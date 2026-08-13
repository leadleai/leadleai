"""
Per-org PROVIDER connections — each org brings its OWN Bland (calling) and Resend
(email) credentials, stored ENCRYPTED, so every business uses and pays for its own
accounts.

    POST   /api/connections            save an org's provider key (encrypt, then store)
    GET    /api/connections            which providers are connected (MASKED, never the key)
    DELETE /api/connections/{service}  remove a connection

SECURITY
  * Credentials are serialized to a tiny JSON blob and Fernet-encrypted with
    TOKEN_ENCRYPTION_KEY (integrations.security) BEFORE they ever reach the
    database. Decryption happens ONLY server-side, at the moment we place a call
    or send an email. The plaintext key is never logged and never returned to the
    browser.
  * GET returns a non-secret masked hint (e.g. "re_...cd12") so a user recognises
    which key is on file — the raw key cannot be read back out.
  * Every route is authenticated and org-scoped, and writes go through PostgREST
    in USER mode so the `connections` RLS policy (org_isolation) is the real
    boundary — no org can touch another org's row.

RESOLUTION (how calls/emails now pick a key)
  * resolve_bland_key(org_id)  -> the org's Bland key, or None.
  * resolve_resend(org_id)     -> {"api_key", "from_email"} for the org, or None.
  Both NEVER raise: on any error they return None and the caller falls back to the
  deployment-wide env key, so first-party testing keeps working with no connection.
"""
import json
import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field, field_validator

import supabase_client as sb
from auth import OrgContext, require_org, sb_error
from integrations import security

logger = logging.getLogger("connections")
router = APIRouter(prefix="/api/connections", tags=["connections"])

# The providers an org can connect here (mirrors the DB check constraint).
SERVICES = ("bland", "resend")


# ── Masking (non-secret hint the frontend may display) ───────────────────────
def mask_key(key: str) -> str:
    """A non-reversible hint like 'sk-...cd12'. Shows the provider-style prefix and
    the last 4 chars so a user can recognise which key is stored, revealing nothing
    usable. Very short keys are fully masked."""
    key = (key or "").strip()
    if len(key) <= 8:
        return "•" * len(key)
    # Keep any provider prefix up to (and including) the first separator, else 3 chars.
    head = key[:3]
    for sep in ("_", "-"):
        idx = key.find(sep)
        if 0 < idx <= 6:
            head = key[: idx + 1]
            break
    return f"{head}…{key[-4:]}"


# ── API shapes ────────────────────────────────────────────────────────────────
class ConnectionIn(BaseModel):
    service: str
    api_key: str = Field(min_length=1, max_length=500)
    # Required for Resend (the verified sender), ignored for Bland.
    from_email: Optional[EmailStr] = None

    @field_validator("service")
    @classmethod
    def _check_service(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if v not in SERVICES:
            raise ValueError(f"unknown service {v!r} (supported: {', '.join(SERVICES)})")
        return v

    @field_validator("api_key")
    @classmethod
    def _clean_key(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("API key can't be blank")
        return v


class ConnectionOut(BaseModel):
    service: str
    connected: bool = True
    masked_key: Optional[str] = None   # e.g. "re_...cd12" — never the full key
    from_email: Optional[str] = None   # Resend only; safe to show
    is_active: bool = True
    updated_at: Optional[str] = None


# ── Encryption of the credential blob ────────────────────────────────────────
def _encrypt_credentials(api_key: str, from_email: Optional[str]) -> str:
    """Serialize {api_key, from_email} to JSON and Fernet-encrypt it. The ciphertext
    is opaque; only the backend (holding TOKEN_ENCRYPTION_KEY) can read it back."""
    blob = json.dumps({"api_key": api_key, "from_email": (from_email or None)})
    return security.encrypt(blob)


def _decrypt_credentials(ciphertext: Optional[str]) -> Optional[Dict[str, Any]]:
    """Reverse of _encrypt_credentials. Returns the dict, or None if the value can't
    be decrypted/parsed (e.g. the key rotated) — the caller then falls back to env."""
    plain = security.decrypt(ciphertext)
    if not plain:
        return None
    try:
        data = json.loads(plain)
        return data if isinstance(data, dict) else None
    except (ValueError, TypeError):
        return None


# ── Endpoints ─────────────────────────────────────────────────────────────────
@router.get("", response_model=list[ConnectionOut])
async def list_connections(ctx: OrgContext = Depends(require_org)):
    """Which providers this org has connected — MASKED. The encrypted key column is
    never even selected (see sb.list_connections), so the full key cannot leak."""
    try:
        rows = await sb.list_connections(ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    out = []
    for r in rows:
        out.append(ConnectionOut(
            service=r.get("service"),
            connected=True,
            masked_key=r.get("key_hint"),
            # from_email is a NON-secret plain column (the verified Resend sender), so
            # it's returned for display. The API KEY never is — GET never selects or
            # decrypts the ciphertext.
            from_email=r.get("from_email"),
            is_active=bool(r.get("is_active", True)),
            updated_at=r.get("updated_at"),
        ))
    return out


@router.post("", response_model=ConnectionOut, status_code=201)
async def save_connection(body: ConnectionIn, ctx: OrgContext = Depends(require_org)):
    """Save (or replace) this org's credentials for a provider. Encrypts before
    storing; the raw key is never persisted or logged."""
    if body.service == "resend" and not body.from_email:
        raise HTTPException(
            status_code=422,
            detail="Resend needs a verified from-email (the address your follow-ups are sent from).",
        )

    from_email = str(body.from_email) if body.from_email else None
    row = {
        "org_id": ctx.org_id,
        "service": body.service,
        "encrypted_credentials": _encrypt_credentials(body.api_key, from_email),
        "key_hint": mask_key(body.api_key),
        "from_email": from_email,   # NON-secret; stored plainly for display + sending
        "is_active": True,
    }
    try:
        saved = await sb.upsert_connection(row, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    if not saved:
        raise HTTPException(status_code=500, detail="Could not save the connection.")
    logger.info("[org %s] %s connection saved by user %s", ctx.org_id, body.service, ctx.user_id)
    return ConnectionOut(
        service=body.service,
        connected=True,
        masked_key=saved.get("key_hint"),
        from_email=(str(body.from_email) if body.from_email else None),
        is_active=bool(saved.get("is_active", True)),
        updated_at=saved.get("updated_at"),
    )


@router.delete("/{service}", status_code=204)
async def remove_connection(service: str, ctx: OrgContext = Depends(require_org)):
    service = (service or "").strip().lower()
    if service not in SERVICES:
        raise HTTPException(status_code=404, detail="Unknown service")
    try:
        existing = await sb.get_connection(ctx.org_id, service, token=ctx.token)
        if not existing:
            raise HTTPException(status_code=404, detail="Not connected")
        await sb.delete_connection(ctx.org_id, service, token=ctx.token)
    except HTTPException:
        raise
    except Exception as e:
        raise sb_error(e)
    logger.info("[org %s] %s connection removed by user %s", ctx.org_id, service, ctx.user_id)
    return None


# ── Server-side resolution (used by the call + email paths) ──────────────────
async def _resolve(org_id: str, service: str, *, token: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Decrypted credentials for one org+service, or None. Never raises — a lookup
    failure must never drop a call or an email; the caller falls back to env."""
    if not org_id:
        return None
    try:
        row = await sb.get_connection(org_id, service, token=token)
    except Exception as e:
        logger.warning("org=%s could not read %s connection (%s); falling back to env", org_id, service, e)
        return None
    if not row or not row.get("is_active", True):
        return None
    return _decrypt_credentials(row.get("encrypted_credentials"))


async def resolve_bland_key(org_id: str, *, token: Optional[str] = None) -> Optional[str]:
    """This org's own Bland API key, or None (caller uses the global env key)."""
    creds = await _resolve(org_id, "bland", token=token)
    key = (creds or {}).get("api_key")
    return key.strip() if isinstance(key, str) and key.strip() else None


async def resolve_resend(org_id: str, *, token: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """This org's own Resend credentials {"api_key", "from_email"}, or None (caller
    uses the global env key + from-email)."""
    creds = await _resolve(org_id, "resend", token=token)
    if not creds:
        return None
    key = (creds.get("api_key") or "").strip()
    if not key:
        return None
    return {"api_key": key, "from_email": (creds.get("from_email") or None)}
