"""
Email history + compose/customized sending + template editing.

  GET  /api/emails                 email_log, newest first
  GET  /api/emails/compose/{id}    pre-filled draft for a lead's next-due step
  POST /api/emails/send            send MY edited content (logs + advances the step)
  GET  /api/emails/templates       the 3 templates (saved rows over defaults)
  PUT  /api/emails/templates       save templates

Everything reuses backend/followup.py: the same Resend sender, the same gate
(master switch + email configured + quiet hours), the same per-lead stop
conditions, the same atomic step claim, and the same email_log writer.
"""
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

import followup
import org_settings
import supabase_client as sb
from auth import OrgContext, require_org

logger = logging.getLogger("emails")
router = APIRouter(prefix="/api/emails", tags=["emails"])


# ── Models ───────────────────────────────────────────────────────────────────
class EmailLogOut(BaseModel):
    id: str
    org_id: Optional[str] = None
    lead_id: Optional[str] = None
    to_email: str
    from_email: Optional[str] = None
    subject: str
    body: Optional[str] = None
    status: str
    error: Optional[str] = None
    step: Optional[str] = None
    provider_id: Optional[str] = None
    created_at: Optional[str] = None


class ComposeOut(BaseModel):
    lead_id: str
    lead_name: Optional[str] = None
    to: str
    subject: str
    body: str
    step: int          # the step this send would be (1-based)
    max: int
    blocked: Optional[str] = None  # non-null => Send should be disabled
    ai_used: bool = False          # draft came from the AI writer (vs a template)
    kb_matched: Optional[str] = None  # title of the matched KB entry, if any


class SendIn(BaseModel):
    lead_id: str
    to: EmailStr
    subject: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1)


class TemplateIn(BaseModel):
    step: int = Field(ge=1, le=3)
    subject: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1)


class TemplateOut(BaseModel):
    step: int
    subject: str
    body: str


def _sb_error(e: Exception) -> HTTPException:
    if isinstance(e, sb.SupabaseNotConfigured):
        return HTTPException(status_code=503, detail=str(e))
    if isinstance(e, sb.SupabaseError):
        return HTTPException(status_code=502, detail=f"Supabase error: {e.message}")
    return HTTPException(status_code=500, detail=str(e))


# ── (A) Email log ────────────────────────────────────────────────────────────
@router.get("", response_model=List[EmailLogOut])
async def list_emails(limit: int = 200, ctx: OrgContext = Depends(require_org)):
    try:
        return await sb.list_email_logs(
            min(max(limit, 1), 500), token=ctx.token, org_id=ctx.org_id
        )
    except Exception as e:
        raise _sb_error(e)


# ── (B) Compose ──────────────────────────────────────────────────────────────
@router.get("/compose/{lead_id}", response_model=ComposeOut)
async def compose(lead_id: str, ctx: OrgContext = Depends(require_org)):
    """Pre-filled draft for the lead's next-due step (template + personalization)."""
    try:
        lead = await sb.get_lead(lead_id, token=ctx.token, org_id=ctx.org_id)
    except Exception as e:
        raise _sb_error(e)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    cfg = await org_settings.resolve_for_org(ctx.org_id, token=ctx.token)
    creds = await followup.resolve_resend(cfg, org_id=ctx.org_id, token=ctx.token)
    step = int(lead.get("followup_step") or 0)
    # Report anything that would block sending (stop conditions + this org's gate).
    blocked_pair = followup.lead_block_reason(lead, cfg.max_followups)
    blocked = blocked_pair[1] if blocked_pair else followup.org_gate(cfg, creds)

    # Same content path as the drip: the org's template with the matched KB entry
    # dropped in (or the AI draft when AI is on). Pre-fills the compose window so
    # the matched content is editable before sending.
    built = await followup.build_followup_content(
        lead, step, cfg=cfg, org_id=ctx.org_id, token=ctx.token
    )

    return ComposeOut(
        lead_id=lead_id,
        lead_name=lead.get("name"),
        to=(lead.get("email") or ""),
        subject=built.subject,
        body=built.body,
        step=min(step + 1, cfg.max_followups),
        max=cfg.max_followups,
        blocked=blocked,
        ai_used=built.ai_used,
        kb_matched=built.kb_matched,
    )


@router.post("/send")
async def send_custom_email(payload: SendIn, ctx: OrgContext = Depends(require_org)):
    """Send the user's EDITED content. Same guardrails as the drip; logs + advances the step."""
    cfg = await org_settings.resolve_for_org(ctx.org_id, token=ctx.token)
    # This org's own Resend key + from-email (their connection, or env fallback).
    creds = await followup.resolve_resend(cfg, org_id=ctx.org_id, token=ctx.token)
    reason = followup.org_gate(cfg, creds)  # per-org: enabled + email configured + quiet hours
    if reason:
        logger.info("[emails lead=%s] compose blocked: %s", payload.lead_id, reason)
        raise HTTPException(status_code=409, detail=reason)

    try:
        lead = await sb.get_lead(payload.lead_id, token=ctx.token, org_id=ctx.org_id)
    except Exception as e:
        raise _sb_error(e)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    blocked = followup.lead_block_reason(lead, cfg.max_followups)
    if blocked:
        code, message = blocked
        logger.info("[emails lead=%s] compose blocked-%s: %s", payload.lead_id, code, message)
        raise HTTPException(status_code=409, detail=message)

    step = int(lead.get("followup_step") or 0)
    # Claim the step atomically BEFORE sending — same at-most-once rule as the drip.
    try:
        claimed = await sb.claim_followup_step(
            payload.lead_id, step, datetime.now(timezone.utc).isoformat(),
            org_id=ctx.org_id, token=ctx.token,
        )
    except Exception as e:
        raise _sb_error(e)
    if not claimed:
        raise HTTPException(status_code=409, detail="that step was already sent")

    to = str(payload.to)
    html = followup.wrap_html(payload.body, followup.unsubscribe_url(payload.lead_id))
    max_f = cfg.max_followups
    try:
        provider_id = await followup.send_via_resend(
            to, payload.subject, html, from_addr=creds.from_email, api_key=creds.api_key
        )
    except Exception as e:
        logger.error("[emails lead=%s] FAILED custom step %d/%d: %s", payload.lead_id, step + 1, max_f, e)
        await followup.log_email(org_id=ctx.org_id, lead_id=payload.lead_id, to_email=to,
                                 subject=payload.subject, body=payload.body, status="failed",
                                 error=str(e), step=str(step + 1), token=ctx.token, from_email=creds.from_email)
        raise HTTPException(status_code=502, detail=f"send failed: {e}")

    logger.info("[emails lead=%s] SENT custom step %d/%d to %s (resend_id=%s)",
                payload.lead_id, step + 1, max_f, to, provider_id or "?")
    await followup.log_email(org_id=ctx.org_id, lead_id=payload.lead_id, to_email=to,
                             subject=payload.subject, body=payload.body, status="sent",
                             step=str(step + 1), provider_id=provider_id, token=ctx.token, from_email=creds.from_email)
    return {"sent": True, "step": step + 1, "max": max_f, "provider_id": provider_id}


# ── Template editing ─────────────────────────────────────────────────────────
@router.get("/templates", response_model=List[TemplateOut])
async def get_templates(ctx: OrgContext = Depends(require_org)):
    templates = await followup.load_templates(org_id=ctx.org_id, token=ctx.token)
    return [TemplateOut(step=i + 1, subject=t["subject"], body=t["body"]) for i, t in enumerate(templates)]


@router.put("/templates", response_model=List[TemplateOut])
async def put_templates(items: List[TemplateIn], ctx: OrgContext = Depends(require_org)):
    try:
        for item in items:
            await sb.upsert_email_template(
                item.step, item.subject, item.body, org_id=ctx.org_id, token=ctx.token
            )
            logger.info("[org %s] email template step %d saved", ctx.org_id, item.step)
    except Exception as e:
        raise _sb_error(e)
    return await get_templates(ctx)
