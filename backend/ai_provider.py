"""
AI provider selector — the single indirection the three AI features import so the
backend can swap LLM providers without touching feature code.

The features (ai_email.py, widget.py, competitors.py) call `ai_provider.generate`,
`ai_provider.api_configured`, and `ai_provider.default_model`; this module routes
those to the active provider's client. Both clients expose the SAME surface and a
result object with the same fields (ok/text/sources/rate_limited/status_code/error),
so callers are provider-agnostic.

ACTIVE PROVIDER — Groq (OpenAI-compatible, generous free tier). Override with the
PROVIDER env var:  PROVIDER=groq (default)  |  PROVIDER=gemini (legacy client).
"""
import logging
import os

import gemini
import groq_client

logger = logging.getLogger("ai_provider")

DEFAULT_PROVIDER = "groq"


def provider_name() -> str:
    return (os.environ.get("PROVIDER", DEFAULT_PROVIDER).strip().lower() or DEFAULT_PROVIDER)


def _client():
    """The active provider module. Unknown values fall back to the default (Groq)."""
    name = provider_name()
    if name == "gemini":
        return gemini
    if name != DEFAULT_PROVIDER:
        logger.warning("ai_provider: unknown PROVIDER=%r; falling back to %s", name, DEFAULT_PROVIDER)
    return groq_client


def api_configured() -> bool:
    return _client().api_configured()


def default_model() -> str:
    return _client().default_model()


async def generate(**kwargs):
    """Delegate to the active provider's generate(). Signature is identical across
    clients (messages/system/model/temperature/max_output_tokens/search/
    thinking_budget/timeout); provider-specific kwargs are ignored where N/A."""
    return await _client().generate(**kwargs)
