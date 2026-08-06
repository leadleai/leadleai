"""
AI calling agents — CRUD + voice list + the resolution the call paths use.

Every route is authenticated and org-scoped. Reads and writes run in USER mode,
so Postgres RLS (org_isolation on `agents`) is the real boundary — a member of
another org can never see or touch these rows.

  GET    /api/agents            list this org's agents (default first, newest next)
  POST   /api/agents            create an agent
  GET    /api/agents/voices     the provider's real voices, for the editor dropdown
  GET    /api/agents/{id}       one agent
  PATCH  /api/agents/{id}       edit an agent (partial)
  DELETE /api/agents/{id}       remove an agent

Agents are provider-neutral: `provider` names the calling backend the agent runs
on (only 'bland' is implemented). Placing a call *as* an agent goes through the
calling adapter (backend/calling/), so a new provider is a drop-in.

This module also exposes the two helpers the call paths share:
  • resolve_agent_for_call() — pick the agent row to call with (explicit id, else
    the org default, else None -> caller uses the legacy dial()).
  • build_agent_settings()   — turn an agent row into the adapter's AgentSettings,
    injecting the org knowledge base ONLY when use_knowledge_base is set.
"""
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator

import supabase_client as sb
from auth import OrgContext, require_org, sb_error
from calling import (
    AgentSettings, available_providers, get_adapter, DEFAULT_PROVIDER,
    CallingNotConfigured, VoicePreviewUnsupported,
)

logger = logging.getLogger("agents")
router = APIRouter(prefix="/api/agents", tags=["agents"])

MAX_FIRST_MESSAGE = 2_000
MAX_PERSONA = 20_000

# The sentence a voice speaks in a preview (kept short — Bland charges per sample).
DEFAULT_SAMPLE_TEXT = "Hi! This is a quick preview of how I'll sound on your calls."


# ── API shapes ───────────────────────────────────────────────────────────────
class AgentOut(BaseModel):
    id: str
    org_id: Optional[str] = None
    name: str
    provider: str = DEFAULT_PROVIDER
    voice: Optional[str] = None
    language: str = "en"
    first_message: str = ""
    persona_prompt: str = ""
    use_knowledge_base: bool = False
    temperature: float = 0.7
    max_duration: int = 5
    extra_params: Dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True
    is_default: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class AgentIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    provider: str = DEFAULT_PROVIDER
    voice: Optional[str] = Field(default=None, max_length=200)
    language: str = Field(default="en", max_length=20)
    first_message: str = Field(default="", max_length=MAX_FIRST_MESSAGE)
    persona_prompt: str = Field(default="", max_length=MAX_PERSONA)
    use_knowledge_base: bool = False
    temperature: float = Field(default=0.7, ge=0, le=1)
    max_duration: int = Field(default=5, ge=1, le=60)
    extra_params: Dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True
    is_default: bool = False

    @field_validator("name")
    @classmethod
    def _clean_name(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("agent name can't be blank")
        return v

    @field_validator("provider")
    @classmethod
    def _check_provider(cls, v: str) -> str:
        v = (v or DEFAULT_PROVIDER).strip().lower()
        if v not in available_providers():
            raise ValueError(f"unknown calling provider {v!r} (available: {', '.join(available_providers())})")
        return v

    def to_row(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "provider": self.provider,
            "voice": (self.voice or None),
            "language": (self.language or "en").strip() or "en",
            "first_message": self.first_message or "",
            "persona_prompt": self.persona_prompt or "",
            "use_knowledge_base": self.use_knowledge_base,
            "temperature": self.temperature,
            "max_duration": self.max_duration,
            "extra_params": self.extra_params or {},
            "is_active": self.is_active,
            "is_default": self.is_default,
        }


class AgentPatch(BaseModel):
    """PATCH: every field optional; only what's sent is written."""
    name: Optional[str] = Field(default=None, max_length=80)
    provider: Optional[str] = None
    voice: Optional[str] = Field(default=None, max_length=200)
    language: Optional[str] = Field(default=None, max_length=20)
    first_message: Optional[str] = Field(default=None, max_length=MAX_FIRST_MESSAGE)
    persona_prompt: Optional[str] = Field(default=None, max_length=MAX_PERSONA)
    use_knowledge_base: Optional[bool] = None
    temperature: Optional[float] = Field(default=None, ge=0, le=1)
    max_duration: Optional[int] = Field(default=None, ge=1, le=60)
    extra_params: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def _clean_name(cls, v):
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("agent name can't be blank")
        return v

    @field_validator("provider")
    @classmethod
    def _check_provider(cls, v):
        if v is None:
            return v
        v = v.strip().lower()
        if v not in available_providers():
            raise ValueError(f"unknown calling provider {v!r}")
        return v

    def cleaned(self) -> Dict[str, Any]:
        fields = self.model_dump(exclude_unset=True)
        if "language" in fields:
            fields["language"] = (fields["language"] or "en").strip() or "en"
        if "voice" in fields:
            fields["voice"] = fields["voice"] or None
        return fields


# ── resolution helpers shared by the manual + auto call paths ────────────────
async def resolve_agent_for_call(
    *, org_id: str, token: Optional[str] = None, agent_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """The agent row to place a call with: the explicitly chosen one (if it's the
    org's and active), else the org's default agent, else None (caller falls back
    to the legacy dial). Never raises for a missing agent — a call is never dropped
    just because agent resolution came up empty."""
    try:
        if agent_id:
            agent = await sb.get_agent(agent_id, org_id=org_id, token=token)
            if agent and agent.get("is_active", True):
                return agent
            # An inactive or unknown id falls through to the default rather than
            # silently using something the caller didn't ask for.
        return await sb.get_default_agent(org_id=org_id, token=token)
    except sb.SupabaseNotConfigured:
        return None
    except Exception as e:
        logger.warning("org=%s could not resolve agent (%s); using legacy dial", org_id, e)
        return None


async def build_agent_settings(
    agent: Dict[str, Any], *, org_id: str, token: Optional[str] = None
) -> AgentSettings:
    """Map an agent row to the adapter's AgentSettings, injecting the flattened org
    knowledge base only when the agent uses it."""
    kb_content = None
    if agent.get("use_knowledge_base"):
        try:
            kb_content = await sb.get_knowledge_content(org_id=org_id, token=token)
        except Exception as e:
            logger.warning("org=%s could not load KB for agent %s (%s)", org_id, agent.get("id"), e)
            kb_content = None
    return AgentSettings(
        id=agent.get("id"),
        name=agent.get("name") or "Ava",
        provider=(agent.get("provider") or DEFAULT_PROVIDER),
        voice=agent.get("voice"),
        language=agent.get("language") or "en",
        first_message=agent.get("first_message") or "",
        persona_prompt=agent.get("persona_prompt") or "",
        use_knowledge_base=bool(agent.get("use_knowledge_base")),
        temperature=float(agent.get("temperature") if agent.get("temperature") is not None else 0.7),
        max_duration=int(agent.get("max_duration") or 5),
        extra_params=agent.get("extra_params") or {},
        knowledge_base_content=kb_content,
    )


async def resolve_settings_for_call(
    *, org_id: str, token: Optional[str] = None, agent_id: Optional[str] = None
) -> Optional[AgentSettings]:
    """One-shot: resolve the agent row and build its settings, or None when the org
    has no agent (caller uses the legacy dial)."""
    agent = await resolve_agent_for_call(org_id=org_id, token=token, agent_id=agent_id)
    if not agent:
        return None
    return await build_agent_settings(agent, org_id=org_id, token=token)


# ── voices (must be declared before /{agent_id} so it isn't shadowed) ────────
@router.get("/voices")
async def list_voices(provider: str = DEFAULT_PROVIDER, ctx: OrgContext = Depends(require_org)):
    """The provider's real voices for the editor dropdown. Authenticated (so only
    signed-in users can spend the upstream call), but not org-specific — voices are
    a provider catalog. Degrades to a static fallback rather than failing.
    `supports_preview` tells the editor whether to show the play button."""
    adapter = get_adapter(provider)
    voices = await adapter.list_voices()
    return {
        "provider": adapter.provider,
        "supports_preview": adapter.supports_voice_preview(),
        "voices": [v.model_dump() for v in voices],
    }


@router.get("/voices/{voice_id}/sample")
async def preview_voice(
    voice_id: str,
    provider: str = DEFAULT_PROVIDER,
    text: str = DEFAULT_SAMPLE_TEXT,
    ctx: OrgContext = Depends(require_org),
):
    """Stream a REAL audio sample of `voice_id` so the user can audition it before
    choosing. Proxies the provider's sample API server-side (the Bland key never
    reaches the browser). 501 if the provider has no sample capability — the editor
    then simply doesn't offer previews rather than faking audio."""
    adapter = get_adapter(provider)
    try:
        audio, content_type = await adapter.preview_voice(voice_id, text or DEFAULT_SAMPLE_TEXT)
    except VoicePreviewUnsupported as e:
        raise HTTPException(status_code=501, detail=str(e))
    except CallingNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.warning("voice preview failed (provider=%s voice=%s): %s", provider, voice_id, e)
        raise HTTPException(status_code=502, detail=f"Voice preview failed: {e}")
    # Let the browser cache a given voice's sample briefly to avoid re-billing on replay.
    return Response(content=audio, media_type=content_type or "audio/wav",
                    headers={"Cache-Control": "private, max-age=3600"})


# ── CRUD ─────────────────────────────────────────────────────────────────────
@router.get("", response_model=List[AgentOut])
async def list_agents(ctx: OrgContext = Depends(require_org)):
    try:
        return await sb.list_agents(org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)


@router.post("", response_model=AgentOut, status_code=201)
async def create_agent(body: AgentIn, ctx: OrgContext = Depends(require_org)):
    row = {"org_id": ctx.org_id, **body.to_row()}
    # First agent an org creates becomes its default automatically, so auto-call
    # always has one to use.
    try:
        existing = await sb.list_agents(org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    if not existing:
        row["is_default"] = True

    try:
        created = await sb.insert_agent(row, token=ctx.token)
        if created and created.get("is_default"):
            # Enforce the single-default invariant in app code (see clear_default_agents).
            await sb.clear_default_agents(org_id=ctx.org_id, token=ctx.token, except_id=created["id"])
    except Exception as e:
        raise sb_error(e)
    if not created:
        raise HTTPException(status_code=500, detail="Could not create the agent.")
    logger.info("[org %s] agent %s created (%s)", ctx.org_id, created.get("id"), body.name)
    return created


@router.get("/{agent_id}", response_model=AgentOut)
async def get_agent(agent_id: str, ctx: OrgContext = Depends(require_org)):
    try:
        agent = await sb.get_agent(agent_id, org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.patch("/{agent_id}", response_model=AgentOut)
async def update_agent(agent_id: str, body: AgentPatch, ctx: OrgContext = Depends(require_org)):
    fields = body.cleaned()
    if not fields:
        raise HTTPException(status_code=422, detail="Nothing to update.")
    try:
        updated = await sb.update_agent(agent_id, fields, org_id=ctx.org_id, token=ctx.token)
        if not updated:
            # Missing OR another org's row — same 404 either way, leaking nothing.
            raise HTTPException(status_code=404, detail="Agent not found")
        # Making this agent the default clears the flag on the others.
        if fields.get("is_default"):
            await sb.clear_default_agents(org_id=ctx.org_id, token=ctx.token, except_id=agent_id)
    except HTTPException:
        raise
    except Exception as e:
        raise sb_error(e)
    logger.info("[org %s] agent %s updated (%s)", ctx.org_id, agent_id, list(fields.keys()))
    return updated


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(agent_id: str, ctx: OrgContext = Depends(require_org)):
    try:
        deleted = await sb.delete_agent(agent_id, org_id=ctx.org_id, token=ctx.token)
        if not deleted:
            raise HTTPException(status_code=404, detail="Agent not found")
        # If we removed the default, promote the most recently updated remaining
        # agent so auto-call keeps a default to use.
        if deleted.get("is_default"):
            remaining = await sb.list_agents(org_id=ctx.org_id, token=ctx.token)
            if remaining:
                await sb.update_agent(
                    remaining[0]["id"], {"is_default": True}, org_id=ctx.org_id, token=ctx.token
                )
    except HTTPException:
        raise
    except Exception as e:
        raise sb_error(e)
    logger.info("[org %s] agent %s deleted", ctx.org_id, agent_id)
    return None
