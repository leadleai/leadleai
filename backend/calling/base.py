"""
Calling-provider adapter interface + the normalized shapes every adapter speaks.

This is the calling analogue of backend/crm/: one common interface, many concrete
providers. A call is described in provider-agnostic terms — an ``AgentSettings``
(what the org configured) plus a ``CallLead`` (who to call) — and each adapter
translates that into its own vendor payload. Only Bland is implemented today; a
new provider (Vapi/Retell/Exotel) is a new file implementing this interface plus
one line in the registry, with no changes to the routes or the calling code.
"""
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class CallingNotConfigured(Exception):
    """Raised when the active adapter isn't ready (missing credentials/config)."""


class VoicePreviewUnsupported(Exception):
    """Raised by preview_voice() on a provider that has no sample/preview API.
    The caller surfaces this honestly instead of fabricating audio."""


class CallLead(BaseModel):
    """Who we're calling — the provider-agnostic subset of a lead a call needs."""
    name: Optional[str] = None
    phone: str
    email: Optional[str] = None
    company: Optional[str] = None
    enquiry: Optional[str] = None
    lead_id: Optional[str] = None


class AgentSettings(BaseModel):
    """The normalized agent config an adapter turns into a vendor call payload.

    This mirrors the ``agents`` table but is deliberately provider-neutral, so the
    same object could drive any adapter. ``knowledge_base_content`` is resolved by
    the caller (the org's KB, flattened) ONLY when ``use_knowledge_base`` is set —
    the adapter just grounds the prompt in whatever text it's handed, and never
    touches the database itself.
    """
    id: Optional[str] = None
    name: str = "Ava"
    provider: str = "bland"
    voice: Optional[str] = None
    language: str = "en"
    first_message: str = ""          # greeting / opening line
    persona_prompt: str = ""         # script + personality -> the call task
    use_knowledge_base: bool = False
    temperature: float = 0.7
    max_duration: int = 5            # minutes
    extra_params: Dict[str, Any] = {}
    # Populated by the caller when use_knowledge_base is true (never by the adapter).
    knowledge_base_content: Optional[str] = None


class Voice(BaseModel):
    """One selectable voice for the agent editor's dropdown."""
    id: str
    name: str
    description: Optional[str] = None


class CallingProviderAdapter(ABC):
    """A calling backend. Two required capabilities: place a call, and list the
    voices an org can pick in the editor."""
    provider: str = "base"

    @abstractmethod
    def is_ready(self) -> bool:
        """Whether the adapter can place a call (credentials/config present)."""

    @abstractmethod
    async def place_call(self, agent_settings: AgentSettings, lead: CallLead) -> str:
        """Place a call as ``agent_settings`` to ``lead``. Returns the provider's
        call id, or raises (CallingNotConfigured when not ready; a provider error
        otherwise)."""

    @abstractmethod
    async def list_voices(self) -> List[Voice]:
        """The voices the org can choose for an agent. Should degrade to a small
        static fallback rather than raise, so the editor dropdown always populates."""

    # -- optional capability: audition a voice before choosing it --
    def supports_voice_preview(self) -> bool:
        """Whether preview_voice() can synthesize a real sample. Default False; the
        editor hides the play button when this is False rather than faking audio."""
        return False

    async def preview_voice(self, voice_id: str, text: str) -> "tuple[bytes, str]":
        """Synthesize a short sample of `voice_id` speaking `text`. Returns
        (audio_bytes, content_type). Base raises VoicePreviewUnsupported; a provider
        with a real sample API overrides this."""
        raise VoicePreviewUnsupported(f"{self.provider} does not support voice previews")
