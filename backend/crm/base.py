"""CRM adapter interface + the normalized lead shape every adapter returns."""
from abc import ABC, abstractmethod
from typing import List, Optional

from pydantic import BaseModel

# Statuses the leads table accepts (mirrors the DB check constraint).
VALID_STATUSES = {"new", "contacted", "interested", "meeting_booked", "closed"}


class NormalizedLead(BaseModel):
    """The single shape all adapters map their CRM's records into."""
    name: str
    phone: str
    email: Optional[str] = None
    company: Optional[str] = None
    enquiry: Optional[str] = None
    status: str = "new"
    external_id: Optional[str] = None


class CrmNotConfigured(Exception):
    """Raised when the active adapter isn't ready (missing config/credentials)."""


class CrmAdapter(ABC):
    """A CRM source. The one required method is fetch_leads()."""
    provider: str = "base"

    @abstractmethod
    def is_ready(self) -> bool:
        """Whether the adapter can fetch (credentials/config present)."""

    @abstractmethod
    async def fetch_leads(self) -> List[NormalizedLead]:
        """Return normalized leads from the CRM. Raises CrmNotConfigured if not ready."""
