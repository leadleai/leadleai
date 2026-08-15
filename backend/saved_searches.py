"""
SAVED SEARCHES — the category+location queries an org wants re-run on a schedule.

This module owns the CRUD for saved searches plus the usage/quota endpoint the
Automation UI reads. The TIMING itself (on/off, frequency, monthly cap) lives in
org_settings alongside the other automation knobs and is edited through
PATCH /api/org/settings; the sweep that actually runs these searches lives in
prospects.run_prospect_search_sweep (driven by /api/cron/prospect-search-sweep).

Everything here is authenticated + org-scoped: Postgres RLS (org_isolation on
public.saved_searches) is the real boundary. One saved search == one upstream
RapidAPI call each time the sweep runs it, so the monthly cap is what keeps an org
inside the 500/month free tier.

Endpoints (all under /api/saved-searches, all authenticated + org-scoped):
  GET    /api/saved-searches          list this org's saved searches
  POST   /api/saved-searches          create one (category + location, or a query)
  PATCH  /api/saved-searches/{id}     edit query/location/category/is_active
  DELETE /api/saved-searches/{id}     remove one
  GET    /api/saved-searches/usage    this month's automated-search usage + the
                                      live credit estimate inputs for the UI
"""
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import org_settings
import prospects
import supabase_client as sb
from auth import OrgContext, require_org, sb_error

logger = logging.getLogger("saved_searches")
router = APIRouter(prefix="/api/saved-searches", tags=["saved-searches"])

# The RapidAPI free tier is 500 searches/month; the UI frames the estimate against
# this hard ceiling regardless of the (≤500) per-org cap.
FREE_TIER_MONTHLY_LIMIT = 500


# ── Models ───────────────────────────────────────────────────────────────────
class SavedSearchOut(BaseModel):
    id: str
    org_id: Optional[str] = None
    query: str
    location: Optional[str] = None
    category: Optional[str] = None
    is_active: bool = True
    last_run_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class SavedSearchCreate(BaseModel):
    # Accept either a composed `query` OR split category/location (same shape the
    # manual search accepts). We resolve one canonical `query` to store.
    query: Optional[str] = Field(default=None, max_length=200)
    category: Optional[str] = Field(default=None, max_length=120)
    location: Optional[str] = Field(default=None, max_length=120)
    is_active: bool = True

    def resolved_query(self) -> str:
        if self.query and self.query.strip():
            return self.query.strip()
        parts = [p.strip() for p in (self.category, self.location) if p and p.strip()]
        if len(parts) == 2:
            return f"{parts[0]} in {parts[1]}"
        return " ".join(parts)


class SavedSearchUpdate(BaseModel):
    query: Optional[str] = Field(default=None, max_length=200)
    category: Optional[str] = Field(default=None, max_length=120)
    location: Optional[str] = Field(default=None, max_length=120)
    is_active: Optional[bool] = None


# ── CRUD ─────────────────────────────────────────────────────────────────────
@router.get("", response_model=List[SavedSearchOut])
async def list_saved_searches(ctx: OrgContext = Depends(require_org)):
    try:
        rows = await sb.list_saved_searches(org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    return [SavedSearchOut(**r) for r in rows]


@router.post("", response_model=SavedSearchOut)
async def create_saved_search(payload: SavedSearchCreate, ctx: OrgContext = Depends(require_org)):
    query = payload.resolved_query()
    if not query:
        raise HTTPException(status_code=400, detail="Enter a category and location (e.g. 'salons' in 'Mumbai').")
    row = {
        "org_id": ctx.org_id,
        "query": query,
        "category": (payload.category or "").strip() or None,
        "location": (payload.location or "").strip() or None,
        "is_active": payload.is_active,
    }
    try:
        created = await sb.insert_saved_search(row, token=ctx.token)
    except sb.SupabaseNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise sb_error(e)
    return SavedSearchOut(**created)


@router.patch("/{search_id}", response_model=SavedSearchOut)
async def update_saved_search(search_id: str, payload: SavedSearchUpdate, ctx: OrgContext = Depends(require_org)):
    fields: Dict[str, Any] = {}
    if payload.query is not None:
        q = payload.query.strip()
        if not q:
            raise HTTPException(status_code=400, detail="Query can't be blank.")
        fields["query"] = q
    if payload.category is not None:
        fields["category"] = payload.category.strip() or None
    if payload.location is not None:
        fields["location"] = payload.location.strip() or None
    if payload.is_active is not None:
        fields["is_active"] = payload.is_active
    if not fields:
        raise HTTPException(status_code=400, detail="Nothing to update.")

    try:
        row = await sb.update_saved_search(search_id, fields, org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    if not row:
        raise HTTPException(status_code=404, detail="Saved search not found")
    return SavedSearchOut(**row)


@router.delete("/{search_id}")
async def delete_saved_search(search_id: str, ctx: OrgContext = Depends(require_org)):
    try:
        row = await sb.delete_saved_search(search_id, org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    if not row:
        raise HTTPException(status_code=404, detail="Saved search not found")
    return {"deleted": True, "id": search_id}


# ── Usage / quota (drives the live credit estimate in Automation settings) ────
@router.get("/usage")
async def usage(ctx: OrgContext = Depends(require_org)):
    """This org's automated-search usage for the current calendar month, plus the
    inputs the Automation UI needs to render (and recompute) the credit estimate:

      used                 automated searches run so far this month
      max_per_month        this org's configured cap
      free_tier_limit      the hard RapidAPI ceiling (500)
      remaining            searches left this month (against the cap)
      active_search_count  active saved searches (× runs/month drives the estimate)
      frequency_hours      current per-search frequency
      hours_per_month      the constant the estimate divides by (≈730)

    Estimate (also computed live in the UI as the slider moves):
        runs_per_month  = hours_per_month / frequency_hours
        projected_usage = active_search_count × runs_per_month
    """
    cfg = await org_settings.resolve_for_org(ctx.org_id, token=ctx.token)
    since = prospects.month_start_iso()
    try:
        used = await sb.count_prospect_search_runs_since(ctx.org_id, since, token=ctx.token)
    except Exception as e:
        raise sb_error(e)

    try:
        searches = await sb.list_saved_searches(org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    active_count = sum(1 for s in searches if s.get("is_active"))

    freq = cfg.prospect_search_frequency_hours
    runs_per_month = prospects.AVG_HOURS_PER_MONTH / freq if freq else 0.0
    projected = active_count * runs_per_month

    return {
        "used": used,
        "max_per_month": cfg.prospect_search_max_per_month,
        "free_tier_limit": FREE_TIER_MONTHLY_LIMIT,
        "remaining": max(0, cfg.prospect_search_max_per_month - used),
        "active_search_count": active_count,
        "total_search_count": len(searches),
        "frequency_hours": freq,
        "enabled": cfg.prospect_search_enabled,
        "hours_per_month": prospects.AVG_HOURS_PER_MONTH,
        "runs_per_month": round(runs_per_month, 2),
        "projected_monthly_usage": round(projected, 1),
    }
