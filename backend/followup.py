"""
Automatic follow-up email drip (Resend).

Up to THREE emails per lead, then stop:
    step 0 -> sent 24h after created_at
    step 1 -> sent 72h after created_at
    step 2 -> sent 168h after created_at
    step 3 -> sequence complete

A sweep runs every FOLLOWUP_INTERVAL_MINUTES (default 1) from a FastAPI startup
loop. The step is CLAIMED atomically (conditional update on followup_step) BEFORE
sending, so a restart/race can never double-send the same step.

Master switch FOLLOWUP_ENABLED defaults FALSE. Secrets (RESEND_API_KEY,
FOLLOWUP_FROM_EMAIL) live in backend/.env only — never the frontend.
"""
import html as html_lib
import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

import ai_email  # optional grounded AI generation (behind AI_EMAILS_ENABLED)
import auto_call  # reuse the existing quiet-hours window
import kb_match   # rule-based keyword matching (default; no AI, no network)
import supabase_client as sb
from auth import OrgContext, require_org, sb_error

logger = logging.getLogger("followup")
router = APIRouter(prefix="/api/followup", tags=["followup"])
settings_router = APIRouter(prefix="/api/settings", tags=["settings"])

# Hours after created_at for each step. Hard cap = len(...) = 3.
FOLLOWUP_SCHEDULE_HOURS = [0.02, 0.04, 0.06]
MAX_FOLLOWUPS = len(FOLLOWUP_SCHEDULE_HOURS)
# They engaged — stop nudging.
STOP_STATUSES = {"closed", "meeting_booked", "interested"}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# ─────────────────────────────────────────────────────────────────────────────
# ✏️  EDIT ME — EMAIL TEMPLATES (one per step).
# Placeholders substituted at send time:
#   {first_name}  the lead's first name         (HTML-escaped)
#   {enquiry}     the lead's enquiry text        (HTML-escaped)
#   {kb_answer}   the matched knowledge-base entry, as a styled block. Filled when
#                 the enquiry matches an entry's keywords; cleanly removed (no
#                 dangling text) when nothing matches. Keep it on its own line.
# An unsubscribe link is appended to every email automatically.
# ─────────────────────────────────────────────────────────────────────────────
FOLLOWUP_EMAIL_1 = {  # Day 1 — gentle nudge
    "subject": "Following up on your enquiry",
    "body": """
<p>Hi {first_name},</p>
<p>Thanks for reaching out to SaleScale AI. You told us:</p>
<blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #ddd;color:#555">{enquiry}</blockquote>
{kb_answer}
<p>Just checking you got what you needed. If it's useful, I'm happy to answer any questions
or set up a quick walkthrough.</p>
<p>Best,<br/>The SaleScale AI team</p>
""",
}

FOLLOWUP_EMAIL_2 = {  # Day 3 — add value / offer help
    "subject": "A quick idea on your enquiry",
    "body": """
<p>Hi {first_name},</p>
<p>Following up on what you asked about:</p>
<blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #ddd;color:#555">{enquiry}</blockquote>
{kb_answer}
<p>Most teams in your position care about three things, and SaleScale AI covers all of them:</p>
<ul>
  <li>Every new enquiry gets contacted within minutes, not days</li>
  <li>An AI agent qualifies the lead and books the meeting for you</li>
  <li>Everything syncs back to your CRM automatically</li>
</ul>
<p>Would a 15-minute walkthrough be helpful? Just reply and I'll send a time.</p>
<p>Best,<br/>The SaleScale AI team</p>
""",
}

FOLLOWUP_EMAIL_3 = {  # Day 7 — final check-in
    "subject": "Last check-in from SaleScale AI",
    "body": """
<p>Hi {first_name},</p>
<p>I've reached out a couple of times about your enquiry:</p>
<blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #ddd;color:#555">{enquiry}</blockquote>
{kb_answer}
<p>I don't want to clutter your inbox, so this is my last note on it. If the timing isn't
right, no problem at all — just reply whenever you'd like to pick it back up.</p>
<p>All the best,<br/>The SaleScale AI team</p>
""",
}

FOLLOWUP_TEMPLATES = [FOLLOWUP_EMAIL_1, FOLLOWUP_EMAIL_2, FOLLOWUP_EMAIL_3]


# ── Config ───────────────────────────────────────────────────────────────────
def _env_bool(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def interval_minutes() -> int:
    return _env_int("FOLLOWUP_INTERVAL_MINUTES", 1)


def _resend_key() -> str:
    return os.environ.get("RESEND_API_KEY", "")


def _from_email() -> str:
    return os.environ.get("FOLLOWUP_FROM_EMAIL", "")


def email_configured() -> bool:
    return bool(_resend_key() and _from_email())


def _public_base() -> str:
    return os.environ.get("PUBLIC_BASE_URL", "http://localhost:8001").rstrip("/")


# ── Master switch (runtime; initialised from env, toggled from Settings) ─────
_enabled = _env_bool("FOLLOWUP_ENABLED", False)


def is_enabled() -> bool:
    return _enabled


def set_enabled(value: bool) -> bool:
    global _enabled
    _enabled = bool(value)
    return _enabled


# ── Helpers ──────────────────────────────────────────────────────────────────
def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    """Parse Supabase timestamptz robustly (py<3.11 fromisoformat is strict)."""
    if not value:
        return None
    v = value.strip()
    if v.endswith("Z"):
        v = v[:-1] + "+00:00"
    m = re.match(r"^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})(?:\.(\d+))?(.*)$", v)
    if m:
        base, frac, tail = m.group(1), m.group(2), m.group(3) or ""
        v = f"{base}.{(frac + '000000')[:6]}{tail}" if frac else f"{base}{tail}"
    try:
        dt = datetime.fromisoformat(v)
    except ValueError:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def render_kb_answer(content: str) -> str:
    """Turn a matched KB entry's plain-text content into a styled HTML block.
    Escaped (it's org data), blank lines -> paragraphs, single newlines -> <br>."""
    content = (content or "").strip()
    if not content:
        return ""
    paras = [html_lib.escape(p.strip()) for p in re.split(r"\n\s*\n", content) if p.strip()]
    inner = "".join(f'<p style="margin:0 0 8px">{p.replace(chr(10), "<br/>")}</p>' for p in paras)
    return (
        '<div style="margin:12px 0;padding:12px 14px;background:#f6f6f6;'
        f'border:1px solid #eee;border-radius:8px">{inner}</div>'
    )


def render_template(template: dict, lead: dict, *, kb_answer: Optional[str] = None) -> Tuple[str, str]:
    """Fill {first_name}/{enquiry}/{kb_answer} -> (subject, body). Body is an HTML
    fragment, without the wrapper/unsubscribe footer (so it can be shown for editing).

    {kb_answer} is replaced by the matched entry's styled block when `kb_answer` is
    given, or by "" (cleanly omitted) when it's None. If a (customised) template has
    no {kb_answer} placeholder but there IS a match, the block is appended so the
    answer is never silently dropped."""
    first = html_lib.escape((lead.get("name") or "there").strip().split(" ")[0] or "there")
    enquiry = html_lib.escape((lead.get("enquiry") or "your enquiry").strip())
    answer_html = render_kb_answer(kb_answer) if kb_answer else ""

    def fill(text: str) -> str:
        return text.replace("{first_name}", first).replace("{enquiry}", enquiry)

    subject = fill(template["subject"]).replace("{kb_answer}", "").strip()

    body = fill(template["body"])
    if "{kb_answer}" in body:
        body = body.replace("{kb_answer}", answer_html)
    elif answer_html:
        body = f"{body.rstrip()}\n{answer_html}"
    # Collapse blank lines left behind by an omitted placeholder — no dangling gaps.
    body = re.sub(r"\n[ \t]*\n[ \t]*\n+", "\n\n", body).strip()
    return subject, body


def wrap_html(body: str, unsub_url: str) -> str:
    """Wrap a body (template-rendered OR user-edited) and append the REQUIRED
    unsubscribe link. Every outgoing email goes through this."""
    footer = (
        '<hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>'
        '<p style="font-size:12px;color:#888">'
        f'Don\'t want these emails? <a href="{unsub_url}">Unsubscribe</a>.'
        "</p>"
    )
    return f'<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#222">{body}{footer}</div>'


def unsubscribe_url(lead_id: str) -> str:
    return f"{_public_base()}/api/followup/unsubscribe?lead_id={lead_id}"


async def load_templates(*, org_id: Optional[str] = None, token: Optional[str] = None) -> list:
    """The 3 templates for ONE org: saved rows (step 1..3) override the hardcoded
    defaults. Falls back to defaults if the table is missing/empty."""
    templates = [dict(t) for t in FOLLOWUP_TEMPLATES]
    try:
        rows = await sb.list_email_templates(org_id=org_id, token=token)
    except Exception as e:
        logger.debug("using default templates (%s)", e)
        return templates
    for row in rows or []:
        try:
            idx = int(row.get("step", 0)) - 1  # stored 1..3
        except (TypeError, ValueError):
            continue
        if 0 <= idx < len(templates):
            if row.get("subject"):
                templates[idx]["subject"] = row["subject"]
            if row.get("body"):
                templates[idx]["body"] = row["body"]
    return templates


@dataclass
class BuiltEmail:
    """A ready-to-send follow-up: subject + HTML body fragment (no wrapper/footer),
    plus how it was produced so callers can log it / show it in the compose window."""
    subject: str
    body: str
    ai_used: bool = False
    kb_matched: Optional[str] = None  # title of the matched KB entry, or None


async def _ai_email(lead: dict, idx: int, *, org_id, token) -> Optional[Tuple[str, str]]:
    """The AI path (behind AI_EMAILS_ENABLED). Returns (subject, body) or None on
    an empty KB / missing key / any error — caller then uses the template path."""
    if not ai_email.is_enabled():
        return None
    try:
        kb = await sb.get_knowledge_content(org_id=org_id, token=token)
    except Exception as e:
        logger.warning("ai email: could not load knowledge base (org=%s): %s; using template", org_id, e)
        return None
    if not kb.strip():
        logger.info("ai email: knowledge base empty (org=%s); using template", org_id)
        return None
    first = (lead.get("name") or "there").strip().split(" ")[0] or "there"
    enquiry = (lead.get("enquiry") or "").strip()
    try:
        return await ai_email.generate_followup(
            first_name=first, enquiry=enquiry, step=idx + 1, kb_content=kb
        )
    except Exception as e:  # defence in depth — generate_followup already guards
        logger.error("ai email: generation raised (org=%s): %s; using template", org_id, e)
        return None


async def _match_kb(lead: dict, *, org_id, token) -> Optional[kb_match.MatchResult]:
    """Rule-based keyword match of the lead's enquiry against the org's KB entries.
    Returns the best match, or None (no keywords hit / matching off / KB unreadable).
    Logs the outcome either way so keywords can be tuned."""
    if not kb_match.kb_matching_enabled():
        return None
    try:
        entries = await sb.list_knowledge(org_id=org_id, token=token)
    except Exception as e:
        logger.warning("kb match: could not load knowledge base (org=%s): %s", org_id, e)
        return None
    result = kb_match.match(lead.get("enquiry") or "", entries)
    lead_id = lead.get("id")
    if result:
        logger.info("[followup lead=%s org=%s] kb match: '%s' (score=%d, keywords=%s)",
                    lead_id, org_id, result.title or "(untitled)", result.score, result.matched_keywords)
    else:
        logger.info("[followup lead=%s org=%s] kb match: no match", lead_id, org_id)
    return result


async def build_followup_content(
    lead: dict, step: int, *, org_id: Optional[str] = None, token: Optional[str] = None
) -> BuiltEmail:
    """Content for a lead's follow-up at `step` (0-based).

    Two paths, in priority order:
      1. AI (only when AI_EMAILS_ENABLED + key + KB content) — grounded AI draft.
      2. Template + rule-based KB matching (the default): the org's template, with
         the matched entry's content dropped into {kb_answer}, or the plain template
         when nothing matches. This is also the fallback whenever the AI path misses.

    Never raises. `body` is an HTML fragment WITHOUT the wrapper/unsubscribe footer —
    the caller still runs it through wrap_html. Shared by the drip (process_lead) and
    the compose pre-fill (emails.compose)."""
    templates = await load_templates(org_id=org_id, token=token)
    idx = min(step, MAX_FOLLOWUPS - 1)

    ai = await _ai_email(lead, idx, org_id=org_id, token=token)
    if ai:
        return BuiltEmail(subject=ai[0], body=ai[1], ai_used=True)

    match = await _match_kb(lead, org_id=org_id, token=token)
    kb_answer = match.content if match else None
    subject, body = render_template(templates[idx], lead, kb_answer=kb_answer)
    return BuiltEmail(
        subject=subject,
        body=body,
        ai_used=False,
        kb_matched=(match.title or "(untitled)") if match else None,
    )


async def log_email(*, org_id, lead_id, to_email, subject, body, status, error=None,
                    step=None, provider_id=None, token=None) -> None:
    """Record every send attempt (auto OR manual) in email_log. Never raises."""
    try:
        await sb.insert_email_log({
            "org_id": org_id,
            "lead_id": lead_id,
            "to_email": to_email,
            "from_email": _from_email() or None,
            "subject": subject,
            "body": body,
            "status": status,
            "error": error,
            "step": step,
            "provider_id": provider_id,
        }, token=token)
    except Exception as e:
        logger.warning("[followup lead=%s] could not write email_log: %s", lead_id, e)


def lead_block_reason(lead: dict) -> Optional[Tuple[str, str]]:
    """Per-lead stop conditions (excludes timing). Returns (code, message) or None."""
    step = int(lead.get("followup_step") or 0)
    if step >= MAX_FOLLOWUPS:
        return ("complete", f"sequence complete ({MAX_FOLLOWUPS}/{MAX_FOLLOWUPS} sent)")
    status = (lead.get("status") or "").strip()
    if status in STOP_STATUSES:
        return ("status", f"lead status is '{status}' — sequence stopped")
    if lead.get("followup_unsubscribed"):
        return ("unsubscribed", "lead has unsubscribed")
    email = (lead.get("email") or "").strip()
    if not email or not EMAIL_RE.match(email):
        return ("no-email", "missing or invalid email address")
    return None


async def _send_via_resend(to: str, subject: str, html: str) -> str:
    payload = {"from": _from_email(), "to": [to], "subject": subject, "html": html}
    async with httpx.AsyncClient(timeout=20) as http:
        resp = await http.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {_resend_key()}", "Content-Type": "application/json"},
            json=payload,
        )
    if resp.status_code >= 400:
        raise RuntimeError(f"Resend error (HTTP {resp.status_code}): {resp.text[:200]}")
    try:
        return resp.json().get("id", "")
    except ValueError:
        return ""


def _global_gate() -> Optional[str]:
    """Conditions that stop ALL sends. Returns a reason, or None if clear."""
    if not is_enabled():
        return "follow-ups are disabled (FOLLOWUP_ENABLED is off)"
    if not email_configured():
        return "email not configured (set RESEND_API_KEY and FOLLOWUP_FROM_EMAIL)"
    if not auto_call.within_allowed_hours(auto_call.now_local()):
        return (
            f"outside allowed hours ({auto_call.quiet_start():%H:%M}–"
            f"{auto_call.quiet_end():%H:%M} {auto_call.tz_name()})"
        )
    return None


# ── Core: decide + send one lead's next follow-up ────────────────────────────
async def process_lead(lead: dict, now_utc: datetime, manual: bool = False) -> Tuple[bool, str]:
    """Returns (sent, message). Assumes the global gate has already passed."""
    lead_id = lead.get("id")
    org_id = lead.get("org_id")  # every downstream write is scoped to the lead's own org
    tag = f"[followup lead={lead_id} org={org_id}]"
    step = int(lead.get("followup_step") or 0)
    email = (lead.get("email") or "").strip()

    blocked = lead_block_reason(lead)  # shared with the compose/manual endpoint
    if blocked:
        code, message = blocked
        logger.info("%s skipped-%s (%s)", tag, code, message)
        return False, message

    if not manual:  # the sweep respects the schedule; manual sends on demand
        created = _parse_dt(lead.get("created_at"))
        if created is None:
            logger.info("%s skipped: unparseable created_at (%r)", tag, lead.get("created_at"))
            return False, "no valid created_at"
        if now_utc < created + timedelta(hours=FOLLOWUP_SCHEDULE_HOURS[step]):
            return False, "not due yet"  # quiet: would log every lead every sweep

    # Claim the step ATOMICALLY before sending — a restart/race can't double-send.
    claimed = await sb.claim_followup_step(lead_id, step, now_utc.isoformat(), org_id=org_id)
    if not claimed:
        logger.info("%s skipped: step %d already claimed (race/restart)", tag, step + 1)
        return False, "that step was already sent"

    # Template + rule-based KB match (default); AI draft only if AI_EMAILS_ENABLED.
    built = await build_followup_content(lead, step, org_id=org_id)
    subject, body = built.subject, built.body
    html = wrap_html(body, unsubscribe_url(lead_id))
    try:
        email_id = await _send_via_resend(email, subject, html)
    except Exception as e:
        # Step stays claimed on purpose: at-most-once (never double-send).
        logger.error("%s FAILED step %d/%d: %s (step already marked; no retry)", tag, step + 1, MAX_FOLLOWUPS, e)
        await log_email(org_id=org_id, lead_id=lead_id, to_email=email, subject=subject, body=body,
                        status="failed", error=str(e), step=str(step + 1))
        return False, f"send failed: {e}"

    logger.info("%s SENT step %d/%d to %s (resend_id=%s, ai=%s, kb=%s)",
                tag, step + 1, MAX_FOLLOWUPS, email, email_id or "?",
                built.ai_used, built.kb_matched or "none")
    await log_email(org_id=org_id, lead_id=lead_id, to_email=email, subject=subject, body=body,
                    status="sent", step=str(step + 1), provider_id=email_id)
    return True, f"sent follow-up {step + 1}/{MAX_FOLLOWUPS}"


async def run_followup_sweep() -> dict:
    """Periodic job: send every due follow-up."""
    reason = _global_gate()
    if reason:
        logger.info("followup sweep skipped: %s", reason)
        return {"swept": 0, "sent": 0, "reason": reason}

    try:
        leads = await sb.list_leads()
    except sb.SupabaseNotConfigured as e:
        logger.warning("followup sweep skipped: %s", e)
        return {"swept": 0, "sent": 0, "reason": str(e)}
    except Exception as e:
        logger.exception("followup sweep: could not list leads: %s", e)
        return {"swept": 0, "sent": 0, "reason": str(e)}

    now_utc = datetime.now(timezone.utc)
    sent = 0
    for lead in leads:
        try:
            ok, _ = await process_lead(lead, now_utc, manual=False)
            if ok:
                sent += 1
        except Exception as e:
            logger.exception("[followup lead=%s] unexpected error: %s", lead.get("id"), e)
    logger.info("followup sweep done: %d lead(s) checked, %d email(s) sent", len(leads), sent)
    return {"swept": len(leads), "sent": sent, "reason": None}


# ── Scheduling ───────────────────────────────────────────────────────────────
# run_followup_sweep() has two drivers, both calling this SAME function so the
# schedule, the atomic step claim, and the guardrails are shared unchanged:
#   • the in-process loop in scheduler.py (default; runs every
#     FOLLOWUP_INTERVAL_MINUTES on startup), and
#   • Cloud Scheduler via POST /api/cron/followup-sweep (see cron.py), used on
#     Cloud Run (scale-to-zero) where the in-process loop is disabled with
#     INTERNAL_SCHEDULER_ENABLED=false.


# ── Endpoints ────────────────────────────────────────────────────────────────
def _page(title: str, message: str) -> str:
    return f"""<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/><title>{title}</title></head>
<body style="font-family:sans-serif;background:#fafafa;color:#111;display:flex;align-items:center;
justify-content:center;height:100vh;margin:0">
  <div style="text-align:center;max-width:420px;padding:32px;background:#fff;border:1px solid #eee;border-radius:16px">
    <h1 style="font-size:20px;margin:0 0 8px">{title}</h1>
    <p style="color:#666;font-size:14px;margin:0">{message}</p>
  </div>
</body></html>"""


@router.get("/unsubscribe", response_class=HTMLResponse)
async def unsubscribe(lead_id: str):
    """Public link included in every follow-up email."""
    try:
        await sb.set_followup_unsubscribed(lead_id)
    except sb.SupabaseNotConfigured as e:
        logger.warning("[followup lead=%s] unsubscribe failed: %s", lead_id, e)
        return HTMLResponse(_page("Something went wrong", "Please try again later."), status_code=503)
    except Exception as e:
        logger.error("[followup lead=%s] unsubscribe failed: %s", lead_id, e)
        return HTMLResponse(_page("Something went wrong", "Please try again later."), status_code=500)
    logger.info("[followup lead=%s] unsubscribed via email link", lead_id)
    return HTMLResponse(_page("You've been unsubscribed", "You won't receive any more follow-up emails from us."))


@router.post("/send/{lead_id}")
async def send_next_followup(lead_id: str, ctx: OrgContext = Depends(require_org)):
    """Manual 'Send next follow-up' — sends the next step now, still respecting stop conditions."""
    reason = _global_gate()
    if reason:
        logger.info("[followup lead=%s] manual skipped: %s", lead_id, reason)
        raise HTTPException(status_code=409, detail=reason)
    try:
        lead = await sb.get_lead(lead_id, token=ctx.token, org_id=ctx.org_id)
    except Exception as e:
        raise sb_error(e)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    step_before = int(lead.get("followup_step") or 0)
    sent, message = await process_lead(lead, datetime.now(timezone.utc), manual=True)
    if not sent:
        raise HTTPException(status_code=409, detail=message)
    return {"sent": True, "step": step_before + 1, "max": MAX_FOLLOWUPS, "message": message}


class FollowupToggle(BaseModel):
    enabled: bool


def current_settings() -> dict:
    return {
        "enabled": is_enabled(),
        "email_configured": email_configured(),
        "from_email": _from_email() or None,
        "schedule_hours": FOLLOWUP_SCHEDULE_HOURS,
        "max_followups": MAX_FOLLOWUPS,
        "interval_minutes": interval_minutes(),
        "quiet_hours": {
            "start": auto_call.quiet_start().strftime("%H:%M"),
            "end": auto_call.quiet_end().strftime("%H:%M"),
            "timezone": auto_call.tz_name(),
        },
    }


@settings_router.get("/followup")
async def get_followup_settings(ctx: OrgContext = Depends(require_org)):
    return current_settings()


@settings_router.put("/followup")
async def put_followup_settings(body: FollowupToggle, ctx: OrgContext = Depends(require_org)):
    # As with auto-call: PROCESS-GLOBAL switch, not per-org. Auth-gated so it
    # can't be flipped anonymously.
    set_enabled(body.enabled)
    logger.info("FOLLOWUP_ENABLED set to %s via Settings API by user %s (org %s)",
                body.enabled, ctx.user_id, ctx.org_id)
    return current_settings()


# ── Public surface reused by the emails module (compose / manual sends) ──────
# Same send + gate + guardrails as the drip — nothing is duplicated there.
global_gate = _global_gate
send_via_resend = _send_via_resend
from_email = _from_email
public_base = _public_base
