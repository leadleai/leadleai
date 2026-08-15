"""
Thin server-side Supabase (PostgREST) client.

TWO MODES, and the difference matters for security:

  * USER MODE  — pass `token=<the caller's Supabase JWT>`. Requests go out with
    the ANON apikey and the user's bearer token, so Postgres evaluates RLS as
    that user. Cross-org reads are impossible even if a query here forgets its
    org filter. Use this for everything on the request path.

  * SERVICE MODE — omit `token`. Requests use the SERVICE ROLE key, which
    BYPASSES RLS entirely. Only for work that has no authenticated caller:
    background jobs (auto-call, the drip sweep), the public enquiry insert, and
    the unsubscribe link. In service mode YOU must pass org_id explicitly —
    nothing else is filtering for you.

The service role key lives only in backend/.env and never reaches the browser.
"""
import contextlib
import os
import secrets
from typing import Any, Dict, List, Optional

import httpx


# ── Shared HTTP client ───────────────────────────────────────────────────────
# Every function below talks to PostgREST over HTTPS. The old code opened a fresh
# `httpx.AsyncClient(...)` for each call (~70 call sites), and each new client
# rebuilds a connection pool AND a new SSL context + CA bundle — tens of MB of
# alloc/ free churn on every request and on every background sweep pass. That
# churn is a prime suspect for the 512MB OOM (exit 137). A single pooled client,
# created lazily on first use inside the running event loop and reused
# everywhere, keeps ONE SSL context and reuses keep-alive connections, so
# steady-state memory stays flat instead of sawtoothing.
#
# `_client()` is an async context manager so the call sites keep their exact
# `async with ... as http:` shape (bodies unchanged) — but it yields the shared
# client and does NOT close it on exit. The client is torn down once, at app
# shutdown, via aclose().
_shared: Optional[httpx.AsyncClient] = None

# Default timeout for every Supabase call (the old sites used 15–20s; 20 is the
# lenient max, harmless as a shared default).
_DEFAULT_TIMEOUT = 20.0


def _shared_client() -> httpx.AsyncClient:
    global _shared
    if _shared is None or _shared.is_closed:
        _shared = httpx.AsyncClient(
            timeout=_DEFAULT_TIMEOUT,
            # Bound the pool so idle keep-alive sockets can't accumulate. The old
            # per-call clients had, in effect, unbounded concurrent pools.
            limits=httpx.Limits(max_connections=30, max_keepalive_connections=10),
        )
    return _shared


@contextlib.asynccontextmanager
async def _client():
    """Yield the shared client without closing it. Lets every call site keep its
    original `async with _client() as http:` structure."""
    yield _shared_client()


async def aclose() -> None:
    """Close the shared client. Call once from the FastAPI shutdown event."""
    global _shared
    if _shared is not None and not _shared.is_closed:
        await _shared.aclose()
    _shared = None


class SupabaseNotConfigured(RuntimeError):
    pass


class SupabaseError(RuntimeError):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def _base_url() -> str:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    if not url:
        raise SupabaseNotConfigured("Supabase is not configured. Set SUPABASE_URL in backend/.env.")
    return url


def _service_key() -> str:
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not key:
        raise SupabaseNotConfigured(
            "Supabase is not configured. Set SUPABASE_SERVICE_ROLE_KEY in backend/.env."
        )
    return key


def _anon_key() -> str:
    key = os.environ.get("SUPABASE_ANON_KEY", "")
    if not key:
        raise SupabaseNotConfigured(
            "Supabase is not configured. Set SUPABASE_ANON_KEY in backend/.env "
            "(needed to forward user tokens so RLS applies)."
        )
    return key


def _config() -> tuple[str, str]:
    return _base_url(), _service_key()


def _headers(token: Optional[str] = None, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    """User mode when `token` is given (RLS enforced), service mode otherwise."""
    if token:
        apikey, bearer = _anon_key(), token
    else:
        apikey = bearer = _service_key()
    headers = {
        "apikey": apikey,
        "Authorization": f"Bearer {bearer}",
        "Content-Type": "application/json",
    }
    if extra:
        headers.update(extra)
    return headers


def _raise_for_error(resp: httpx.Response) -> None:
    if resp.status_code >= 400:
        try:
            body = resp.json()
            msg = body.get("message") or body.get("hint") or str(body)
        except Exception:
            msg = resp.text[:300]
        raise SupabaseError(resp.status_code, msg)


def _one(data: Any) -> Optional[Dict[str, Any]]:
    return data[0] if isinstance(data, list) and data else (data or None)


# ── Leads ────────────────────────────────────────────────────────────────────
async def insert_lead(row: Dict[str, Any], *, token: Optional[str] = None) -> Dict[str, Any]:
    url = _base_url()
    async with _client() as http:
        resp = await http.post(
            f"{url}/rest/v1/leads",
            headers=_headers(token, {"Prefer": "return=representation"}),
            json=row,
        )
    _raise_for_error(resp)
    data = resp.json()
    return data[0] if isinstance(data, list) and data else data


# Leads carry their tags embedded through the lead_tag_assignments join table.
# PostgREST resolves leads -> lead_tag_assignments (via lead_id FK) -> lead_tags
# (via tag_id FK); _flatten_lead_tags() then collapses that nesting into a plain
# `tags` array so the API stays a flat, typed shape.
_LEAD_SELECT_WITH_TAGS = "*,tag_links:lead_tag_assignments(tag:lead_tags(id,name,color))"


def _flatten_lead_tags(lead: Dict[str, Any]) -> Dict[str, Any]:
    links = lead.pop("tag_links", None) or []
    tags = [ln["tag"] for ln in links if ln.get("tag")]
    tags.sort(key=lambda t: (t.get("name") or "").lower())
    lead["tags"] = tags
    return lead


async def list_leads(
    source: Optional[str] = None, *, token: Optional[str] = None, org_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    url = _base_url()
    params = {"select": _LEAD_SELECT_WITH_TAGS, "order": "created_at.desc"}
    if source:
        params["source"] = f"eq.{source}"
    if org_id:
        params["org_id"] = f"eq.{org_id}"
    async with _client() as http:
        resp = await http.get(f"{url}/rest/v1/leads", headers=_headers(token), params=params)
    _raise_for_error(resp)
    return [_flatten_lead_tags(row) for row in resp.json()]


async def list_leads_for_sweep(*, only_new_uncalled: bool = False) -> List[Dict[str, Any]]:
    """Service-mode lead fetch for the background sweeps (auto-call / follow-up).

    Two differences from list_leads(), both about keeping the per-sweep working
    set small on the 512MB box:

      * select="*" — NO lead_tags join. The sweeps never read `tags`, so the
        nested lead_tag_assignments->lead_tags embedding was pure overhead: extra
        DB work, a bigger JSON payload, and more objects held in memory while the
        pass runs. Plain columns only.

      * only_new_uncalled=True pushes the auto-call CANDIDATE filter down to
        Postgres so a growing leads table doesn't inflate the fetch: status
        'new' AND auto_called_at IS NULL. `leads.status` is NOT NULL DEFAULT
        'new' (migration 0002), so status.eq.new is exhaustive — it can never be
        NULL in the DB even though the Python guard defensively treats a missing
        key as 'new'. Keeping it a plain equality (not an OR with is.null) also
        lets the partial index leads_auto_call_candidates_idx (migration 0017)
        serve this query. Which leads get called is unchanged; already-handled
        rows just stay in the database instead of being pulled over the wire.
    """
    url = _base_url()
    params: Dict[str, str] = {"select": "*", "order": "created_at.desc"}
    if only_new_uncalled:
        params["status"] = "eq.new"
        params["auto_called_at"] = "is.null"
    async with _client() as http:
        resp = await http.get(f"{url}/rest/v1/leads", headers=_headers(), params=params)
    _raise_for_error(resp)
    return resp.json()


async def update_lead_status(
    lead_id: str, status: str, *, token: Optional[str] = None, org_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    url = _base_url()
    params = {"id": f"eq.{lead_id}"}
    if org_id:
        params["org_id"] = f"eq.{org_id}"
    async with _client() as http:
        resp = await http.patch(
            f"{url}/rest/v1/leads",
            headers=_headers(token, {"Prefer": "return=representation"}),
            params=params,
            json={"status": status},
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def get_lead(
    lead_id: str, *, token: Optional[str] = None, org_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    url = _base_url()
    params = {"id": f"eq.{lead_id}", "select": _LEAD_SELECT_WITH_TAGS, "limit": "1"}
    if org_id:
        params["org_id"] = f"eq.{org_id}"
    async with _client() as http:
        resp = await http.get(f"{url}/rest/v1/leads", headers=_headers(token), params=params)
    _raise_for_error(resp)
    row = _one(resp.json())
    return _flatten_lead_tags(row) if row else None


async def recently_auto_called(phone: str, since_iso: str, *, org_id: Optional[str] = None) -> bool:
    """True if a lead with this phone was auto-called at/after since_iso.
    Service mode (background dedupe), so the org filter is applied by hand."""
    url = _base_url()
    params = {
        "phone": f"eq.{phone}",
        "auto_called_at": f"gte.{since_iso}",
        "select": "id",
        "limit": "1",
    }
    if org_id:
        params["org_id"] = f"eq.{org_id}"
    async with _client() as http:
        resp = await http.get(f"{url}/rest/v1/leads", headers=_headers(), params=params)
    _raise_for_error(resp)
    return bool(resp.json())


async def find_lead(
    external_id: Optional[str], phone: str, *, org_id: str, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Find an existing lead by external_id (if given) OR phone — for CRM dedupe.
    Always org-scoped: two orgs may legitimately hold the same phone number."""
    url = _base_url()
    if external_id:
        params = {"or": f"(external_id.eq.{external_id},phone.eq.{phone})"}
    else:
        params = {"phone": f"eq.{phone}"}
    params.update({"org_id": f"eq.{org_id}", "select": "id,status", "limit": "1"})
    async with _client() as http:
        resp = await http.get(f"{url}/rest/v1/leads", headers=_headers(token), params=params)
    _raise_for_error(resp)
    return _one(resp.json())


async def find_lead_by_contact(
    phone: Optional[str], email: Optional[str], *, org_id: str, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Find an existing lead in THIS org by phone OR email — for file-import dedupe.
    Always org-scoped: two tenants may legitimately hold the same contact. At least
    one of phone/email must be a non-empty value, else there is nothing to match on
    and we return None (the caller treats it as 'no duplicate')."""
    phone = (phone or "").strip()
    email = (email or "").strip()
    clauses = []
    if phone:
        clauses.append(f"phone.eq.{phone}")
    if email:
        clauses.append(f"email.eq.{email}")
    if not clauses:
        return None

    url = _base_url()
    if len(clauses) == 1:
        field, value = clauses[0].split(".eq.", 1)
        params = {field: f"eq.{value}"}
    else:
        params = {"or": f"({','.join(clauses)})"}
    params.update({"org_id": f"eq.{org_id}", "select": "id,status", "limit": "1"})
    async with _client() as http:
        resp = await http.get(f"{url}/rest/v1/leads", headers=_headers(token), params=params)
    _raise_for_error(resp)
    return _one(resp.json())


async def update_lead_fields(
    lead_id: str, fields: Dict[str, Any], *, org_id: Optional[str] = None, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    url = _base_url()
    params = {"id": f"eq.{lead_id}"}
    if org_id:
        params["org_id"] = f"eq.{org_id}"
    async with _client() as http:
        resp = await http.patch(
            f"{url}/rest/v1/leads",
            headers=_headers(token, {"Prefer": "return=representation"}),
            params=params,
            json=fields,
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def claim_auto_call(
    lead_id: str, now_iso: str, *, org_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Atomically claim a lead for auto-calling BEFORE dialing.

    Conditional on auto_called_at still being NULL, so two overlapping sweeps (or
    a Scheduler double-fire) can never place the same call twice — the loser's
    conditional update matches no row. Returns the row if we won the claim, else
    None. On a Bland failure the caller releases the claim (see release_auto_call)
    so a later sweep can retry. Service mode: the sweep has no user session."""
    url = _base_url()
    params = {"id": f"eq.{lead_id}", "auto_called_at": "is.null"}
    if org_id:
        params["org_id"] = f"eq.{org_id}"
    async with _client() as http:
        resp = await http.patch(
            f"{url}/rest/v1/leads",
            headers=_headers(None, {"Prefer": "return=representation"}),
            params=params,
            json={"auto_called_at": now_iso},
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def release_auto_call(lead_id: str, *, org_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Undo a claim after a failed dial so the lead is eligible again next sweep."""
    url = _base_url()
    params = {"id": f"eq.{lead_id}"}
    if org_id:
        params["org_id"] = f"eq.{org_id}"
    async with _client() as http:
        resp = await http.patch(
            f"{url}/rest/v1/leads",
            headers=_headers(None, {"Prefer": "return=representation"}),
            params=params,
            json={"auto_called_at": None},
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def mark_auto_called(lead_id: str, call_id: str, called_at_iso: str) -> Optional[Dict[str, Any]]:
    """Record a successful auto-call. Service mode: runs in a background task."""
    url = _base_url()
    async with _client() as http:
        resp = await http.patch(
            f"{url}/rest/v1/leads",
            headers=_headers(None, {"Prefer": "return=representation"}),
            params={"id": f"eq.{lead_id}"},
            json={"auto_called_at": called_at_iso, "call_id": call_id, "status": "contacted"},
        )
    _raise_for_error(resp)
    return _one(resp.json())


# ── Email log + templates ────────────────────────────────────────────────────
async def insert_email_log(row: Dict[str, Any], *, token: Optional[str] = None) -> Optional[Dict[str, Any]]:
    url = _base_url()
    async with _client() as http:
        resp = await http.post(
            f"{url}/rest/v1/email_log",
            headers=_headers(token, {"Prefer": "return=representation"}),
            json=row,
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def list_email_logs(
    limit: int = 200, *, token: Optional[str] = None, org_id: Optional[str] = None,
    lead_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    url = _base_url()
    params = {"select": "*", "order": "created_at.desc", "limit": str(limit)}
    if org_id:
        params["org_id"] = f"eq.{org_id}"
    if lead_id:
        params["lead_id"] = f"eq.{lead_id}"
    async with _client() as http:
        resp = await http.get(f"{url}/rest/v1/email_log", headers=_headers(token), params=params)
    _raise_for_error(resp)
    return resp.json()


async def rows_since(
    table: str, start_iso: str, *, select: str = "created_at,status",
    order: str = "created_at.asc", org_id: Optional[str] = None,
    token: Optional[str] = None, limit: int = 20000,
) -> List[Dict[str, Any]]:
    """Fetch only the rows a table has since `start_iso`, and only the columns
    `select` — used by the analytics aggregates so we never pull the whole table.
    User mode (token) so RLS scopes it; the explicit org_id narrows to the active
    org (a user may belong to several). `select` may include a PostgREST embed,
    e.g. "id,created_at,status,lead:leads(name)"."""
    url = _base_url()
    params = {
        "select": select,
        "created_at": f"gte.{start_iso}",
        "order": order,
        "limit": str(limit),
    }
    if org_id:
        params["org_id"] = f"eq.{org_id}"
    async with _client() as http:
        resp = await http.get(f"{url}/rest/v1/{table}", headers=_headers(token), params=params)
    _raise_for_error(resp)
    return resp.json()


async def list_email_templates(
    *, token: Optional[str] = None, org_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    url = _base_url()
    params = {"select": "*", "order": "step.asc"}
    if org_id:
        params["org_id"] = f"eq.{org_id}"
    async with _client() as http:
        resp = await http.get(f"{url}/rest/v1/email_templates", headers=_headers(token), params=params)
    _raise_for_error(resp)
    return resp.json()


async def upsert_email_template(
    step: int, subject: str, body: str, *, org_id: str, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Insert-or-update this org's template for a step (PK = org_id, step)."""
    url = _base_url()
    async with _client() as http:
        resp = await http.post(
            f"{url}/rest/v1/email_templates",
            headers=_headers(token, {"Prefer": "resolution=merge-duplicates,return=representation"}),
            params={"on_conflict": "org_id,step"},
            json={
                "org_id": org_id,
                "step": step,
                "subject": subject,
                "body": body,
                "updated_at": _utcnow_iso(),
            },
        )
    _raise_for_error(resp)
    return _one(resp.json())


def _utcnow_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def _iso_in_days(days: int) -> str:
    from datetime import datetime, timedelta, timezone
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


# ── Knowledge base (per-org, private; grounds the AI follow-up writer) ────────
async def list_knowledge(
    *, org_id: Optional[str] = None, token: Optional[str] = None
) -> List[Dict[str, Any]]:
    """This org's KB entries, newest-edited first. User mode (RLS) on the request
    path; service mode (explicit org_id) for the background follow-up sweep."""
    url = _base_url()
    params = {"select": "*", "order": "updated_at.desc"}
    if org_id:
        params["org_id"] = f"eq.{org_id}"
    async with _client() as http:
        resp = await http.get(f"{url}/rest/v1/knowledge_base", headers=_headers(token), params=params)
    _raise_for_error(resp)
    return resp.json()


async def insert_knowledge(row: Dict[str, Any], *, token: Optional[str] = None) -> Optional[Dict[str, Any]]:
    url = _base_url()
    async with _client() as http:
        resp = await http.post(
            f"{url}/rest/v1/knowledge_base",
            headers=_headers(token, {"Prefer": "return=representation"}),
            json=row,
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def update_knowledge(
    entry_id: str, fields: Dict[str, Any], *, org_id: Optional[str] = None, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    url = _base_url()
    params = {"id": f"eq.{entry_id}"}
    if org_id:
        params["org_id"] = f"eq.{org_id}"
    async with _client() as http:
        resp = await http.patch(
            f"{url}/rest/v1/knowledge_base",
            headers=_headers(token, {"Prefer": "return=representation"}),
            params=params,
            json=fields,
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def delete_knowledge(
    entry_id: str, *, org_id: Optional[str] = None, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    url = _base_url()
    params = {"id": f"eq.{entry_id}"}
    if org_id:
        params["org_id"] = f"eq.{org_id}"
    async with _client() as http:
        resp = await http.delete(
            f"{url}/rest/v1/knowledge_base",
            headers=_headers(token, {"Prefer": "return=representation"}),
            params=params,
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def get_knowledge_content(
    *, org_id: Optional[str] = None, token: Optional[str] = None
) -> str:
    """Flatten this org's KB entries into one plain-text block for the AI prompt.
    Returns '' when the org has no usable content (caller falls back to templates)."""
    rows = await list_knowledge(org_id=org_id, token=token)
    parts: List[str] = []
    for row in rows or []:
        title = (row.get("title") or "").strip()
        content = (row.get("content") or "").strip()
        if not content:
            continue
        parts.append(f"## {title}\n{content}" if title else content)
    return "\n\n".join(parts)


# ── Call log ─────────────────────────────────────────────────────────────────
async def insert_call_log(row: Dict[str, Any], *, token: Optional[str] = None) -> Optional[Dict[str, Any]]:
    url = _base_url()
    async with _client() as http:
        resp = await http.post(
            f"{url}/rest/v1/call_log",
            headers=_headers(token, {"Prefer": "return=representation"}),
            json=row,
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def list_call_logs(
    limit: int = 200, *, token: Optional[str] = None, org_id: Optional[str] = None,
    lead_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Newest first, with the lead's name/company embedded via the lead_id FK."""
    url = _base_url()
    params = {
        "select": "*,lead:leads(name,company)",
        "order": "created_at.desc",
        "limit": str(limit),
    }
    if org_id:
        params["org_id"] = f"eq.{org_id}"
    if lead_id:
        params["lead_id"] = f"eq.{lead_id}"
    async with _client() as http:
        resp = await http.get(f"{url}/rest/v1/call_log", headers=_headers(token), params=params)
    _raise_for_error(resp)
    rows = resp.json()
    # Flatten the embedded lead so the API stays a flat, typed shape.
    for row in rows:
        lead = row.pop("lead", None) or {}
        row["lead_name"] = lead.get("name")
        row["lead_company"] = lead.get("company")
    return rows


# ── Lead status-change history (drives the activity timeline) ────────────────
async def insert_status_history(
    row: Dict[str, Any], *, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Append one status-transition row. User mode on the request path so the
    org_isolation RLS policy authorises the write."""
    url = _base_url()
    async with _client() as http:
        resp = await http.post(
            f"{url}/rest/v1/lead_status_history",
            headers=_headers(token, {"Prefer": "return=representation"}),
            json=row,
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def list_status_history(
    lead_id: str, *, token: Optional[str] = None, org_id: Optional[str] = None,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    """This lead's status transitions, newest first."""
    url = _base_url()
    params = {
        "lead_id": f"eq.{lead_id}",
        "select": "*",
        "order": "created_at.desc",
        "limit": str(limit),
    }
    if org_id:
        params["org_id"] = f"eq.{org_id}"
    async with _client() as http:
        resp = await http.get(
            f"{url}/rest/v1/lead_status_history", headers=_headers(token), params=params
        )
    _raise_for_error(resp)
    return resp.json()


# ── Follow-up drip helpers ───────────────────────────────────────────────────
async def claim_followup_step(
    lead_id: str, expected_step: int, now_iso: str, *, org_id: Optional[str] = None,
    token: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Atomically claim the next follow-up step BEFORE sending.

    The update is conditional on followup_step still being `expected_step`, so a
    concurrent sweep / restart can never send the same step twice. Returns the
    updated row if we won the claim, or None if someone else already took it.
    """
    url = _base_url()
    params = {"id": f"eq.{lead_id}", "followup_step": f"eq.{expected_step}"}
    if org_id:
        params["org_id"] = f"eq.{org_id}"
    async with _client() as http:
        resp = await http.patch(
            f"{url}/rest/v1/leads",
            headers=_headers(token, {"Prefer": "return=representation"}),
            params=params,
            json={"followup_step": expected_step + 1, "last_followup_at": now_iso},
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def set_followup_unsubscribed(lead_id: str) -> Optional[Dict[str, Any]]:
    """Public unsubscribe link — no session, so service mode. Safe because the
    lead id is an unguessable uuid and this only ever sets an opt-out flag."""
    url = _base_url()
    async with _client() as http:
        resp = await http.patch(
            f"{url}/rest/v1/leads",
            headers=_headers(None, {"Prefer": "return=representation"}),
            params={"id": f"eq.{lead_id}"},
            json={"followup_unsubscribed": True},
        )
    _raise_for_error(resp)
    return _one(resp.json())


# ── Per-org automation settings (org_settings) ───────────────────────────────
async def get_org_settings(
    org_id: str, *, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """This org's settings row, or None if it has none yet. User mode (RLS) on the
    request path; service mode (explicit org_id) for the background sweeps."""
    url = _base_url()
    async with _client() as http:
        resp = await http.get(
            f"{url}/rest/v1/org_settings",
            headers=_headers(token),
            params={"org_id": f"eq.{org_id}", "select": "*", "limit": "1"},
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def list_all_org_settings() -> List[Dict[str, Any]]:
    """EVERY org's settings row. Service mode (no user session): the sweeps call
    this once per pass to resolve settings per-org LIVE, so a dashboard edit is
    reflected on the very next sweep without any caching or restart."""
    url = _base_url()
    async with _client() as http:
        resp = await http.get(
            f"{url}/rest/v1/org_settings",
            headers=_headers(),
            params={"select": "*", "limit": "100000"},
        )
    _raise_for_error(resp)
    return resp.json()


async def upsert_org_settings(
    org_id: str, fields: Dict[str, Any], *, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Insert-or-update this org's single settings row (unique on org_id).

    User mode on the request path so the org_isolation RLS policy is what actually
    authorises the write — a caller can only ever touch their own org's row. Unset
    columns keep their table defaults on insert and their stored values on update."""
    url = _base_url()
    body = {"org_id": org_id, **fields, "updated_at": _utcnow_iso()}
    async with _client() as http:
        resp = await http.post(
            f"{url}/rest/v1/org_settings",
            headers=_headers(token, {"Prefer": "resolution=merge-duplicates,return=representation"}),
            params={"on_conflict": "org_id"},
            json=body,
        )
    _raise_for_error(resp)
    return _one(resp.json())


# ── Organizations / memberships / invites ────────────────────────────────────
async def list_memberships(*, token: str) -> List[Dict[str, Any]]:
    """The caller's orgs. User mode: RLS guarantees only their own rows come back."""
    url = _base_url()
    async with _client() as http:
        resp = await http.get(
            f"{url}/rest/v1/memberships",
            headers=_headers(token),
            params={"select": "id,org_id,role,created_at,organization:organizations(id,name,slug)",
                    "order": "created_at.asc"},
        )
    _raise_for_error(resp)
    return resp.json()


async def get_org_by_slug(slug: str) -> Optional[Dict[str, Any]]:
    """Resolve a public enquiry-form slug to an org. Service mode by necessity:
    the submitter is anonymous. Returns only non-secret columns."""
    url = _base_url()
    async with _client() as http:
        resp = await http.get(
            f"{url}/rest/v1/organizations",
            headers=_headers(),
            params={"slug": f"eq.{slug}", "select": "id,name,slug", "limit": "1"},
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def list_org_members(org_id: str, *, token: str) -> List[Dict[str, Any]]:
    url = _base_url()
    async with _client() as http:
        resp = await http.get(
            f"{url}/rest/v1/memberships",
            headers=_headers(token),
            params={"org_id": f"eq.{org_id}", "select": "id,user_id,role,created_at",
                    "order": "created_at.asc"},
        )
    _raise_for_error(resp)
    return resp.json()


async def list_invites(org_id: str, *, token: str) -> List[Dict[str, Any]]:
    """This org's still-pending invites, newest first. User mode (RLS)."""
    url = _base_url()
    async with _client() as http:
        resp = await http.get(
            f"{url}/rest/v1/invites",
            headers=_headers(token),
            params={"org_id": f"eq.{org_id}", "status": "eq.pending",
                    "select": "id,email,role,token,status,created_at,expires_at",
                    "order": "created_at.desc"},
        )
    _raise_for_error(resp)
    return resp.json()


async def create_invite(
    org_id: str, email: str, role: str, invited_by: str, *, token: str
) -> Optional[Dict[str, Any]]:
    """Create (or re-open) a pending invite for an email.

    User mode on purpose: the `invite_owner_write` policy rejects this unless the
    caller is actually an owner of org_id. The DB is the authority, not us.

    Upsert on (org_id, email): re-inviting someone whose invite was accepted or
    expired flips it back to pending, mints a fresh token, and pushes the expiry
    out again — so one row per (org, email) is reused rather than duplicated.
    A brand-new row gets its token + expiry from the column defaults."""
    url = _base_url()
    row = {
        "org_id": org_id,
        "email": email,
        "role": role,
        "invited_by": invited_by,
        "status": "pending",
        "accepted_at": None,
        # Re-issue a token + expiry on re-invite. gen_random_bytes lives in the
        # DB, so we mirror its shape here for the update-path of the upsert.
        "token": secrets.token_hex(24),
        "expires_at": _iso_in_days(7),
    }
    async with _client() as http:
        resp = await http.post(
            f"{url}/rest/v1/invites",
            headers=_headers(token, {"Prefer": "resolution=merge-duplicates,return=representation"}),
            params={"on_conflict": "org_id,email"},
            json=row,
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def get_invite_by_token(invite_token: str) -> Optional[Dict[str, Any]]:
    """Look up an invite by its shareable token. Service mode by necessity: the
    person accepting is NOT yet a member of the org, so RLS would hide the row
    from their own JWT. The token is an unguessable secret that stands in for
    that authorisation; the caller still verifies email + status + expiry."""
    url = _base_url()
    async with _client() as http:
        resp = await http.get(
            f"{url}/rest/v1/invites",
            headers=_headers(),
            params={"token": f"eq.{invite_token}",
                    "select": "id,org_id,email,role,status,expires_at,"
                              "organization:organizations(id,name,slug)",
                    "limit": "1"},
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def is_org_member(org_id: str, user_id: str) -> bool:
    """Whether a user already belongs to an org. Service mode: used by the invite
    accept to stay idempotent when the signup trigger already joined them."""
    url = _base_url()
    async with _client() as http:
        resp = await http.get(
            f"{url}/rest/v1/memberships",
            headers=_headers(),
            params={"org_id": f"eq.{org_id}", "user_id": f"eq.{user_id}",
                    "select": "id", "limit": "1"},
        )
    _raise_for_error(resp)
    return bool(resp.json())


async def mark_invite_accepted(invite_id: str) -> Optional[Dict[str, Any]]:
    """Flag an invite accepted after a successful token redemption. Service mode:
    paired with get_invite_by_token / add_membership_service in the accept flow."""
    url = _base_url()
    async with _client() as http:
        resp = await http.patch(
            f"{url}/rest/v1/invites",
            headers=_headers(None, {"Prefer": "return=representation"}),
            params={"id": f"eq.{invite_id}"},
            json={"status": "accepted", "accepted_at": _utcnow_iso()},
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def delete_invite(invite_id: str, org_id: str, *, token: str) -> None:
    """Revoke (hard-delete) a pending invite. org_id is scoped in the params too
    so a stray id can't reach outside the caller's org even before RLS."""
    url = _base_url()
    async with _client() as http:
        resp = await http.delete(
            f"{url}/rest/v1/invites", headers=_headers(token),
            params={"id": f"eq.{invite_id}", "org_id": f"eq.{org_id}"},
        )
    _raise_for_error(resp)


async def add_membership(org_id: str, user_id: str, role: str, *, token: str) -> Optional[Dict[str, Any]]:
    """Add an EXISTING user to an org. RLS enforces owner-only."""
    url = _base_url()
    async with _client() as http:
        resp = await http.post(
            f"{url}/rest/v1/memberships",
            headers=_headers(token, {"Prefer": "resolution=merge-duplicates,return=representation"}),
            params={"on_conflict": "org_id,user_id"},
            json={"org_id": org_id, "user_id": user_id, "role": role},
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def add_membership_service(org_id: str, user_id: str, role: str) -> Optional[Dict[str, Any]]:
    """Add a user to an org WITHOUT an owner session. Service mode: used by the
    token-based invite accept, where the person joining is not yet a member and
    so has no RLS authorisation to insert their own membership. Authorisation
    comes from having redeemed a valid invite token, checked by the caller."""
    url = _base_url()
    async with _client() as http:
        resp = await http.post(
            f"{url}/rest/v1/memberships",
            headers=_headers(None, {"Prefer": "resolution=merge-duplicates,return=representation"}),
            params={"on_conflict": "org_id,user_id"},
            json={"org_id": org_id, "user_id": user_id, "role": role},
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def update_member_role(
    org_id: str, user_id: str, role: str, *, token: str
) -> Optional[Dict[str, Any]]:
    """Change a member's role. User mode: `membership_owner_write` authorises it
    only for owners. The last-owner trigger (migration 0016) rejects demoting the
    sole owner at the database level regardless of what we do here."""
    url = _base_url()
    async with _client() as http:
        resp = await http.patch(
            f"{url}/rest/v1/memberships",
            headers=_headers(token, {"Prefer": "return=representation"}),
            params={"org_id": f"eq.{org_id}", "user_id": f"eq.{user_id}"},
            json={"role": role},
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def remove_membership(org_id: str, user_id: str, *, token: str) -> None:
    """Remove a member from an org by (org_id, user_id). User mode: owner-only via
    RLS; the last-owner trigger blocks removing the sole owner at the DB level."""
    url = _base_url()
    async with _client() as http:
        resp = await http.delete(
            f"{url}/rest/v1/memberships", headers=_headers(token),
            params={"org_id": f"eq.{org_id}", "user_id": f"eq.{user_id}"},
        )
    _raise_for_error(resp)


# ── Auth admin (service mode; used only to resolve ids -> emails) ────────────
async def admin_get_user(user_id: str) -> Optional[Dict[str, Any]]:
    """Look up one auth user. auth.users isn't reachable through PostgREST, so
    the Team view resolves member emails here — AFTER the caller's membership in
    the org has been verified."""
    url = _base_url()
    async with _client() as http:
        resp = await http.get(f"{url}/auth/v1/admin/users/{user_id}", headers=_headers())
    if resp.status_code == 404:
        return None
    _raise_for_error(resp)
    return resp.json()


async def admin_find_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Find an existing auth user by email (invite flow: add them straight away
    instead of leaving a pending invite)."""
    url = _base_url()
    async with _client() as http:
        resp = await http.get(
            f"{url}/auth/v1/admin/users",
            headers=_headers(),
            params={"page": "1", "per_page": "200"},
        )
    _raise_for_error(resp)
    payload = resp.json()
    users = payload.get("users", payload if isinstance(payload, list) else [])
    target = (email or "").strip().lower()
    for user in users:
        if (user.get("email") or "").strip().lower() == target:
            return user
    return None


# ── Integration tokens (per-org, replaces the old MongoDB collection) ────────
async def list_integration_tokens(org_id: str, *, token: Optional[str] = None) -> List[Dict[str, Any]]:
    url = _base_url()
    async with _client() as http:
        resp = await http.get(
            f"{url}/rest/v1/integration_tokens",
            headers=_headers(token),
            params={"org_id": f"eq.{org_id}",
                    "select": "id,platform,scope,connected_at,expires_at",
                    "order": "connected_at.desc"},
        )
    _raise_for_error(resp)
    return resp.json()


async def get_integration_token(org_id: str, platform: str) -> Optional[Dict[str, Any]]:
    """Full row INCLUDING the encrypted token columns. Service mode — used by the
    OAuth callback and by adapters acting on the org's behalf."""
    url = _base_url()
    async with _client() as http:
        resp = await http.get(
            f"{url}/rest/v1/integration_tokens",
            headers=_headers(),
            params={"org_id": f"eq.{org_id}", "platform": f"eq.{platform}",
                    "select": "*", "limit": "1"},
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def upsert_integration_token(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Called from the OAuth callback, which has no user session (the provider
    redirected the browser), so service mode with an explicit org_id."""
    url = _base_url()
    async with _client() as http:
        resp = await http.post(
            f"{url}/rest/v1/integration_tokens",
            headers=_headers(None, {"Prefer": "resolution=merge-duplicates,return=representation"}),
            params={"on_conflict": "org_id,platform"},
            json=row,
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def delete_integration_token(org_id: str, platform: str, *, token: Optional[str] = None) -> None:
    url = _base_url()
    async with _client() as http:
        resp = await http.delete(
            f"{url}/rest/v1/integration_tokens",
            headers=_headers(token),
            params={"org_id": f"eq.{org_id}", "platform": f"eq.{platform}"},
        )
    _raise_for_error(resp)


# ── Per-org provider connections (Bland / Resend API keys, encrypted) ─────────
# Distinct from integration_tokens (OAuth). encrypted_credentials is Fernet
# ciphertext produced by the backend; the raw key never reaches this layer as
# plaintext beyond the moment of encryption in connections.py.
async def list_connections(org_id: str, *, token: Optional[str] = None) -> List[Dict[str, Any]]:
    """Non-secret columns only — never selects encrypted_credentials, so a masked
    view is all the request path can ever build. User mode (RLS) on the request path."""
    url = _base_url()
    async with _client() as http:
        resp = await http.get(
            f"{url}/rest/v1/connections",
            headers=_headers(token),
            params={"org_id": f"eq.{org_id}",
                    "select": "service,key_hint,from_email,is_active,created_at,updated_at",
                    "order": "service.asc"},
        )
    _raise_for_error(resp)
    return resp.json()


async def get_connection(
    org_id: str, service: str, *, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Full row INCLUDING encrypted_credentials. Used server-side only — by the
    call/email paths resolving an org's own key. Service mode (explicit org_id) for
    the background sweeps; user mode when a token is passed on the request path."""
    url = _base_url()
    async with _client() as http:
        resp = await http.get(
            f"{url}/rest/v1/connections",
            headers=_headers(token),
            params={"org_id": f"eq.{org_id}", "service": f"eq.{service}",
                    "select": "*", "limit": "1"},
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def upsert_connection(row: Dict[str, Any], *, token: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Insert-or-update one org's connection for a service (unique on org_id,service).
    User mode on the request path so the org_isolation RLS policy authorises it."""
    url = _base_url()
    async with _client() as http:
        resp = await http.post(
            f"{url}/rest/v1/connections",
            headers=_headers(token, {"Prefer": "resolution=merge-duplicates,return=representation"}),
            params={"on_conflict": "org_id,service"},
            json={**row, "updated_at": _utcnow_iso()},
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def delete_connection(org_id: str, service: str, *, token: Optional[str] = None) -> None:
    url = _base_url()
    async with _client() as http:
        resp = await http.delete(
            f"{url}/rest/v1/connections",
            headers=_headers(token),
            params={"org_id": f"eq.{org_id}", "service": f"eq.{service}"},
        )
    _raise_for_error(resp)


# ── Lead tags (per-org library + many-to-many assignments) ────────────────────
# All USER mode on the request path: RLS (org_isolation) is what actually scopes
# every read and write to the caller's org.
async def list_tags(*, org_id: str, token: Optional[str] = None) -> List[Dict[str, Any]]:
    url = _base_url()
    async with _client() as http:
        resp = await http.get(
            f"{url}/rest/v1/lead_tags",
            headers=_headers(token),
            params={"org_id": f"eq.{org_id}", "select": "id,org_id,name,color,created_at",
                    "order": "name.asc"},
        )
    _raise_for_error(resp)
    return resp.json()


async def insert_tag(row: Dict[str, Any], *, token: Optional[str] = None) -> Optional[Dict[str, Any]]:
    url = _base_url()
    async with _client() as http:
        resp = await http.post(
            f"{url}/rest/v1/lead_tags",
            headers=_headers(token, {"Prefer": "return=representation"}),
            json=row,
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def delete_tag(tag_id: str, *, org_id: str, token: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Delete a tag from the library. Its assignments cascade away (FK on delete)."""
    url = _base_url()
    async with _client() as http:
        resp = await http.delete(
            f"{url}/rest/v1/lead_tags",
            headers=_headers(token, {"Prefer": "return=representation"}),
            params={"id": f"eq.{tag_id}", "org_id": f"eq.{org_id}"},
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def get_tag(tag_id: str, *, org_id: str, token: Optional[str] = None) -> Optional[Dict[str, Any]]:
    url = _base_url()
    async with _client() as http:
        resp = await http.get(
            f"{url}/rest/v1/lead_tags",
            headers=_headers(token),
            params={"id": f"eq.{tag_id}", "org_id": f"eq.{org_id}", "select": "*", "limit": "1"},
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def assign_tag(
    lead_id: str, tag_id: str, org_id: str, *, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Attach a tag to a lead. Idempotent: re-assigning the same tag is a no-op
    (merge-duplicates on the (lead_id, tag_id) primary key)."""
    url = _base_url()
    async with _client() as http:
        resp = await http.post(
            f"{url}/rest/v1/lead_tag_assignments",
            headers=_headers(token, {"Prefer": "resolution=merge-duplicates,return=representation"}),
            params={"on_conflict": "lead_id,tag_id"},
            json={"lead_id": lead_id, "tag_id": tag_id, "org_id": org_id},
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def unassign_tag(
    lead_id: str, tag_id: str, *, org_id: str, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    url = _base_url()
    async with _client() as http:
        resp = await http.delete(
            f"{url}/rest/v1/lead_tag_assignments",
            headers=_headers(token, {"Prefer": "return=representation"}),
            params={"lead_id": f"eq.{lead_id}", "tag_id": f"eq.{tag_id}", "org_id": f"eq.{org_id}"},
        )
    _raise_for_error(resp)
    return _one(resp.json())


# ── Lead notes ────────────────────────────────────────────────────────────────
async def list_lead_notes(
    lead_id: str, *, org_id: Optional[str] = None, token: Optional[str] = None, limit: int = 500
) -> List[Dict[str, Any]]:
    """A lead's notes, newest first."""
    url = _base_url()
    params = {
        "lead_id": f"eq.{lead_id}",
        "select": "id,org_id,lead_id,author_user_id,body,created_at",
        "order": "created_at.desc",
        "limit": str(limit),
    }
    if org_id:
        params["org_id"] = f"eq.{org_id}"
    async with _client() as http:
        resp = await http.get(f"{url}/rest/v1/lead_notes", headers=_headers(token), params=params)
    _raise_for_error(resp)
    return resp.json()


async def insert_lead_note(row: Dict[str, Any], *, token: Optional[str] = None) -> Optional[Dict[str, Any]]:
    url = _base_url()
    async with _client() as http:
        resp = await http.post(
            f"{url}/rest/v1/lead_notes",
            headers=_headers(token, {"Prefer": "return=representation"}),
            json=row,
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def delete_lead_note(
    note_id: str, *, org_id: str, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    url = _base_url()
    async with _client() as http:
        resp = await http.delete(
            f"{url}/rest/v1/lead_notes",
            headers=_headers(token, {"Prefer": "return=representation"}),
            params={"id": f"eq.{note_id}", "org_id": f"eq.{org_id}"},
        )
    _raise_for_error(resp)
    return _one(resp.json())


# ── Custom field definitions (per-org schema) ─────────────────────────────────
async def list_custom_field_defs(
    *, org_id: str, token: Optional[str] = None
) -> List[Dict[str, Any]]:
    url = _base_url()
    async with _client() as http:
        resp = await http.get(
            f"{url}/rest/v1/custom_field_defs",
            headers=_headers(token),
            params={"org_id": f"eq.{org_id}",
                    "select": "id,org_id,field_key,label,field_type,options,created_at",
                    "order": "created_at.asc"},
        )
    _raise_for_error(resp)
    return resp.json()


async def insert_custom_field_def(
    row: Dict[str, Any], *, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    url = _base_url()
    async with _client() as http:
        resp = await http.post(
            f"{url}/rest/v1/custom_field_defs",
            headers=_headers(token, {"Prefer": "return=representation"}),
            json=row,
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def update_custom_field_def(
    def_id: str, fields: Dict[str, Any], *, org_id: str, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    url = _base_url()
    async with _client() as http:
        resp = await http.patch(
            f"{url}/rest/v1/custom_field_defs",
            headers=_headers(token, {"Prefer": "return=representation"}),
            params={"id": f"eq.{def_id}", "org_id": f"eq.{org_id}"},
            json=fields,
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def delete_custom_field_def(
    def_id: str, *, org_id: str, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Delete a field definition. Its stored values cascade away (FK on delete)."""
    url = _base_url()
    async with _client() as http:
        resp = await http.delete(
            f"{url}/rest/v1/custom_field_defs",
            headers=_headers(token, {"Prefer": "return=representation"}),
            params={"id": f"eq.{def_id}", "org_id": f"eq.{org_id}"},
        )
    _raise_for_error(resp)
    return _one(resp.json())


# ── Lead custom field values ──────────────────────────────────────────────────
async def list_lead_custom_values(
    lead_id: str, *, org_id: Optional[str] = None, token: Optional[str] = None
) -> List[Dict[str, Any]]:
    url = _base_url()
    params = {
        "lead_id": f"eq.{lead_id}",
        "select": "lead_id,field_def_id,org_id,value,updated_at",
    }
    if org_id:
        params["org_id"] = f"eq.{org_id}"
    async with _client() as http:
        resp = await http.get(
            f"{url}/rest/v1/lead_custom_values", headers=_headers(token), params=params
        )
    _raise_for_error(resp)
    return resp.json()


async def upsert_lead_custom_value(
    lead_id: str, field_def_id: str, value: str, org_id: str, *, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Insert-or-update one lead's value for one field (PK = lead_id, field_def_id)."""
    url = _base_url()
    async with _client() as http:
        resp = await http.post(
            f"{url}/rest/v1/lead_custom_values",
            headers=_headers(token, {"Prefer": "resolution=merge-duplicates,return=representation"}),
            params={"on_conflict": "lead_id,field_def_id"},
            json={"lead_id": lead_id, "field_def_id": field_def_id, "org_id": org_id, "value": value},
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def delete_lead_custom_value(
    lead_id: str, field_def_id: str, *, org_id: str, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Clear a lead's value for one field (used when the value is set to blank)."""
    url = _base_url()
    async with _client() as http:
        resp = await http.delete(
            f"{url}/rest/v1/lead_custom_values",
            headers=_headers(token, {"Prefer": "return=representation"}),
            params={"lead_id": f"eq.{lead_id}", "field_def_id": f"eq.{field_def_id}",
                    "org_id": f"eq.{org_id}"},
        )
    _raise_for_error(resp)
    return _one(resp.json())


# ── Agents (AI calling agents) ───────────────────────────────────────────────
# User mode (RLS) on the request path; service mode (explicit org_id) for the
# background auto-caller, which resolves the org's default agent with no session.
async def list_agents(*, org_id: str, token: Optional[str] = None) -> List[Dict[str, Any]]:
    url = _base_url()
    async with _client() as http:
        resp = await http.get(
            f"{url}/rest/v1/agents",
            headers=_headers(token),
            # Default first, then newest — a stable order for the list UI.
            params={"org_id": f"eq.{org_id}", "select": "*",
                    "order": "is_default.desc,created_at.desc"},
        )
    _raise_for_error(resp)
    return resp.json()


async def get_agent(
    agent_id: str, *, org_id: str, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    url = _base_url()
    async with _client() as http:
        resp = await http.get(
            f"{url}/rest/v1/agents",
            headers=_headers(token),
            params={"id": f"eq.{agent_id}", "org_id": f"eq.{org_id}",
                    "select": "*", "limit": "1"},
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def get_default_agent(
    *, org_id: str, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """The org's active default agent (auto-call uses this). Deterministic even if
    two rows are somehow flagged default: newest edit wins."""
    url = _base_url()
    async with _client() as http:
        resp = await http.get(
            f"{url}/rest/v1/agents",
            headers=_headers(token),
            params={"org_id": f"eq.{org_id}", "is_default": "eq.true",
                    "is_active": "eq.true", "select": "*",
                    "order": "updated_at.desc", "limit": "1"},
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def insert_agent(row: Dict[str, Any], *, token: Optional[str] = None) -> Optional[Dict[str, Any]]:
    url = _base_url()
    async with _client() as http:
        resp = await http.post(
            f"{url}/rest/v1/agents",
            headers=_headers(token, {"Prefer": "return=representation"}),
            json=row,
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def update_agent(
    agent_id: str, fields: Dict[str, Any], *, org_id: str, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    url = _base_url()
    async with _client() as http:
        resp = await http.patch(
            f"{url}/rest/v1/agents",
            headers=_headers(token, {"Prefer": "return=representation"}),
            params={"id": f"eq.{agent_id}", "org_id": f"eq.{org_id}"},
            json=fields,
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def delete_agent(
    agent_id: str, *, org_id: str, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    url = _base_url()
    async with _client() as http:
        resp = await http.delete(
            f"{url}/rest/v1/agents",
            headers=_headers(token, {"Prefer": "return=representation"}),
            params={"id": f"eq.{agent_id}", "org_id": f"eq.{org_id}"},
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def clear_default_agents(
    *, org_id: str, token: Optional[str] = None, except_id: Optional[str] = None
) -> None:
    """Clear is_default on this org's agents (optionally sparing `except_id`), so
    at most one agent is the default. Called before flagging a new default."""
    url = _base_url()
    params = {"org_id": f"eq.{org_id}", "is_default": "eq.true"}
    if except_id:
        params["id"] = f"neq.{except_id}"
    async with _client() as http:
        resp = await http.patch(
            f"{url}/rest/v1/agents",
            headers=_headers(token, {"Prefer": "return=minimal"}),
            params=params,
            json={"is_default": False},
        )
    _raise_for_error(resp)


# ── Prospects (compliant business discovery; SEPARATE from leads) ─────────────
# User mode (RLS) on the request path; service mode (explicit id) only for the
# public cold-email unsubscribe link, which has no user session.
async def insert_prospect(row: Dict[str, Any], *, token: Optional[str] = None) -> Optional[Dict[str, Any]]:
    url = _base_url()
    async with _client() as http:
        resp = await http.post(
            f"{url}/rest/v1/prospects",
            headers=_headers(token, {"Prefer": "return=representation"}),
            json=row,
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def list_prospects(
    *, org_id: str, token: Optional[str] = None, status: Optional[str] = None
) -> List[Dict[str, Any]]:
    """This org's prospects, newest first. Optionally filtered by status."""
    url = _base_url()
    params = {"org_id": f"eq.{org_id}", "select": "*", "order": "created_at.desc"}
    if status:
        params["status"] = f"eq.{status}"
    async with _client() as http:
        resp = await http.get(f"{url}/rest/v1/prospects", headers=_headers(token), params=params)
    _raise_for_error(resp)
    return resp.json()


async def get_prospect(
    prospect_id: str, *, org_id: Optional[str] = None, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    url = _base_url()
    params = {"id": f"eq.{prospect_id}", "select": "*", "limit": "1"}
    if org_id:
        params["org_id"] = f"eq.{org_id}"
    async with _client() as http:
        resp = await http.get(f"{url}/rest/v1/prospects", headers=_headers(token), params=params)
    _raise_for_error(resp)
    return _one(resp.json())


async def find_prospect_by_identity(
    external_id: Optional[str], phone: Optional[str], website: Optional[str],
    *, org_id: str, token: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Find an existing prospect in THIS org by business_id OR phone OR website —
    for search dedupe so re-running a query doesn't duplicate rows. Always
    org-scoped: two tenants may legitimately discover the same business. Returns
    None when there's nothing to match on."""
    external_id = (external_id or "").strip()
    phone = (phone or "").strip()
    website = (website or "").strip()
    clauses = []
    if external_id:
        clauses.append(f"external_id.eq.{external_id}")
    if phone:
        clauses.append(f"phone.eq.{phone}")
    if website:
        clauses.append(f"website.eq.{website}")
    if not clauses:
        return None

    url = _base_url()
    if len(clauses) == 1:
        field, value = clauses[0].split(".eq.", 1)
        params = {field: f"eq.{value}"}
    else:
        params = {"or": f"({','.join(clauses)})"}
    params.update({"org_id": f"eq.{org_id}", "select": "*", "limit": "1"})
    async with _client() as http:
        resp = await http.get(f"{url}/rest/v1/prospects", headers=_headers(token), params=params)
    _raise_for_error(resp)
    return _one(resp.json())


async def update_prospect_fields(
    prospect_id: str, fields: Dict[str, Any], *, org_id: Optional[str] = None, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    url = _base_url()
    params = {"id": f"eq.{prospect_id}"}
    if org_id:
        params["org_id"] = f"eq.{org_id}"
    async with _client() as http:
        resp = await http.patch(
            f"{url}/rest/v1/prospects",
            headers=_headers(token, {"Prefer": "return=representation"}),
            params=params,
            json=fields,
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def set_prospect_unsubscribed(prospect_id: str) -> Optional[Dict[str, Any]]:
    """Public cold-email unsubscribe link — no session, so service mode. Safe
    because the prospect id is an unguessable uuid and this only ever sets an
    opt-out flag."""
    url = _base_url()
    async with _client() as http:
        resp = await http.patch(
            f"{url}/rest/v1/prospects",
            headers=_headers(None, {"Prefer": "return=representation"}),
            params={"id": f"eq.{prospect_id}"},
            json={"unsubscribed": True},
        )
    _raise_for_error(resp)
    return _one(resp.json())


# ── Saved searches (scheduled/automated prospect discovery) ───────────────────
# User mode (RLS) on the request path; service mode (explicit org_id) for the
# background sweep (list_active_saved_searches_for_sweep / touch_saved_search_run).
async def list_saved_searches(
    *, org_id: str, token: Optional[str] = None
) -> List[Dict[str, Any]]:
    """This org's saved searches, newest first."""
    url = _base_url()
    async with _client() as http:
        resp = await http.get(
            f"{url}/rest/v1/saved_searches",
            headers=_headers(token),
            params={"org_id": f"eq.{org_id}", "select": "*", "order": "created_at.desc"},
        )
    _raise_for_error(resp)
    return resp.json()


async def get_saved_search(
    search_id: str, *, org_id: Optional[str] = None, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    url = _base_url()
    params = {"id": f"eq.{search_id}", "select": "*", "limit": "1"}
    if org_id:
        params["org_id"] = f"eq.{org_id}"
    async with _client() as http:
        resp = await http.get(f"{url}/rest/v1/saved_searches", headers=_headers(token), params=params)
    _raise_for_error(resp)
    return _one(resp.json())


async def insert_saved_search(row: Dict[str, Any], *, token: Optional[str] = None) -> Optional[Dict[str, Any]]:
    url = _base_url()
    async with _client() as http:
        resp = await http.post(
            f"{url}/rest/v1/saved_searches",
            headers=_headers(token, {"Prefer": "return=representation"}),
            json=row,
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def update_saved_search(
    search_id: str, fields: Dict[str, Any], *, org_id: Optional[str] = None, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    url = _base_url()
    params = {"id": f"eq.{search_id}"}
    if org_id:
        params["org_id"] = f"eq.{org_id}"
    async with _client() as http:
        resp = await http.patch(
            f"{url}/rest/v1/saved_searches",
            headers=_headers(token, {"Prefer": "return=representation"}),
            params=params,
            json=fields,
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def delete_saved_search(
    search_id: str, *, org_id: str, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    url = _base_url()
    async with _client() as http:
        resp = await http.delete(
            f"{url}/rest/v1/saved_searches",
            headers=_headers(token, {"Prefer": "return=representation"}),
            params={"id": f"eq.{search_id}", "org_id": f"eq.{org_id}"},
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def list_active_saved_searches() -> List[Dict[str, Any]]:
    """EVERY org's ACTIVE saved searches. Service mode (no user session): the
    prospect-search sweep calls this once per pass, groups by org_id, and — using
    each org's LIVE settings — runs the ones whose interval has elapsed."""
    url = _base_url()
    async with _client() as http:
        resp = await http.get(
            f"{url}/rest/v1/saved_searches",
            headers=_headers(),
            params={"is_active": "eq.true", "select": "*", "limit": "100000"},
        )
    _raise_for_error(resp)
    return resp.json()


async def touch_saved_search_run(search_id: str, now_iso: str) -> Optional[Dict[str, Any]]:
    """Stamp last_run_at after the sweep runs a saved search. Service mode."""
    url = _base_url()
    async with _client() as http:
        resp = await http.patch(
            f"{url}/rest/v1/saved_searches",
            headers=_headers(None, {"Prefer": "return=representation"}),
            params={"id": f"eq.{search_id}"},
            json={"last_run_at": now_iso},
        )
    _raise_for_error(resp)
    return _one(resp.json())


# ── Prospect-search usage log (drives the monthly quota + usage endpoint) ─────
async def insert_prospect_search_run(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Record one executed automated search. Service mode: written only by the
    sweep, which has no user session."""
    url = _base_url()
    async with _client() as http:
        resp = await http.post(
            f"{url}/rest/v1/prospect_search_runs",
            headers=_headers(None, {"Prefer": "return=representation"}),
            json=row,
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def count_prospect_search_runs_since(
    org_id: str, since_iso: str, *, token: Optional[str] = None
) -> int:
    """How many automated searches this org has run at/after since_iso — the
    monthly-quota count. Uses PostgREST's exact count (Content-Range header) so we
    never pull the rows themselves. USER mode (RLS) for the usage endpoint; SERVICE
    mode (explicit org_id, no token) for the sweep's pre-flight quota check."""
    url = _base_url()
    async with _client() as http:
        resp = await http.get(
            f"{url}/rest/v1/prospect_search_runs",
            headers=_headers(token, {"Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0"}),
            params={"org_id": f"eq.{org_id}", "created_at": f"gte.{since_iso}", "select": "id"},
        )
    _raise_for_error(resp)
    # Content-Range looks like "0-0/42" (or "*/0" when empty); the total is after '/'.
    content_range = resp.headers.get("content-range") or resp.headers.get("Content-Range") or ""
    total = content_range.split("/")[-1].strip()
    try:
        return int(total)
    except (TypeError, ValueError):
        return 0
