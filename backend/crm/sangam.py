"""
Sangam CRM adapter — STUB. Structured and ready; fill in + verify the CONFIG
against your Sangam account, then set CRM_PROVIDER=sangam.
Credentials come from backend/.env (SANGAM_API_URL, SANGAM_TOKEN) — never the browser.
"""
import os
from typing import List

import httpx

from .base import CrmAdapter, CrmNotConfigured, NormalizedLead

# ─────────────────────────────────────────────────────────────────────────────
# ⚠️  VERIFY EVERYTHING IN THIS BLOCK AGAINST YOUR SANGAM ACCOUNT / API DOCS  ⚠️
# Only this CONFIG should need editing to go live.
# ─────────────────────────────────────────────────────────────────────────────
SANGAM_CONFIG = {
    # Base URL comes from env (SANGAM_API_URL), e.g. https://<domain>.sangamcrm.com/api/v1
    "auth_header_name": "Authorization",   # ⚠️ VERIFY (header name)
    "auth_header_prefix": "",              # ⚠️ VERIFY ("" for a raw token, or "Bearer ")
    "list_path": "get-data",               # ⚠️ VERIFY (save-data is known; list path is not)
    "list_method": "POST",                 # ⚠️ VERIFY (GET or POST)
    "module_name": "Lead",                 # confirmed
    "records_keys": ["data", "records", "result", "rows"],  # ⚠️ VERIFY where the array lives
    "field_map": {                         # ⚠️ VERIFY each source key
        "name": "last_name",
        "phone": "phone",
        "email": "email",
        "company": "company",
        "enquiry": "comment",
        "external_id": "id",
        "status": "status",
    },
}


def _base_url() -> str:
    return os.environ.get("SANGAM_API_URL", "").rstrip("/")


def _token() -> str:
    return os.environ.get("SANGAM_TOKEN", "")


class SangamCrmAdapter(CrmAdapter):
    provider = "sangam"

    def is_ready(self) -> bool:
        return bool(_base_url() and _token())

    async def fetch_leads(self) -> List[NormalizedLead]:
        if not self.is_ready():
            raise CrmNotConfigured(
                "Sangam CRM is not configured. Set SANGAM_API_URL and SANGAM_TOKEN in "
                "backend/.env (and verify SANGAM_CONFIG in backend/crm/sangam.py)."
            )

        cfg = SANGAM_CONFIG
        headers = {
            cfg["auth_header_name"]: f'{cfg["auth_header_prefix"]}{_token()}',
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        url = f'{_base_url()}/{cfg["list_path"].lstrip("/")}'
        body = {"module_name": cfg["module_name"]}  # ⚠️ VERIFY params/pagination

        async with httpx.AsyncClient(timeout=20) as http:
            if cfg["list_method"].upper() == "GET":
                resp = await http.get(url, headers=headers, params=body)
            else:
                resp = await http.post(url, headers=headers, json=body)

        if resp.status_code >= 400:
            # Surface Sangam's error (e.g. {"status":401,"message":"Unauthorised Key"}).
            raise CrmNotConfigured(f"Sangam API error (HTTP {resp.status_code}): {resp.text[:200]}")

        data = resp.json()
        records = None
        for key in cfg["records_keys"]:
            if isinstance(data, dict) and isinstance(data.get(key), list):
                records = data[key]
                break
        if records is None:
            records = data if isinstance(data, list) else []

        fm = cfg["field_map"]

        def s(rec, k):
            v = rec.get(k)
            return None if v is None else str(v).strip()

        out: List[NormalizedLead] = []
        for rec in records:
            ext = s(rec, fm["external_id"])
            out.append(NormalizedLead(
                name=s(rec, fm["name"]) or "Unknown",
                phone=s(rec, fm["phone"]) or "",
                email=s(rec, fm["email"]),
                company=s(rec, fm["company"]),
                enquiry=s(rec, fm["enquiry"]),
                status=s(rec, fm["status"]) or "new",
                external_id=ext,
            ))
        return out
