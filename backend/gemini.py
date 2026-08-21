"""
Shared Google Gemini client — the single place the whole backend talks to the
Gemini API (generativelanguage.googleapis.com). All three AI features route
through here: AI-written follow-up emails (ai_email.py), the embeddable chat
widget (widget.py), and competitor / market intelligence (competitors.py).

Why one module: every feature wants the same things — a system instruction, a
few user/assistant turns, JSON-friendly output, optional Google Search
grounding, and — crucially for a FREE-TIER key — graceful degradation. So the
key check, the request shape, and the 429 (rate-limit / quota) handling live in
ONE place instead of being copy-pasted three times.

DESIGN NOTES
  * Uses the REST `generateContent` endpoint with the API key. No SDK, so the
    only dependency is httpx (already a backend dependency).
  * CONFIG — the model name is a CONSTANT (DEFAULT_MODEL) so it's trivial to bump
    when Google rotates the free Flash tier. Override per-deploy with GEMINI_MODEL.
  * FREE-TIER FRIENDLY — Gemini's free tier bills per-minute AND per-day request
    quotas; when Google returns 429 (RESOURCE_EXHAUSTED) we surface it as a
    structured `rate_limited` result so callers can degrade instead of crashing.
  * THINKING OFF by default — the 2.5 Flash family is a "thinking" model that can
    silently spend the whole output budget on hidden reasoning and return empty
    text. For these short, bounded tasks we disable it (thinkingBudget=0), which
    is both more reliable and cheaper on the free tier.

GRACEFUL DORMANCY — with no GEMINI_API_KEY set, `api_configured()` is False and
callers show a clear "AI not configured" state instead of erroring. Nothing here
ever raises to the caller: `generate()` always returns a GeminiResult.

CONFIG (backend/.env only — never the frontend):
  GEMINI_API_KEY   the API key from https://aistudio.google.com/apikey (free, no card).
  GEMINI_MODEL     optional model override (default DEFAULT_MODEL below).
"""
import logging
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union

import httpx

logger = logging.getLogger("gemini")

# ── CONFIG ───────────────────────────────────────────────────────────────────
# The Gemini REST base. `{model}:generateContent` is appended per call.
GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"
#
# ┌─ MODEL — change this one line to switch the model everything uses ─────────┐
# │ "gemini-2.0-flash": a regular (non-lite) Flash model, set by explicit user  │
# │ request for its generous free tier (~1500 requests/day historically).       │
# │                                                                            │
# │ ⚠️  HEADS UP: as of the last check this id returned HTTP 404 "no longer     │
# │ available" on the project's current GEMINI_API_KEY (Google's own error      │
# │ recommends "gemini-3.6-flash" as its successor). If every AI call starts    │
# │ failing with a 404, that's why — switch to a currently-served id. Verified  │
# │ working alternatives on this key: "gemini-flash-latest" (regular Flash) and │
# │ "gemini-flash-lite-latest" (Flash-Lite). The "-latest" aliases track the    │
# │ newest stable model and don't get retired, unlike pinned version ids.       │
# │                                                                            │
# │ Override per deploy with the GEMINI_MODEL env var (see default_model()).    │
# └────────────────────────────────────────────────────────────────────────────┘
DEFAULT_MODEL = "gemini-2.0-flash"


def api_key() -> str:
    return os.environ.get("GEMINI_API_KEY", "").strip()


def api_configured() -> bool:
    return bool(api_key())


def default_model() -> str:
    return os.environ.get("GEMINI_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL


# ── Result type ──────────────────────────────────────────────────────────────
@dataclass
class GeminiResult:
    """Everything a caller needs, and never an exception.

    ok            True when `text` came back usable.
    text          the model's concatenated text output ("" on failure).
    sources       [{"url","title"}] cited via Google Search grounding (search=True).
    rate_limited  True on HTTP 429 — the free-tier per-minute/per-day quota was hit.
    status_code   the HTTP status, when a response was received.
    error         a short human-readable reason when ok is False.
    """
    ok: bool = False
    text: str = ""
    sources: List[Dict[str, str]] = field(default_factory=list)
    rate_limited: bool = False
    status_code: Optional[int] = None
    error: Optional[str] = None


# ── Request building ─────────────────────────────────────────────────────────
def _to_contents(messages: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    """Map [{'role': 'user'|'assistant'|'model', 'content': str}] to Gemini
    `contents`. Gemini uses the role name "model" for assistant turns."""
    contents: List[Dict[str, Any]] = []
    for m in messages:
        role = m.get("role")
        text = (m.get("content") or "").strip()
        if not text:
            continue
        g_role = "model" if role in ("assistant", "model") else "user"
        contents.append({"role": g_role, "parts": [{"text": text}]})
    return contents


def _collect_sources(candidate: Dict[str, Any]) -> List[Dict[str, str]]:
    """Pull cited web pages out of a candidate's groundingMetadata (Google Search
    grounding). Each chunk is {'web': {'uri','title'}}; uri is a Google redirect
    URL that resolves to the real source, title is usually the site/domain."""
    sources: List[Dict[str, str]] = []
    seen: set = set()
    meta = candidate.get("groundingMetadata") or {}
    for chunk in meta.get("groundingChunks") or []:
        web = chunk.get("web") or {}
        url = (web.get("uri") or "").strip()
        if url and url not in seen:
            seen.add(url)
            sources.append({"url": url, "title": (web.get("title") or "").strip()})
    return sources


# ── The one call everything goes through ─────────────────────────────────────
async def generate(
    *,
    messages: List[Dict[str, str]],
    system: Optional[Union[str, List[str]]] = None,
    model: Optional[str] = None,
    temperature: Optional[float] = None,
    max_output_tokens: int = 800,
    search: bool = False,
    thinking_budget: Optional[int] = None,
    timeout: float = 45.0,
) -> GeminiResult:
    """Call Gemini `generateContent`. NEVER raises — always returns a GeminiResult.

    system            system instruction (str, or list of strings joined with blank
                      lines — lets the widget pass guardrails + KB as separate parts).
    messages          conversation turns; roles user/assistant(/model).
    search            enable Google Search grounding (used by competitor intel);
                      cited sources come back on the result's `sources`.
    thinking_budget   None (default) omits thinkingConfig entirely, letting the model
                      use its own light default — the compatible choice, since the
                      Flash-Lite / Gemini-3.x tier REJECTS thinkingBudget=0 with a 400.
                      Pass a POSITIVE budget to grant reasoning, or -1 for dynamic.
                      (Only the older 2.5 tier accepts 0 to fully disable thinking.)
    """
    if not api_configured():
        return GeminiResult(ok=False, error="GEMINI_API_KEY not configured.")

    used_model = (model or default_model()).strip()
    url = f"{GEMINI_API_BASE}/models/{used_model}:generateContent"

    gen_config: Dict[str, Any] = {"maxOutputTokens": max_output_tokens}
    if temperature is not None:
        gen_config["temperature"] = temperature
    # Only send thinkingConfig when a budget is explicitly requested — the current
    # Flash-Lite default rejects budget=0, so omitting it is the portable choice.
    if thinking_budget is not None:
        gen_config["thinkingConfig"] = {"thinkingBudget": thinking_budget}

    payload: Dict[str, Any] = {
        "contents": _to_contents(messages),
        "generationConfig": gen_config,
    }
    if system:
        parts = [system] if isinstance(system, str) else list(system)
        payload["systemInstruction"] = {"parts": [{"text": p} for p in parts if p]}
    if search:
        # Google Search grounding: the model issues its own searches server-side,
        # reads the results, and returns an answer plus groundingMetadata.
        payload["tools"] = [{"google_search": {}}]

    # The key travels in a header (never the URL / query string).
    headers = {"x-goog-api-key": api_key(), "content-type": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=timeout) as http:
            resp = await http.post(url, headers=headers, json=payload)
    except Exception as e:
        logger.error("gemini: request failed: %s", e)
        return GeminiResult(ok=False, error="Couldn't reach the AI provider.")

    if resp.status_code == 429:
        # Free-tier per-minute / per-day quota. Degrade gracefully, don't crash.
        logger.warning("gemini: rate limited (HTTP 429): %s", resp.text[:200])
        return GeminiResult(ok=False, rate_limited=True, status_code=429,
                            error="AI temporarily rate-limited (free-tier quota). Try again shortly.")
    if resp.status_code >= 400:
        logger.error("gemini: HTTP %s: %s", resp.status_code, resp.text[:300])
        return GeminiResult(ok=False, status_code=resp.status_code,
                            error=f"AI request failed (HTTP {resp.status_code}).")

    try:
        data = resp.json()
    except Exception as e:
        logger.error("gemini: could not parse response JSON: %s", e)
        return GeminiResult(ok=False, status_code=resp.status_code,
                            error="AI returned an unreadable response.")

    # A prompt-level block (safety) has no candidates, just promptFeedback.
    candidates = data.get("candidates") or []
    if not candidates:
        reason = ((data.get("promptFeedback") or {}).get("blockReason")) or "no candidates"
        logger.error("gemini: empty response (%s): %s", reason, str(data)[:200])
        return GeminiResult(ok=False, status_code=resp.status_code,
                            error=f"AI returned no answer ({reason}).")

    cand = candidates[0]
    parts = ((cand.get("content") or {}).get("parts")) or []
    text = "".join(p.get("text", "") for p in parts if isinstance(p, dict)).strip()
    sources = _collect_sources(cand) if search else []

    if not text:
        finish = cand.get("finishReason") or "unknown"
        logger.error("gemini: empty text (finishReason=%s)", finish)
        return GeminiResult(ok=False, status_code=resp.status_code,
                            error=f"AI returned an empty answer ({finish}).")

    return GeminiResult(ok=True, text=text, sources=sources, status_code=resp.status_code)
