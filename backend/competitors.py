"""
COMPETITOR / MARKET INTELLIGENCE.

An org adds COMPETITORS (name + website). On a schedule — and on demand via a
"check now" button — this asks Groq's agentic "compound" model, which does LIVE
web search server-side, to research each competitor and summarise it into a clean
INSIGHT:

    summary        one short paragraph of recent activity
    key_points     3–6 crisp bullets
    source_urls    the web pages compound actually searched/cited

LIVE WEB SEARCH: COMPETITOR_MODEL ("groq/compound") runs its own web searches and
reads the results before answering; groq_client harvests the cited pages from the
response's executed_tools onto result.sources, so the dashboard shows real links
and details.live_search=True.

GRACEFUL FALLBACK: if compound errors, is rate-limited (429), or exceeds the free
tier's per-request size (413), we retry once with COMPETITOR_FALLBACK_MODEL (a
plain, no-search Groq model) which profiles from training knowledge. That path
sets details.live_search=False, source_urls=[], and appends a "not a live web
search" disclaimer to the summary — so the feature stays functional and honest.

Insights are stored (public.competitor_insights) so the Market Watch dashboard can
show the latest one per competitor and when it was last checked.

COST CONTROL — the AI call is the ONLY thing that consumes quota, and agentic web
search costs more per run, so the per-org monthly cap matters:
  * a cost-conscious model (free tier, configurable) is used,
  * each competitor is re-checked at most every competitor_check_frequency_hours,
  * and a per-org MONTHLY CAP (competitor_max_per_month) bounds total AI runs.
Each stored insight == one run, so this month's usage is simply
count(competitor_insights since the start of the calendar month) for the org.
A free-tier rate-limit (429) is surfaced as a normal analysis error so the run
isn't stamped and retries later, rather than crashing the sweep.

GRACEFUL DORMANCY — the whole feature is READY but dormant until GROQ_API_KEY
is set. With no key: CRUD + the dashboard work normally, and any analysis (manual
"check now" or the sweep) returns a clear "AI not configured — add GROQ_API_KEY
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

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import groq_client
import org_settings
import supabase_client as sb
from auth import OrgContext, require_org, sb_error

logger = logging.getLogger("competitors")
router = APIRouter(prefix="/api/competitors", tags=["competitors"])

# ── AI config (key is backend-only, never the browser) ───────────────────────
# Competitor intel is bound to GROQ directly (independent of the global PROVIDER),
# because it uses Groq's agentic "compound" model, which does LIVE web search
# server-side. If compound fails/limits out, we fall back to a plain Groq model
# that summarises from training knowledge (with a disclaimer) so the feature never
# breaks.
#
# ┌─ COMPETITOR_MODEL — the live-web-search model (override via env) ──────────┐
# │ "groq/compound" runs Google-style web search + reads results server-side,  │
# │ returning both an answer and the pages it searched (message.executed_tools,│
# │ from which groq_client extracts citations). "groq/compound-mini" is a       │
# │ lighter/cheaper variant. Override per-deploy with COMPETITOR_MODEL.         │
# └────────────────────────────────────────────────────────────────────────────┘
COMPETITOR_MODEL = "groq/compound"
# Graceful fallback when compound errors, rate-limits (429), or exceeds the free
# tier's per-request size (413): a plain Groq chat model with NO web search.
COMPETITOR_FALLBACK_MODEL = "openai/gpt-oss-120b"

# Bounded so one analysis stays cheap and predictable.
MAX_TOKENS = 1024
REQUEST_TIMEOUT_SECONDS = 90.0

# The message the UI shows (and the sweep logs) when the key isn't set.
NOT_CONFIGURED_MESSAGE = (
    "AI not configured — add GROQ_API_KEY to enable competitor intelligence."
)

# Appended to a summary ONLY on the fallback path (no live search), so the
# dashboard makes clear that insight is the model's general knowledge, not live.
LIVE_SEARCH_DISCLAIMER = (
    "Note: this profile is generated from the AI model's general knowledge, not a "
    "live web search, so it may be out of date."
)

# A month is reckoned as this many hours (365.25/12*24 ≈ 730.5), matching the
# prospect-search sweep, so "runs per month" = AVG_HOURS_PER_MONTH / frequency_hours.
AVG_HOURS_PER_MONTH = 730.0


# ── config helpers ───────────────────────────────────────────────────────────
def api_configured() -> bool:
    return groq_client.api_configured()


def model() -> str:
    # The live-web-search model. COMPETITOR_MODEL env overrides the constant.
    return os.environ.get("COMPETITOR_MODEL", "").strip() or COMPETITOR_MODEL


def fallback_model() -> str:
    # Plain (no-search) model used when the search model fails/limits out.
    return os.environ.get("COMPETITOR_FALLBACK_MODEL", "").strip() or COMPETITOR_FALLBACK_MODEL


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
# THE AI ANALYSIS — Groq compound (LIVE web search) with a graceful fallback.
# ─────────────────────────────────────────────────────────────────────────────
# PRIMARY: one request to COMPETITOR_MODEL ("groq/compound"). Compound runs web
# searches SERVER-SIDE for the competitor, reads the pages, and answers. groq_client
# harvests the cited pages from message.executed_tools onto result.sources. We ask
# for a JSON object (summary + key_points + activity_level) and parse it from the
# text; if the searched answer isn't clean JSON we still keep it (see _from_search).
# This path sets details.live_search=True and populates source_urls with real links.
#
# FALLBACK: if compound errors / is rate-limited (429) / exceeds the free-tier
# per-request size (413), we retry once with COMPETITOR_FALLBACK_MODEL (a plain, no-
# search Groq model) which profiles from training knowledge. That path sets
# live_search=False and appends the "not a live web search" disclaimer, so the
# feature stays functional and honest even when live search is unavailable.
# ═════════════════════════════════════════════════════════════════════════════

# System prompt for the LIVE-SEARCH (compound) path.
_SYSTEM_SEARCH = (
    "You are a market-intelligence analyst with a LIVE web search tool. First, search "
    "the web for RECENT, material information about the SPECIFIED competitor company — "
    "news, product launches, pricing changes, promotions/offers, funding, partnerships, "
    "notable hiring, or market moves from roughly the last few months. Prefer primary "
    "and reputable sources. Do NOT invent facts; if searches turn up nothing recent, "
    "say so plainly. "
    "After searching, respond with ONLY a JSON object (no prose, no markdown, no code "
    'fences), shaped exactly as: {"summary": "<2-4 sentence overview of what is recent>", '
    '"key_points": ["<short bullet>", "..."], '
    '"activity_level": "<one of: high, moderate, low, none>"}. '
    "Keep key_points to 3-6 crisp, factual bullets. Do not put URLs in the JSON — the "
    "source links are collected automatically from your searches."
)

# System prompt for the FALLBACK (no-search) path — training knowledge only.
_SYSTEM_KNOWLEDGE = (
    "You are a market-intelligence analyst. You do NOT have live web access, so work "
    "ONLY from what you already know about the SPECIFIED competitor company from the "
    "name, website, and any context provided. Give a concise general profile: what the "
    "company does, its market/positioning, typical products or services, and likely "
    "strengths or weaknesses. Do NOT fabricate specific recent events, dates, prices, "
    "funding rounds, or news — if you are unsure or your knowledge may be outdated, say "
    "so plainly and keep to durable, general facts. "
    "Respond with ONLY a JSON object (no prose around it), shaped exactly as: "
    '{"summary": "<2-4 sentence profile of the company>", '
    '"key_points": ["<short bullet>", "..."], '
    '"activity_level": "<one of: high, moderate, low, none>"}. '
    "Keep key_points to 3-6 crisp bullets. Do not put URLs in the JSON."
)


def _build_user_prompt(*, name: str, website: Optional[str], notes: Optional[str], live: bool) -> str:
    lines = [f"COMPETITOR TO RESEARCH: {name}" if live else f"COMPETITOR TO PROFILE: {name}"]
    if website:
        lines.append(f"WEBSITE: {website}")
    if notes:
        lines.append(f"CONTEXT (from the user, may help disambiguate): {notes.strip()}")
    if live:
        lines.append("\nSearch the web for this company's recent activity and return ONLY "
                     "the JSON object described in the system prompt.")
    else:
        lines.append("\nProfile this company from your own knowledge and return the JSON "
                     "object described in the system prompt.")
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


def _build_insight(
    *, text: str, sources: List[Dict[str, str]], used_model: str, live_search: bool
) -> Optional[Dict[str, Any]]:
    """Turn a model reply into the stored insight shape, or None if unusable.

    Parses the JSON object the prompt asks for. On the live path, if the searched
    answer isn't clean JSON we still salvage it (text as the summary) rather than
    throw away a real web search. On the fallback path we append the disclaimer and
    flag live_search=False. source_urls carries the citations (real ones on the
    live path, [] on the fallback path).
    """
    parsed = _extract_json(text)
    if isinstance(parsed, dict):
        summary = (parsed.get("summary") or "").strip()
        key_points = [str(p).strip() for p in (parsed.get("key_points") or []) if str(p).strip()]
        activity_level = (parsed.get("activity_level") or "").strip().lower()
        if activity_level not in ("high", "moderate", "low", "none"):
            activity_level = None
    elif live_search and text.strip():
        # Compound searched but replied in prose/markdown — keep the searched answer
        # (trimmed) instead of discarding a genuine live-search result.
        summary = text.strip()[:1500]
        key_points, activity_level = [], None
    else:
        return None

    if not summary:
        return None

    if not live_search and LIVE_SEARCH_DISCLAIMER.split(":")[0] not in summary:
        # No live search: make that unmistakable in the UI (source_urls stays []).
        summary = f"{summary}\n\n{LIVE_SEARCH_DISCLAIMER}"

    details: Dict[str, Any] = {
        "key_points": key_points,
        "activity_level": activity_level,
        "model": used_model,
        "live_search": live_search,
    }
    if not live_search:
        details["note"] = LIVE_SEARCH_DISCLAIMER
    return {"summary": summary, "details": details, "source_urls": sources if live_search else []}


async def analyze_competitor(
    *, name: str, website: Optional[str] = None, notes: Optional[str] = None
) -> Dict[str, Any]:
    """Research one competitor via Groq compound (LIVE web search), with a graceful
    fallback to a plain no-search model. Returns a structured dict; NEVER raises:

      {"configured": False, "message": NOT_CONFIGURED_MESSAGE}      # no API key
      {"configured": True, "insight": {summary, details, source_urls}}  # success
      {"configured": True, "insight": None, "error": "<why>"}       # 429 / total failure

    `insight` is exactly the shape stored in competitor_insights. On the live path
    details.live_search=True and source_urls holds the cited pages; on the fallback
    path details.live_search=False and source_urls is [].
    """
    if not api_configured():
        return {"configured": False, "message": NOT_CONFIGURED_MESSAGE}

    # ── PRIMARY: live web search via compound ────────────────────────────────
    search_model = model()
    result = await groq_client.generate(
        system=_SYSTEM_SEARCH,
        messages=[{"role": "user",
                   "content": _build_user_prompt(name=name, website=website, notes=notes, live=True)}],
        model=search_model,
        temperature=0.3,
        max_output_tokens=MAX_TOKENS,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    if result.ok:
        insight = _build_insight(text=result.text, sources=result.sources,
                                 used_model=search_model, live_search=True)
        if insight:
            logger.info("competitor analyze: '%s' -> %d key point(s), %d source(s) via %s (LIVE search)",
                        name, len(insight["details"]["key_points"]), len(insight["source_urls"]), search_model)
            return {"configured": True, "insight": insight}
        logger.warning("competitor analyze: '%s' live reply unusable; falling back", name)
    elif result.rate_limited:
        # 429: don't burn the (also-limited) fallback on a billed run — surface it so
        # last_checked_at isn't stamped and the next check/sweep retries.
        logger.warning("competitor analyze: '%s' rate-limited: %s", name, result.error)
        return {"configured": True, "insight": None, "error": result.error or "AI rate-limited."}
    else:
        # Other compound failure (e.g. 413 request-too-large on the free tier, model
        # unavailable). Fall through to the no-search fallback so the feature works.
        logger.warning("competitor analyze: '%s' compound failed (%s); falling back to %s",
                       name, result.error, fallback_model())

    # ── FALLBACK: no-search profile from training knowledge ──────────────────
    fb_model = fallback_model()
    fb = await groq_client.generate(
        system=_SYSTEM_KNOWLEDGE,
        messages=[{"role": "user",
                   "content": _build_user_prompt(name=name, website=website, notes=notes, live=False)}],
        model=fb_model,
        temperature=0.4,
        max_output_tokens=MAX_TOKENS,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    if not fb.ok:
        logger.warning("competitor analyze: '%s' fallback failed: %s", name, fb.error)
        return {"configured": True, "insight": None, "error": fb.error or "AI analysis failed."}

    insight = _build_insight(text=fb.text, sources=[], used_model=fb_model, live_search=False)
    if not insight:
        logger.error("competitor analyze: '%s' fallback reply not JSON (%r...)", name, fb.text[:160])
        return {"configured": True, "insight": None, "error": "AI returned an unreadable response."}

    logger.info("competitor analyze: '%s' -> %d key point(s) via %s (fallback, no live search)",
                name, len(insight["details"]["key_points"]), fb_model)
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
    no GROQ_API_KEY set, returns 200 with configured=false + a clear message —
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
# GROQ_API_KEY is unset the whole sweep no-ops early with a clear reason.
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
