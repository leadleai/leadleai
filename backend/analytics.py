"""
Org-scoped analytics aggregates for the Dashboard + Analytics pages.

  GET /api/analytics/summary?period=7d       stat-card counts + status breakdown
  GET /api/analytics/timeseries?period=7d     per-day counts for the charts

Both are authenticated and scoped to the caller's ACTIVE org: reads run in USER
mode (the caller's token) so Postgres RLS restricts rows to their org, and we
also pass org_id explicitly to narrow to the one org they're acting in.

`period` is one of today / 7d / 30d (default 7d). We fetch only the rows in the
window and only the columns we need (created_at, status) via rows_since — never
the whole table — then aggregate in Python. The aggregation is split into pure
functions (build_summary / build_timeseries) so it's unit-testable without a DB.
"""
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

import supabase_client as sb
from auth import OrgContext, require_org, sb_error

logger = logging.getLogger("analytics")
router = APIRouter(prefix="/api/analytics", tags=["analytics"])

LEAD_STATUSES = ["new", "contacted", "interested", "meeting_booked", "closed"]
PERIOD_DAYS = {"today": 1, "7d": 7, "30d": 30}


# ── Models ───────────────────────────────────────────────────────────────────
class SummaryOut(BaseModel):
    period: str
    leads_new: int = 0
    calls_placed: int = 0
    calls_failed: int = 0
    emails_sent: int = 0
    emails_failed: int = 0
    meetings_booked: int = 0
    status_breakdown: Dict[str, int] = Field(default_factory=dict)
    has_data: bool = False


class TimePoint(BaseModel):
    day: str            # YYYY-MM-DD (UTC)
    leads: int = 0
    calls_placed: int = 0
    calls_failed: int = 0
    emails_sent: int = 0
    emails_failed: int = 0


class TimeseriesOut(BaseModel):
    period: str
    points: List[TimePoint]
    has_data: bool = False


class ActivityItem(BaseModel):
    id: str                       # unique per feed item: "<source>:<row id>"
    type: str                     # 'lead' | 'call' | 'email'
    label: str                    # human summary, e.g. "New lead: Aman"
    status: Optional[str] = None  # placed/failed/sent — drives colour/outcome
    at: str                       # ISO timestamp (newest-first sort key)


class ActivityOut(BaseModel):
    period: str
    items: List[ActivityItem]
    has_data: bool = False


# ── Time helpers ─────────────────────────────────────────────────────────────
def _period_days(period: str) -> int:
    if period not in PERIOD_DAYS:
        raise HTTPException(status_code=400, detail="period must be one of: today, 7d, 30d")
    return PERIOD_DAYS[period]


def _day_list(days: int, today: Optional[datetime] = None) -> List[str]:
    """The N UTC dates in the window, oldest first, inclusive of today."""
    end = (today or datetime.now(timezone.utc)).date()
    return [(end - timedelta(days=days - 1 - i)).isoformat() for i in range(days)]


def _start_iso(days: int, today: Optional[datetime] = None) -> str:
    end = (today or datetime.now(timezone.utc)).date()
    start = end - timedelta(days=days - 1)
    return datetime(start.year, start.month, start.day, tzinfo=timezone.utc).isoformat()


def _row_day(ts: Optional[str]) -> Optional[str]:
    """UTC date (YYYY-MM-DD) of a Supabase timestamptz, or None if unparseable."""
    if not ts:
        return None
    v = ts.strip()
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
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).date().isoformat()


# ── Pure aggregation (unit-testable; no DB) ──────────────────────────────────
def build_summary(period: str, leads: list, calls: list, emails: list) -> SummaryOut:
    status_breakdown = {s: 0 for s in LEAD_STATUSES}
    for row in leads:
        s = (row.get("status") or "new")
        status_breakdown[s] = status_breakdown.get(s, 0) + 1
    calls_placed = sum(1 for r in calls if (r.get("status") or "") == "placed")
    calls_failed = sum(1 for r in calls if (r.get("status") or "") == "failed")
    emails_sent = sum(1 for r in emails if (r.get("status") or "") == "sent")
    emails_failed = sum(1 for r in emails if (r.get("status") or "") == "failed")
    has_data = bool(leads or calls or emails)
    return SummaryOut(
        period=period,
        leads_new=len(leads),
        calls_placed=calls_placed,
        calls_failed=calls_failed,
        emails_sent=emails_sent,
        emails_failed=emails_failed,
        meetings_booked=status_breakdown.get("meeting_booked", 0),
        status_breakdown=status_breakdown,
        has_data=has_data,
    )


def build_timeseries(period: str, days: int, leads: list, calls: list, emails: list,
                     today: Optional[datetime] = None) -> TimeseriesOut:
    day_keys = _day_list(days, today)
    buckets = {d: TimePoint(day=d) for d in day_keys}

    def bump(rows, field, match=None):
        for row in rows:
            if match is not None and (row.get("status") or "") != match:
                continue
            d = _row_day(row.get("created_at"))
            point = buckets.get(d)
            if point is not None:
                setattr(point, field, getattr(point, field) + 1)

    bump(leads, "leads")
    bump(calls, "calls_placed", match="placed")
    bump(calls, "calls_failed", match="failed")
    bump(emails, "emails_sent", match="sent")
    bump(emails, "emails_failed", match="failed")

    has_data = bool(leads or calls or emails)
    return TimeseriesOut(period=period, points=[buckets[d] for d in day_keys], has_data=has_data)


# ── Data loading ─────────────────────────────────────────────────────────────
async def _load(period: str, ctx: OrgContext):
    days = _period_days(period)
    start = _start_iso(days)
    try:
        leads = await sb.rows_since("leads", start, org_id=ctx.org_id, token=ctx.token)
        calls = await sb.rows_since("call_log", start, org_id=ctx.org_id, token=ctx.token)
        emails = await sb.rows_since("email_log", start, org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    return days, leads, calls, emails


# ── Endpoints ────────────────────────────────────────────────────────────────
@router.get("/summary", response_model=SummaryOut)
async def summary(period: str = Query("7d"), ctx: OrgContext = Depends(require_org)):
    _, leads, calls, emails = await _load(period, ctx)
    logger.info("[org %s] analytics summary period=%s leads=%d calls=%d emails=%d",
                ctx.org_id, period, len(leads), len(calls), len(emails))
    return build_summary(period, leads, calls, emails)


@router.get("/timeseries", response_model=TimeseriesOut)
async def timeseries(period: str = Query("7d"), ctx: OrgContext = Depends(require_org)):
    days, leads, calls, emails = await _load(period, ctx)
    return build_timeseries(period, days, leads, calls, emails)


# ── Recent activity feed ─────────────────────────────────────────────────────
ACTIVITY_LIMIT = 15


def _lead_name(row: dict) -> str:
    lead = row.get("lead") or {}
    name = (lead.get("name") if isinstance(lead, dict) else None) or ""
    return name.strip() or "a lead"


def build_activity(period: str, leads: list, calls: list, emails: list) -> ActivityOut:
    """Merge the three timestamped event streams into one newest-first feed.

    NOTE: leads have no status-change timestamp in the schema (only created_at),
    so discrete manual status changes aren't emitted; calls/emails already
    capture the bulk of ongoing activity."""
    items: List[ActivityItem] = []

    for r in leads:
        name = (r.get("name") or "").strip() or "someone"
        items.append(ActivityItem(id=f"lead:{r.get('id')}", type="lead",
                                   label=f"New lead: {name}", at=r.get("created_at") or ""))

    for r in calls:
        name = _lead_name(r)
        status = (r.get("status") or "").strip() or None
        label = f"Call to {name} — failed" if status == "failed" else f"Call placed to {name}"
        items.append(ActivityItem(id=f"call:{r.get('id')}", type="call",
                                   label=label, status=status, at=r.get("created_at") or ""))

    for r in emails:
        name = _lead_name(r)
        if name == "a lead" and r.get("to_email"):
            name = r["to_email"]
        status = (r.get("status") or "").strip() or None
        step = (r.get("step") or "").strip()
        kind = "Follow-up email" if step in {"1", "2", "3"} else "Email"
        label = f"{kind} to {name} — failed" if status == "failed" else f"{kind} sent to {name}"
        items.append(ActivityItem(id=f"email:{r.get('id')}", type="email",
                                   label=label, status=status, at=r.get("created_at") or ""))

    items.sort(key=lambda i: i.at, reverse=True)
    return ActivityOut(period=period, items=items[:ACTIVITY_LIMIT], has_data=bool(items))


@router.get("/activity", response_model=ActivityOut)
async def activity(period: str = Query("7d"), ctx: OrgContext = Depends(require_org)):
    days = _period_days(period)
    start = _start_iso(days)
    # Pull a bounded slice of each stream (newest first), with the lead's name
    # embedded for the call/email rows, then merge to the newest ACTIVITY_LIMIT.
    try:
        leads = await sb.rows_since("leads", start, select="id,name,created_at,status",
                                    order="created_at.desc", limit=30, org_id=ctx.org_id, token=ctx.token)
        calls = await sb.rows_since("call_log", start, select="id,created_at,status,lead:leads(name)",
                                    order="created_at.desc", limit=30, org_id=ctx.org_id, token=ctx.token)
        emails = await sb.rows_since("email_log", start, select="id,created_at,status,step,to_email,lead:leads(name)",
                                     order="created_at.desc", limit=30, org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    logger.info("[org %s] analytics activity period=%s (%d leads, %d calls, %d emails)",
                ctx.org_id, period, len(leads), len(calls), len(emails))
    return build_activity(period, leads, calls, emails)
