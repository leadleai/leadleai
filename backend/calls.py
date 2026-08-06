"""
Outbound AI call via Bland.ai.  POST /api/call

The Bland API key is read from the backend .env only (BLAND_API_KEY) and used
server-to-server — it is never sent to the browser.
"""
import logging
import os
import re
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

import supabase_client as sb
from auth import OrgContext, require_org, sb_error

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/call", tags=["call"])

E164 = re.compile(r"^\+[1-9]\d{7,14}$")


class BlandError(Exception):
    """Raised when a Bland call can't be placed; carries an HTTP-ish status."""
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message

# ─────────────────────────────────────────────────────────────────────────────
# ✏️  EDIT ME — KNOWLEDGE BASE the AI answers from (embedded in the call prompt).
# For a bigger KB later, use Bland's dynamic_data / custom tools to pull from a
# live API at call time instead of inlining it here.
# ─────────────────────────────────────────────────────────────────────────────
KNOWLEDGE_BASE = """
COMPANY: SaleScale.ai — an AI lead-calling and sales-automation tool.
WHAT WE DO: Capture inbound enquiries, then call and qualify leads with an AI voice agent.
PRICING: Starter $49/mo, Growth $199/mo, Enterprise custom. 14-day free trial, no card.
BENEFITS: Faster lead response, 24/7 calling, consistent qualification.
FALLBACK: If asked something not covered here, say a human specialist will follow up by email.
""".strip()

AGENT_NAME = "Ava"
COMPANY_NAME = "SaleScale.ai"
VOICE = "maya"
RECORD = True
MAX_DURATION = 5  # minutes


class CallIn(BaseModel):
    name: Optional[str] = None
    phone: str
    email: Optional[str] = None
    company: Optional[str] = None
    enquiry: Optional[str] = None
    leadId: Optional[str] = None
    # Which agent to call as. Optional: falls back to the org's default agent, then
    # to the legacy fixed prompt if the org has no agents yet.
    agentId: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def phone_e164(cls, v: str) -> str:
        v = (v or "").strip()
        if not E164.match(v):
            raise ValueError("phone must be E.164 with country code, e.g. +919812345678")
        return v


def _build_task(name, company, enquiry, agent_name=None) -> str:
    who = (name or "the prospect").strip()
    agent = (agent_name or AGENT_NAME).strip() or AGENT_NAME
    company = f" at {company.strip()}" if company else ""
    enquiry = (enquiry or "(no specific enquiry on file)").strip()
    return f"""
You are {agent}, a friendly, concise AI sales rep from {COMPANY_NAME}.
You are placing an OUTBOUND follow-up call to {who}{company}.

The reason for this call — their specific enquiry — is:
"{enquiry}"

How to behave:
- Greet them by name, say you're {agent} from {COMPANY_NAME}, following up on their enquiry.
- Answer questions ACCURATELY using ONLY the knowledge base below.
- Be brief and natural; offer to book a quick demo if they're interested.
- If asked something not in the knowledge base, say a human will follow up by email. Do not invent facts.
- If they're busy or not interested, thank them and end the call.

KNOWLEDGE BASE (answer strictly from this):
{KNOWLEDGE_BASE}
""".strip()


def bland_api_key() -> str:
    """The server-side Bland key, or raise BlandError(503). Never sent to the browser."""
    api_key = os.environ.get("BLAND_API_KEY")
    if not api_key:
        raise BlandError(503, "Server not configured: set BLAND_API_KEY in backend/.env.")
    return api_key


async def post_bland_call(payload: dict) -> str:
    """POST one already-built payload to Bland and return the call_id, or raise
    BlandError. This is the single low-level Bland entry point: the legacy dial()
    below and the BlandProviderAdapter both build their own payload and hand it
    here, so error parsing and the same-number guardrail live in exactly one place."""
    api_key = bland_api_key()
    phone = (payload.get("phone_number") or "").strip()
    if not E164.match(phone):
        raise BlandError(422, "phone must be E.164 with country code, e.g. +919812345678")

    try:
        async with httpx.AsyncClient(timeout=20) as http:
            resp = await http.post(
                "https://api.bland.ai/v1/calls",
                headers={"authorization": api_key, "Content-Type": "application/json"},  # raw key, no "Bearer"
                json=payload,
            )
    except httpx.HTTPError as e:
        raise BlandError(502, f"Could not reach Bland.ai: {e}")

    try:
        data = resp.json()
    except ValueError:
        data = {}

    if data.get("status") == "success" and data.get("call_id"):
        return data["call_id"]

    # Surface Bland's error text (AUTH_FAILURE, the 10s same-number limit, etc.)
    errors = data.get("errors")
    if isinstance(errors, list) and errors:
        message = "; ".join(
            e if isinstance(e, str) else (e.get("message") or e.get("error") or str(e)) for e in errors
        )
    else:
        message = data.get("message") or f"Bland API error (HTTP {resp.status_code})"
    raise BlandError(resp.status_code if resp.status_code >= 400 else 502, message)


async def dial(*, phone, name=None, email=None, company=None, enquiry=None, lead_id=None, agent_name=None) -> str:
    """Place a Bland call the LEGACY way (fixed voice + inlined KNOWLEDGE_BASE),
    returns the call_id or raises BlandError. This is the fallback used when an org
    has no agent configured yet; agent-driven calls go through the calling adapter
    instead. `agent_name` is the per-org voice-agent name (falls back to the
    module default)."""
    payload = {
        "phone_number": (phone or "").strip(),
        "task": _build_task(name, company, enquiry, agent_name),
        "request_data": {"name": name, "company": company, "email": email, "enquiry": enquiry, "leadId": lead_id},
        "voice": VOICE,
        "record": RECORD,
        "max_duration": MAX_DURATION,
    }
    return await post_bland_call(payload)


async def log_call(*, org_id, lead_id, to_phone, status, trigger, call_id=None,
                   error=None, token=None) -> None:
    """Record every dial attempt (manual / auto / import) in call_log. Never raises —
    a logging failure must not turn a placed call into a reported error."""
    try:
        await sb.insert_call_log({
            "org_id": org_id,
            "lead_id": lead_id,
            "to_phone": to_phone,
            "call_id": call_id,
            "status": status,
            "trigger": trigger,
            "error": error,
        }, token=token)
    except Exception as e:
        logger.warning("[calls lead=%s] could not write call_log: %s", lead_id, e)


async def dial_and_log(*, trigger: str, org_id: str, phone, name=None, email=None,
                       company=None, enquiry=None, lead_id=None, token=None,
                       agent_name=None, agent_settings=None) -> str:
    """Place a call + write a call_log row on BOTH outcomes. Returns the call_id or
    re-raises BlandError, so every existing caller keeps its current error handling.

    When `agent_settings` is given the call is routed through the calling adapter
    for that agent's provider (Bland today); otherwise it falls back to the legacy
    dial() so an org with no agent configured still calls exactly as before."""
    try:
        if agent_settings is not None:
            import calling  # lazy: calling.bland imports this module
            adapter = calling.get_adapter(agent_settings.provider)
            lead = calling.CallLead(
                name=name, phone=phone, email=email,
                company=company, enquiry=enquiry, lead_id=lead_id,
            )
            call_id = await adapter.place_call(agent_settings, lead)
        else:
            call_id = await dial(
                phone=phone, name=name, email=email, company=company,
                enquiry=enquiry, lead_id=lead_id, agent_name=agent_name,
            )
    except BlandError as e:
        await log_call(org_id=org_id, lead_id=lead_id, to_phone=phone, status="failed",
                       trigger=trigger, error=e.message, token=token)
        raise
    await log_call(org_id=org_id, lead_id=lead_id, to_phone=phone, status="placed",
                   trigger=trigger, call_id=call_id, token=token)
    return call_id


@router.post("")
async def place_call(lead: CallIn, ctx: OrgContext = Depends(require_org)):
    """Manual dial from the dashboard. The lead must belong to the caller's org —
    verified before we spend money on a Bland call."""
    if lead.leadId:
        try:
            owned = await sb.get_lead(lead.leadId, token=ctx.token, org_id=ctx.org_id)
        except Exception as e:
            raise sb_error(e)
        if not owned:
            raise HTTPException(status_code=404, detail="Lead not found")

    # Prefer the chosen agent (or the org default) via the calling adapter; fall
    # back to the legacy fixed prompt (agent_name only) when the org has no agents.
    import agents
    import org_settings
    agent_settings = await agents.resolve_settings_for_call(
        org_id=ctx.org_id, token=ctx.token, agent_id=lead.agentId
    )
    agent_name = None
    if agent_settings is None:
        cfg = await org_settings.resolve_for_org(ctx.org_id, token=ctx.token)
        agent_name = cfg.agent_name
    try:
        call_id = await dial_and_log(
            trigger="manual", org_id=ctx.org_id, token=ctx.token,
            phone=lead.phone, name=lead.name, email=lead.email,
            company=lead.company, enquiry=lead.enquiry, lead_id=lead.leadId,
            agent_name=agent_name, agent_settings=agent_settings,
        )
    except BlandError as e:
        raise HTTPException(status_code=e.status, detail=e.message)
    return {"success": True, "call_id": call_id}


# ── Call history (GET /api/calls) ────────────────────────────────────────────
log_router = APIRouter(prefix="/api/calls", tags=["calls"])


class CallLogOut(BaseModel):
    id: str
    org_id: Optional[str] = None
    lead_id: Optional[str] = None
    to_phone: str
    call_id: Optional[str] = None
    status: str
    trigger: str
    error: Optional[str] = None
    created_at: Optional[str] = None
    lead_name: Optional[str] = None
    lead_company: Optional[str] = None


@log_router.get("", response_model=List[CallLogOut])
async def list_calls(limit: int = 200, ctx: OrgContext = Depends(require_org)):
    try:
        return await sb.list_call_logs(
            min(max(limit, 1), 500), token=ctx.token, org_id=ctx.org_id
        )
    except Exception as e:
        raise sb_error(e)
