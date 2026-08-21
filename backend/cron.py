"""
Cron endpoints for Cloud Run (scale-to-zero) driven by Cloud Scheduler.

On Cloud Run the container is frozen/killed once a request finishes, so the old
in-process background loops (the follow-up drip sweep and the "sleep then call"
auto-caller) don't survive. Instead, Cloud Scheduler pings these HTTP endpoints
on a schedule and each does ONE sweep:

  POST /api/cron/auto-call-sweep   every ~1 min  — call leads whose delay elapsed
  POST /api/cron/followup-sweep    every ~5-15 min — send any due follow-ups

Both are guarded by a shared secret. They are NOT publicly triggerable: the
caller must send `X-Cron-Secret: <CRON_SECRET>` (Cloud Scheduler adds this
header). A missing/wrong secret is 401; an unset server-side secret is 503 so a
misconfiguration fails closed rather than running wide open.

All the real work — and every guardrail (master switches, quiet hours, dedupe,
the atomic once-per-step / call-once claims, the 3-email cap, unsubscribe) —
lives in followup.py / auto_call.py and is reused unchanged here.
"""
import hmac
import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException

import auto_call
import competitors
import followup
import prospects

logger = logging.getLogger("cron")
router = APIRouter(prefix="/api/cron", tags=["cron"])


def require_cron_secret(x_cron_secret: Optional[str] = Header(default=None, alias="X-Cron-Secret")) -> bool:
    """Constant-time check of the shared secret. 503 if the server has none set
    (fail closed), 401 if the caller's header is missing or wrong."""
    expected = os.environ.get("CRON_SECRET", "").strip()
    if not expected:
        logger.error("cron call rejected: CRON_SECRET is not set on the server")
        raise HTTPException(status_code=503, detail="CRON_SECRET is not configured on the server.")
    if not x_cron_secret or not hmac.compare_digest(x_cron_secret, expected):
        logger.warning("cron call rejected: missing/invalid X-Cron-Secret")
        raise HTTPException(status_code=401, detail="Invalid or missing X-Cron-Secret.")
    return True


@router.post("/auto-call-sweep")
async def auto_call_sweep(_: bool = Depends(require_cron_secret)):
    """Call every lead whose AUTO_CALL_DELAY_SECONDS has elapsed and is still an
    un-called 'new'. Idempotent: the atomic claim prevents double-dialing."""
    logger.info("cron: auto-call-sweep triggered")
    result = await auto_call.run_auto_call_sweep()
    logger.info("cron: auto-call-sweep result: %s", result)
    return {"job": "auto-call-sweep", **result}


@router.post("/followup-sweep")
async def followup_sweep(_: bool = Depends(require_cron_secret)):
    """Run one follow-up drip sweep (the logic formerly in the periodic loop)."""
    logger.info("cron: followup-sweep triggered")
    result = await followup.run_followup_sweep()
    logger.info("cron: followup-sweep result: %s", result)
    return {"job": "followup-sweep", **result}


@router.post("/prospect-search-sweep")
async def prospect_search_sweep(_: bool = Depends(require_cron_secret)):
    """Run one scheduled-prospect-search sweep: for each org with the feature on,
    re-run every active saved search whose frequency has elapsed (up to the monthly
    cap), DISCOVERING new prospects. Never auto-contacts — review stays manual."""
    logger.info("cron: prospect-search-sweep triggered")
    result = await prospects.run_prospect_search_sweep()
    logger.info("cron: prospect-search-sweep result: %s", result)
    return {"job": "prospect-search-sweep", **result}


@router.post("/competitor-sweep")
async def competitor_sweep(_: bool = Depends(require_cron_secret)):
    """Run one competitor-intel sweep: for each org with the feature on, re-analyse
    every active competitor whose check interval has elapsed (up to the monthly cap),
    calling the AI provider (Groq) and storing an insight. No-ops cleanly
    when GROQ_API_KEY is unset (graceful dormancy)."""
    logger.info("cron: competitor-sweep triggered")
    result = await competitors.run_competitor_sweep()
    logger.info("cron: competitor-sweep result: %s", result)
    return {"job": "competitor-sweep", **result}
