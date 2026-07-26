"""
CRM lead-import API.

  GET  /api/crm/status   which adapter is active and whether it's ready
  POST /api/crm/import   fetch via the active adapter, upsert into `leads`
                         (dedupe on external_id or phone), tag source='crm'

The active adapter is chosen by CRM_PROVIDER (default "mock").
"""
import logging
import os

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

import supabase_client as sb
import auto_call
from auth import OrgContext, require_org
from .base import CrmAdapter, CrmNotConfigured
from .mock import MockCrmAdapter
from .sangam import SangamCrmAdapter

logger = logging.getLogger("crm")
router = APIRouter(prefix="/api/crm", tags=["crm"])

_ADAPTERS = {"mock": MockCrmAdapter, "sangam": SangamCrmAdapter}


def get_adapter() -> CrmAdapter:
    name = os.environ.get("CRM_PROVIDER", "mock").strip().lower()
    cls = _ADAPTERS.get(name, MockCrmAdapter)
    return cls()


class ImportResult(BaseModel):
    provider: str
    imported: int
    updated: int
    skipped: int
    total: int
    # Auto-call outcome: {"queued": n, "skipped": {"disabled", "quiet_hours", "duplicate", "not_new"}}
    auto_calls: dict = {}


@router.get("/status")
async def crm_status(ctx: OrgContext = Depends(require_org)):
    adapter = get_adapter()
    return {
        "provider": adapter.provider,
        "ready": adapter.is_ready(),
        "available": list(_ADAPTERS.keys()),
    }


@router.post("/import", response_model=ImportResult)
async def crm_import(background_tasks: BackgroundTasks, ctx: OrgContext = Depends(require_org)):
    """Imports into the CALLER's org. Dedupe is org-scoped, so two tenants
    importing the same CRM contact each get their own lead row."""
    adapter = get_adapter()

    try:
        leads = await adapter.fetch_leads()
    except CrmNotConfigured as e:
        logger.warning("[crm import %s] blocked: %s", adapter.provider, e)
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:  # network/parse failures from a real adapter
        logger.exception("[crm import %s] fetch failed", adapter.provider)
        raise HTTPException(status_code=502, detail=f"CRM fetch failed: {e}")

    imported = updated = skipped = 0
    new_leads = []       # NEWLY inserted rows with status 'new' -> auto-call candidates
    imported_not_new = 0  # newly inserted but status != 'new' -> not auto-called
    try:
        for lead in leads:
            if not (lead.phone or "").strip() or not (lead.name or "").strip():
                skipped += 1
                logger.info("[crm import %s] skip (missing name/phone) external_id=%s", adapter.provider, lead.external_id)
                continue

            existing = await sb.find_lead(
                lead.external_id, lead.phone, org_id=ctx.org_id, token=ctx.token
            )
            if existing:
                # Update contact fields; preserve local status (don't clobber
                # auto-call/manual progress). Updated leads are NOT re-called.
                await sb.update_lead_fields(existing["id"], {
                    "name": lead.name,
                    "email": lead.email,
                    "company": lead.company,
                    "enquiry": lead.enquiry,
                    "external_id": lead.external_id,
                    "source": "crm",
                }, org_id=ctx.org_id, token=ctx.token)
                updated += 1
                logger.info("[crm import %s] update lead=%s external_id=%s (%s)", adapter.provider, existing["id"], lead.external_id, lead.name)
            else:
                created = await sb.insert_lead({
                    "org_id": ctx.org_id,
                    "name": lead.name,
                    "phone": lead.phone,
                    "email": lead.email,
                    "company": lead.company,
                    "enquiry": lead.enquiry,
                    "status": lead.status or "new",
                    "source": "crm",
                    "external_id": lead.external_id,
                }, token=ctx.token)
                imported += 1
                logger.info("[crm import %s] insert external_id=%s (%s)", adapter.provider, lead.external_id, lead.name)
                if created and created.get("status") == "new":
                    new_leads.append(created)  # eligible for auto-call
                else:
                    imported_not_new += 1
    except sb.SupabaseNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))
    except sb.SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.message}")

    # Schedule auto-calls only for NEWLY imported 'new' leads, via the existing engine.
    auto = await auto_call.schedule_for_imported(new_leads, background_tasks)
    auto["skipped"]["not_new"] = imported_not_new

    logger.info(
        "[crm import %s] done: imported=%d updated=%d skipped=%d (total=%d) | auto-calls queued=%d skipped=%s",
        adapter.provider, imported, updated, skipped, len(leads), auto["queued"], auto["skipped"],
    )
    return ImportResult(
        provider=adapter.provider, imported=imported, updated=updated, skipped=skipped,
        total=len(leads), auto_calls=auto,
    )
