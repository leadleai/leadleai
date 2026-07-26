"""
Automatic calling for new inbound leads.

POST /api/leads schedules run_auto_call() as a FastAPI BackgroundTask. After a
configurable delay it re-checks every guardrail, then places one Bland call and
records the outcome. Every decision is logged: called / skipped-* / failed.

Master switch AUTO_CALL_ENABLED defaults to FALSE — nothing auto-dials until it
is turned on (via env or the Settings toggle).
"""
import asyncio
import logging
import os
import re
from datetime import datetime, time, timedelta, timezone
from typing import Optional, Tuple

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None

from fastapi import APIRouter, Depends
from pydantic import BaseModel

import calls
import supabase_client as sb
from auth import OrgContext, require_org

logger = logging.getLogger("auto_call")
settings_router = APIRouter(prefix="/api/settings", tags=["settings"])


# ── Config (env) ─────────────────────────────────────────────────────────────
def _env_bool(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _parse_hhmm(value: str, default: time) -> time:
    try:
        h, m = value.split(":")
        return time(int(h), int(m))
    except Exception:
        return default


def delay_seconds() -> int:
    return _env_int("AUTO_CALL_DELAY_SECONDS", 45)


def dedupe_minutes() -> int:
    return _env_int("AUTO_CALL_DEDUPE_MINUTES", 60)


def quiet_start() -> time:
    return _parse_hhmm(os.environ.get("AUTO_CALL_QUIET_START", "09:00"), time(9, 0))


def quiet_end() -> time:
    return _parse_hhmm(os.environ.get("AUTO_CALL_QUIET_END", "20:00"), time(20, 0))


def tz_name() -> str:
    return os.environ.get("AUTO_CALL_TIMEZONE", "Asia/Kolkata")


def _tz():
    if ZoneInfo is None:
        return None
    try:
        return ZoneInfo(tz_name())
    except Exception:
        logger.warning("Unknown timezone %s; falling back to UTC", tz_name())
        return None


# ── Master switch (runtime; initialised from env, toggled via Settings) ──────
_enabled = _env_bool("AUTO_CALL_ENABLED", False)


def is_enabled() -> bool:
    return _enabled


def set_enabled(value: bool) -> bool:
    global _enabled
    _enabled = bool(value)
    return _enabled


def now_local() -> datetime:
    """Current time in the configured calling timezone (shared by follow-ups)."""
    return datetime.now(_tz())


def within_allowed_hours(now: datetime) -> bool:
    start, end, t = quiet_start(), quiet_end(), now.time()
    if start <= end:
        return start <= t < end
    return t >= start or t < end  # window wraps past midnight


# ── Robust timestamptz parsing (Supabase; py<3.11 fromisoformat is strict) ───
def _parse_dt(value: Optional[str]) -> Optional[datetime]:
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


# ── Place ONE call, with the atomic call-once claim (shared by both callers) ──
async def _attempt_call(lead: dict, now: datetime, trigger: str) -> Tuple[bool, str]:
    """Dedupe → atomic claim → dial → finalize (or release on failure).

    Returns (called, reason). Assumes the global gates (master switch, quiet
    hours) have already passed. The claim makes call-once safe under overlapping
    sweeps: only the writer that flips auto_called_at from NULL proceeds to dial."""
    lead_id = lead.get("id")
    phone = lead.get("phone")
    org_id = lead.get("org_id")
    tag = f"[auto-call lead={lead_id} phone={phone} org={org_id}]"

    # DEDUPE — scoped to this org: two tenants may hold the same number.
    cutoff = (now - timedelta(minutes=dedupe_minutes())).isoformat()
    try:
        if await sb.recently_auto_called(phone, cutoff, org_id=org_id):
            logger.info("%s skipped: duplicate (same phone auto-called within %s min)", tag, dedupe_minutes())
            return False, "duplicate"
    except sb.SupabaseNotConfigured:
        pass

    # CALL ONCE — atomic claim (conditional on auto_called_at IS NULL).
    claimed = await sb.claim_auto_call(lead_id, now.isoformat(), org_id=org_id)
    if not claimed:
        logger.info("%s skipped: already auto-called / claimed by another sweep", tag)
        return False, "already_called"

    # PLACE THE CALL. On failure, release the claim so a later sweep can retry.
    try:
        call_id = await calls.dial_and_log(
            trigger=trigger, org_id=org_id,
            phone=phone, name=lead.get("name"), email=lead.get("email"),
            company=lead.get("company"), enquiry=lead.get("enquiry"), lead_id=lead_id,
        )
    except calls.BlandError as e:
        await sb.release_auto_call(lead_id, org_id=org_id)
        logger.error("%s FAILED: %s (claim released; will retry next sweep)", tag, e.message)
        return False, "failed"
    except Exception as e:
        await sb.release_auto_call(lead_id, org_id=org_id)
        logger.exception("%s error: %s (claim released)", tag, e)
        return False, "failed"

    # Record the outcome (auto_called_at already set by the claim).
    await sb.update_lead_fields(lead_id, {"call_id": call_id, "status": "contacted"}, org_id=org_id)
    logger.info("%s CALLED: call_id=%s (status new -> contacted)", tag, call_id)
    return True, "called"


# ── The background task (local dev + CRM import path) ────────────────────────
async def run_auto_call(lead: dict, trigger: str = "auto") -> None:
    """Legacy in-process path: wait the delay, re-check the gates, place the call.

    On Cloud Run (scale-to-zero) background tasks are unreliable, so the auto-call
    SWEEP (run_auto_call_sweep, driven by Cloud Scheduler) is the primary path.
    This is kept for local dev and the CRM importer; the atomic claim in
    _attempt_call means the two paths can never double-call the same lead."""
    lead_id = lead.get("id")
    tag = f"[auto-call lead={lead_id}]"
    try:
        await asyncio.sleep(delay_seconds())
        if not is_enabled():
            logger.info("%s skipped: AUTO_CALL disabled", tag)
            return
        now = datetime.now(_tz())
        if not within_allowed_hours(now):
            logger.info("%s skipped: quiet hours (%s %s; window %s–%s)",
                        tag, now.strftime("%H:%M"), tz_name(),
                        quiet_start().strftime("%H:%M"), quiet_end().strftime("%H:%M"))
            return
        await _attempt_call(lead, now, trigger)
    except sb.SupabaseNotConfigured as e:
        logger.warning("%s skipped: %s", tag, e)
    except Exception as e:  # never let a background task crash silently
        logger.exception("%s unexpected error: %s", tag, e)


# ── The auto-call SWEEP (Cloud Scheduler → POST /api/cron/auto-call-sweep) ───
async def run_auto_call_sweep() -> dict:
    """One pass: call every lead that has been 'new' and un-called for longer than
    AUTO_CALL_DELAY_SECONDS. Replaces the in-process "sleep 45s then call" so the
    delay works without a persistent process. Every guardrail is preserved:
    master switch, quiet hours, dedupe, and the atomic call-once claim."""
    summary = {
        "eligible": 0, "called": 0,
        "skipped": {"not_due": 0, "duplicate": 0, "already_called": 0, "failed": 0},
        "reason": None,
    }
    if not is_enabled():
        summary["reason"] = "auto-call disabled (AUTO_CALL_ENABLED is off)"
        logger.info("auto-call sweep skipped: %s", summary["reason"])
        return summary

    now = datetime.now(_tz())
    if not within_allowed_hours(now):
        summary["reason"] = (f"quiet hours ({quiet_start():%H:%M}–{quiet_end():%H:%M} {tz_name()})")
        logger.info("auto-call sweep skipped: %s", summary["reason"])
        return summary

    try:
        leads = await sb.list_leads()
    except sb.SupabaseNotConfigured as e:
        summary["reason"] = str(e)
        logger.warning("auto-call sweep skipped: %s", e)
        return summary
    except Exception as e:
        summary["reason"] = str(e)
        logger.exception("auto-call sweep: could not list leads: %s", e)
        return summary

    due_before = datetime.now(timezone.utc) - timedelta(seconds=delay_seconds())
    for lead in leads:
        if (lead.get("status") or "new") != "new":
            continue
        if lead.get("auto_called_at"):
            continue
        created = _parse_dt(lead.get("created_at"))
        if created is None:
            continue
        if created > due_before:  # created too recently — respect the delay
            summary["skipped"]["not_due"] += 1
            continue
        summary["eligible"] += 1
        try:
            called, reason = await _attempt_call(lead, now, "auto")
        except Exception as e:
            summary["skipped"]["failed"] += 1
            logger.exception("[auto-call lead=%s] sweep error: %s", lead.get("id"), e)
            continue
        if called:
            summary["called"] += 1
        elif reason in summary["skipped"]:
            summary["skipped"][reason] += 1

    logger.info("auto-call sweep done: %d eligible, %d called, skipped=%s",
                summary["eligible"], summary["called"], summary["skipped"])
    return summary


async def schedule_for_imported(new_leads: list, background_tasks) -> dict:
    """Queue auto-calls for CRM-imported NEW leads through the SAME engine
    (run_auto_call) the enquiry form uses. Applies the shared master switch +
    quiet hours + dedupe up front so the import can report queued vs skipped;
    run_auto_call then re-checks every guardrail (incl. call-once) before dialing.
    No per-import cap and no stagger — all queued calls share the same delay.
    """
    report = {"queued": 0, "skipped": {"disabled": 0, "quiet_hours": 0, "duplicate": 0}}
    if not new_leads:
        return report

    enabled = is_enabled()
    now = datetime.now(_tz())
    within = within_allowed_hours(now)
    cutoff = (now - timedelta(minutes=dedupe_minutes())).isoformat()

    for lead in new_leads:
        tag = f"[crm auto-call lead={lead.get('id')} phone={lead.get('phone')}]"
        if not enabled:
            report["skipped"]["disabled"] += 1
            logger.info("%s skipped: AUTO_CALL disabled", tag)
            continue
        if not within:
            report["skipped"]["quiet_hours"] += 1
            logger.info("%s skipped: quiet hours (window %s–%s %s)", tag,
                        quiet_start().strftime("%H:%M"), quiet_end().strftime("%H:%M"), tz_name())
            continue
        try:
            duplicate = await sb.recently_auto_called(
                lead.get("phone"), cutoff, org_id=lead.get("org_id")
            )
        except sb.SupabaseNotConfigured:
            duplicate = False
        if duplicate:
            report["skipped"]["duplicate"] += 1
            logger.info("%s skipped: duplicate (same phone auto-called within %s min)", tag, dedupe_minutes())
            continue
        background_tasks.add_task(run_auto_call, lead, "import")
        report["queued"] += 1
        logger.info("%s queued auto-call (fires in %ss)", tag, delay_seconds())

    return report


# ── Settings API (master switch toggle + current config) ─────────────────────
class AutoCallToggle(BaseModel):
    enabled: bool


def current_settings() -> dict:
    return {
        "enabled": is_enabled(),
        "delay_seconds": delay_seconds(),
        "dedupe_minutes": dedupe_minutes(),
        "quiet_hours": {
            "start": quiet_start().strftime("%H:%M"),
            "end": quiet_end().strftime("%H:%M"),
            "timezone": tz_name(),
        },
        "bland_configured": bool(os.environ.get("BLAND_API_KEY")),
        "supabase_configured": bool(os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY")),
    }


@settings_router.get("/auto-call")
async def get_auto_call_settings(ctx: OrgContext = Depends(require_org)):
    return current_settings()


@settings_router.put("/auto-call")
async def put_auto_call_settings(body: AutoCallToggle, ctx: OrgContext = Depends(require_org)):
    # NOTE: this master switch is PROCESS-GLOBAL (an env-backed flag), not
    # per-org — flipping it affects auto-calling for every tenant on this
    # deployment. Auth is required so it can't be toggled anonymously; making
    # it per-org needs an org_settings table (see the follow-ups in the summary).
    set_enabled(body.enabled)
    logger.info("AUTO_CALL_ENABLED set to %s via Settings API by user %s (org %s)",
                body.enabled, ctx.user_id, ctx.org_id)
    return current_settings()
