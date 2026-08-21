from fastapi import FastAPI, APIRouter, HTTPException, Request, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Optional MongoDB (see db.py) — disabled unless MONGO_URL is set.
import db as mongo
import supabase_client as sb  # shared HTTP client; closed on shutdown
from integrations.router import router as integrations_router
from connections import router as connections_router
from leads import router as leads_router
from lead_import import router as lead_import_router
from prospects import router as prospects_router
from saved_searches import router as saved_searches_router
from competitors import router as competitors_router
from calls import router as calls_router, log_router as call_log_router
from auto_call import settings_router
from crm.router import router as crm_router
from orgs import router as orgs_router, public_router as public_org_router
from org_settings import router as org_settings_router
import followup
import emails as emails_module
import ai_email
from knowledge import router as knowledge_router
from widget import router as widget_router, public_router as widget_public_router
from widget_js import WIDGET_JS
from tags import router as tags_router, assign_router as lead_tags_router
from notes import router as notes_router
from custom_fields import router as custom_fields_router, values_router as lead_custom_fields_router
from agents import router as agents_router
from analytics import router as analytics_router
from cron import router as cron_router
from geo import router as geo_router
import scheduler

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore MongoDB's _id field
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

def _require_mongo():
    """These demo endpoints need Mongo, which is optional — 503 when it's off."""
    if mongo.db is None:
        raise HTTPException(status_code=503, detail="Mongo is not configured (set MONGO_URL).")


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    _require_mongo()
    status_obj = StatusCheck(**input.model_dump())
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()  # ISO string for MongoDB
    _ = await mongo.db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    _require_mongo()
    status_checks = await mongo.db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    return status_checks

# Include the router in the main app
app.include_router(api_router)
# OAuth2 integrations (authorize / callback / list / disconnect) under /api/integrations
app.include_router(integrations_router)
# Per-org PROVIDER connections: each org's own encrypted Bland/Resend API keys.
app.include_router(connections_router)
# Inbound leads (Supabase-backed) and outbound Bland calls.
app.include_router(leads_router)
# Excel/CSV lead import (upload -> preview/map -> confirm).
app.include_router(lead_import_router)
# Compliant PROSPECT finder: RapidAPI "Local Business Data" search -> stored,
# reviewable prospects (org-scoped, RLS). SEPARATE from leads and NEVER
# auto-called; a prospect only enters the calling pipeline once CONVERTED to a lead.
app.include_router(prospects_router)
# Scheduled/automated prospect searches (CRUD + monthly usage). Timing lives in
# org_settings; the sweep is prospects.run_prospect_search_sweep via cron.
app.include_router(saved_searches_router)
# Competitor / market intelligence: per-org CRUD for tracked competitors + AI
# analysis into stored insights (org-scoped, RLS). AI is backend-only and gracefully
# DORMANT until GROQ_API_KEY is set; the scheduled sweep runs via
# competitors.run_competitor_sweep (cron /api/cron/competitor-sweep).
app.include_router(competitors_router)
app.include_router(calls_router)
# Call history (call_log), newest first.
app.include_router(call_log_router)
# Auto-call settings (master switch toggle).
app.include_router(settings_router)
# CRM lead import (pluggable adapters: mock / sangam).
app.include_router(crm_router)
# Follow-up email drip: unsubscribe + manual send, and its settings toggle.
app.include_router(followup.router)
app.include_router(followup.settings_router)
# Email history, compose/custom send, and template editing.
app.include_router(emails_module.router)
# Per-org knowledge base (grounds the AI follow-up writer) + its on/off toggle.
app.include_router(knowledge_router)
# Embeddable AI chat widget. MANAGEMENT (auth) config + conversations, and the
# PUBLIC (widget_key, no auth) message/capture/config endpoints called from any
# website. The public endpoints — and /widget.js below — are the ONLY surfaces
# opened to arbitrary origins; see the scoped-CORS middleware further down.
app.include_router(widget_router)
app.include_router(widget_public_router)
app.include_router(ai_email.settings_router)
# Lead tags (per-org library + assign/unassign), notes, and custom fields
# (per-org definitions + per-lead values). All authenticated and org-scoped.
app.include_router(tags_router)
app.include_router(lead_tags_router)
app.include_router(notes_router)
app.include_router(custom_fields_router)
app.include_router(lead_custom_fields_router)
# AI calling agents (per-org CRUD + provider voice list). Calls are placed *as* an
# agent through the calling adapter (backend/calling/), Bland today.
app.include_router(agents_router)
# Org-scoped analytics aggregates for the Dashboard + Analytics pages.
app.include_router(analytics_router)
# Organizations + team management (auth required), and the public org lookup
# the enquiry form uses to render "who am I contacting".
app.include_router(orgs_router)
app.include_router(public_org_router)
# Per-org automation settings (GET/PATCH /api/org/settings). The single source of
# truth the sweeps read LIVE per-org — replaces the old global env-var settings.
app.include_router(org_settings_router)
# Cloud Scheduler → cron sweeps (secured by X-Cron-Secret). Replaces the old
# in-process background loops so scheduling survives Cloud Run scale-to-zero.
app.include_router(cron_router)
# Public, unauthenticated visitor-country lookup for DISPLAY-ONLY currency on the
# marketing pricing page. Cosmetic — never touches billing; always falls back safely.
app.include_router(geo_router)


# The self-contained embeddable widget script. Served at the ROOT (not /api) so
# the one-line <script src="…/widget.js"> tag is clean. Public + cacheable; the
# scoped-CORS middleware below opens it (and the public widget API) to any origin.
@app.get("/widget.js", include_in_schema=False)
async def widget_js() -> Response:
    return Response(
        content=WIDGET_JS,
        media_type="application/javascript; charset=utf-8",
        headers={"Cache-Control": "public, max-age=300"},
    )


def _is_public_widget_path(path: str) -> bool:
    """Exactly the surfaces that must work from ANY website: /widget.js and the
    three PUBLIC widget endpoints /api/widget/{key}/{message|capture|config}.
    The MANAGEMENT routes /api/widget/config, /api/widget/conversations and
    /api/widget/config/rotate-key are 3-part or end in 'rotate-key', so they are
    deliberately NOT matched and stay under the locked-down global CORS policy."""
    if path == "/widget.js":
        return True
    parts = path.strip("/").split("/")
    return (
        len(parts) == 4
        and parts[0] == "api"
        and parts[1] == "widget"
        and parts[3] in ("message", "capture", "config")
    )


@app.on_event("startup")
async def _startup():
    # Mongo is optional (no-op unless MONGO_URL is set) and never blocks boot.
    await mongo.ensure_indexes()
    # Restore the in-process sweep loops so auto-call + follow-up run on their own
    # on boot (auto-call ~60s, follow-up ~5-10 min). They call the SAME functions
    # as the /api/cron/* endpoints — every guardrail is reused, not duplicated.
    # Gated by INTERNAL_SCHEDULER_ENABLED (default TRUE); set it FALSE on Cloud Run
    # (scale-to-zero) where Cloud Scheduler drives the cron endpoints instead.
    scheduler.start()
    logging.getLogger(__name__).info(
        "startup complete; internal scheduler enabled=%s (cron endpoints /api/cron/* also available)",
        scheduler.is_enabled(),
    )


# Cross-origin access for the frontend (e.g. the Vercel app). Comma-separated
# origins in ALLOWED_ORIGINS; defaults to '*'. CORS_ORIGINS is still honoured for
# back-compat. Credentials can't be combined with '*', so only enable them when
# explicit origins are configured.
_origins_raw = (os.environ.get('ALLOWED_ORIGINS') or os.environ.get('CORS_ORIGINS') or '*')
_allow_origins = [o.strip() for o in _origins_raw.split(',') if o.strip()] or ['*']
app.add_middleware(
    CORSMiddleware,
    allow_credentials='*' not in _allow_origins,
    allow_origins=_allow_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Registered AFTER the global CORSMiddleware, so it is the OUTERMOST middleware
# and gets first crack at every request. That ordering is what lets it answer the
# cross-origin PREFLIGHT for the public widget surfaces itself — before the global
# CORS layer (which would reject a non-allowlisted origin) ever sees it. Only the
# public widget paths are opened here; every other route keeps the locked-down
# global policy above.
@app.middleware("http")
async def widget_public_cors(request: Request, call_next):
    if not _is_public_widget_path(request.url.path):
        return await call_next(request)
    if request.method == "OPTIONS":
        resp = Response(status_code=200)
    else:
        resp = await call_next(request)
    # No credentials are ever used on these endpoints, so '*' is correct and lets
    # the response be cached across origins.
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Max-Age"] = "86400"
    return resp


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    # Stop the sweep loops first so they don't run mid-teardown, then close the
    # shared Supabase HTTP client and Mongo.
    await scheduler.stop()
    await sb.aclose()
    mongo.close()