"""
Bland.ai calling adapter.

Wraps the existing backend/calls.py so nothing about how we talk to Bland is
duplicated: the low-level POST, the E.164 check, the same-number guardrail and
the error parsing all still live in calls.py (post_bland_call). This adapter's
job is purely the TRANSLATION from a provider-neutral AgentSettings + CallLead
into a Bland payload:

    voice           -> voice
    first_message   -> first_sentence     (the forced opening line / greeting)
    persona_prompt  -> task               (+ lead context, + KB when enabled)
    temperature     -> temperature
    max_duration    -> max_duration       (minutes)
    language        -> language
    extra_params    -> merged in verbatim (wait_for_greeting, model, etc.)

The Bland API key stays server-side (read inside calls.py); it is never handed to
the browser and never stored per-org here.
"""
import logging
import os
from typing import List, Optional

import httpx

import calls
from .base import (
    AgentSettings, CallingNotConfigured, CallingProviderAdapter, CallLead, Voice,
)

logger = logging.getLogger("calling.bland")

# Shown if Bland's /v1/voices can't be reached or no key is set, so the editor's
# dropdown always has something. 'maya' is the historical default from calls.py.
_FALLBACK_VOICES = [
    Voice(id="maya", name="Maya", description="Warm, friendly female (default)"),
    Voice(id="ryan", name="Ryan", description="Confident male"),
    Voice(id="nat", name="Nat", description="Calm, neutral"),
    Voice(id="june", name="June", description="Bright, upbeat female"),
]


def _build_task(agent: AgentSettings, lead: CallLead) -> str:
    """The Bland `task` — the agent's persona/script grounded in the lead's
    context, and (when enabled) the org knowledge base, keeping the same
    don't-invent-facts guardrail the legacy prompt had."""
    who = (lead.name or "the prospect").strip()
    at_company = f" at {lead.company.strip()}" if lead.company else ""
    enquiry = (lead.enquiry or "(no specific enquiry on file)").strip()
    persona = (agent.persona_prompt or "").strip()

    if not persona:
        # No script written yet — fall back to a sensible default persona so the
        # call still behaves reasonably.
        persona = (
            f"You are {agent.name}, a friendly, concise AI sales rep. "
            "You are placing an outbound follow-up call. Be brief and natural, "
            "answer questions accurately, and offer to book a quick demo if they're interested."
        )

    parts = [
        persona,
        "",
        f"You are calling {who}{at_company}.",
        f'Their enquiry / reason for the call: "{enquiry}"',
    ]

    kb = (agent.knowledge_base_content or "").strip() if agent.use_knowledge_base else ""
    if kb:
        parts += [
            "",
            "Answer questions ACCURATELY using ONLY the knowledge base below. If asked "
            "something not covered here, say a human specialist will follow up by email — "
            "do not invent facts.",
            "",
            "KNOWLEDGE BASE:",
            kb,
        ]
    return "\n".join(parts).strip()


class BlandProviderAdapter(CallingProviderAdapter):
    provider = "bland"

    def is_ready(self) -> bool:
        return bool(os.environ.get("BLAND_API_KEY"))

    async def place_call(
        self, agent_settings: AgentSettings, lead: CallLead, *, api_key: Optional[str] = None
    ) -> str:
        """Translate the agent + lead into a Bland payload and place the call via
        calls.post_bland_call (shared guardrails). Returns the Bland call_id.

        `api_key` is the org's own Bland key (from their connection); it is passed
        straight through to the Bland POST so their account is charged. None -> env."""
        payload = {
            "phone_number": (lead.phone or "").strip(),
            "task": _build_task(agent_settings, lead),
            "request_data": {
                "name": lead.name, "company": lead.company, "email": lead.email,
                "enquiry": lead.enquiry, "leadId": lead.lead_id,
                "agent": agent_settings.name, "agentId": agent_settings.id,
            },
            "voice": (agent_settings.voice or calls.VOICE),
            "language": (agent_settings.language or "en"),
            "temperature": agent_settings.temperature,
            "max_duration": agent_settings.max_duration,
            "record": calls.RECORD,
        }
        if agent_settings.first_message and agent_settings.first_message.strip():
            payload["first_sentence"] = agent_settings.first_message.strip()

        # Advanced/passthrough Bland params (wait_for_greeting, interruption_threshold,
        # model, voicemail_message, …). Explicit fields above win over extra_params.
        extra = agent_settings.extra_params or {}
        if isinstance(extra, dict):
            for k, v in extra.items():
                payload.setdefault(k, v)

        return await calls.post_bland_call(payload, api_key=api_key)

    async def list_voices(self) -> List[Voice]:
        """Bland's real preset voices (GET /v1/voices). Falls back to a small
        static set on any error so the dropdown always populates."""
        api_key = os.environ.get("BLAND_API_KEY")
        if not api_key:
            return list(_FALLBACK_VOICES)
        try:
            async with httpx.AsyncClient(timeout=15) as http:
                resp = await http.get(
                    "https://api.bland.ai/v1/voices",
                    headers={"authorization": api_key},
                )
            resp.raise_for_status()
            data = resp.json()
        except (httpx.HTTPError, ValueError) as e:
            logger.warning("could not fetch Bland voices (%s); using fallback list", e)
            return list(_FALLBACK_VOICES)

        raw = data.get("voices") if isinstance(data, dict) else data
        if not isinstance(raw, list):
            return list(_FALLBACK_VOICES)

        voices: List[Voice] = []
        for v in raw:
            if not isinstance(v, dict):
                continue
            # Bland's call API resolves a voice by its catalog "id" (uuid) OR its
            # "name" — both are verified to work on /v1/calls and /v1/voices. The
            # separate "voice_id" field is the UNDERLYING TTS-provider id and is
            # NOT a valid Bland reference (it 404s / 500s), so we deliberately never
            # emit it: doing so would make Bland silently fall back to its default
            # voice. Prefer id, fall back to name.
            vid = str(v.get("id") or v.get("name") or "").strip()
            name = str(v.get("name") or vid).strip()
            if not vid:
                continue
            desc = v.get("description")
            tags = v.get("tags")
            if not desc and isinstance(tags, list) and tags:
                desc = ", ".join(str(t) for t in tags)
            voices.append(Voice(id=vid, name=name or vid, description=desc or None))

        return voices or list(_FALLBACK_VOICES)

    # -- voice preview: Bland has a real sample endpoint (POST /v1/voices/{id}/sample) --
    def supports_voice_preview(self) -> bool:
        return True

    async def preview_voice(self, voice_id: str, text: str) -> "tuple[bytes, str]":
        """Synthesize a real sample of `voice_id` via Bland's sample endpoint and
        return (wav_bytes, content_type). The API key stays server-side, so this is
        always called from our backend proxy, never the browser."""
        api_key = os.environ.get("BLAND_API_KEY")
        if not api_key:
            raise CallingNotConfigured("Bland is not configured: set BLAND_API_KEY in backend/.env.")
        vid = (voice_id or "").strip()
        if not vid:
            raise ValueError("voice_id is required for a preview")
        try:
            async with httpx.AsyncClient(timeout=60) as http:
                resp = await http.post(
                    f"https://api.bland.ai/v1/voices/{vid}/sample",
                    headers={"authorization": api_key, "Content-Type": "application/json"},
                    json={"text": (text or "").strip()[:300]},
                )
        except httpx.HTTPError as e:
            raise RuntimeError(f"Could not reach Bland.ai: {e}")

        content_type = resp.headers.get("content-type", "")
        if resp.status_code < 400 and "audio" in content_type:
            return resp.content, content_type
        # Surface Bland's JSON error text rather than returning bad "audio".
        try:
            data = resp.json()
            errors = data.get("errors")
            if isinstance(errors, list) and errors:
                msg = "; ".join(
                    e if isinstance(e, str) else (e.get("message") or str(e)) for e in errors
                )
            else:
                msg = data.get("message") or f"Bland sample error (HTTP {resp.status_code})"
        except ValueError:
            msg = f"Bland sample error (HTTP {resp.status_code})"
        raise RuntimeError(msg)
