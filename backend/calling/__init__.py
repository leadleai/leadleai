"""
Pluggable calling providers: a common adapter interface + a provider registry.

Adding a provider later is a two-step, code-only change:
  1. write backend/calling/<name>.py with a class implementing CallingProviderAdapter
  2. register it in _ADAPTERS below
The agents table's `provider` column then just needs to carry that name; no route,
schema, or call-placement change is required.
"""
from typing import Dict, Type

from .base import (
    AgentSettings,
    CallingNotConfigured,
    CallingProviderAdapter,
    CallLead,
    Voice,
    VoicePreviewUnsupported,
)
from .bland import BlandProviderAdapter

# provider name (matches agents.provider) -> adapter class.
_ADAPTERS: Dict[str, Type[CallingProviderAdapter]] = {
    "bland": BlandProviderAdapter,
}

# The provider used when an agent doesn't name one / for the legacy default.
DEFAULT_PROVIDER = "bland"


def available_providers() -> list:
    return list(_ADAPTERS.keys())


def get_adapter(provider: str = DEFAULT_PROVIDER) -> CallingProviderAdapter:
    """The adapter for `provider`, falling back to the default provider for an
    unknown/blank name (so a stray value never breaks call placement)."""
    cls = _ADAPTERS.get((provider or "").strip().lower(), _ADAPTERS[DEFAULT_PROVIDER])
    return cls()


__all__ = [
    "AgentSettings",
    "CallLead",
    "Voice",
    "CallingProviderAdapter",
    "CallingNotConfigured",
    "VoicePreviewUnsupported",
    "get_adapter",
    "available_providers",
    "DEFAULT_PROVIDER",
]
