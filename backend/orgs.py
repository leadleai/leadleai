"""
Organization + team management.

  GET    /api/org/me                current org, the user, and every org they belong to
  GET    /api/org/members           members (with emails) + pending invites
  POST   /api/org/invite            invite by email          (owners only)
  DELETE /api/org/invite/{id}       revoke a pending invite  (owners only)
  DELETE /api/org/members/{id}      remove a member          (owners only)

Everything here runs in USER mode against Supabase, so the RLS policies from
migration 0008 are the real enforcement — this module is a convenience layer,
not the security boundary.
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

import supabase_client as sb
from auth import OrgContext, require_org, require_owner, sb_error

logger = logging.getLogger("orgs")
router = APIRouter(prefix="/api/org", tags=["org"])
# Unauthenticated, deliberately. Used by the public enquiry form to show whose
# form you're filling in. Returns name + slug only — never members or counts.
public_router = APIRouter(prefix="/api/public", tags=["public"])


@public_router.get("/org/{slug}")
async def public_org(slug: str):
    try:
        org = await sb.get_org_by_slug(slug)
    except Exception as e:
        raise sb_error(e)
    if not org:
        raise HTTPException(status_code=404, detail="Unknown enquiry form.")
    return {"name": org.get("name"), "slug": org.get("slug")}


class OrgOut(BaseModel):
    id: str
    name: Optional[str] = None
    slug: Optional[str] = None
    role: str


class MeOut(BaseModel):
    user_id: str
    email: Optional[str] = None
    org: OrgOut
    orgs: List[OrgOut]


class MemberOut(BaseModel):
    id: str                      # membership id
    user_id: str
    email: Optional[str] = None
    role: str
    created_at: Optional[str] = None
    is_you: bool = False


class InviteOut(BaseModel):
    id: str
    email: str
    role: str
    created_at: Optional[str] = None


class TeamOut(BaseModel):
    members: List[MemberOut]
    invites: List[InviteOut]
    can_manage: bool


class InviteIn(BaseModel):
    email: EmailStr
    role: str = Field(default="member")

    @property
    def normalized_role(self) -> str:
        return "owner" if self.role == "owner" else "member"


def _org_out(membership: dict) -> OrgOut:
    org = membership.get("organization") or {}
    return OrgOut(
        id=membership["org_id"],
        name=org.get("name"),
        slug=org.get("slug"),
        role=membership.get("role") or "member",
    )


@router.get("/me", response_model=MeOut)
async def me(ctx: OrgContext = Depends(require_org)):
    """Who am I, which org am I in, and what else could I switch to."""
    return MeOut(
        user_id=ctx.user_id,
        email=ctx.principal.email,
        org=OrgOut(id=ctx.org_id, name=ctx.org.get("name"), slug=ctx.org.get("slug"), role=ctx.role),
        orgs=[_org_out(m) for m in ctx.memberships],
    )


@router.get("/members", response_model=TeamOut)
async def members(ctx: OrgContext = Depends(require_org)):
    try:
        rows = await sb.list_org_members(ctx.org_id, token=ctx.token)
        invites = await sb.list_invites(ctx.org_id, token=ctx.token) if ctx.is_owner else []
    except Exception as e:
        raise sb_error(e)

    out: List[MemberOut] = []
    for row in rows:
        email = None
        try:
            # Safe: membership in this org was already proven by require_org + RLS.
            user = await sb.admin_get_user(row["user_id"])
            email = (user or {}).get("email")
        except Exception as e:
            logger.warning("could not resolve email for user %s: %s", row.get("user_id"), e)
        out.append(MemberOut(
            id=row["id"],
            user_id=row["user_id"],
            email=email,
            role=row.get("role") or "member",
            created_at=row.get("created_at"),
            is_you=row["user_id"] == ctx.user_id,
        ))

    return TeamOut(
        members=out,
        invites=[InviteOut(**i) for i in invites],
        can_manage=ctx.is_owner,
    )


@router.post("/invite")
async def invite(payload: InviteIn, ctx: OrgContext = Depends(require_owner)):
    """Add someone by email.

    If they already have an account we add the membership immediately. If not,
    we record a pending invite — the signup trigger in migration 0008 puts them
    straight into this org when they register instead of creating their own.
    """
    email = str(payload.email).strip().lower()
    role = payload.normalized_role

    try:
        existing = await sb.admin_find_user_by_email(email)
    except Exception as e:
        raise sb_error(e)

    if existing and existing.get("id"):
        try:
            await sb.add_membership(ctx.org_id, existing["id"], role, token=ctx.token)
        except Exception as e:
            raise sb_error(e)
        logger.info("[org %s] added existing user %s as %s", ctx.org_id, email, role)
        return {"added": True, "pending": False, "email": email, "role": role}

    try:
        await sb.create_invite(ctx.org_id, email, role, ctx.user_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    logger.info("[org %s] invited %s as %s (pending signup)", ctx.org_id, email, role)
    return {"added": False, "pending": True, "email": email, "role": role}


@router.delete("/invite/{invite_id}")
async def revoke_invite(invite_id: str, ctx: OrgContext = Depends(require_owner)):
    try:
        await sb.delete_invite(invite_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    return {"revoked": invite_id}


@router.delete("/members/{membership_id}")
async def remove_member(membership_id: str, ctx: OrgContext = Depends(require_owner)):
    """Remove a teammate. You cannot remove yourself — that would risk orphaning
    an org with no owner."""
    try:
        rows = await sb.list_org_members(ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)

    target = next((r for r in rows if r["id"] == membership_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Member not found in this organization.")
    if target["user_id"] == ctx.user_id:
        raise HTTPException(status_code=400, detail="You can't remove yourself from the organization.")

    try:
        await sb.remove_membership(membership_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    return {"removed": membership_id}
