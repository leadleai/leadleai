"""
AI-written follow-up emails, grounded in the org's knowledge base.

Given the lead's own enquiry, their name, the follow-up step (1/2/3) and the
org's KB, this asks the AI provider (Groq by default) to write a short,
professional email that DIRECTLY answers the enquiry using ONLY the knowledge
base — and, crucially, to NOT invent anything. When the KB doesn't cover the
question the model is told to promise a specialist will follow up rather than guess.

Everything here is best-effort and NEVER raises to the caller: on a missing key,
an API error, a rate-limit (429), or an unparseable reply, `generate_followup`
returns None and the caller (followup.build_followup_content) falls back to the
static templates.

CONFIG (backend/.env only — never the frontend):
  GROQ_API_KEY        the API key. Absent -> AI generation is off.
  GROQ_MODEL          optional model override (default groq_client.DEFAULT_MODEL).
  AI_EMAILS_ENABLED   master switch, default false. Toggle here or from Settings.
"""
import json
import logging
import os
import re
from typing import Optional, Tuple

from fastapi import APIRouter, Depends
from pydantic import BaseModel

import ai_provider
from auth import OrgContext, require_org

logger = logging.getLogger("ai_email")

settings_router = APIRouter(prefix="/api/settings", tags=["settings"])

# What each step is FOR. Kept here so the prompt and the templates stay in step.
STEP_INTENT = {
    1: "This is the FIRST follow-up: directly answer their enquiry, then a gentle nudge to reply.",
    2: "This is the SECOND follow-up: add a little extra value and warmly offer a quick call.",
    3: "This is the THIRD and FINAL follow-up: a brief, no-pressure last check-in.",
}


# ── Config ───────────────────────────────────────────────────────────────────
def _env_bool(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


def model() -> str:
    return ai_provider.default_model()


def api_configured() -> bool:
    return ai_provider.api_configured()


# Master switch (runtime; initialised from env, toggled from Settings) ─────────
_enabled = _env_bool("AI_EMAILS_ENABLED", False)


def is_enabled() -> bool:
    """True only when the toggle is on AND a key is present — either off means
    the caller uses the static templates."""
    return _enabled and api_configured()


def toggle_on() -> bool:
    """The raw toggle state, independent of whether a key is set (for Settings)."""
    return _enabled


def set_enabled(value: bool) -> bool:
    global _enabled
    _enabled = bool(value)
    return _enabled


def current_settings() -> dict:
    return {
        "enabled": _enabled,
        "active": is_enabled(),          # actually generating (toggle + key)
        "api_configured": api_configured(),
        "model": model(),
    }


# ── Prompt ───────────────────────────────────────────────────────────────────
_SYSTEM = (
    "You write short, professional B2B sales follow-up emails. You answer the "
    "lead's enquiry using ONLY the facts in the KNOWLEDGE BASE provided. "
    "Absolute rule: never invent, guess, or embellish facts (pricing, features, "
    "timelines, integrations, names). If the knowledge base does not cover what "
    "they asked, do NOT make something up — instead say a specialist will follow "
    "up with the specifics. Keep it concise (roughly 60-130 words), warm, and "
    "free of hype. Do not fabricate a signature name; sign off as the team. "
    "Return ONLY a JSON object, no prose around it, shaped exactly as: "
    '{"subject": "<subject line>", "body_html": "<the email body as simple HTML '
    'using only <p> and optionally <ul><li> tags; no <html>/<head>/<body> and no '
    'unsubscribe link>"}'
)


def _build_user_prompt(*, first_name: str, enquiry: str, step: int, kb_content: str) -> str:
    intent = STEP_INTENT.get(step, STEP_INTENT[1])
    return (
        f"KNOWLEDGE BASE (the ONLY facts you may state):\n"
        f"\"\"\"\n{kb_content.strip()}\n\"\"\"\n\n"
        f"LEAD'S NAME: {first_name}\n"
        f"LEAD'S ENQUIRY:\n\"\"\"\n{enquiry.strip()}\n\"\"\"\n\n"
        f"FOLLOW-UP STEP: {step} of 3. {intent}\n\n"
        f"Write the email now. Greet them by first name. Directly address their "
        f"enquiry with facts from the knowledge base only. Output the JSON object."
    )


# ── Parsing the model's reply ────────────────────────────────────────────────
_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def _extract_json(text: str) -> Optional[dict]:
    """Best-effort: strip code fences / surrounding prose, then json.loads."""
    if not text:
        return None
    cleaned = _FENCE_RE.sub("", text.strip()).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    # Fall back to the outermost {...} span.
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if 0 <= start < end:
        try:
            return json.loads(cleaned[start:end + 1])
        except json.JSONDecodeError:
            return None
    return None


def _normalise_body(body: str) -> str:
    """Ensure the body is an HTML fragment (wrap_html adds the wrapper + footer)."""
    body = (body or "").strip()
    if not body:
        return ""
    if "<" in body and ">" in body:
        return body
    # Plain text -> paragraphs.
    paras = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]
    return "".join(f"<p>{p}</p>" for p in paras)


# ── Public API ───────────────────────────────────────────────────────────────
async def generate_followup(
    *, first_name: str, enquiry: str, step: int, kb_content: str,
    enabled: Optional[bool] = None,
) -> Optional[Tuple[str, str]]:
    """Return (subject, body_html) or None on ANY failure (caller falls back).

    Never raises. `step` is 1-based (1/2/3). `kb_content` must be non-empty — the
    caller checks that before calling, but we double-check to stay safe.

    `enabled` lets a PER-ORG caller (the drip) override the process-global toggle:
    when passed, it decides on/off instead of is_enabled(); a key is still required.
    """
    active = (enabled if enabled is not None else is_enabled())
    if not active or not api_configured():
        return None
    if not kb_content.strip():
        logger.info("ai email: empty knowledge base; falling back to template")
        return None

    result = await ai_provider.generate(
        system=_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": _build_user_prompt(
                    first_name=first_name, enquiry=enquiry, step=step, kb_content=kb_content
                ),
            }
        ],
        temperature=0.4,
        max_output_tokens=800,
    )
    if not result.ok:
        # Missing key, API error, or free-tier rate-limit (429) — fall back to the
        # static template instead of erroring.
        logger.error("ai email: generation failed: %s", result.error)
        return None

    parsed = _extract_json(result.text)
    if not isinstance(parsed, dict):
        logger.error("ai email: model reply was not JSON (%r...)", result.text[:120])
        return None

    subject = (parsed.get("subject") or "").strip()
    body = _normalise_body(parsed.get("body_html") or parsed.get("body") or "")
    if not subject or not body:
        logger.error("ai email: model reply missing subject/body")
        return None

    logger.info("ai email: generated step %s (%d chars body) via %s", step, len(body), model())
    return subject, body


# ── Settings endpoints (auth-gated; process-global toggle, like the drip) ────
class AIEmailToggle(BaseModel):
    enabled: bool


@settings_router.get("/ai-emails")
async def get_ai_email_settings(ctx: OrgContext = Depends(require_org)):
    return current_settings()


@settings_router.put("/ai-emails")
async def put_ai_email_settings(body: AIEmailToggle, ctx: OrgContext = Depends(require_org)):
    set_enabled(body.enabled)
    logger.info("AI_EMAILS_ENABLED set to %s via Settings API by user %s (org %s)",
                body.enabled, ctx.user_id, ctx.org_id)
    return current_settings()
