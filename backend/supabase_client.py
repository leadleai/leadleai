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
import os
from typing import Any, Dict, List, Optional

import httpx


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
    async with httpx.AsyncClient(timeout=15) as http:
        resp = await http.post(
            f"{url}/rest/v1/leads",
            headers=_headers(token, {"Prefer": "return=representation"}),
            json=row,
        )
    _raise_for_error(resp)
    data = resp.json()
    return data[0] if isinstance(data, list) and data else data


async def list_leads(
    source: Optional[str] = None, *, token: Optional[str] = None, org_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    url = _base_url()
    params = {"select": "*", "order": "created_at.desc"}
    if source:
        params["source"] = f"eq.{source}"
    if org_id:
        params["org_id"] = f"eq.{org_id}"
    async with httpx.AsyncClient(timeout=15) as http:
        resp = await http.get(f"{url}/rest/v1/leads", headers=_headers(token), params=params)
    _raise_for_error(resp)
    return resp.json()


async def update_lead_status(
    lead_id: str, status: str, *, token: Optional[str] = None, org_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    url = _base_url()
    params = {"id": f"eq.{lead_id}"}
    if org_id:
        params["org_id"] = f"eq.{org_id}"
    async with httpx.AsyncClient(timeout=15) as http:
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
    params = {"id": f"eq.{lead_id}", "select": "*", "limit": "1"}
    if org_id:
        params["org_id"] = f"eq.{org_id}"
    async with httpx.AsyncClient(timeout=15) as http:
        resp = await http.get(f"{url}/rest/v1/leads", headers=_headers(token), params=params)
    _raise_for_error(resp)
    return _one(resp.json())


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
    async with httpx.AsyncClient(timeout=15) as http:
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
    async with httpx.AsyncClient(timeout=15) as http:
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
    async with httpx.AsyncClient(timeout=15) as http:
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
    async with httpx.AsyncClient(timeout=15) as http:
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
    async with httpx.AsyncClient(timeout=15) as http:
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
    async with httpx.AsyncClient(timeout=15) as http:
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
    async with httpx.AsyncClient(timeout=15) as http:
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
    async with httpx.AsyncClient(timeout=15) as http:
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
    async with httpx.AsyncClient(timeout=20) as http:
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
    async with httpx.AsyncClient(timeout=15) as http:
        resp = await http.get(f"{url}/rest/v1/email_templates", headers=_headers(token), params=params)
    _raise_for_error(resp)
    return resp.json()


async def upsert_email_template(
    step: int, subject: str, body: str, *, org_id: str, token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Insert-or-update this org's template for a step (PK = org_id, step)."""
    url = _base_url()
    async with httpx.AsyncClient(timeout=15) as http:
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
    async with httpx.AsyncClient(timeout=15) as http:
        resp = await http.get(f"{url}/rest/v1/knowledge_base", headers=_headers(token), params=params)
    _raise_for_error(resp)
    return resp.json()


async def insert_knowledge(row: Dict[str, Any], *, token: Optional[str] = None) -> Optional[Dict[str, Any]]:
    url = _base_url()
    async with httpx.AsyncClient(timeout=15) as http:
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
    async with httpx.AsyncClient(timeout=15) as http:
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
    async with httpx.AsyncClient(timeout=15) as http:
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
    async with httpx.AsyncClient(timeout=15) as http:
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
    async with httpx.AsyncClient(timeout=15) as http:
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
    async with httpx.AsyncClient(timeout=15) as http:
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
    async with httpx.AsyncClient(timeout=15) as http:
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
    async with httpx.AsyncClient(timeout=15) as http:
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
    async with httpx.AsyncClient(timeout=15) as http:
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
    async with httpx.AsyncClient(timeout=15) as http:
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
    async with httpx.AsyncClient(timeout=20) as http:
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
    async with httpx.AsyncClient(timeout=15) as http:
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
    async with httpx.AsyncClient(timeout=15) as http:
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
    async with httpx.AsyncClient(timeout=15) as http:
        resp = await http.get(
            f"{url}/rest/v1/organizations",
            headers=_headers(),
            params={"slug": f"eq.{slug}", "select": "id,name,slug", "limit": "1"},
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def list_org_members(org_id: str, *, token: str) -> List[Dict[str, Any]]:
    url = _base_url()
    async with httpx.AsyncClient(timeout=15) as http:
        resp = await http.get(
            f"{url}/rest/v1/memberships",
            headers=_headers(token),
            params={"org_id": f"eq.{org_id}", "select": "id,user_id,role,created_at",
                    "order": "created_at.asc"},
        )
    _raise_for_error(resp)
    return resp.json()


async def list_invites(org_id: str, *, token: str) -> List[Dict[str, Any]]:
    url = _base_url()
    async with httpx.AsyncClient(timeout=15) as http:
        resp = await http.get(
            f"{url}/rest/v1/invites",
            headers=_headers(token),
            params={"org_id": f"eq.{org_id}", "accepted_at": "is.null",
                    "select": "id,email,role,created_at", "order": "created_at.desc"},
        )
    _raise_for_error(resp)
    return resp.json()


async def create_invite(
    org_id: str, email: str, role: str, invited_by: str, *, token: str
) -> Optional[Dict[str, Any]]:
    """User mode on purpose: the `invite_owner_write` policy rejects this unless
    the caller is actually an owner of org_id. The DB is the authority, not us."""
    url = _base_url()
    async with httpx.AsyncClient(timeout=15) as http:
        resp = await http.post(
            f"{url}/rest/v1/invites",
            headers=_headers(token, {"Prefer": "resolution=merge-duplicates,return=representation"}),
            params={"on_conflict": "org_id,email"},
            json={"org_id": org_id, "email": email, "role": role, "invited_by": invited_by},
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def delete_invite(invite_id: str, *, token: str) -> None:
    url = _base_url()
    async with httpx.AsyncClient(timeout=15) as http:
        resp = await http.delete(
            f"{url}/rest/v1/invites", headers=_headers(token), params={"id": f"eq.{invite_id}"}
        )
    _raise_for_error(resp)


async def add_membership(org_id: str, user_id: str, role: str, *, token: str) -> Optional[Dict[str, Any]]:
    """Add an EXISTING user to an org. RLS enforces owner-only."""
    url = _base_url()
    async with httpx.AsyncClient(timeout=15) as http:
        resp = await http.post(
            f"{url}/rest/v1/memberships",
            headers=_headers(token, {"Prefer": "resolution=merge-duplicates,return=representation"}),
            params={"on_conflict": "org_id,user_id"},
            json={"org_id": org_id, "user_id": user_id, "role": role},
        )
    _raise_for_error(resp)
    return _one(resp.json())


async def remove_membership(membership_id: str, *, token: str) -> None:
    url = _base_url()
    async with httpx.AsyncClient(timeout=15) as http:
        resp = await http.delete(
            f"{url}/rest/v1/memberships", headers=_headers(token), params={"id": f"eq.{membership_id}"}
        )
    _raise_for_error(resp)


# ── Auth admin (service mode; used only to resolve ids -> emails) ────────────
async def admin_get_user(user_id: str) -> Optional[Dict[str, Any]]:
    """Look up one auth user. auth.users isn't reachable through PostgREST, so
    the Team view resolves member emails here — AFTER the caller's membership in
    the org has been verified."""
    url = _base_url()
    async with httpx.AsyncClient(timeout=15) as http:
        resp = await http.get(f"{url}/auth/v1/admin/users/{user_id}", headers=_headers())
    if resp.status_code == 404:
        return None
    _raise_for_error(resp)
    return resp.json()


async def admin_find_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Find an existing auth user by email (invite flow: add them straight away
    instead of leaving a pending invite)."""
    url = _base_url()
    async with httpx.AsyncClient(timeout=15) as http:
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
    async with httpx.AsyncClient(timeout=15) as http:
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
    async with httpx.AsyncClient(timeout=15) as http:
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
    async with httpx.AsyncClient(timeout=15) as http:
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
    async with httpx.AsyncClient(timeout=15) as http:
        resp = await http.delete(
            f"{url}/rest/v1/integration_tokens",
            headers=_headers(token),
            params={"org_id": f"eq.{org_id}", "platform": f"eq.{platform}"},
        )
    _raise_for_error(resp)
