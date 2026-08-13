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
from collections import defaultdict
from datetime import datetime, time, timedelta, timezone
from typing import Dict, Optional, Tuple

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None

from fastapi import APIRouter, Depends
from pydantic import BaseModel

import calls
import org_settings
import supabase_client as sb
from auth import OrgContext, require_org
from org_settings import ResolvedSettings

logger = logging.getLogger("auto_call")
settings_router = APIRouter(prefix="/api/settings", tags=["settings"])


# ── Config (env) ─────────────────────────────────────────────────────────────
# NOTE: these env helpers now describe only the DEFAULTS used when an org has no
# org_settings row. The live per-org values come from org_settings (read on every
# sweep), so editing them in the dashboard takes effect on the next sweep.
def _env_bool(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
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


# ── Per-org sweep frequency + adaptive scheduler tick ────────────────────────
# The internal scheduler is a SINGLE shared loop, so an org can't be checked more
# often than the loop ticks. We reconcile the per-org auto_call_sweep_seconds with
# that reality in two honest steps:
#   1. the loop tick adapts DOWN to the smallest per-org interval seen on the last
#      sweep, floored by AUTO_CALL_SWEEP_MIN_SECONDS (so one org can't force a
#      hot loop); and
#   2. inside each pass an org is only actually processed once ITS OWN interval has
#      elapsed since we last swept it (_org_last_swept).
# Net effect: intervals >= the floor are honoured precisely; smaller ones clamp up
# to the floor. On Cloud Run the tick is Cloud Scheduler's cadence instead.
_org_last_swept: Dict[Optional[str], datetime] = {}
_desired_loop_seconds: Optional[float] = None


def _sweep_min_seconds() -> float:
    return max(1.0, _env_float("AUTO_CALL_SWEEP_MIN_SECONDS", 15.0))


def desired_loop_seconds() -> float:
    """Adaptive tick for scheduler.py: the smallest per-org auto_call_sweep_seconds
    seen on the last pass, floored by the MIN. Falls back to the env interval until
    the first sweep has populated it. Read live by the scheduler each pass."""
    if _desired_loop_seconds is not None:
        return _desired_loop_seconds
    return max(_sweep_min_seconds(), _env_float("AUTO_CALL_SWEEP_INTERVAL_SECONDS", 60.0))


def _recompute_loop_interval(settings_map: Dict[str, ResolvedSettings]) -> None:
    global _desired_loop_seconds
    floor = _sweep_min_seconds()
    if settings_map:
        smallest = min(s.auto_call_sweep_seconds for s in settings_map.values())
    else:
        smallest = _env_float("AUTO_CALL_SWEEP_INTERVAL_SECONDS", 60.0)
    _desired_loop_seconds = max(floor, float(smallest))


def _org_is_due(org_id: Optional[str], cfg: ResolvedSettings, now_wall: datetime) -> bool:
    """Per-org sweep-frequency gate: has this org's own interval elapsed since we
    last processed it? Records the timestamp when it has."""
    last = _org_last_swept.get(org_id)
    if last and (now_wall - last).total_seconds() < cfg.auto_call_sweep_seconds:
        return False
    _org_last_swept[org_id] = now_wall
    return True


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
async def _attempt_call(lead: dict, now: datetime, trigger: str, cfg: ResolvedSettings) -> Tuple[bool, str]:
    """Dedupe → atomic claim → dial → finalize (or release on failure).

    Returns (called, reason). Assumes the per-org gates (master switch, quiet
    hours) have already passed. `cfg` is the lead's OWN org's resolved settings, so
    the dedupe window and the agent name are per-org. The claim makes call-once
    safe under overlapping sweeps: only the writer that flips auto_called_at from
    NULL proceeds to dial."""
    lead_id = lead.get("id")
    phone = lead.get("phone")
    org_id = lead.get("org_id")
    tag = f"[auto-call lead={lead_id} phone={phone} org={org_id}]"

    # DEDUPE — scoped to this org, using this org's window: two tenants may hold
    # the same number and may configure different windows.
    cutoff = (now - timedelta(minutes=cfg.dedupe_minutes)).isoformat()
    try:
        if await sb.recently_auto_called(phone, cutoff, org_id=org_id):
            logger.info("%s skipped: duplicate (same phone auto-called within %s min)", tag, cfg.dedupe_minutes)
            return False, "duplicate"
    except sb.SupabaseNotConfigured:
        pass

    # CALL ONCE — atomic claim (conditional on auto_called_at IS NULL).
    claimed = await sb.claim_auto_call(lead_id, now.isoformat(), org_id=org_id)
    if not claimed:
        logger.info("%s skipped: already auto-called / claimed by another sweep", tag)
        return False, "already_called"

    # PLACE THE CALL. On failure, release the claim so a later sweep can retry.
    # Auto-calls run as the org's DEFAULT agent (service mode, no user token); if
    # the org has no agent yet, fall back to the legacy prompt (cfg.agent_name).
    import agents
    agent_settings = await agents.resolve_settings_for_call(org_id=org_id)
    try:
        call_id = await calls.dial_and_log(
            trigger=trigger, org_id=org_id,
            phone=phone, name=lead.get("name"), email=lead.get("email"),
            company=lead.get("company"), enquiry=lead.get("enquiry"), lead_id=lead_id,
            agent_name=(None if agent_settings else cfg.agent_name),
            agent_settings=agent_settings,
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
    org_id = lead.get("org_id")
    tag = f"[auto-call lead={lead_id} org={org_id}]"
    try:
        # Resolve THIS lead's org settings AFTER the delay so a change made during
        # the wait (delay/enabled/quiet-hours) is honoured — live, not cached.
        pre = await org_settings.resolve_for_org(org_id)
        await asyncio.sleep(pre.auto_call_delay_seconds)
        cfg = await org_settings.resolve_for_org(org_id)
        if not cfg.auto_call_enabled:
            logger.info("%s skipped: auto-call disabled for this org", tag)
            return
        now = cfg.now_local()
        if not cfg.within_allowed_hours(now):
            logger.info("%s skipped: quiet hours (%s %s; window %s–%s)",
                        tag, now.strftime("%H:%M"), cfg.timezone,
                        cfg.quiet_start, cfg.quiet_end)
            return
        await _attempt_call(lead, now, trigger, cfg)
    except sb.SupabaseNotConfigured as e:
        logger.warning("%s skipped: %s", tag, e)
    except Exception as e:  # never let a background task crash silently
        logger.exception("%s unexpected error: %s", tag, e)


# ── The auto-call SWEEP (Cloud Scheduler → POST /api/cron/auto-call-sweep) ───
async def run_auto_call_sweep() -> dict:
    """One pass: for EACH org, using that org's OWN live settings, call every lead
    that has been 'new' and un-called for longer than the org's delay. Replaces the
    in-process "sleep 45s then call" so the delay works without a persistent
    process. Every guardrail is preserved and resolved PER-ORG: master switch,
    quiet hours, delay, dedupe, sweep-frequency, and the atomic call-once claim.

    Settings are read LIVE at the top of every pass (resolve_all), so a dashboard
    edit changes behaviour on the very next sweep with no restart."""
    summary = {
        "eligible": 0, "called": 0, "orgs_swept": 0,
        "skipped": {"not_due": 0, "duplicate": 0, "already_called": 0, "failed": 0,
                    "disabled": 0, "quiet_hours": 0, "not_due_org": 0},
        "reason": None,
    }

    settings_map = await org_settings.resolve_all()
    _recompute_loop_interval(settings_map)  # adapt the scheduler tick to live values

    try:
        # Candidate leads only (status new/null AND not yet auto-called), plain
        # columns without the tag join — the sweep reads neither tags nor
        # already-handled leads, so filtering server-side keeps the per-pass
        # working set proportional to work-to-do, not to total table size.
        leads = await sb.list_leads_for_sweep(only_new_uncalled=True)
    except sb.SupabaseNotConfigured as e:
        summary["reason"] = str(e)
        logger.warning("auto-call sweep skipped: %s", e)
        return summary
    except Exception as e:
        summary["reason"] = str(e)
        logger.exception("auto-call sweep: could not list leads: %s", e)
        return summary

    now_wall = datetime.now(timezone.utc)
    by_org: Dict[Optional[str], list] = defaultdict(list)
    for lead in leads:
        by_org[lead.get("org_id")].append(lead)

    for org_id, org_leads in by_org.items():
        cfg = org_settings.for_org_or_default(org_id, settings_map)

        # Per-org sweep frequency: only process this org if its interval elapsed.
        if not _org_is_due(org_id, cfg, now_wall):
            summary["skipped"]["not_due_org"] += len(org_leads)
            continue

        if not cfg.auto_call_enabled:
            summary["skipped"]["disabled"] += len(org_leads)
            continue

        now_local = cfg.now_local()
        if not cfg.within_allowed_hours(now_local):
            summary["skipped"]["quiet_hours"] += len(org_leads)
            continue

        summary["orgs_swept"] += 1
        due_before = now_wall - timedelta(seconds=cfg.auto_call_delay_seconds)
        for lead in org_leads:
            if (lead.get("status") or "new") != "new":
                continue
            if lead.get("auto_called_at"):
                continue
            created = _parse_dt(lead.get("created_at"))
            if created is None:
                continue
            if created > due_before:  # created too recently — respect this org's delay
                summary["skipped"]["not_due"] += 1
                continue
            summary["eligible"] += 1
            try:
                called, reason = await _attempt_call(lead, now_local, "auto", cfg)
            except Exception as e:
                summary["skipped"]["failed"] += 1
                logger.exception("[auto-call lead=%s] sweep error: %s", lead.get("id"), e)
                continue
            if called:
                summary["called"] += 1
            elif reason in summary["skipped"]:
                summary["skipped"][reason] += 1

    logger.info("auto-call sweep done: %d org(s) swept, %d eligible, %d called, skipped=%s",
                summary["orgs_swept"], summary["eligible"], summary["called"], summary["skipped"])
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

    # CRM imports are org-scoped, but resolve per-lead to be correct even if a
    # batch ever spans orgs. Cache each org's settings for this call.
    cache: Dict[Optional[str], ResolvedSettings] = {}

    async def cfg_for(org_id):
        if org_id not in cache:
            cache[org_id] = await org_settings.resolve_for_org(org_id)
        return cache[org_id]

    for lead in new_leads:
        org_id = lead.get("org_id")
        cfg = await cfg_for(org_id)
        tag = f"[crm auto-call lead={lead.get('id')} phone={lead.get('phone')} org={org_id}]"
        if not cfg.auto_call_enabled:
            report["skipped"]["disabled"] += 1
            logger.info("%s skipped: auto-call disabled for this org", tag)
            continue
        if not cfg.within_allowed_hours():
            report["skipped"]["quiet_hours"] += 1
            logger.info("%s skipped: quiet hours (window %s–%s %s)", tag,
                        cfg.quiet_start, cfg.quiet_end, cfg.timezone)
            continue
        cutoff = (cfg.now_local() - timedelta(minutes=cfg.dedupe_minutes)).isoformat()
        try:
            duplicate = await sb.recently_auto_called(lead.get("phone"), cutoff, org_id=org_id)
        except sb.SupabaseNotConfigured:
            duplicate = False
        if duplicate:
            report["skipped"]["duplicate"] += 1
            logger.info("%s skipped: duplicate (same phone auto-called within %s min)", tag, cfg.dedupe_minutes)
            continue
        background_tasks.add_task(run_auto_call, lead, "import")
        report["queued"] += 1
        logger.info("%s queued auto-call (fires in ~%ss)", tag, cfg.auto_call_delay_seconds)

    return report


# ── Settings API (master switch toggle + current config) ─────────────────────
class AutoCallToggle(BaseModel):
    enabled: bool


def settings_view(cfg: ResolvedSettings) -> dict:
    """The legacy GET /api/settings/auto-call shape, now built from an org's
    resolved (live) settings rather than global env vars."""
    return {
        "enabled": cfg.auto_call_enabled,
        "delay_seconds": cfg.auto_call_delay_seconds,
        "dedupe_minutes": cfg.dedupe_minutes,
        "quiet_hours": {
            "start": cfg.quiet_start,
            "end": cfg.quiet_end,
            "timezone": cfg.timezone,
        },
        "bland_configured": bool(os.environ.get("BLAND_API_KEY")),
        "supabase_configured": bool(os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY")),
    }


@settings_router.get("/auto-call")
async def get_auto_call_settings(ctx: OrgContext = Depends(require_org)):
    """Legacy read endpoint, now per-org. The full editor is GET/PATCH /api/org/settings."""
    cfg = await org_settings.resolve_for_org(ctx.org_id, token=ctx.token)
    return settings_view(cfg)


@settings_router.put("/auto-call")
async def put_auto_call_settings(body: AutoCallToggle, ctx: OrgContext = Depends(require_org)):
    """Legacy toggle, now PER-ORG: persists auto_call_enabled to this org's row so
    the sweeps honour it live. Superseded by PATCH /api/org/settings."""
    try:
        await sb.upsert_org_settings(ctx.org_id, {"auto_call_enabled": bool(body.enabled)}, token=ctx.token)
    except Exception as e:
        from auth import sb_error
        raise sb_error(e)
    logger.info("auto_call_enabled set to %s for org %s by user %s",
                body.enabled, ctx.org_id, ctx.user_id)
    cfg = await org_settings.resolve_for_org(ctx.org_id, token=ctx.token)
    return settings_view(cfg)
