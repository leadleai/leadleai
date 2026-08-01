"""
Internal background scheduler — the in-process sweep loops, restored.

Before the Cloud Run prep, the backend ran two periodic loops in-process on
startup: a fast auto-call sweep and a slower follow-up drip sweep. Those loops
were removed in favour of external Cloud Scheduler pings to
POST /api/cron/auto-call-sweep and /api/cron/followup-sweep (see cron.py),
because on Cloud Run (scale-to-zero) the container is frozen between requests and
an in-process loop can't survive.

For local dev and any always-on deployment, that meant nothing triggered the
sweeps and auto-call / email quietly stopped running on their own. This module
brings the loops back. It calls the SAME sweep functions the cron endpoints call:

    auto_call.run_auto_call_sweep()   ~every AUTO_CALL_SWEEP_INTERVAL_SECONDS (60s)
    followup.run_followup_sweep()     ~every FOLLOWUP_INTERVAL_MINUTES (5–10 min)

so every guardrail lives in one place and is reused unchanged — master switches
(AUTO_CALL_ENABLED / FOLLOWUP_ENABLED), quiet hours, dedupe, the atomic
call-once / once-per-step claims, the 3-email cap, and unsubscribe. Nothing about
those behaviours is duplicated or altered here; this is purely a timer.

Gated by INTERNAL_SCHEDULER_ENABLED (default TRUE). On Cloud Run set it to FALSE
so Cloud Scheduler is the only driver and the sweeps don't run twice. The cron
endpoints remain available regardless of this flag.
"""
import asyncio
import logging
import os
from typing import Awaitable, Callable

import auto_call
import followup

logger = logging.getLogger("scheduler")

# Live background tasks, so shutdown can cancel them cleanly.
_tasks: list[asyncio.Task] = []


def _env_bool(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def is_enabled() -> bool:
    """Master switch for the internal scheduler. Default TRUE."""
    return _env_bool("INTERNAL_SCHEDULER_ENABLED", True)


def auto_call_interval_seconds() -> float:
    """How often the auto-call LOOP ticks. This is now ADAPTIVE and per-org aware:
    auto_call.desired_loop_seconds() returns the smallest per-org
    auto_call_sweep_seconds seen on the last sweep, floored by
    AUTO_CALL_SWEEP_MIN_SECONDS. Re-read every pass (see _run_loop), so editing an
    org's sweep frequency in the dashboard speeds up / slows down the loop within
    one cycle — no restart. Within each pass, each org is only actually processed
    once its OWN interval has elapsed, so larger per-org values are honoured too.
    Honest limit: the loop is shared, so no org is checked more often than this
    tick, and the tick can't drop below the MIN floor."""
    return max(1.0, auto_call.desired_loop_seconds())


def followup_interval_seconds() -> float:
    """How often the follow-up LOOP ticks — adaptive, same design as above via
    followup.desired_loop_seconds() (smallest per-org followup_sweep_seconds,
    floored by FOLLOWUP_SWEEP_MIN_SECONDS). Re-read every pass."""
    return max(1.0, followup.desired_loop_seconds())


async def _run_loop(
    name: str,
    sweep: Callable[[], Awaitable[dict]],
    interval_seconds: Callable[[], float],
    initial_delay: float,
) -> None:
    """Run `sweep` forever, roughly every `interval_seconds()`.

    A short initial delay lets the app finish booting and staggers the two loops
    so they don't fire in the same instant. The interval is re-read each pass, so
    changing FOLLOWUP_INTERVAL_MINUTES takes effect without a restart. A sweep
    that raises is logged and swallowed — one bad pass never kills the loop."""
    try:
        await asyncio.sleep(initial_delay)
        while True:
            try:
                result = await sweep()
                logger.info("scheduler: '%s' sweep -> %s", name, result)
            except Exception:  # defensive — the sweeps already guard themselves
                logger.exception("scheduler: '%s' sweep raised; continuing", name)
            await asyncio.sleep(interval_seconds())
    except asyncio.CancelledError:
        logger.info("scheduler: '%s' loop cancelled", name)
        raise


def start() -> bool:
    """Launch the sweep loops as asyncio background tasks. Call from the FastAPI
    startup event (the event loop is already running there). Idempotent and a
    no-op when INTERNAL_SCHEDULER_ENABLED is off. Returns True if started."""
    if not is_enabled():
        logger.info(
            "internal scheduler disabled (INTERNAL_SCHEDULER_ENABLED is off); "
            "sweeps must be driven externally via POST /api/cron/*"
        )
        return False
    if _tasks:
        logger.info("internal scheduler already running")
        return True

    _tasks.append(asyncio.create_task(
        _run_loop("auto-call", auto_call.run_auto_call_sweep, auto_call_interval_seconds, initial_delay=5.0),
        name="scheduler-auto-call",
    ))
    _tasks.append(asyncio.create_task(
        _run_loop("followup", followup.run_followup_sweep, followup_interval_seconds, initial_delay=15.0),
        name="scheduler-followup",
    ))
    logger.info(
        "internal scheduler started: auto-call sweep ~every %.0fs, follow-up sweep ~every %.0fs",
        auto_call_interval_seconds(), followup_interval_seconds(),
    )
    return True


async def stop() -> None:
    """Cancel the sweep loops and wait for them to unwind. Call from shutdown."""
    if not _tasks:
        return
    for t in _tasks:
        t.cancel()
    for t in _tasks:
        try:
            await t
        except asyncio.CancelledError:
            pass
        except Exception:  # pragma: no cover - defensive
            logger.exception("scheduler: error awaiting cancelled task")
    _tasks.clear()
    logger.info("internal scheduler stopped")
