"""
Optional MongoDB connection.

Mongo is legacy — the app's real data lives in Supabase. The only remaining Mongo
users are the demo /api/status endpoints. So it's fully OPTIONAL: unless MONGO_URL
is set, we never import the driver, never connect, and startup does no Mongo work
(important on Cloud Run, where a 30s server-selection hang on a missing Mongo
would delay readiness). Set MONGO_URL only if you actually want those endpoints.
"""
import logging
import os

logger = logging.getLogger("db")

MONGO_URL = os.environ.get("MONGO_URL", "").strip()
DB_NAME = os.environ.get("DB_NAME", "leadpilot")

client = None
db = None

if MONGO_URL:
    try:
        from motor.motor_asyncio import AsyncIOMotorClient
        # Short timeouts so a misconfigured URL fails fast instead of hanging boot.
        client = AsyncIOMotorClient(
            MONGO_URL, serverSelectionTimeoutMS=3000, connectTimeoutMS=3000
        )
        db = client[DB_NAME]
        logger.info("Mongo configured (db=%s)", DB_NAME)
    except Exception as e:  # driver missing or bad URL — degrade, don't crash
        logger.warning("Mongo disabled (%s)", e)
        client = db = None
else:
    logger.info("MONGO_URL not set — Mongo disabled (fine; app data is in Supabase)")


def mongo_enabled() -> bool:
    return db is not None


async def ensure_indexes():
    """No-op unless Mongo is configured. Never raises to the caller."""
    if db is None:
        return
    try:
        await db.integration_tokens.create_index(
            [("user_id", 1), ("platform", 1)], unique=True
        )
    except Exception as e:
        logger.warning("ensure_indexes skipped: %s", e)


def close():
    if client is not None:
        client.close()
