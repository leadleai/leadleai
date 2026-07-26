"""
OAuth2 authorization-code endpoints — now per-ORGANIZATION.

    GET    /api/integrations                        -> the org's connected platforms
    GET    /api/integrations/{platform}/authorize   -> build provider consent URL (+ CSRF state)
    GET    /api/integrations/{platform}/callback     -> exchange code -> token, store, redirect back
    DELETE /api/integrations/{platform}              -> revoke + delete stored tokens

WHAT CHANGED (multi-tenancy):
  * Tokens live in Supabase `integration_tokens` with an org_id, not MongoDB.
    A connection belongs to the ORG, so any teammate can use it and RLS keeps
    it away from every other tenant.
  * GET /session is gone. It used to mint a fresh random user id for anyone who
    asked, which meant "auth" was decorative. Callers now present a real
    Supabase JWT and the org is resolved from their membership.
  * The callback is a plain browser redirect with no Authorization header, so
    it recovers the org from the SIGNED `state` parameter instead, then writes
    with the service role.

Provider client secrets and the token-encryption key stay in backend/.env;
tokens are encrypted at rest before they ever reach the database.
"""
import logging
import os
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, parse_qs

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse

import supabase_client as sb
from auth import OrgContext, require_org, sb_error
from . import providers, security

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/integrations", tags=["integrations"])

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8001")


def redirect_uri_for(slug: str) -> str:
    return f"{PUBLIC_BASE_URL}/api/integrations/{slug}/callback"


@router.get("")
async def list_integrations(ctx: OrgContext = Depends(require_org)):
    try:
        rows = await sb.list_integration_tokens(ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)

    return {
        "connected": [
            {
                "platform": r["platform"],
                "connected": True,
                "scope": r.get("scope"),
                "connected_at": r.get("connected_at"),
            }
            for r in rows
        ],
        "available": [s for s in providers.known_slugs() if providers.is_configured(s)],
    }


@router.get("/{platform}/authorize")
async def authorize(platform: str, ctx: OrgContext = Depends(require_org)):
    if platform not in providers.known_slugs():
        raise HTTPException(status_code=404, detail="Unknown platform")
    if not providers.is_configured(platform):
        raise HTTPException(
            status_code=400,
            detail=f"{platform} is not configured. Set {platform.upper()}_CLIENT_ID / "
                   f"{platform.upper()}_CLIENT_SECRET (and endpoints for custom providers).",
        )
    provider = providers.get_provider(platform)
    client_id, _ = providers.client_credentials(platform)
    # Signed state carries BOTH who started the flow and which org it's for.
    state = security.make_state(ctx.user_id, ctx.org_id, platform)

    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri_for(platform),
        "scope": provider.default_scopes,
        "state": state,
        **provider.authorize_extras,
    }
    return {"authorization_url": f"{provider.authorize_url}?{urlencode(params)}"}


def _frontend_redirect(**params) -> RedirectResponse:
    return RedirectResponse(url=f"{FRONTEND_URL}/app/integrations?{urlencode(params)}")


@router.get("/{platform}/callback")
async def callback(platform: str, request: Request):
    """Handle the provider redirect: verify state, exchange code, store tokens."""
    q = request.query_params
    if q.get("error"):
        return _frontend_redirect(error=q.get("error"), platform=platform)

    code, state = q.get("code"), q.get("state")
    if not code or not state:
        return _frontend_redirect(error="missing_code_or_state", platform=platform)

    try:
        claims = security.verify_state(state, platform)  # CSRF check + org recovery
    except ValueError as e:
        logger.warning("OAuth state verification failed for %s: %s", platform, e)
        return _frontend_redirect(error="invalid_state", platform=platform)

    user_id, org_id = claims["uid"], claims["org"]
    provider = providers.get_provider(platform)
    client_id, client_secret = providers.client_credentials(platform)

    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri_for(platform),
        "client_id": client_id,
        "client_secret": client_secret,
    }
    try:
        async with httpx.AsyncClient(timeout=20) as http:
            resp = await http.post(
                provider.token_url, data=data,
                headers={"Accept": "application/json",
                         "Content-Type": "application/x-www-form-urlencoded"},
            )
    except httpx.HTTPError as e:
        logger.error("Token exchange transport error for %s: %s", platform, e)
        return _frontend_redirect(error="token_exchange_failed", platform=platform)

    if resp.status_code >= 400:
        logger.error("Token endpoint %s returned %s: %s", platform, resp.status_code, resp.text[:300])
        return _frontend_redirect(error="token_exchange_failed", platform=platform)

    # Most providers return JSON; a few legacy ones return form-encoded.
    try:
        payload = resp.json()
    except ValueError:
        payload = {k: v[0] for k, v in parse_qs(resp.text).items()}

    access_token = payload.get("access_token")
    if not access_token:
        logger.error("No access_token from %s: %s", platform, str(payload)[:300])
        return _frontend_redirect(error="no_access_token", platform=platform)

    expires_in = payload.get("expires_in")
    expires_at = (
        (datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))).isoformat()
        if expires_in else None
    )

    # Encrypted at rest, keyed on (org_id, platform) so re-connecting refreshes.
    try:
        await sb.upsert_integration_token({
            "org_id": org_id,
            "user_id": user_id,          # who connected it, for the audit trail
            "platform": platform,
            "access_token": security.encrypt(access_token),
            "refresh_token": security.encrypt(payload.get("refresh_token")),
            "token_type": payload.get("token_type", "Bearer"),
            "scope": payload.get("scope", provider.default_scopes),
            "expires_at": expires_at,
            "connected_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.error("Could not store %s tokens for org %s: %s", platform, org_id, e)
        return _frontend_redirect(error="token_store_failed", platform=platform)

    logger.info("Connected %s for org %s (by user %s)", platform, org_id, user_id)
    return _frontend_redirect(connected=platform)


@router.delete("/{platform}")
async def disconnect(platform: str, ctx: OrgContext = Depends(require_org)):
    try:
        row = await sb.get_integration_token(ctx.org_id, platform)
    except Exception as e:
        raise sb_error(e)
    if not row:
        raise HTTPException(status_code=404, detail="Not connected")

    # Best-effort token revocation at the provider.
    provider = providers.get_provider(platform)
    if provider.revoke_url:
        token = security.decrypt(row.get("access_token"))
        if token:
            try:
                async with httpx.AsyncClient(timeout=10) as http:
                    await http.post(provider.revoke_url, data={"token": token})
            except httpx.HTTPError:
                logger.warning("Revoke call to %s failed (continuing).", platform)

    try:
        await sb.delete_integration_token(ctx.org_id, platform, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    logger.info("Disconnected %s for org %s", platform, ctx.org_id)
    return {"disconnected": platform}
