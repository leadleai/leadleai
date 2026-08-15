"""
Per-org automation settings — the single source of truth the sweeps read LIVE.

Every automation knob that used to be a process-global env var now lives in the
`org_settings` table, one row per org (migration 0012). This module is the ONLY
place that:

  1. reads the env-var DEFAULTS (the fallback for an org with no row), and
  2. turns a raw DB row into a normalised, typed ``ResolvedSettings`` the rest of
     the backend consumes.

Two read paths, and the distinction is what makes edits take effect immediately:

  • ``resolve_for_org(org_id, token=...)`` — one org. USER mode on the request
    path (RLS scopes it); SERVICE mode with an explicit org_id for background use.

  • ``resolve_all()`` — a ``{org_id: ResolvedSettings}`` map of every org, read in
    SERVICE mode. The sweeps call this ONCE PER PASS. Because it is re-read on
    every pass and never cached across passes, a value edited from the dashboard
    is honoured on the very next sweep — no restart, no in-process cache to bust.

The GET/PATCH ``/api/org/settings`` endpoints live here too. PATCH is a partial
update: only the fields the client sends are written; everything else keeps its
stored value (or its column default on first insert).
"""
import logging
import os
import re
from dataclasses import dataclass, asdict
from datetime import datetime, time
from typing import Any, Dict, List, Optional

try:
    from zoneinfo import ZoneInfo, available_timezones
except ImportError:  # pragma: no cover
    ZoneInfo = None
    available_timezones = None

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

import supabase_client as sb
from auth import OrgContext, require_org, sb_error

logger = logging.getLogger("org_settings")
router = APIRouter(prefix="/api/org", tags=["org-settings"])

_HHMM_RE = re.compile(r"^([01]?\d|2[0-3]):[0-5]\d$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Hard cap on follow-up steps — there are exactly three editable email templates.
MAX_FOLLOWUP_STEPS = 3


# ── env-var defaults (the fallback when an org has no row) ────────────────────
def _env_bool(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _norm_hhmm(value: Any, default: str) -> str:
    """Normalise a time to 'HH:MM'. Accepts 'H:MM', 'HH:MM', or Postgres 'HH:MM:SS'."""
    s = str(value or "").strip()
    if not s:
        return default
    parts = s.split(":")
    try:
        h, m = int(parts[0]), int(parts[1])
        if 0 <= h <= 23 and 0 <= m <= 59:
            return f"{h:02d}:{m:02d}"
    except (ValueError, IndexError):
        pass
    return default


def _parse_schedule(value: Any, default: List[float]) -> List[float]:
    """Coerce a schedule into a list of 1..MAX positive hours. Accepts a real list
    (DB numeric[]) or a comma-separated string (env var)."""
    if value is None:
        return list(default)
    if isinstance(value, str):
        raw = [p.strip() for p in value.split(",") if p.strip()]
    elif isinstance(value, (list, tuple)):
        raw = list(value)
    else:
        return list(default)
    out: List[float] = []
    for item in raw:
        try:
            h = float(item)
        except (TypeError, ValueError):
            continue
        if h > 0:
            out.append(h)
    out = out[:MAX_FOLLOWUP_STEPS]
    return out or list(default)


def env_defaults() -> "ResolvedSettings":
    """The org-less fallback, read from the same env vars the old code used, so an
    org with no row behaves exactly as the global defaults did before."""
    return ResolvedSettings(
        org_id=None,
        auto_call_enabled=_env_bool("AUTO_CALL_ENABLED", False),
        auto_call_delay_seconds=_env_int("AUTO_CALL_DELAY_SECONDS", 45),
        dedupe_minutes=_env_int("AUTO_CALL_DEDUPE_MINUTES", 60),
        quiet_start=_norm_hhmm(os.environ.get("AUTO_CALL_QUIET_START"), "09:00"),
        quiet_end=_norm_hhmm(os.environ.get("AUTO_CALL_QUIET_END"), "20:00"),
        timezone=os.environ.get("AUTO_CALL_TIMEZONE", "Asia/Kolkata") or "Asia/Kolkata",
        followup_enabled=_env_bool("FOLLOWUP_ENABLED", False),
        followup_from_email=(os.environ.get("FOLLOWUP_FROM_EMAIL") or None),
        followup_schedule_hours=_parse_schedule(
            os.environ.get("FOLLOWUP_SCHEDULE_HOURS"), [24.0, 72.0, 168.0]
        ),
        agent_name=(os.environ.get("AGENT_NAME") or "Ava").strip() or "Ava",
        kb_matching_enabled=_env_bool("KB_MATCHING_ENABLED", True),
        ai_emails_enabled=_env_bool("AI_EMAILS_ENABLED", False),
        auto_call_sweep_seconds=_env_int("AUTO_CALL_SWEEP_INTERVAL_SECONDS", 60),
        followup_sweep_seconds=max(5, _env_int("FOLLOWUP_INTERVAL_MINUTES", 1) * 60),
        prospect_search_enabled=_env_bool("PROSPECT_SEARCH_ENABLED", False),
        prospect_search_frequency_hours=_env_int("PROSPECT_SEARCH_FREQUENCY_HOURS", 168),
        prospect_search_max_per_month=_env_int("PROSPECT_SEARCH_MAX_PER_MONTH", 100),
    )


# ── the normalised, typed settings the rest of the backend consumes ──────────
@dataclass
class ResolvedSettings:
    org_id: Optional[str]
    auto_call_enabled: bool
    auto_call_delay_seconds: int
    dedupe_minutes: int
    quiet_start: str            # "HH:MM"
    quiet_end: str             # "HH:MM"
    timezone: str
    followup_enabled: bool
    followup_from_email: Optional[str]
    followup_schedule_hours: List[float]
    agent_name: str
    kb_matching_enabled: bool
    ai_emails_enabled: bool
    auto_call_sweep_seconds: int
    followup_sweep_seconds: int
    # -- automated/scheduled prospect search (discovery only; never contacts) --
    prospect_search_enabled: bool
    prospect_search_frequency_hours: int   # how often each active saved search re-runs
    prospect_search_max_per_month: int     # cap on automated searches/month (≤ 500)

    # -- derived timing helpers (shared by both sweeps) --
    def tzinfo(self):
        if ZoneInfo is None:
            return None
        try:
            return ZoneInfo(self.timezone)
        except Exception:
            logger.warning("org=%s unknown timezone %r; using UTC", self.org_id, self.timezone)
            return None

    def now_local(self) -> datetime:
        return datetime.now(self.tzinfo())

    def _t(self, hhmm: str, fallback: time) -> time:
        try:
            h, m = hhmm.split(":")
            return time(int(h), int(m))
        except Exception:
            return fallback

    def quiet_start_time(self) -> time:
        return self._t(self.quiet_start, time(9, 0))

    def quiet_end_time(self) -> time:
        return self._t(self.quiet_end, time(20, 0))

    def within_allowed_hours(self, now: Optional[datetime] = None) -> bool:
        """True if `now` (defaults to now in this org's tz) is inside the calling
        window. Handles windows that wrap past midnight."""
        now = now or self.now_local()
        start, end, t = self.quiet_start_time(), self.quiet_end_time(), now.time()
        if start <= end:
            return start <= t < end
        return t >= start or t < end

    @property
    def max_followups(self) -> int:
        return min(len(self.followup_schedule_hours), MAX_FOLLOWUP_STEPS)

    def to_api(self) -> Dict[str, Any]:
        d = asdict(self)
        d["max_followups"] = self.max_followups
        return d


def _from_row(row: Dict[str, Any]) -> ResolvedSettings:
    """Normalise a raw org_settings row, falling back to env defaults for any
    NULL/missing column so a partially-populated row is always safe to consume."""
    d = env_defaults()
    return ResolvedSettings(
        org_id=row.get("org_id") or d.org_id,
        auto_call_enabled=bool(row.get("auto_call_enabled", d.auto_call_enabled)),
        auto_call_delay_seconds=int(row.get("auto_call_delay_seconds") or d.auto_call_delay_seconds),
        dedupe_minutes=int(row.get("dedupe_minutes") if row.get("dedupe_minutes") is not None else d.dedupe_minutes),
        quiet_start=_norm_hhmm(row.get("quiet_start"), d.quiet_start),
        quiet_end=_norm_hhmm(row.get("quiet_end"), d.quiet_end),
        timezone=(row.get("timezone") or d.timezone),
        followup_enabled=bool(row.get("followup_enabled", d.followup_enabled)),
        followup_from_email=(row.get("followup_from_email") or d.followup_from_email),
        followup_schedule_hours=_parse_schedule(row.get("followup_schedule_hours"), d.followup_schedule_hours),
        agent_name=(row.get("agent_name") or d.agent_name),
        kb_matching_enabled=bool(row.get("kb_matching_enabled", d.kb_matching_enabled)),
        ai_emails_enabled=bool(row.get("ai_emails_enabled", d.ai_emails_enabled)),
        auto_call_sweep_seconds=int(row.get("auto_call_sweep_seconds") or d.auto_call_sweep_seconds),
        followup_sweep_seconds=int(row.get("followup_sweep_seconds") or d.followup_sweep_seconds),
        prospect_search_enabled=bool(row.get("prospect_search_enabled", d.prospect_search_enabled)),
        prospect_search_frequency_hours=int(
            row.get("prospect_search_frequency_hours") or d.prospect_search_frequency_hours
        ),
        prospect_search_max_per_month=int(
            row.get("prospect_search_max_per_month")
            if row.get("prospect_search_max_per_month") is not None
            else d.prospect_search_max_per_month
        ),
    )


# ── resolution API (used by the sweeps + the request path) ───────────────────
async def resolve_for_org(org_id: str, *, token: Optional[str] = None) -> ResolvedSettings:
    """Settings for ONE org, merged over env defaults. Never raises for a missing
    row or an unconfigured/unreachable Supabase — falls back to env defaults so a
    lead is never dropped just because its settings couldn't be read."""
    if not org_id:
        return env_defaults()
    try:
        row = await sb.get_org_settings(org_id, token=token)
    except sb.SupabaseNotConfigured:
        return env_defaults()
    except Exception as e:
        logger.warning("org=%s could not read settings (%s); using env defaults", org_id, e)
        return env_defaults()
    return _from_row(row) if row else env_defaults()


async def resolve_all() -> Dict[str, ResolvedSettings]:
    """{org_id: ResolvedSettings} for every org, read LIVE in service mode. Called
    once per sweep pass so dashboard edits take effect on the next pass. On any
    failure returns {} and the sweep falls back to env defaults per lead."""
    try:
        rows = await sb.list_all_org_settings()
    except sb.SupabaseNotConfigured:
        return {}
    except Exception as e:
        logger.warning("could not list org_settings (%s); sweeps will use env defaults", e)
        return {}
    out: Dict[str, ResolvedSettings] = {}
    for row in rows or []:
        oid = row.get("org_id")
        if oid:
            out[oid] = _from_row(row)
    return out


def for_org_or_default(org_id: Optional[str], settings_map: Dict[str, ResolvedSettings]) -> ResolvedSettings:
    """Pick a lead's org settings out of a resolve_all() map, or env defaults."""
    if org_id and org_id in settings_map:
        return settings_map[org_id]
    return env_defaults()


# ── GET / PATCH /api/org/settings ────────────────────────────────────────────
def _valid_timezone(name: str) -> bool:
    if ZoneInfo is None:
        return True  # can't validate without zoneinfo; trust the input
    try:
        ZoneInfo(name)
        return True
    except Exception:
        return False


class SettingsPatch(BaseModel):
    """Every field optional — PATCH writes only what's provided."""
    auto_call_enabled: Optional[bool] = None
    auto_call_delay_seconds: Optional[int] = Field(default=None, ge=0, le=86400)
    dedupe_minutes: Optional[int] = Field(default=None, ge=0, le=10080)
    quiet_start: Optional[str] = None
    quiet_end: Optional[str] = None
    timezone: Optional[str] = None
    followup_enabled: Optional[bool] = None
    followup_from_email: Optional[str] = None
    followup_schedule_hours: Optional[List[float]] = None
    agent_name: Optional[str] = None
    kb_matching_enabled: Optional[bool] = None
    ai_emails_enabled: Optional[bool] = None
    auto_call_sweep_seconds: Optional[int] = Field(default=None, ge=5, le=86400)
    followup_sweep_seconds: Optional[int] = Field(default=None, ge=5, le=86400)
    # Automated prospect search: every 6h … once a month (744h); 0–500 searches/month.
    prospect_search_enabled: Optional[bool] = None
    prospect_search_frequency_hours: Optional[int] = Field(default=None, ge=6, le=744)
    prospect_search_max_per_month: Optional[int] = Field(default=None, ge=0, le=500)

    @field_validator("quiet_start", "quiet_end")
    @classmethod
    def _check_hhmm(cls, v):
        if v is None:
            return v
        v = v.strip()
        if not _HHMM_RE.match(v):
            raise ValueError("time must be 'HH:MM' (24-hour), e.g. 09:00")
        return v

    @field_validator("timezone")
    @classmethod
    def _check_tz(cls, v):
        if v is None:
            return v
        v = v.strip()
        if not _valid_timezone(v):
            raise ValueError(f"unknown timezone {v!r} (use an IANA name like 'Asia/Kolkata')")
        return v

    @field_validator("followup_from_email")
    @classmethod
    def _check_email(cls, v):
        if v is None:
            return v
        v = v.strip()
        if v and not _EMAIL_RE.match(v):
            raise ValueError("from-email must be a valid email address, or blank to use the default")
        return v or None

    @field_validator("agent_name")
    @classmethod
    def _check_agent(cls, v):
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("agent name can't be blank")
        if len(v) > 80:
            raise ValueError("agent name is too long (max 80 characters)")
        return v

    @field_validator("followup_schedule_hours")
    @classmethod
    def _check_schedule(cls, v):
        if v is None:
            return v
        if not (1 <= len(v) <= MAX_FOLLOWUP_STEPS):
            raise ValueError(f"follow-up schedule needs 1–{MAX_FOLLOWUP_STEPS} steps")
        cleaned: List[float] = []
        for h in v:
            try:
                h = float(h)
            except (TypeError, ValueError):
                raise ValueError("each follow-up time must be a number of hours")
            if h <= 0:
                raise ValueError("each follow-up time must be greater than 0 hours")
            if h > 8760:
                raise ValueError("a follow-up time over a year (8760h) doesn't make sense")
            cleaned.append(round(h, 4))
        return cleaned


def _configured_flags() -> Dict[str, bool]:
    """Deployment-level readiness the UI surfaces (secrets stay server-side)."""
    return {
        "bland_configured": bool(os.environ.get("BLAND_API_KEY")),
        "resend_configured": bool(os.environ.get("RESEND_API_KEY")),
        "ai_configured": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "rapidapi_configured": bool(os.environ.get("RAPIDAPI_KEY")),
        "supabase_configured": bool(
            os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        ),
        "env_from_email": os.environ.get("FOLLOWUP_FROM_EMAIL") or None,
    }


@router.get("/settings")
async def get_settings(ctx: OrgContext = Depends(require_org)):
    """This org's resolved settings (row merged over env defaults) + read-only
    deployment flags. Reads in USER mode so RLS scopes it to the caller's org."""
    settings = await resolve_for_org(ctx.org_id, token=ctx.token)
    return {**settings.to_api(), **_configured_flags()}


@router.patch("/settings")
async def patch_settings(body: SettingsPatch, ctx: OrgContext = Depends(require_org)):
    """Update this org's settings (partial). Written in USER mode so the
    org_isolation RLS policy authorises it — a caller can only write their own
    org's row. Changes are read live by the sweeps, so they take effect on the
    next sweep with no restart. Returns the freshly-resolved settings."""
    fields = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    if not fields:
        raise HTTPException(status_code=400, detail="No settings provided to update.")
    try:
        await sb.upsert_org_settings(ctx.org_id, fields, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    logger.info("org=%s settings updated by user=%s: %s", ctx.org_id, ctx.user_id, list(fields.keys()))
    settings = await resolve_for_org(ctx.org_id, token=ctx.token)
    return {**settings.to_api(), **_configured_flags()}
