"""
Inbound leads API.

  POST  /api/leads          PUBLIC enquiry-form submissions -> Supabase `leads`
  GET   /api/leads          list this org's leads      (auth required)
  PATCH /api/leads/{id}     update a lead's status     (auth required)

POST stays public — that is the whole point of an enquiry form — but it must
still file the lead under the right organization. The submitter names the org
with a non-secret `org_slug` (the /enquiry/:slug URL); knowing a slug lets you
SUBMIT to an org, never READ from it. When no slug is given we fall back to
DEFAULT_ORG_SLUG in backend/.env so the pre-multi-tenant /enquiry link keeps
working.

Reads and writes on the dashboard side run in USER mode, so Postgres RLS —
not this file — is what actually prevents cross-org access.
"""
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field, field_validator

import supabase_client as sb
from auth import OrgContext, require_org, sb_error

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/leads", tags=["leads"])

# Lead lifecycle. The order also drives the "next status" affordance in the UI.
LEAD_STATUSES = ["new", "contacted", "interested", "meeting_booked", "closed"]
E164 = re.compile(r"^\+[1-9]\d{7,14}$")  # "+" then 8–15 digits, country code required


def default_org_slug() -> str:
    return os.environ.get("DEFAULT_ORG_SLUG", "default").strip()


class LeadIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    phone: str
    email: EmailStr
    company: Optional[str] = Field(default=None, max_length=200)
    enquiry: str = Field(min_length=1, max_length=5000)
    # Which org this enquiry belongs to. Public, non-secret; see module docstring.
    org_slug: Optional[str] = Field(default=None, max_length=100)

    @field_validator("phone")
    @classmethod
    def phone_e164(cls, v: str) -> str:
        v = v.strip()
        if not E164.match(v):
            raise ValueError("phone must be E.164 with country code, e.g. +919812345678")
        return v

    @field_validator("name", "enquiry")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("must not be blank")
        return v


class LeadOut(BaseModel):
    id: str
    org_id: Optional[str] = None
    name: str
    phone: str
    email: str
    company: Optional[str] = None
    enquiry: str
    status: str
    source: str
    created_at: Optional[str] = None
    auto_called_at: Optional[str] = None
    call_id: Optional[str] = None
    external_id: Optional[str] = None
    followup_step: int = 0
    last_followup_at: Optional[str] = None
    followup_unsubscribed: bool = False


class StatusUpdate(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def valid_status(cls, v: str) -> str:
        if v not in LEAD_STATUSES:
            raise ValueError(f"status must be one of {LEAD_STATUSES}")
        return v


class ActivityEvent(BaseModel):
    """One entry in a lead's chronological activity timeline. The frontend keys
    its icon/styling off `type` and `outcome`; `meta` carries type-specific
    extras (call_id, step, error, …) without widening the top-level shape."""
    id: str
    type: str                         # "enquiry" | "call" | "email" | "status"
    timestamp: Optional[str] = None
    title: str
    detail: Optional[str] = None
    outcome: Optional[str] = None     # "placed"/"failed"/"sent" etc. — sub-status
    meta: Dict[str, Any] = Field(default_factory=dict)


def _parse_ts(value: Optional[str]) -> datetime:
    """Best-effort ISO-8601 -> aware datetime for sorting. Unparseable/absent
    timestamps sort oldest so a good event never hides behind a bad one."""
    if not value:
        return datetime.min.replace(tzinfo=timezone.utc)
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, AttributeError):
        return datetime.min.replace(tzinfo=timezone.utc)


async def resolve_public_org(slug: Optional[str]) -> dict:
    """Map an enquiry-form slug to an org, or 404/503 with a useful message."""
    wanted = (slug or "").strip() or default_org_slug()
    try:
        org = await sb.get_org_by_slug(wanted)
    except Exception as e:
        raise sb_error(e)
    if not org:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Unknown enquiry form '{wanted}'. Check the /enquiry/<slug> URL, "
                "or set DEFAULT_ORG_SLUG in backend/.env."
            ),
        )
    return org


@router.post("", response_model=LeadOut, status_code=201)
async def create_lead(lead: LeadIn):
    """PUBLIC: called by the enquiry form. Service mode (the submitter has no
    session), so org_id is set explicitly from the resolved slug.

    Auto-calling is NO LONGER scheduled here as an in-process background task
    (unreliable on Cloud Run scale-to-zero). The lead is simply inserted as
    'new'; the auto-call SWEEP (POST /api/cron/auto-call-sweep, driven by Cloud
    Scheduler) picks it up once AUTO_CALL_DELAY_SECONDS has elapsed, applying all
    the same guardrails."""
    org = await resolve_public_org(lead.org_slug)

    row = {
        "org_id": org["id"],
        "name": lead.name,
        "phone": lead.phone,
        "email": str(lead.email),
        "company": lead.company,
        "enquiry": lead.enquiry,
        # status ('new'), source ('inbound') and created_at come from column defaults.
    }
    try:
        created = await sb.insert_lead(row)
    except Exception as e:
        raise sb_error(e)

    logger.info("[lead %s] created for org %s (%s) — auto-call sweep will pick it up",
                created.get("id"), org["id"], org.get("slug"))
    return created


@router.get("", response_model=List[LeadOut])
async def get_leads(ctx: OrgContext = Depends(require_org)):
    try:
        return await sb.list_leads(token=ctx.token, org_id=ctx.org_id)
    except Exception as e:
        raise sb_error(e)


@router.get("/{lead_id}", response_model=LeadOut)
async def get_lead(lead_id: str, ctx: OrgContext = Depends(require_org)):
    try:
        lead = await sb.get_lead(lead_id, token=ctx.token, org_id=ctx.org_id)
    except Exception as e:
        raise sb_error(e)
    if not lead:
        # Missing or another org's — same 404 either way, leaks nothing.
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@router.get("/{lead_id}/activity", response_model=List[ActivityEvent])
async def get_lead_activity(lead_id: str, ctx: OrgContext = Depends(require_org)):
    """Chronological (newest-first) feed of everything that happened to this lead,
    merged from the enquiry submission, call_log, email_log and status history.
    Org-scoped: every underlying read is RLS-gated to the caller's org, and the
    lead itself is checked first so cross-org ids get a clean 404."""
    try:
        lead = await sb.get_lead(lead_id, token=ctx.token, org_id=ctx.org_id)
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        calls = await sb.list_call_logs(500, token=ctx.token, org_id=ctx.org_id, lead_id=lead_id)
        emails = await sb.list_email_logs(500, token=ctx.token, org_id=ctx.org_id, lead_id=lead_id)
        history = await sb.list_status_history(lead_id, token=ctx.token, org_id=ctx.org_id)
    except HTTPException:
        raise
    except Exception as e:
        raise sb_error(e)

    events: List[ActivityEvent] = []

    # The enquiry submission — the oldest, anchoring event.
    events.append(ActivityEvent(
        id=f"enquiry-{lead['id']}",
        type="enquiry",
        timestamp=lead.get("created_at"),
        title="Enquiry submitted",
        detail=lead.get("enquiry"),
        outcome=lead.get("source") or "inbound",
        meta={"source": lead.get("source")},
    ))

    for c in calls:
        placed = c.get("status") == "placed"
        trigger = c.get("trigger") or "manual"
        title = f"Call {'placed' if placed else 'failed'}"
        if trigger and trigger != "manual":
            title += f" ({trigger})"
        events.append(ActivityEvent(
            id=f"call-{c['id']}",
            type="call",
            timestamp=c.get("created_at"),
            title=title,
            detail=None if placed else c.get("error"),
            outcome=c.get("status"),
            meta={"call_id": c.get("call_id"), "trigger": trigger, "to_phone": c.get("to_phone")},
        ))

    for e in emails:
        sent = e.get("status") == "sent"
        step = e.get("step")
        step_label = "Follow-up" if step and step != "manual" else "Email"
        if step and step not in (None, "manual"):
            step_label = f"Follow-up #{step}"
        title = f"{step_label} {'sent' if sent else 'failed'}"
        events.append(ActivityEvent(
            id=f"email-{e['id']}",
            type="email",
            timestamp=e.get("created_at"),
            title=title,
            detail=e.get("subject"),
            outcome=e.get("status"),
            meta={"step": step, "to_email": e.get("to_email"), "error": e.get("error")},
        ))

    for h in history:
        to_status = h.get("to_status")
        from_status = h.get("from_status")
        events.append(ActivityEvent(
            id=f"status-{h['id']}",
            type="status",
            timestamp=h.get("created_at"),
            title=(f"Status: {from_status} → {to_status}" if from_status else f"Status set to {to_status}"),
            detail=None,
            outcome=to_status,
            meta={"from_status": from_status, "to_status": to_status},
        ))

    events.sort(key=lambda ev: _parse_ts(ev.timestamp), reverse=True)
    return events


@router.patch("/{lead_id}", response_model=LeadOut)
async def patch_lead(lead_id: str, update: StatusUpdate, ctx: OrgContext = Depends(require_org)):
    # Read the current status first so we can record the transition. The read is
    # org-scoped, so this also doubles as the "does this lead belong to you" check.
    try:
        current = await sb.get_lead(lead_id, token=ctx.token, org_id=ctx.org_id)
    except Exception as e:
        raise sb_error(e)
    if not current:
        raise HTTPException(status_code=404, detail="Lead not found")

    prev_status = current.get("status")
    try:
        updated = await sb.update_lead_status(
            lead_id, update.status, token=ctx.token, org_id=ctx.org_id
        )
    except Exception as e:
        raise sb_error(e)
    if not updated:
        # Either it doesn't exist or it belongs to another org — same answer
        # either way, so this leaks nothing about other tenants.
        raise HTTPException(status_code=404, detail="Lead not found")

    # Record the transition for the activity timeline. Best-effort: a history
    # write must never turn a successful status change into a reported failure.
    if prev_status != update.status:
        try:
            await sb.insert_status_history({
                "org_id": ctx.org_id,
                "lead_id": lead_id,
                "from_status": prev_status,
                "to_status": update.status,
                "changed_by": ctx.user_id,
            }, token=ctx.token)
        except Exception as e:
            logger.warning("[lead %s] could not write status history: %s", lead_id, e)

    return updated
