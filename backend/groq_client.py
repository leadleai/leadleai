"""
Shared Groq client — the OpenAI-compatible provider the backend now uses for all
three AI features: AI-written follow-up emails (ai_email.py), the embeddable chat
widget (widget.py), and competitor / market intelligence (competitors.py).

WHY GROQ: Groq serves open models (GPT-OSS, Llama, Qwen, etc.) behind an
OpenAI-compatible API with a generous free tier (~30 req/min, ~1000 req/day) — far
roomier than the Gemini free tier, which rate-limited these features too aggressively.

This module is a DROP-IN for gemini.py: same public surface (`api_configured`,
`default_model`, `generate`) and the result object carries the same fields, so
callers (and the ai_provider shim) don't care which provider is active.

DESIGN NOTES
  * OpenAI-compatible REST: POST {base}/chat/completions with a Bearer token.
    Response is standard OpenAI shape — choices[0].message.content.
  * CONFIG — the model name is a CONSTANT (DEFAULT_MODEL) so it's trivial to swap;
    override per-deploy with GROQ_MODEL.
  * FREE-TIER FRIENDLY — a 429 (rate-limit / quota) is surfaced as a structured
    `rate_limited` result (with Groq's Retry-After when present) so callers degrade
    instead of crashing.
  * NO WEB SEARCH — unlike Gemini grounding, Groq/Llama has no server-side search.
    `generate(search=...)` is accepted for signature-compatibility but is a no-op;
    competitors.py is written to summarise from the model's own knowledge instead.

GRACEFUL DORMANCY — with no GROQ_API_KEY set, `api_configured()` is False and
callers show a clear "AI not configured" state. Nothing here ever raises to the
caller: `generate()` always returns a GroqResult.

CONFIG (backend/.env only — never the frontend):
  GROQ_API_KEY   the API key from https://console.groq.com/keys (free, no card).
  GROQ_MODEL     optional model override (default DEFAULT_MODEL below).
"""
import logging
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union

import httpx

logger = logging.getLogger("groq")

# ── CONFIG ───────────────────────────────────────────────────────────────────
# OpenAI-compatible base; "/chat/completions" is appended per call.
GROQ_API_BASE = "https://api.groq.com/openai/v1"
#
# ┌─ MODEL — change this one line to switch the model everything uses ─────────┐
# │ "openai/gpt-oss-120b": a capable general-purpose open-weight model on Groq  │
# │ that returns clean JSON (needed by the email + competitor features) with no │
# │ "thinking" preamble. Verified present + working on this project's key.      │
# │                                                                            │
# │ NOTE: the originally-requested "llama-3.3-70b-versatile" returned HTTP 404  │
# │ "model does not exist or you do not have access" on this key (GET           │
# │ /openai/v1/models lists what the key can actually use). If you have Llama   │
# │ access, set GROQ_MODEL=llama-3.3-70b-versatile to use it — no code change.  │
# │ Other verified options here: "openai/gpt-oss-20b" (smaller/faster).         │
# │ Override per-deploy with GROQ_MODEL.                                         │
# └────────────────────────────────────────────────────────────────────────────┘
DEFAULT_MODEL = "openai/gpt-oss-120b"


def api_key() -> str:
    return os.environ.get("GROQ_API_KEY", "").strip()


def api_configured() -> bool:
    return bool(api_key())


def default_model() -> str:
    return os.environ.get("GROQ_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL


# ── Result type (same fields as gemini.GeminiResult, so callers are identical) ─
@dataclass
class GroqResult:
    ok: bool = False
    text: str = ""
    sources: List[Dict[str, str]] = field(default_factory=list)  # always [] (no search)
    rate_limited: bool = False
    status_code: Optional[int] = None
    error: Optional[str] = None


# ── Request building ─────────────────────────────────────────────────────────
def _to_openai_messages(
    system: Optional[Union[str, List[str]]], messages: List[Dict[str, str]]
) -> List[Dict[str, str]]:
    """Build the OpenAI `messages` array: an optional leading system message, then
    the user/assistant turns. A list `system` (widget guardrails + KB) is joined
    into one system message with the guardrails first."""
    out: List[Dict[str, str]] = []
    if system:
        sys_text = system if isinstance(system, str) else "\n\n".join(p for p in system if p)
        if sys_text.strip():
            out.append({"role": "system", "content": sys_text})
    for m in messages:
        content = (m.get("content") or "").strip()
        if not content:
            continue
        role = "assistant" if m.get("role") in ("assistant", "model") else "user"
        out.append({"role": role, "content": content})
    return out


# ── The one call everything goes through ─────────────────────────────────────
async def generate(
    *,
    messages: List[Dict[str, str]],
    system: Optional[Union[str, List[str]]] = None,
    model: Optional[str] = None,
    temperature: Optional[float] = None,
    max_output_tokens: int = 800,
    search: bool = False,          # accepted for gemini-signature parity; no-op on Groq
    thinking_budget: Optional[int] = None,  # accepted for parity; ignored on Groq
    timeout: float = 45.0,
) -> GroqResult:
    """Call Groq's OpenAI-compatible chat/completions. NEVER raises — always
    returns a GroqResult with the same fields the Gemini client returns."""
    if not api_configured():
        return GroqResult(ok=False, error="GROQ_API_KEY not configured.")

    used_model = (model or default_model()).strip()
    payload: Dict[str, Any] = {
        "model": used_model,
        "messages": _to_openai_messages(system, messages),
        "max_tokens": max_output_tokens,
    }
    if temperature is not None:
        payload["temperature"] = temperature

    headers = {"Authorization": f"Bearer {api_key()}", "content-type": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=timeout) as http:
            resp = await http.post(f"{GROQ_API_BASE}/chat/completions", headers=headers, json=payload)
    except Exception as e:
        logger.error("groq: request failed: %s", e)
        return GroqResult(ok=False, error="Couldn't reach the AI provider.")

    if resp.status_code == 429:
        # Free-tier per-minute / per-day quota. Surface the real reason (+ Groq's
        # Retry-After hint when present) so callers can degrade gracefully.
        retry_after = resp.headers.get("retry-after")
        hint = f" Retry after {retry_after}s." if retry_after else ""
        logger.warning("groq: rate limited (HTTP 429)%s: %s", hint, resp.text[:200])
        return GroqResult(ok=False, rate_limited=True, status_code=429,
                          error=f"AI rate-limited (Groq free-tier quota).{hint} Try again shortly.")
    if resp.status_code >= 400:
        logger.error("groq: HTTP %s: %s", resp.status_code, resp.text[:300])
        return GroqResult(ok=False, status_code=resp.status_code,
                          error=f"AI request failed (HTTP {resp.status_code}).")

    try:
        data = resp.json()
    except Exception as e:
        logger.error("groq: could not parse response JSON: %s", e)
        return GroqResult(ok=False, status_code=resp.status_code,
                          error="AI returned an unreadable response.")

    choices = data.get("choices") or []
    if not choices:
        logger.error("groq: response had no choices: %s", str(data)[:200])
        return GroqResult(ok=False, status_code=resp.status_code, error="AI returned no answer.")

    message = choices[0].get("message") or {}
    text = (message.get("content") or "").strip()
    if not text:
        finish = choices[0].get("finish_reason") or "unknown"
        logger.error("groq: empty content (finish_reason=%s)", finish)
        return GroqResult(ok=False, status_code=resp.status_code,
                          error=f"AI returned an empty answer ({finish}).")

    return GroqResult(ok=True, text=text, status_code=resp.status_code)
