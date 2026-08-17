"""
COMPETITOR / MARKET INTELLIGENCE.

An org adds COMPETITORS (name + website). On a schedule — and on demand via a
"check now" button — this asks Anthropic, WITH THE WEB SEARCH TOOL enabled, to
find recent news / offers / pricing / product / hiring activity about each
competitor, then summarises it into a clean INSIGHT:

    summary        one short paragraph of what's new
    key_points     3–6 crisp bullets
    source_urls    the web pages the model actually cited

Insights are stored (public.competitor_insights) so the Market Watch dashboard can
show the latest one per competitor and when it was last checked.

COST CONTROL — the Anthropic call is the ONLY thing that costs money, so:
  * a cost-conscious model (claude-haiku / sonnet, configurable) is used,
  * each competitor is re-checked at most every competitor_check_frequency_hours,
  * and a per-org MONTHLY CAP (competitor_max_per_month) bounds total AI runs.
Each stored insight == one billed run, so this month's usage is simply
count(competitor_insights since the start of the calendar month) for the org.

GRACEFUL DORMANCY — the whole feature is READY but dormant until ANTHROPIC_API_KEY
is set. With no key: CRUD + the dashboard work normally, and any analysis (manual
"check now" or the sweep) returns a clear "AI not configured — add ANTHROPIC_API_KEY
to enable competitor intelligence" message instead of erroring. `ai_configured` is
surfaced to the UI so it can show that state rather than a broken button.

Endpoints (all under /api/competitors, all authenticated + org-scoped):
  GET    /api/competitors               list this org's competitors + latest insight
  POST   /api/competitors               add one (name + website + notes)
  PATCH  /api/competitors/{id}          edit name/website/notes/is_active
  DELETE /api/competitors/{id}          remove one (its insights cascade)
  GET    /api/competitors/{id}/insights this competitor's insight history
  POST   /api/competitors/{id}/check    run analysis NOW (respects the monthly cap)
  GET    /api/competitors/usage         AI-run usage this month + the config state

The scheduled sweep is run_competitor_sweep(), driven by Cloud Scheduler →
POST /api/cron/competitor-sweep (cron.py), mirroring the prospect-search sweep.
"""
import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import org_settings
import supabase_client as sb
from auth import OrgContext, require_org, sb_error

logger = logging.getLogger("competitors")
router = APIRouter(prefix="/api/competitors", tags=["competitors"])

# ── Anthropic config (mirrors ai_email.py; key is backend-only, never the browser) ─
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
# Cost-conscious default. Override with ANTHROPIC_COMPETITOR_MODEL, else the shared
# ANTHROPIC_MODEL, else this. Haiku is the cheapest capable option for this job.
DEFAULT_MODEL = "claude-haiku-4-5-20251001"
# The basic web-search tool variant — works on every current model (Haiku included)
# and needs no beta header, so it stays compatible with anthropic-version 2023-06-01.
WEB_SEARCH_TOOL = {"type": "web_search_20250305", "name": "web_search", "max_uses": 5}
# Bounded so one analysis stays cheap and predictable.
MAX_TOKENS = 1024
REQUEST_TIMEOUT_SECONDS = 90.0
MAX_TURNS = 4  # server-side web-search loops can emit stop_reason=pause_turn; resume a few times

# The message the UI shows (and the sweep logs) when the key isn't set.
NOT_CONFIGURED_MESSAGE = (
    "AI not configured — add ANTHROPIC_API_KEY to enable competitor intelligence."
)

# A month is reckoned as this many hours (365.25/12*24 ≈ 730.5), matching the
# prospect-search sweep, so "runs per month" = AVG_HOURS_PER_MONTH / frequency_hours.
AVG_HOURS_PER_MONTH = 730.0


# ── config helpers ───────────────────────────────────────────────────────────
def _api_key() -> str:
    return os.environ.get("ANTHROPIC_API_KEY", "").strip()


def api_configured() -> bool:
    return bool(_api_key())


def model() -> str:
    return (
        os.environ.get("ANTHROPIC_COMPETITOR_MODEL", "").strip()
        or os.environ.get("ANTHROPIC_MODEL", "").strip()
        or DEFAULT_MODEL
    )


# ── Models ───────────────────────────────────────────────────────────────────
class CompetitorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    website: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = Field(default=None, max_length=5000)


class CompetitorUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    website: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = Field(default=None, max_length=5000)
    is_active: Optional[bool] = None


class InsightOut(BaseModel):
    id: str
    competitor_id: Optional[str] = None
    summary: str
    details: Dict[str, Any] = Field(default_factory=dict)
    source_urls: List[Dict[str, Any]] = Field(default_factory=list)
    created_at: Optional[str] = None


class CompetitorOut(BaseModel):
    id: str
    org_id: Optional[str] = None
    name: str
    website: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True
    last_checked_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    # The most-recent insight, embedded for the dashboard (None until first check).
    latest_insight: Optional[InsightOut] = None


# ═════════════════════════════════════════════════════════════════════════════
# THE AI ANALYSIS — Anthropic Messages API with the WEB SEARCH tool enabled.
# ─────────────────────────────────────────────────────────────────────────────
# How web search is used: we send ONE request with the web_search tool available.
# Anthropic runs the searches SERVER-SIDE — the model decides what to query (recent
# news, offers, pricing, launches for this competitor), reads the results, and
# writes a grounded summary. The response contains `web_search_tool_result` blocks
# (the pages it fetched, each with a url + title) and `text` blocks (its answer,
# with citations). We collect the cited URLs from those result blocks and parse a
# small JSON object (summary + key_points) from the final text.
# ═════════════════════════════════════════════════════════════════════════════
_SYSTEM = (
    "You are a market-intelligence analyst. Using the web search tool, research the "
    "SPECIFIED competitor company and report only what is RECENT and material — news, "
    "product launches, pricing changes, promotions/offers, funding, partnerships, "
    "notable hiring, or market moves from roughly the last few months. Prefer primary "
    "and reputable sources. Do NOT invent facts: if you can't verify something, leave "
    "it out. If searches turn up nothing recent, say so plainly. "
    "After researching, respond with ONLY a JSON object (no prose around it), shaped "
    'exactly as: {"summary": "<2-4 sentence overview of what is new>", '
    '"key_points": ["<short bullet>", "..."], '
    '"activity_level": "<one of: high, moderate, low, none>"}. '
    "Keep key_points to 3-6 crisp, factual bullets. Cite via the search tool; the "
    "source links are collected automatically, so do not put URLs in the JSON."
)


def _build_user_prompt(*, name: str, website: Optional[str], notes: Optional[str]) -> str:
    lines = [f"COMPETITOR TO RESEARCH: {name}"]
    if website:
        lines.append(f"WEBSITE: {website}")
    if notes:
        lines.append(f"CONTEXT (from the user, may help disambiguate): {notes.strip()}")
    lines.append(
        "\nSearch the web for this company's recent activity and return the JSON object "
        "described in the system prompt."
    )
    return "\n".join(lines)


_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def _extract_json(text: str) -> Optional[dict]:
    """Best-effort: strip code fences / surrounding prose, then json.loads."""
    if not text:
        return None
    cleaned = _FENCE_RE.sub("", text.strip()).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if 0 <= start < end:
        try:
            return json.loads(cleaned[start:end + 1])
        except json.JSONDecodeError:
            return None
    return None


def _collect_from_content(blocks: List[Dict[str, Any]], texts: List[str], sources: List[Dict[str, str]]) -> None:
    """Pull text and web-search source URLs out of one message's content blocks."""
    seen = {s["url"] for s in sources}
    for b in blocks or []:
        btype = b.get("type")
        if btype == "text":
            texts.append(b.get("text", ""))
        elif btype == "web_search_tool_result":
            for item in b.get("content", []) or []:
                if item.get("type") == "web_search_result":
                    url = (item.get("url") or "").strip()
                    if url and url not in seen:
                        seen.add(url)
                        sources.append({"url": url, "title": (item.get("title") or "").strip()})


async def analyze_competitor(
    *, name: str, website: Optional[str] = None, notes: Optional[str] = None
) -> Dict[str, Any]:
    """Research one competitor via Anthropic + web search and return a result dict.

    NEVER raises — the caller (request path or sweep) always gets a structured dict:

      {"configured": False, "message": NOT_CONFIGURED_MESSAGE}      # no API key
      {"configured": True, "insight": {summary, details, source_urls}}  # success
      {"configured": True, "insight": None, "error": "<why>"}       # API/parse error

    `insight` is exactly the shape stored in competitor_insights.
    """
    if not api_configured():
        return {"configured": False, "message": NOT_CONFIGURED_MESSAGE}

    used_model = model()
    headers = {
        "x-api-key": _api_key(),
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
    }
    messages: List[Dict[str, Any]] = [
        {"role": "user", "content": _build_user_prompt(name=name, website=website, notes=notes)}
    ]
    texts: List[str] = []
    sources: List[Dict[str, str]] = []

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as http:
            for _turn in range(MAX_TURNS):
                payload = {
                    "model": used_model,
                    "max_tokens": MAX_TOKENS,
                    "system": _SYSTEM,
                    "tools": [WEB_SEARCH_TOOL],
                    "messages": messages,
                }
                resp = await http.post(ANTHROPIC_URL, headers=headers, json=payload)
                if resp.status_code >= 400:
                    logger.error("competitor analyze: Anthropic HTTP %s: %s", resp.status_code, resp.text[:300])
                    return {"configured": True, "insight": None,
                            "error": f"AI request failed (HTTP {resp.status_code})."}
                data = resp.json()
                content = data.get("content") or []
                _collect_from_content(content, texts, sources)
                # web search runs server-side; if it paused mid-loop, feed the
                # assistant turn back and continue so it can finish its answer.
                if data.get("stop_reason") == "pause_turn":
                    messages.append({"role": "assistant", "content": content})
                    continue
                break
    except Exception as e:
        logger.error("competitor analyze: request to Anthropic failed: %s", e)
        return {"configured": True, "insight": None, "error": "Couldn't reach the AI provider."}

    parsed = _extract_json("\n".join(t for t in texts if t))
    if not isinstance(parsed, dict):
        logger.error("competitor analyze: model reply was not JSON (%r...)", ("".join(texts))[:160])
        return {"configured": True, "insight": None, "error": "AI returned an unreadable response."}

    summary = (parsed.get("summary") or "").strip()
    if not summary:
        return {"configured": True, "insight": None, "error": "AI returned an empty summary."}

    key_points = [str(p).strip() for p in (parsed.get("key_points") or []) if str(p).strip()]
    activity_level = (parsed.get("activity_level") or "").strip().lower()
    if activity_level not in ("high", "moderate", "low", "none"):
        activity_level = None

    insight = {
        "summary": summary,
        "details": {
            "key_points": key_points,
            "activity_level": activity_level,
            "model": used_model,
        },
        "source_urls": sources,
    }
    logger.info("competitor analyze: '%s' -> %d key point(s), %d source(s) via %s",
                name, len(key_points), len(sources), used_model)
    return {"configured": True, "insight": insight}


# ── month boundary + timestamp parsing (shared with the sweep) ───────────────
def month_start_iso(now: Optional[datetime] = None) -> str:
    """Start of the current UTC calendar month, ISO — the quota window boundary."""
    now = now or datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    """Robust timestamptz parse (Supabase; py<3.11 fromisoformat is strict)."""
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


def _is_due(competitor: Dict[str, Any], frequency_hours: int, now: datetime) -> bool:
    """A competitor is due when it has never been checked, or its last_checked_at is
    older than the org's configured frequency. Per-row last_checked_at also makes the
    sweep idempotent under a Scheduler double-fire: a just-checked competitor isn't due."""
    last = _parse_dt(competitor.get("last_checked_at"))
    if last is None:
        return True
    return (now - last).total_seconds() >= frequency_hours * 3600.0


# ── store one insight (shared by the manual "check now" AND the sweep) ────────
async def _store_insight(
    insight: Dict[str, Any], *, org_id: str, competitor_id: str, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    row = {
        "org_id": org_id,
        "competitor_id": competitor_id,
        "summary": insight["summary"],
        "details": insight.get("details") or {},
        "source_urls": insight.get("source_urls") or [],
    }
    return await sb.insert_competitor_insight(row, token=token)


# ── Endpoints ────────────────────────────────────────────────────────────────
def _merge_latest(competitors: List[Dict[str, Any]], insights: List[Dict[str, Any]]) -> List[CompetitorOut]:
    """Attach each competitor's most-recent insight for the dashboard."""
    by_competitor: Dict[str, Dict[str, Any]] = {}
    for ins in insights:
        cid = ins.get("competitor_id")
        if cid and cid not in by_competitor:
            by_competitor[cid] = ins
    out: List[CompetitorOut] = []
    for c in competitors:
        latest = by_competitor.get(c["id"])
        out.append(CompetitorOut(**c, latest_insight=InsightOut(**latest) if latest else None))
    return out


@router.get("")
async def list_competitors(ctx: OrgContext = Depends(require_org)):
    """This org's competitors, each with its latest AI insight embedded. Also returns
    `ai_configured` so the UI can show the dormant state instead of a broken button."""
    try:
        rows = await sb.list_competitors(org_id=ctx.org_id, token=ctx.token)
        latest = await sb.list_latest_competitor_insights(org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    return {
        "competitors": _merge_latest(rows, latest),
        "ai_configured": api_configured(),
    }


@router.post("", response_model=CompetitorOut)
async def create_competitor(payload: CompetitorCreate, ctx: OrgContext = Depends(require_org)):
    row = {
        "org_id": ctx.org_id,
        "name": payload.name.strip(),
        "website": (payload.website or "").strip() or None,
        "notes": (payload.notes or "").strip() or None,
        "is_active": True,
    }
    try:
        created = await sb.insert_competitor(row, token=ctx.token)
    except sb.SupabaseNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise sb_error(e)
    return CompetitorOut(**created)


@router.patch("/{competitor_id}", response_model=CompetitorOut)
async def update_competitor(competitor_id: str, payload: CompetitorUpdate, ctx: OrgContext = Depends(require_org)):
    fields: Dict[str, Any] = {}
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name can't be blank.")
        fields["name"] = name
    if payload.website is not None:
        fields["website"] = payload.website.strip() or None
    if payload.notes is not None:
        fields["notes"] = payload.notes.strip() or None
    if payload.is_active is not None:
        fields["is_active"] = payload.is_active
    if not fields:
        raise HTTPException(status_code=400, detail="Nothing to update.")
    try:
        row = await sb.update_competitor_fields(competitor_id, fields, org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    if not row:
        raise HTTPException(status_code=404, detail="Competitor not found")
    return CompetitorOut(**row)


@router.delete("/{competitor_id}")
async def delete_competitor(competitor_id: str, ctx: OrgContext = Depends(require_org)):
    try:
        row = await sb.delete_competitor(competitor_id, org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    if not row:
        raise HTTPException(status_code=404, detail="Competitor not found")
    return {"deleted": True, "id": competitor_id}


@router.get("/usage")
async def usage(ctx: OrgContext = Depends(require_org)):
    """This org's AI-run usage for the current calendar month + the config state the
    Market Watch page needs to render the estimate and the dormant/enabled banners."""
    cfg = await org_settings.resolve_for_org(ctx.org_id, token=ctx.token)
    since = month_start_iso()
    try:
        used = await sb.count_competitor_insights_since(ctx.org_id, since, token=ctx.token)
        competitors = await sb.list_competitors(org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    active_count = sum(1 for c in competitors if c.get("is_active"))
    freq = cfg.competitor_check_frequency_hours
    runs_per_month = AVG_HOURS_PER_MONTH / freq if freq else 0.0
    projected = active_count * runs_per_month
    return {
        "ai_configured": api_configured(),
        "enabled": cfg.competitor_intel_enabled,
        "used": used,
        "max_per_month": cfg.competitor_max_per_month,
        "remaining": max(0, cfg.competitor_max_per_month - used),
        "active_competitor_count": active_count,
        "total_competitor_count": len(competitors),
        "frequency_hours": freq,
        "hours_per_month": AVG_HOURS_PER_MONTH,
        "runs_per_month": round(runs_per_month, 2),
        "projected_monthly_usage": round(projected, 1),
    }


@router.get("/{competitor_id}/insights", response_model=List[InsightOut])
async def list_insights(competitor_id: str, ctx: OrgContext = Depends(require_org)):
    """One competitor's insight history, newest first."""
    try:
        # Ownership is enforced by RLS on the read; a stray id just returns [].
        rows = await sb.list_competitor_insights(competitor_id, org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    return [InsightOut(**r) for r in rows]


@router.post("/{competitor_id}/check")
async def check_now(competitor_id: str, ctx: OrgContext = Depends(require_org)):
    """Run the AI analysis for ONE competitor RIGHT NOW and store the insight.

    Respects the per-org monthly cap (this is a billed run). GRACEFUL DORMANCY: with
    no ANTHROPIC_API_KEY set, returns 200 with configured=false + a clear message —
    never a 500 — so the UI can show the "add your key" state.
    """
    try:
        competitor = await sb.get_competitor(competitor_id, org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    if not competitor:
        raise HTTPException(status_code=404, detail="Competitor not found")

    # Dormant: don't touch the cap, just tell the UI to show the "add key" state.
    if not api_configured():
        return {"ran": False, "configured": False, "message": NOT_CONFIGURED_MESSAGE}

    # Monthly cap (cost control). Counts stored insights this calendar month.
    cfg = await org_settings.resolve_for_org(ctx.org_id, token=ctx.token)
    try:
        used = await sb.count_competitor_insights_since(ctx.org_id, month_start_iso(), token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    if used >= cfg.competitor_max_per_month:
        raise HTTPException(
            status_code=429,
            detail=(f"Monthly AI-run cap reached ({used}/{cfg.competitor_max_per_month}). "
                    "Raise it in Automation settings to run more this month."),
        )

    result = await analyze_competitor(
        name=competitor["name"], website=competitor.get("website"), notes=competitor.get("notes")
    )
    if not result.get("configured"):
        return {"ran": False, "configured": False, "message": result.get("message", NOT_CONFIGURED_MESSAGE)}
    if not result.get("insight"):
        # AI reachable but this run failed — surface it without stamping last_checked_at,
        # so the next attempt (manual or scheduled) retries.
        raise HTTPException(status_code=502, detail=result.get("error") or "AI analysis failed.")

    try:
        stored = await _store_insight(
            result["insight"], org_id=ctx.org_id, competitor_id=competitor_id, token=ctx.token
        )
        now_iso = datetime.now(timezone.utc).isoformat()
        await sb.update_competitor_fields(
            competitor_id, {"last_checked_at": now_iso}, org_id=ctx.org_id, token=ctx.token
        )
    except Exception as e:
        raise sb_error(e)

    logger.info("[competitors check id=%s org=%s] stored insight", competitor_id, ctx.org_id)
    return {"ran": True, "configured": True, "insight": InsightOut(**stored) if stored else None}


# ═════════════════════════════════════════════════════════════════════════════
# SCHEDULED / AUTOMATED COMPETITOR SWEEP
# ─────────────────────────────────────────────────────────────────────────────
# Driven by Cloud Scheduler → POST /api/cron/competitor-sweep (cron.py). Same shape
# as the prospect-search sweep: settings are read LIVE per pass (resolve_all), so a
# dashboard edit lands on the very next sweep with no restart. GRACEFUL DORMANCY: if
# ANTHROPIC_API_KEY is unset the whole sweep no-ops early with a clear reason.
# ═════════════════════════════════════════════════════════════════════════════
async def run_competitor_sweep() -> dict:
    """For EACH org with competitor_intel_enabled, analyse every active competitor
    whose check interval has elapsed — up to the org's monthly cap — storing one
    insight per run and stamping last_checked_at. Never raises to the caller."""
    summary = {"orgs_swept": 0, "competitors_checked": 0, "insights_stored": 0,
               "skipped": {"disabled_or_not_due": 0, "quota": 0, "error": 0}, "reason": None}

    # Dormant deployment: no key, nothing to do. Clear, cheap, no DB churn.
    if not api_configured():
        summary["reason"] = NOT_CONFIGURED_MESSAGE
        logger.info("competitor sweep skipped: %s", NOT_CONFIGURED_MESSAGE)
        return summary

    settings_map = await org_settings.resolve_all()

    try:
        competitors = await sb.list_active_competitors()
    except sb.SupabaseNotConfigured as e:
        summary["reason"] = str(e)
        logger.warning("competitor sweep skipped: %s", e)
        return summary
    except Exception as e:
        summary["reason"] = str(e)
        logger.exception("competitor sweep: could not list competitors: %s", e)
        return summary

    from collections import defaultdict
    by_org: dict = defaultdict(list)
    for c in competitors:
        by_org[c.get("org_id")].append(c)

    now = datetime.now(timezone.utc)
    since = month_start_iso(now)

    for org_id, org_competitors in by_org.items():
        cfg = org_settings.for_org_or_default(org_id, settings_map)
        if not cfg.competitor_intel_enabled:
            summary["skipped"]["disabled_or_not_due"] += len(org_competitors)
            continue

        due = [c for c in org_competitors if _is_due(c, cfg.competitor_check_frequency_hours, now)]
        if not due:
            summary["skipped"]["disabled_or_not_due"] += len(org_competitors)
            continue

        try:
            used = await sb.count_competitor_insights_since(org_id, since)
        except Exception as e:
            logger.warning("competitor sweep: org=%s quota read failed (%s); skipping org", org_id, e)
            summary["skipped"]["error"] += len(due)
            continue
        remaining = cfg.competitor_max_per_month - used
        if remaining <= 0:
            logger.info("competitor sweep: org=%s at monthly cap (%d/%d) — skipping %d competitor(s)",
                        org_id, used, cfg.competitor_max_per_month, len(due))
            summary["skipped"]["quota"] += len(due)
            continue

        summary["orgs_swept"] += 1
        for competitor in due:
            if remaining <= 0:
                summary["skipped"]["quota"] += 1
                continue
            try:
                result = await analyze_competitor(
                    name=competitor["name"], website=competitor.get("website"), notes=competitor.get("notes")
                )
                if not result.get("insight"):
                    # AI error (not dormancy — we checked the key up top). Log and move
                    # on WITHOUT stamping last_checked_at so it retries next sweep.
                    logger.warning("competitor sweep: org=%s competitor=%s failed: %s",
                                   org_id, competitor.get("id"), result.get("error"))
                    summary["skipped"]["error"] += 1
                    continue
                await _store_insight(result["insight"], org_id=org_id, competitor_id=competitor["id"])
            except Exception as e:
                logger.exception("competitor sweep: org=%s competitor=%s unexpected error: %s",
                                 org_id, competitor.get("id"), e)
                summary["skipped"]["error"] += 1
                continue

            # Success: one billed run against the monthly cap.
            remaining -= 1
            summary["competitors_checked"] += 1
            summary["insights_stored"] += 1
            try:
                await sb.touch_competitor_checked(competitor["id"], now.isoformat())
            except Exception as e:
                logger.warning("competitor sweep: org=%s last_checked_at stamp failed: %s", org_id, e)

            logger.info("competitor sweep: org=%s '%s' analysed (cap left=%d)",
                        org_id, competitor.get("name"), remaining)

    logger.info("competitor sweep done: %d org(s), %d competitor(s) checked, %d insight(s) stored",
                summary["orgs_swept"], summary["competitors_checked"], summary["insights_stored"])
    return summary
