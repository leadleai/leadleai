"""
Organization + team management.

  GET    /api/org/me                    current org, the user, and their orgs
  GET    /api/org/members               members (name, email, role, joined)
  PATCH  /api/org/members/{user_id}     change a member's role   (owners only)
  DELETE /api/org/members/{user_id}     remove a member          (owners only)
  GET    /api/org/invites               pending invites          (owners only)
  POST   /api/org/invites               invite by email + role   (owners only)
  DELETE /api/org/invites/{id}          revoke a pending invite  (owners only)
  POST   /api/org/invites/accept        redeem an invite token   (any signed-in user)

Everything on the request path runs in USER mode against Supabase, so the RLS
policies from migration 0008 are the real enforcement and this module is a
convenience layer — EXCEPT the token accept, which is service mode because the
person joining is not yet a member (see accept_invite). Two invariants are
belt-and-suspanders'd here AND in the database (migration 0016):
  * only owners manage the team  (RLS `*_owner_write` + require_owner)
  * an org always keeps >=1 owner (memberships_keep_owner trigger + checks here)
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

import supabase_client as sb
from auth import OrgContext, Principal, require_org, require_owner, require_user, sb_error

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


@public_router.get("/invite/{token}")
async def preview_invite(token: str):
    """Unauthenticated preview of an invite link, so the accept page can say who
    it's for before the visitor logs in. The token is a secret held only by the
    intended recipient (or whoever they forwarded it to), so returning the target
    email + org name to its bearer is acceptable. Redeeming still requires signing
    in as the invited email (see accept_invite)."""
    try:
        invite = await sb.get_invite_by_token((token or "").strip())
    except Exception as e:
        raise sb_error(e)
    if not invite:
        raise HTTPException(status_code=404, detail="This invite link is invalid.")
    org = invite.get("organization") or {}
    expired = bool(invite.get("expires_at") and _is_expired(invite["expires_at"]))
    return {
        "email": invite.get("email"),
        "role": invite.get("role") or "member",
        "org_name": org.get("name"),
        "status": invite.get("status"),
        "expired": expired,
        "valid": invite.get("status") == "pending" and not expired,
    }


# ── Models ───────────────────────────────────────────────────────────────────
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
    name: Optional[str] = None
    email: Optional[str] = None
    role: str
    created_at: Optional[str] = None   # joined date
    is_you: bool = False


class MembersOut(BaseModel):
    members: List[MemberOut]
    can_manage: bool
    your_role: str


class InviteOut(BaseModel):
    id: str
    email: str
    role: str
    token: Optional[str] = None
    status: Optional[str] = None
    created_at: Optional[str] = None
    expires_at: Optional[str] = None


class InviteIn(BaseModel):
    email: EmailStr
    role: str = Field(default="member")

    @property
    def normalized_role(self) -> str:
        return "owner" if self.role == "owner" else "member"


class RoleIn(BaseModel):
    role: str

    @property
    def normalized_role(self) -> str:
        return "owner" if self.role == "owner" else "member"


class AcceptIn(BaseModel):
    token: str


def _org_out(membership: dict) -> OrgOut:
    org = membership.get("organization") or {}
    return OrgOut(
        id=membership["org_id"],
        name=org.get("name"),
        slug=org.get("slug"),
        role=membership.get("role") or "member",
    )


def _display_name(user: Optional[dict]) -> Optional[str]:
    """A human name for a member: OAuth profile name, else the email's local part."""
    if not user:
        return None
    meta = user.get("user_metadata") or user.get("raw_user_meta_data") or {}
    for key in ("full_name", "name"):
        val = (meta.get(key) or "").strip()
        if val:
            return val
    email = user.get("email") or ""
    return email.split("@")[0] or None


# ── Me ───────────────────────────────────────────────────────────────────────
@router.get("/me", response_model=MeOut)
async def me(ctx: OrgContext = Depends(require_org)):
    """Who am I, which org am I in, and what else could I switch to."""
    return MeOut(
        user_id=ctx.user_id,
        email=ctx.principal.email,
        org=OrgOut(id=ctx.org_id, name=ctx.org.get("name"), slug=ctx.org.get("slug"), role=ctx.role),
        orgs=[_org_out(m) for m in ctx.memberships],
    )


# ── Members ──────────────────────────────────────────────────────────────────
async def _members(ctx: OrgContext) -> List[MemberOut]:
    """Resolve this org's membership rows into MemberOut with name + email.

    Emails/names live in auth.users, which PostgREST can't reach, so we resolve
    them via the admin API — safe because require_org + RLS already proved the
    caller belongs to this org."""
    rows = await sb.list_org_members(ctx.org_id, token=ctx.token)
    out: List[MemberOut] = []
    for row in rows:
        name = email = None
        try:
            user = await sb.admin_get_user(row["user_id"])
            email = (user or {}).get("email")
            name = _display_name(user)
        except Exception as e:
            logger.warning("could not resolve identity for user %s: %s", row.get("user_id"), e)
        out.append(MemberOut(
            id=row["id"],
            user_id=row["user_id"],
            name=name,
            email=email,
            role=row.get("role") or "member",
            created_at=row.get("created_at"),
            is_you=row["user_id"] == ctx.user_id,
        ))
    return out


@router.get("/members", response_model=MembersOut)
async def members(ctx: OrgContext = Depends(require_org)):
    try:
        out = await _members(ctx)
    except Exception as e:
        raise sb_error(e)
    return MembersOut(members=out, can_manage=ctx.is_owner, your_role=ctx.role)


def _owner_user_ids(rows: List[dict]) -> List[str]:
    return [r["user_id"] for r in rows if (r.get("role") or "member") == "owner"]


@router.patch("/members/{user_id}")
async def change_role(user_id: str, payload: RoleIn, ctx: OrgContext = Depends(require_owner)):
    """Promote/demote a member. Guarded so the org never loses its last owner —
    the DB trigger enforces the same rule, this just gives a friendlier 400."""
    role = payload.normalized_role
    try:
        rows = await sb.list_org_members(ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)

    target = next((r for r in rows if r["user_id"] == user_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Member not found in this organization.")

    current = target.get("role") or "member"
    if current == role:
        return {"user_id": user_id, "role": role, "unchanged": True}

    # Demoting the sole owner would orphan the org.
    if current == "owner" and role == "member":
        owners = _owner_user_ids(rows)
        if len(owners) <= 1:
            raise HTTPException(
                status_code=400,
                detail="This is the organization's only owner. Promote someone else to owner first.",
            )

    try:
        await sb.update_member_role(ctx.org_id, user_id, role, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    logger.info("[org %s] role of %s -> %s", ctx.org_id, user_id, role)
    return {"user_id": user_id, "role": role}


@router.delete("/members/{user_id}")
async def remove_member(user_id: str, ctx: OrgContext = Depends(require_owner)):
    """Remove a teammate. Can't remove yourself, and can't remove the last owner."""
    if user_id == ctx.user_id:
        raise HTTPException(status_code=400, detail="You can't remove yourself from the organization.")

    try:
        rows = await sb.list_org_members(ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)

    target = next((r for r in rows if r["user_id"] == user_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Member not found in this organization.")

    if (target.get("role") or "member") == "owner" and len(_owner_user_ids(rows)) <= 1:
        raise HTTPException(
            status_code=400,
            detail="This is the organization's only owner and can't be removed.",
        )

    try:
        await sb.remove_membership(ctx.org_id, user_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    logger.info("[org %s] removed member %s", ctx.org_id, user_id)
    return {"removed": user_id}


# ── Invites ──────────────────────────────────────────────────────────────────
@router.get("/invites", response_model=List[InviteOut])
async def list_invites(ctx: OrgContext = Depends(require_owner)):
    try:
        rows = await sb.list_invites(ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    return [InviteOut(**r) for r in rows]


@router.post("/invites")
async def create_invite(payload: InviteIn, ctx: OrgContext = Depends(require_owner)):
    """Invite someone by email + role.

    If they already have an account we add the membership immediately. Otherwise
    we record a pending invite carrying a shareable token — they can either sign
    up with this email (the migration-0008 trigger joins them automatically) or
    redeem the token via the invite link.
    """
    email = str(payload.email).strip().lower()
    role = payload.normalized_role

    try:
        existing = await sb.admin_find_user_by_email(email)
    except Exception as e:
        raise sb_error(e)

    if existing and existing.get("id"):
        if existing["id"] == ctx.user_id:
            raise HTTPException(status_code=400, detail="That's you — you're already in this workspace.")
        try:
            await sb.add_membership(ctx.org_id, existing["id"], role, token=ctx.token)
        except Exception as e:
            raise sb_error(e)
        logger.info("[org %s] added existing user %s as %s", ctx.org_id, email, role)
        return {"added": True, "pending": False, "email": email, "role": role}

    try:
        invite = await sb.create_invite(ctx.org_id, email, role, ctx.user_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    logger.info("[org %s] invited %s as %s (pending)", ctx.org_id, email, role)
    return {
        "added": False,
        "pending": True,
        "email": email,
        "role": role,
        "invite": InviteOut(**invite) if invite else None,
    }


@router.delete("/invites/{invite_id}")
async def revoke_invite(invite_id: str, ctx: OrgContext = Depends(require_owner)):
    try:
        await sb.delete_invite(invite_id, ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    return {"revoked": invite_id}


@router.post("/invites/accept")
async def accept_invite(payload: AcceptIn, principal: Principal = Depends(require_user)):
    """Redeem an invite token and join the inviting org.

    Any signed-in user may call this; authorisation comes from possessing a valid
    token AND the token's target email matching the caller's own email — so a
    leaked token can't be redeemed by the wrong person. Service mode is required
    because the caller isn't a member yet and thus has no RLS access to the org's
    invites/memberships.
    """
    token_value = (payload.token or "").strip()
    if not token_value:
        raise HTTPException(status_code=400, detail="Missing invite token.")

    try:
        invite = await sb.get_invite_by_token(token_value)
    except Exception as e:
        raise sb_error(e)

    if not invite:
        raise HTTPException(status_code=404, detail="This invite link is invalid.")

    org = invite.get("organization") or {}

    # Idempotent: the signup trigger may already have joined this user by email
    # (the common flow when they sign up with the invited address). Don't error —
    # just confirm they're in.
    if invite.get("status") != "pending":
        try:
            already = await sb.is_org_member(invite["org_id"], principal.user_id)
        except Exception as e:
            raise sb_error(e)
        if already:
            return {
                "joined": True,
                "org": {"id": invite["org_id"], "name": org.get("name"), "slug": org.get("slug")},
                "role": invite.get("role") or "member",
            }
        raise HTTPException(status_code=409, detail="This invite has already been used or revoked.")

    expires_at = invite.get("expires_at")
    if expires_at and _is_expired(expires_at):
        raise HTTPException(status_code=410, detail="This invite has expired. Ask for a new one.")

    invited_email = (invite.get("email") or "").strip().lower()
    caller_email = (principal.email or "").strip().lower()
    if not caller_email or caller_email != invited_email:
        raise HTTPException(
            status_code=403,
            detail=f"This invite was sent to {invited_email}. Sign in with that email to accept it.",
        )

    try:
        await sb.add_membership_service(invite["org_id"], principal.user_id, invite.get("role") or "member")
        await sb.mark_invite_accepted(invite["id"])
    except Exception as e:
        raise sb_error(e)

    logger.info("[org %s] %s accepted invite via token", invite["org_id"], caller_email)
    return {
        "joined": True,
        "org": {"id": invite["org_id"], "name": org.get("name"), "slug": org.get("slug")},
        "role": invite.get("role") or "member",
    }


def _is_expired(iso_ts: str) -> bool:
    from datetime import datetime, timezone
    try:
        dt = datetime.fromisoformat(iso_ts.replace("Z", "+00:00"))
    except ValueError:
        return False
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt < datetime.now(timezone.utc)
