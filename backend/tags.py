"""
Lead tags: a per-org tag library plus many-to-many assignments to leads.

Every route is authenticated and org-scoped. Reads and writes run in USER mode,
so Postgres RLS (org_isolation on lead_tags / lead_tag_assignments) is the real
boundary — a member of another org can never see or touch these rows, and the
assign/unassign routes can only ever wire together a lead and a tag the caller's
org already owns.

  GET    /api/tags                          list this org's tag library
  POST   /api/tags                          create a tag
  DELETE /api/tags/{tag_id}                 delete a tag (removes its assignments)

  POST   /api/leads/{lead_id}/tags          assign a tag to a lead  {tag_id}
  DELETE /api/leads/{lead_id}/tags/{tag_id} unassign a tag from a lead

The tag assignment routes live under /api/leads (a second router) so they read
as lead-scoped, which is how the UI uses them.
"""
import logging
import re
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

import supabase_client as sb
from auth import OrgContext, require_org, sb_error

logger = logging.getLogger("tags")

router = APIRouter(prefix="/api/tags", tags=["tags"])
# Lead-scoped assign/unassign — same auth, mounted under /api/leads.
assign_router = APIRouter(prefix="/api/leads", tags=["tags"])

HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
DEFAULT_COLOR = "#6b7280"


class TagOut(BaseModel):
    id: str
    org_id: Optional[str] = None
    name: str
    color: str = DEFAULT_COLOR
    created_at: Optional[str] = None


class TagIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    color: str = DEFAULT_COLOR

    @field_validator("name")
    @classmethod
    def _clean_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("tag name can't be blank")
        return v

    @field_validator("color")
    @classmethod
    def _clean_color(cls, v: str) -> str:
        v = (v or "").strip() or DEFAULT_COLOR
        if not HEX_COLOR.match(v):
            raise ValueError("color must be a 6-digit hex like #6b7280")
        return v.lower()


class TagAssignIn(BaseModel):
    tag_id: str = Field(min_length=1)


@router.get("", response_model=List[TagOut])
async def list_tags(ctx: OrgContext = Depends(require_org)):
    try:
        return await sb.list_tags(org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)


@router.post("", response_model=TagOut, status_code=201)
async def create_tag(body: TagIn, ctx: OrgContext = Depends(require_org)):
    row = {"org_id": ctx.org_id, "name": body.name, "color": body.color}
    try:
        created = await sb.insert_tag(row, token=ctx.token)
    except sb.SupabaseError as e:
        # A duplicate name (case-insensitive unique index) surfaces as 23505.
        if e.status == 409 or "duplicate" in (e.message or "").lower():
            raise HTTPException(status_code=409, detail="A tag with that name already exists.")
        raise sb_error(e)
    except Exception as e:
        raise sb_error(e)
    if not created:
        raise HTTPException(status_code=500, detail="Could not create the tag.")
    logger.info("[org %s] tag %s created (%s)", ctx.org_id, created.get("id"), body.name)
    return created


@router.delete("/{tag_id}", status_code=204)
async def delete_tag(tag_id: str, ctx: OrgContext = Depends(require_org)):
    try:
        deleted = await sb.delete_tag(tag_id, org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    if not deleted:
        raise HTTPException(status_code=404, detail="Tag not found")
    logger.info("[org %s] tag %s deleted", ctx.org_id, tag_id)
    return None


@assign_router.post("/{lead_id}/tags", response_model=List[TagOut], status_code=201)
async def assign_tag(lead_id: str, body: TagAssignIn, ctx: OrgContext = Depends(require_org)):
    """Attach an existing org tag to a lead, then return the lead's full tag set.

    Both the lead and the tag are verified to belong to the caller's org before
    the join row is written — a cross-org id gets a clean 404, never a dangling
    assignment. Re-assigning the same tag is idempotent."""
    try:
        lead = await sb.get_lead(lead_id, token=ctx.token, org_id=ctx.org_id)
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        tag = await sb.get_tag(body.tag_id, org_id=ctx.org_id, token=ctx.token)
        if not tag:
            raise HTTPException(status_code=404, detail="Tag not found")
        await sb.assign_tag(lead_id, body.tag_id, ctx.org_id, token=ctx.token)
        refreshed = await sb.get_lead(lead_id, token=ctx.token, org_id=ctx.org_id)
    except HTTPException:
        raise
    except Exception as e:
        raise sb_error(e)
    return (refreshed or {}).get("tags", [])


@assign_router.delete("/{lead_id}/tags/{tag_id}", response_model=List[TagOut])
async def unassign_tag(lead_id: str, tag_id: str, ctx: OrgContext = Depends(require_org)):
    """Detach a tag from a lead and return the remaining tag set. Removing a tag
    that isn't attached is a no-op that still returns the current set (200)."""
    try:
        lead = await sb.get_lead(lead_id, token=ctx.token, org_id=ctx.org_id)
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        await sb.unassign_tag(lead_id, tag_id, org_id=ctx.org_id, token=ctx.token)
        refreshed = await sb.get_lead(lead_id, token=ctx.token, org_id=ctx.org_id)
    except HTTPException:
        raise
    except Exception as e:
        raise sb_error(e)
    return (refreshed or {}).get("tags", [])
