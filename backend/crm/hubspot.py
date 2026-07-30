"""
HubSpot CRM adapter — pulls contacts from the HubSpot CRM v3 objects API and
normalizes them into our lead shape.

Auth is a HubSpot **Private App** token, read from backend/.env (HUBSPOT_TOKEN)
and sent as a Bearer header — server-side only, never the browser. Activate with
CRM_PROVIDER=hubspot.

NOTE: HUBSPOT_TOKEN (Private App token) is unrelated to HUBSPOT_CLIENT_ID/SECRET,
which belong to the separate OAuth integrations system (backend/integrations/).
"""
import os
from typing import List, Optional

import httpx

from .base import VALID_STATUSES, CrmAdapter, CrmNotConfigured, NormalizedLead

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG — adjust which HubSpot properties are pulled and how status maps.
# This is the only block you should need to edit.
# ─────────────────────────────────────────────────────────────────────────────
HUBSPOT_CONFIG = {
    "base_url": "https://api.hubapi.com",
    "list_path": "/crm/v3/objects/contacts",
    "page_size": 100,                       # HubSpot max is 100 per page
    "max_pages": 100,                       # safety cap (100 pages * 100 = 10k contacts)

    # HubSpot contact properties to request. Add/remove keys here and, if you add
    # one that feeds a normalized field, wire it into _normalize() below.
    "properties": [
        "firstname",
        "lastname",
        "email",
        "phone",
        "company",
        "hs_lead_status",
        "message",          # default enquiry source; see "enquiry_properties"
    ],

    # Where to look for the enquiry/notes text, in priority order. The first of
    # these that has a value on the contact is used as the enquiry.
    "enquiry_properties": ["message"],
    "default_enquiry": "Imported from HubSpot",

    # Map HubSpot's hs_lead_status values -> our statuses. Keys are matched
    # case-insensitively. Unmapped / missing values fall back to "new".
    "status_map": {
        "new": "new",
        "open": "new",
        "attempted to contact": "contacted",
        "in progress": "contacted",
        "contacted": "contacted",
        "connected": "interested",
        "open deal": "interested",
        "interested": "interested",
        "meeting": "meeting_booked",
        "meeting booked": "meeting_booked",
        "meeting_booked": "meeting_booked",
        "bad timing": "contacted",
        "unqualified": "closed",
        "closed": "closed",
        "won": "closed",
        "lost": "closed",
    },
    "default_status": "new",

    # Toward-E.164 phone normalization. If a number is a plain local Indian
    # 10-digit number we prefix +91; otherwise we leave it alone (never drop it).
    "default_country_code": "+91",
}
# ─────────────────────────────────────────────────────────────────────────────


def _token() -> str:
    return os.environ.get("HUBSPOT_TOKEN", "").strip()


def _normalize_phone(raw: Optional[str]) -> str:
    """Nudge toward E.164 without ever dropping a number we don't recognize."""
    if not raw:
        return ""
    phone = raw.strip()
    if not phone:
        return ""
    # Already international.
    if phone.startswith("+"):
        return phone
    digits = "".join(ch for ch in phone if ch.isdigit())
    if not digits:
        return phone  # keep whatever the user had; don't lose data
    cc = HUBSPOT_CONFIG["default_country_code"]
    # Bare 10-digit local number -> assume default country.
    if len(digits) == 10:
        return f"{cc}{digits}"
    # 12 digits starting with 91 (India) -> add the plus.
    if len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"
    # 11 digits with a leading trunk 0 -> strip it and add the country code.
    if len(digits) == 11 and digits.startswith("0"):
        return f"{cc}{digits[1:]}"
    # Unrecognized shape: return the original, untouched.
    return phone


def _map_status(raw: Optional[str]) -> str:
    if not raw:
        return HUBSPOT_CONFIG["default_status"]
    mapped = HUBSPOT_CONFIG["status_map"].get(str(raw).strip().lower())
    if mapped and mapped in VALID_STATUSES:
        return mapped
    return HUBSPOT_CONFIG["default_status"]


def _normalize(contact: dict) -> NormalizedLead:
    props = contact.get("properties") or {}

    def p(key: str) -> str:
        v = props.get(key)
        return "" if v is None else str(v).strip()

    first, last = p("firstname"), p("lastname")
    name = " ".join(part for part in (first, last) if part).strip()
    email = p("email") or None
    if not name:
        # Fall back to email (then the contact id) so name is never empty.
        name = email or f"HubSpot contact {contact.get('id')}"

    enquiry = ""
    for key in HUBSPOT_CONFIG["enquiry_properties"]:
        val = p(key)
        if val:
            enquiry = val
            break
    if not enquiry:
        enquiry = HUBSPOT_CONFIG["default_enquiry"]

    return NormalizedLead(
        external_id=str(contact.get("id")) if contact.get("id") is not None else None,
        name=name,
        phone=_normalize_phone(p("phone")),
        email=email,
        company=p("company") or None,
        enquiry=enquiry,
        status=_map_status(p("hs_lead_status")),
    )


class HubSpotCrmAdapter(CrmAdapter):
    provider = "hubspot"

    def is_ready(self) -> bool:
        return bool(_token())

    async def fetch_leads(self) -> List[NormalizedLead]:
        if not self.is_ready():
            raise CrmNotConfigured(
                "HubSpot CRM is not configured. Set HUBSPOT_TOKEN (a HubSpot Private "
                "App token) in backend/.env and set CRM_PROVIDER=hubspot."
            )

        cfg = HUBSPOT_CONFIG
        url = f'{cfg["base_url"]}{cfg["list_path"]}'
        headers = {
            "Authorization": f"Bearer {_token()}",
            "Accept": "application/json",
        }

        out: List[NormalizedLead] = []
        after: Optional[str] = None

        async with httpx.AsyncClient(timeout=30) as http:
            for _ in range(cfg["max_pages"]):
                params = {
                    "properties": ",".join(cfg["properties"]),
                    "limit": cfg["page_size"],
                }
                if after:
                    params["after"] = after

                resp = await http.get(url, headers=headers, params=params)

                # Surface HubSpot errors clearly.
                if resp.status_code == 401:
                    raise CrmNotConfigured(
                        "HubSpot rejected the token (HTTP 401). Check HUBSPOT_TOKEN is a "
                        "valid Private App token with CRM contacts read scope."
                    )
                if resp.status_code == 429:
                    retry = resp.headers.get("Retry-After", "unknown")
                    raise CrmNotConfigured(
                        f"HubSpot rate limit hit (HTTP 429). Retry-After={retry}s. "
                        "Try again shortly or lower the import frequency."
                    )
                if resp.status_code >= 400:
                    raise CrmNotConfigured(
                        f"HubSpot API error (HTTP {resp.status_code}): {resp.text[:300]}"
                    )

                data = resp.json()
                for contact in data.get("results", []) or []:
                    out.append(_normalize(contact))

                # Advance the pagination cursor, or stop.
                after = (
                    (data.get("paging") or {}).get("next") or {}
                ).get("after")
                if not after:
                    break

        return out
