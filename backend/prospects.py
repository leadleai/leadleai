"""
Compliant PROSPECT FINDER.

Discovery for REVIEW + compliant outreach — NOT auto-cold-calling. The user
searches for businesses (category + location) via RapidAPI's "Local Business
Data" API; results are normalized and stored as PROSPECTS for the calling org.
From there the user reviews them, sets status / notes, and reaches out through
COMPLIANT channels only:

  * COLD EMAIL — only when an email was discovered; reuses the existing Resend
    sender and ALWAYS appends an unsubscribe link (see followup.wrap_html).
  * MANUAL "mark as contacted" — for when the user reaches out themselves.
  * CONVERT TO LEAD — promotes a prospect into the normal `leads` table
    (source='prospect'), after which it flows through the usual pipeline and is
    eligible for calling like any other lead.

Guardrails:
  * Prospects are SEPARATE from leads and are NEVER fed into the auto-call sweep
    (that sweep reads `leads` only). No auto-calling of prospects — ever.
  * Everything is authenticated + org-scoped; Postgres RLS is the real boundary.
  * One search == exactly one upstream API call (the free tier is 500/month), and
    the response's remaining-quota headers are surfaced so usage is visible.
  * Lightweight: stdlib + httpx only. No pandas.

Endpoints (all under /api/prospects, all authenticated + org-scoped except the
public unsubscribe link):

  POST   /api/prospects/search              run one Local Business Data search,
                                            normalize + dedupe + store, return the
                                            stored prospects + API usage.
  GET    /api/prospects                     list this org's prospects (?status=…).
  PATCH  /api/prospects/{id}                update status and/or notes.
  POST   /api/prospects/{id}/email          send a compliant cold email (needs an
                                            email; appends the unsubscribe link).
  POST   /api/prospects/{id}/convert        convert to a lead (source='prospect').
  GET    /api/prospects/unsubscribe         PUBLIC cold-email opt-out link.
"""
import logging
import os
import re
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, EmailStr, Field, field_validator

import followup
import org_settings
import supabase_client as sb
from auth import OrgContext, require_org, sb_error

logger = logging.getLogger("prospects")
router = APIRouter(prefix="/api/prospects", tags=["prospects"])

# ═════════════════════════════════════════════════════════════════════════════
# CONFIG — RapidAPI "Local Business Data" (by Letscrape).  EDIT HERE to adjust.
# ─────────────────────────────────────────────────────────────────────────────
# Auth: RAPIDAPI_KEY in backend/.env (never sent to the browser).
# The Search endpoint takes a free-text `query` (e.g. "salons in Mumbai") + a
# result `limit`. `extract_emails_and_contacts` asks the API to scrape the
# business website for an email/socials (this is what makes the compliant
# cold-email channel possible when an email exists).
#
# One /api/prospects/search  ==  exactly ONE request below  ==  one call against
# the 500/month free tier, regardless of how many results `limit` asks for.
# ═════════════════════════════════════════════════════════════════════════════
RAPIDAPI_HOST = "local-business-data.p.rapidapi.com"
RAPIDAPI_SEARCH_URL = f"https://{RAPIDAPI_HOST}/search"
RAPIDAPI_TIMEOUT_SECONDS = 30.0

# Per-search result cap. The free tier bills PER CALL (not per result), so a
# larger limit is "free" — but we keep a sane ceiling so one review list stays
# manageable and payloads stay small.
DEFAULT_LIMIT = 20
MAX_LIMIT = 60

# Field mapping: RapidAPI response field  ->  our prospect column. Adjust the
# right-hand strings if the upstream schema changes.
FIELD_MAP = {
    "external_id": "business_id",     # stable Google place id (dedupe anchor)
    "name": "name",
    "phone": "phone_number",          # already E.164 from Google
    "address": "full_address",
    "website": "website",
    "category": "type",               # e.g. "Coffee shop"
    "rating": "rating",               # float 0–5
    "review_count": "review_count",
}
# Where the scraped email lives in the response (only when extract_emails_and_contacts=true).
EMAILS_CONTACTS_FIELD = "emails_and_contacts"
EMAILS_SUBFIELD = "emails"
# Response envelope fields.
RESP_STATUS_FIELD = "status"          # "OK" on success
RESP_DATA_FIELD = "data"              # list of businesses
# RapidAPI returns remaining monthly quota in these response headers.
QUOTA_LIMIT_HEADER = "x-ratelimit-requests-limit"
QUOTA_REMAINING_HEADER = "x-ratelimit-requests-remaining"
# ═════════════════════════════════════════════════════════════════════════════

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PROSPECT_STATUSES = ["new", "contacted", "interested", "not_interested", "converted"]


def _rapidapi_key() -> str:
    key = os.environ.get("RAPIDAPI_KEY", "").strip()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="Prospect search isn't configured: set RAPIDAPI_KEY in backend/.env.",
        )
    return key


# ── Models ───────────────────────────────────────────────────────────────────
class ProspectSearchIn(BaseModel):
    # `query` is a free-text business search; the UI composes it from category +
    # location (e.g. "salons in Mumbai"). We also accept them split so the
    # frontend can send either shape.
    query: Optional[str] = Field(default=None, max_length=200)
    category: Optional[str] = Field(default=None, max_length=120)
    location: Optional[str] = Field(default=None, max_length=120)
    limit: int = Field(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT)

    def resolved_query(self) -> str:
        if self.query and self.query.strip():
            return self.query.strip()
        parts = [p.strip() for p in (self.category, self.location) if p and p.strip()]
        if len(parts) == 2:
            return f"{parts[0]} in {parts[1]}"
        return " ".join(parts)


class ProspectOut(BaseModel):
    id: str
    org_id: Optional[str] = None
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None
    category: Optional[str] = None
    rating: Optional[float] = None
    review_count: Optional[int] = None
    source: str = "prospect_search"
    status: str = "new"
    notes: Optional[str] = None
    unsubscribed: bool = False
    external_id: Optional[str] = None
    converted_lead_id: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ProspectSearchOut(BaseModel):
    query: str
    found: int                       # businesses the API returned
    stored: int                      # brand-new prospects inserted
    updated: int                     # existing prospects refreshed (dedupe hit)
    prospects: List[ProspectOut]     # the full stored set for this search
    # API usage from the response headers, so the 500/month tier stays visible.
    api_requests_used: Optional[int] = None       # this call counts as 1
    api_requests_remaining: Optional[int] = None
    api_requests_limit: Optional[int] = None


class ProspectUpdateIn(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = Field(default=None, max_length=5000)

    @field_validator("status")
    @classmethod
    def valid_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in PROSPECT_STATUSES:
            raise ValueError(f"status must be one of {PROSPECT_STATUSES}")
        return v


class ProspectEmailIn(BaseModel):
    to: EmailStr
    subject: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1)


# ── Normalization ────────────────────────────────────────────────────────────
def _clean(value: Any) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def _extract_email(business: Dict[str, Any]) -> Optional[str]:
    """First scraped email for the business, if any (and only if it looks valid)."""
    contacts = business.get(EMAILS_CONTACTS_FIELD) or {}
    emails = contacts.get(EMAILS_SUBFIELD) or []
    for e in emails:
        e = (e or "").strip()
        if EMAIL_RE.match(e):
            return e
    return None


def normalize_business(business: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Map one RapidAPI business object onto our prospect columns via FIELD_MAP.
    Returns None for an unusable record (no name)."""
    name = _clean(business.get(FIELD_MAP["name"]))
    if not name:
        return None
    try:
        rating = business.get(FIELD_MAP["rating"])
        rating = float(rating) if rating is not None else None
    except (TypeError, ValueError):
        rating = None
    try:
        review_count = business.get(FIELD_MAP["review_count"])
        review_count = int(review_count) if review_count is not None else None
    except (TypeError, ValueError):
        review_count = None
    return {
        "external_id": _clean(business.get(FIELD_MAP["external_id"])),
        "name": name,
        "phone": _clean(business.get(FIELD_MAP["phone"])),
        "email": _extract_email(business),
        "address": _clean(business.get(FIELD_MAP["address"])),
        "website": _clean(business.get(FIELD_MAP["website"])),
        "category": _clean(business.get(FIELD_MAP["category"])),
        "rating": rating,
        "review_count": review_count,
    }


# ── The one upstream call ────────────────────────────────────────────────────
async def _call_local_business_search(query: str, limit: int) -> tuple[List[Dict[str, Any]], Dict[str, Optional[int]]]:
    """Exactly ONE request to the Local Business Data Search endpoint. Returns
    (businesses, usage). Maps upstream failures onto clean HTTP errors."""
    headers = {
        "X-RapidAPI-Key": _rapidapi_key(),
        "X-RapidAPI-Host": RAPIDAPI_HOST,
    }
    params = {
        "query": query,
        "limit": str(limit),
        "extract_emails_and_contacts": "true",  # enables the compliant email channel
    }
    try:
        async with httpx.AsyncClient(timeout=RAPIDAPI_TIMEOUT_SECONDS) as http:
            resp = await http.get(RAPIDAPI_SEARCH_URL, headers=headers, params=params)
    except httpx.HTTPError as e:
        logger.warning("prospect search: upstream unreachable (%s)", e)
        raise HTTPException(status_code=502, detail=f"Couldn't reach the business-data provider: {e}")

    # Surface quota + rate-limit / server errors with actionable messages.
    if resp.status_code == 429:
        raise HTTPException(
            status_code=429,
            detail="Business-data provider rate limit hit (free tier is 500 requests/month). Try again later.",
        )
    if resp.status_code == 401 or resp.status_code == 403:
        raise HTTPException(
            status_code=502,
            detail="Business-data provider rejected the API key. Check RAPIDAPI_KEY in backend/.env.",
        )
    if resp.status_code >= 500:
        raise HTTPException(status_code=502, detail=f"Business-data provider error (HTTP {resp.status_code}).")
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Business-data provider returned HTTP {resp.status_code}: {resp.text[:200]}")

    try:
        payload = resp.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="Business-data provider returned a non-JSON response.")

    if (payload.get(RESP_STATUS_FIELD) or "").upper() not in ("OK", ""):
        # The API sometimes 200s with an error status in the body.
        raise HTTPException(status_code=502, detail=f"Business-data provider: {payload.get(RESP_STATUS_FIELD)}")

    businesses = payload.get(RESP_DATA_FIELD) or []
    if not isinstance(businesses, list):
        businesses = []

    def _hdr_int(name: str) -> Optional[int]:
        raw = resp.headers.get(name)
        try:
            return int(raw) if raw is not None else None
        except (TypeError, ValueError):
            return None

    limit_total = _hdr_int(QUOTA_LIMIT_HEADER)
    remaining = _hdr_int(QUOTA_REMAINING_HEADER)
    usage = {
        "limit": limit_total,
        "remaining": remaining,
        # We made exactly one call; "used so far" is limit - remaining when known.
        "used": (limit_total - remaining) if (limit_total is not None and remaining is not None) else 1,
    }
    return businesses, usage


# ── Endpoints ────────────────────────────────────────────────────────────────
@router.post("/search", response_model=ProspectSearchOut)
async def search_prospects(payload: ProspectSearchIn, ctx: OrgContext = Depends(require_org)):
    """Run ONE Local Business Data search, normalize + dedupe + store the results
    as prospects for the calling org, and return them with the API usage."""
    query = payload.resolved_query()
    if not query:
        raise HTTPException(status_code=400, detail="Enter a category and location (e.g. 'salons in Mumbai').")

    businesses, usage = await _call_local_business_search(query, payload.limit)
    logger.info("[prospects search org=%s] '%s' -> %d businesses (remaining=%s)",
                ctx.org_id, query, len(businesses), usage.get("remaining"))

    stored = updated = 0
    result_ids: List[str] = []
    try:
        for business in businesses:
            norm = normalize_business(business)
            if not norm:
                continue
            existing = await sb.find_prospect_by_identity(
                norm.get("external_id"), norm.get("phone"), norm.get("website"),
                org_id=ctx.org_id, token=ctx.token,
            )
            if existing:
                # Refresh discovered contact details, but PRESERVE the user's own
                # status/notes/unsubscribed so re-searching never clobbers review
                # progress. Only fill in fields, never overwrite a set status.
                fields: Dict[str, Any] = {}
                for k in ("phone", "email", "address", "website", "category", "rating", "review_count", "external_id"):
                    if norm.get(k) is not None:
                        fields[k] = norm[k]
                row = await sb.update_prospect_fields(existing["id"], fields, org_id=ctx.org_id, token=ctx.token)
                updated += 1
                result_ids.append((row or existing)["id"])
            else:
                row = await sb.insert_prospect({
                    "org_id": ctx.org_id,            # the CALLING user's org
                    "source": "prospect_search",
                    "status": "new",
                    **norm,
                }, token=ctx.token)
                stored += 1
                if row:
                    result_ids.append(row["id"])
    except sb.SupabaseNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))
    except sb.SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.message}")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[prospects search org=%s] store failed", ctx.org_id)
        raise sb_error(e)

    # Return the full stored set for this search (newest first), limited to what
    # we just touched so the UI shows exactly these results.
    try:
        all_rows = await sb.list_prospects(org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    id_set = set(result_ids)
    prospects = [ProspectOut(**r) for r in all_rows if r["id"] in id_set]

    logger.info("[prospects search org=%s] stored=%d updated=%d", ctx.org_id, stored, updated)
    return ProspectSearchOut(
        query=query,
        found=len(businesses),
        stored=stored,
        updated=updated,
        prospects=prospects,
        api_requests_used=usage.get("used"),
        api_requests_remaining=usage.get("remaining"),
        api_requests_limit=usage.get("limit"),
    )


@router.get("", response_model=List[ProspectOut])
async def list_prospects_endpoint(
    status: Optional[str] = Query(default=None),
    ctx: OrgContext = Depends(require_org),
):
    if status and status not in PROSPECT_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {PROSPECT_STATUSES}")
    try:
        rows = await sb.list_prospects(org_id=ctx.org_id, token=ctx.token, status=status)
    except Exception as e:
        raise sb_error(e)
    return [ProspectOut(**r) for r in rows]


@router.patch("/{prospect_id}", response_model=ProspectOut)
async def update_prospect(prospect_id: str, update: ProspectUpdateIn, ctx: OrgContext = Depends(require_org)):
    """Set a prospect's status and/or notes. Also the MANUAL 'mark as contacted'
    action (status='contacted') for when the user reaches out themselves."""
    fields: Dict[str, Any] = {}
    if update.status is not None:
        fields["status"] = update.status
    if update.notes is not None:
        fields["notes"] = update.notes or None
    if not fields:
        raise HTTPException(status_code=400, detail="Nothing to update — send a status and/or notes.")

    try:
        row = await sb.update_prospect_fields(prospect_id, fields, org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    if not row:
        raise HTTPException(status_code=404, detail="Prospect not found")
    return ProspectOut(**row)


@router.post("/{prospect_id}/email")
async def send_prospect_email(prospect_id: str, payload: ProspectEmailIn, ctx: OrgContext = Depends(require_org)):
    """Send a COMPLIANT cold email to a prospect. Reuses the org's Resend sender
    and ALWAYS appends the unsubscribe link (via followup.wrap_html). Only allowed
    when the prospect has a valid email and hasn't unsubscribed; respects the org's
    quiet hours. Never auto-called — this is the one outbound-message path, and the
    user triggers it per-prospect."""
    try:
        prospect = await sb.get_prospect(prospect_id, org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    if prospect.get("unsubscribed"):
        raise HTTPException(status_code=409, detail="This prospect has unsubscribed — you can't email them.")

    to = str(payload.to)
    if not EMAIL_RE.match(to):
        raise HTTPException(status_code=400, detail="A valid email address is required to send.")

    # Resolve THIS org's own Resend key + from-email (their connection, or env
    # fallback), then apply the compliant gate: configured + within quiet hours.
    cfg = await org_settings.resolve_for_org(ctx.org_id, token=ctx.token)
    creds = await followup.resolve_resend(cfg, org_id=ctx.org_id, token=ctx.token)
    if not creds.configured:
        raise HTTPException(
            status_code=409,
            detail="Email isn't configured. Connect Resend in Connections, or set RESEND_API_KEY + a from-email.",
        )
    if not cfg.within_allowed_hours():
        raise HTTPException(
            status_code=409,
            detail=f"Outside allowed sending hours ({cfg.quiet_start}–{cfg.quiet_end} {cfg.timezone}).",
        )

    # Compliant footer: the unsubscribe link points at OUR public prospect
    # opt-out endpoint (not the leads one), so the flag lands on this prospect.
    html = followup.wrap_html(payload.body, _prospect_unsubscribe_url(prospect_id))
    try:
        provider_id = await followup.send_via_resend(
            to, payload.subject, html, from_addr=creds.from_email, api_key=creds.api_key
        )
    except Exception as e:
        logger.error("[prospects email id=%s org=%s] FAILED: %s", prospect_id, ctx.org_id, e)
        await followup.log_email(
            org_id=ctx.org_id, lead_id=None, to_email=to, subject=payload.subject,
            body=payload.body, status="failed", error=str(e), step="cold",
            token=ctx.token, from_email=creds.from_email,
        )
        raise HTTPException(status_code=502, detail=f"Send failed: {e}")

    logger.info("[prospects email id=%s org=%s] SENT to %s (resend_id=%s)",
                prospect_id, ctx.org_id, to, provider_id or "?")
    await followup.log_email(
        org_id=ctx.org_id, lead_id=None, to_email=to, subject=payload.subject,
        body=payload.body, status="sent", step="cold", provider_id=provider_id,
        token=ctx.token, from_email=creds.from_email,
    )
    # Advance status new -> contacted (never downgrade a further-along status).
    if prospect.get("status") == "new":
        try:
            await sb.update_prospect_fields(prospect_id, {"status": "contacted"}, org_id=ctx.org_id, token=ctx.token)
        except Exception as e:
            logger.warning("[prospects email id=%s] status bump failed: %s", prospect_id, e)

    return {"sent": True, "provider_id": provider_id}


@router.post("/{prospect_id}/convert", response_model=Dict[str, Any])
async def convert_prospect(prospect_id: str, ctx: OrgContext = Depends(require_org)):
    """Convert a prospect into a normal LEAD (source='prospect'), after which it
    flows through the standard pipeline (auto-call sweep + follow-ups) like any
    other lead. Idempotent: a prospect already converted returns its existing lead."""
    try:
        prospect = await sb.get_prospect(prospect_id, org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")

    if prospect.get("converted_lead_id"):
        return {"converted": True, "lead_id": prospect["converted_lead_id"], "already": True}

    # The leads table requires name/phone/email/enquiry NOT NULL; synthesize
    # gentle fallbacks (empty strings satisfy NOT NULL; a lead with no phone just
    # isn't auto-call-eligible). The enquiry records where the lead came from.
    name = (prospect.get("name") or "Prospect").strip()
    phone = (prospect.get("phone") or "").strip()
    email = (prospect.get("email") or "").strip()
    email = email if EMAIL_RE.match(email) else ""
    bits = [b for b in (prospect.get("category"), prospect.get("address")) if b]
    enquiry = "Converted from prospect discovery" + (f": {' — '.join(bits)}" if bits else "")

    try:
        lead = await sb.insert_lead({
            "org_id": ctx.org_id,
            "name": name,
            "phone": phone,
            "email": email,
            "company": name,                 # business prospect: the business is the company
            "enquiry": enquiry,
            "status": "new",
            "source": "prospect",
        }, token=ctx.token)
    except sb.SupabaseNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))
    except sb.SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.message}")
    except Exception as e:
        raise sb_error(e)

    lead_id = lead.get("id") if lead else None
    # Mark the prospect converted + link it. Best-effort: the lead already exists,
    # so a link-write failure must not fail the conversion.
    try:
        await sb.update_prospect_fields(
            prospect_id, {"status": "converted", "converted_lead_id": lead_id},
            org_id=ctx.org_id, token=ctx.token,
        )
    except Exception as e:
        logger.warning("[prospects convert id=%s] link-write failed: %s", prospect_id, e)

    logger.info("[prospects convert id=%s org=%s] -> lead %s", prospect_id, ctx.org_id, lead_id)
    return {"converted": True, "lead_id": lead_id, "already": False}


# ── Public cold-email unsubscribe ────────────────────────────────────────────
def _prospect_unsubscribe_url(prospect_id: str) -> str:
    return f"{followup.public_base()}/api/prospects/unsubscribe?prospect_id={prospect_id}"


def _page(title: str, message: str) -> str:
    return f"""<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/><title>{title}</title></head>
<body style="font-family:sans-serif;background:#fafafa;color:#111;display:flex;align-items:center;
justify-content:center;height:100vh;margin:0">
  <div style="text-align:center;max-width:420px;padding:32px;background:#fff;border:1px solid #eee;border-radius:16px">
    <h1 style="font-size:20px;margin:0 0 8px">{title}</h1>
    <p style="color:#666;font-size:14px;margin:0">{message}</p>
  </div>
</body></html>"""


@router.get("/unsubscribe", response_class=HTMLResponse)
async def unsubscribe(prospect_id: str):
    """Public link included in every prospect cold email. Sets the opt-out flag so
    the prospect can never be emailed again."""
    try:
        await sb.set_prospect_unsubscribed(prospect_id)
    except sb.SupabaseNotConfigured as e:
        logger.warning("[prospects unsubscribe id=%s] failed: %s", prospect_id, e)
        return HTMLResponse(_page("Something went wrong", "Please try again later."), status_code=503)
    except Exception as e:
        logger.error("[prospects unsubscribe id=%s] failed: %s", prospect_id, e)
        return HTMLResponse(_page("Something went wrong", "Please try again later."), status_code=500)
    logger.info("[prospects unsubscribe id=%s] unsubscribed via email link", prospect_id)
    return HTMLResponse(_page("You've been unsubscribed", "You won't receive any more emails from us."))
