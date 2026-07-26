"""
Supabase Auth for FastAPI: verify the caller's JWT, then resolve which
organization they're acting in.

    Authorization: Bearer <supabase access token>
    X-Org-Id: <uuid>            (optional; must be an org they belong to)

Two dependencies cover every protected route:

    principal = Depends(require_user)   -> authenticated, org not needed
    ctx       = Depends(require_org)    -> authenticated + resolved org

`ctx.token` is the caller's raw JWT, meant to be handed to supabase_client so
PostgREST evaluates RLS as that user. `ctx.org_id` is derived from their
memberships in the database — an org id sent by the client is only ever used to
CHOOSE among orgs they already belong to, never trusted on its own.

SIGNING MODES — Supabase projects come in two flavours and this supports both:

  * ASYMMETRIC (current default): tokens are signed ES256/RS256 with rotating
    JWT signing keys. The matching PUBLIC keys are published at
    <project>/auth/v1/.well-known/jwks.json; we fetch, cache, and verify
    against the key whose `kid` matches the token header. No shared secret.

  * SYMMETRIC (legacy): tokens are signed HS256 with the project's JWT Secret,
    read from SUPABASE_JWT_SECRET in backend/.env.

The algorithm is read from the token header and the key is chosen to match, but
the algorithm is always PINNED to that single value when verifying — never a
permissive list. `none` (and anything else unrecognised) is rejected outright.
"""
import asyncio
import logging
import os
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import httpx
import jwt
from fastapi import Depends, Header, HTTPException

import supabase_client as sb

logger = logging.getLogger("auth")

# Supabase signs project JWTs with this audience.
JWT_AUDIENCE = "authenticated"

# Asymmetric: key material comes from JWKS (public keys, safe to cache).
ASYMMETRIC_ALGS = frozenset({
    "RS256", "RS384", "RS512",
    "ES256", "ES384", "ES512",
    "PS256", "PS384", "PS512",
    "EdDSA",
})
# Symmetric: key material is the project's shared JWT secret.
SYMMETRIC_ALGS = frozenset({"HS256", "HS384", "HS512"})

JWKS_CACHE_SECONDS = int(os.environ.get("SUPABASE_JWKS_CACHE_SECONDS", "600"))


def _jwt_secret() -> str:
    secret = os.environ.get("SUPABASE_JWT_SECRET", "")
    if not secret:
        raise HTTPException(
            status_code=503,
            detail=(
                "This token is HS256-signed but SUPABASE_JWT_SECRET is not set in "
                "backend/.env (Supabase dashboard -> Project Settings -> API -> JWT Secret). "
                "If your project uses the newer JWT signing keys, tokens are ES256/RS256 "
                "and are verified via JWKS instead — no secret needed."
            ),
        )
    return secret


def _jwks_url() -> str:
    """Where to fetch the project's public signing keys."""
    explicit = os.environ.get("SUPABASE_JWKS_URL", "").strip()
    if explicit:
        return explicit
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    if not base:
        raise HTTPException(
            status_code=503,
            detail="Auth is not configured: set SUPABASE_URL (or SUPABASE_JWKS_URL) in backend/.env.",
        )
    return f"{base}/auth/v1/.well-known/jwks.json"


# JWKS cache: {url: (PyJWKSet, fetched_at)}. The key set is public material and
# changes only on rotation, so a short TTL keeps steady-state verification free
# of network round trips.
#
# We fetch with httpx rather than PyJWKClient's built-in urllib transport for
# two reasons: httpx ships its own CA bundle (urllib relies on the system store,
# which is missing on some macOS/Python installs and yields
# CERTIFICATE_VERIFY_FAILED), and doing the fetch ourselves lets us tell
# "couldn't reach Supabase" (503, our fault) apart from "kid isn't published"
# (401, the token's fault). Conflating those two makes an outage look like an
# auth failure.
_jwks_lock = asyncio.Lock()
_jwks_cache: Dict[str, tuple] = {}


async def _fetch_jwks(url: str) -> jwt.PyJWKSet:
    try:
        async with httpx.AsyncClient(timeout=10) as http:
            resp = await http.get(url)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=503, detail=f"Could not reach the signing-key endpoint: {e}")
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=503,
            detail=f"Signing-key endpoint returned HTTP {resp.status_code} for {url}.",
        )
    try:
        return jwt.PyJWKSet.from_dict(resp.json())
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Malformed JWKS document at {url}: {e}")


async def _jwks_for(url: str, force: bool = False) -> jwt.PyJWKSet:
    async with _jwks_lock:
        cached = _jwks_cache.get(url)
        if not force and cached and (time.time() - cached[1]) < JWKS_CACHE_SECONDS:
            return cached[0]
        jwks = await _fetch_jwks(url)
        _jwks_cache[url] = (jwks, time.time())
        return jwks


def _match_key(jwks: jwt.PyJWKSet, kid: Optional[str]):
    for key in jwks.keys:
        if kid is None or key.key_id == kid:
            return key
    return None


async def _signing_key_for(token: str, kid: Optional[str]):
    """Public key matching the token's `kid`.

    An unknown kid triggers exactly one forced refresh — that is what a key
    rotation looks like, and it should heal without restarting the process.
    """
    url = _jwks_url()

    jwks = await _jwks_for(url)
    key = _match_key(jwks, kid)
    if key is not None:
        return key.key

    logger.info("kid %r not in cached JWKS; refreshing from %s", kid, url)
    jwks = await _jwks_for(url, force=True)
    key = _match_key(jwks, kid)
    if key is not None:
        return key.key

    # Reached Supabase fine, but it does not publish this key -> not our token.
    raise HTTPException(
        status_code=401,
        detail="Token signing key is not published by this project.",
    )


@dataclass
class Principal:
    """An authenticated Supabase user."""
    user_id: str
    email: Optional[str]
    token: str          # raw JWT, forwarded to PostgREST so RLS applies
    claims: Dict[str, Any]


@dataclass
class OrgContext:
    """An authenticated user acting inside one specific organization."""
    principal: Principal
    org_id: str
    role: str
    org: Dict[str, Any]
    memberships: List[Dict[str, Any]]

    @property
    def token(self) -> str:
        return self.principal.token

    @property
    def user_id(self) -> str:
        return self.principal.user_id

    @property
    def is_owner(self) -> bool:
        return self.role == "owner"


async def decode_token(token: str) -> Dict[str, Any]:
    """Verify signature, expiry and audience. Raises 401 on any failure.

    The algorithm comes from the token header only to CHOOSE the key source;
    verification then pins `algorithms=[alg]`, so a token cannot smuggle in a
    different algorithm than the key it is checked against.
    """
    try:
        header = jwt.get_unverified_header(token)
    except jwt.InvalidTokenError as e:
        logger.info("rejected token: unreadable header (%s)", e)
        raise HTTPException(status_code=401, detail="Invalid or malformed access token.")

    alg = header.get("alg")

    if alg in SYMMETRIC_ALGS:
        # Legacy shared-secret projects. Note the secret is NOT any public key,
        # so the classic "sign with the public key as an HMAC secret" algorithm
        # confusion attack fails here.
        key = _jwt_secret()
    elif alg in ASYMMETRIC_ALGS:
        key = await _signing_key_for(token, header.get("kid"))
    else:
        # Includes alg="none", alg missing, and anything unrecognised.
        logger.info("rejected token: unsupported alg %r", alg)
        raise HTTPException(
            status_code=401,
            detail=f"Unsupported token signing algorithm: {alg!r}.",
        )

    try:
        return jwt.decode(
            token,
            key,
            algorithms=[alg],          # pinned to exactly the one we keyed for
            audience=JWT_AUDIENCE,
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired — please log in again.")
    except jwt.InvalidAudienceError:
        raise HTTPException(status_code=401, detail="Invalid token audience.")
    except jwt.InvalidTokenError as e:
        # Covers bad signature, malformed token, missing claims.
        logger.info("rejected token (alg=%s): %s", alg, e)
        raise HTTPException(status_code=401, detail="Invalid or malformed access token.")


async def require_user(authorization: Optional[str] = Header(default=None)) -> Principal:
    """Authenticated user, or 401."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization: Bearer <token> header.")
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty bearer token.")

    claims = await decode_token(token)
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token has no subject claim.")

    return Principal(
        user_id=user_id,
        email=claims.get("email"),
        token=token,
        claims=claims,
    )


async def require_org(
    principal: Principal = Depends(require_user),
    x_org_id: Optional[str] = Header(default=None, alias="X-Org-Id"),
) -> OrgContext:
    """Resolve the org this request acts in.

    Memberships are read with the caller's own token, so RLS already restricts
    the result to their rows — an attacker cannot widen it by sending a
    different X-Org-Id. If the header names an org they aren't in, we 403
    rather than silently falling back to one they are in.
    """
    try:
        memberships = await sb.list_memberships(token=principal.token)
    except sb.SupabaseNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))
    except sb.SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.message}")

    if not memberships:
        raise HTTPException(
            status_code=403,
            detail="Your account is not a member of any organization.",
        )

    chosen = None
    if x_org_id:
        chosen = next((m for m in memberships if m.get("org_id") == x_org_id), None)
        if chosen is None:
            raise HTTPException(status_code=403, detail="You are not a member of that organization.")
    else:
        chosen = memberships[0]  # oldest membership is the default workspace

    org = chosen.get("organization") or {}
    return OrgContext(
        principal=principal,
        org_id=chosen["org_id"],
        role=chosen.get("role") or "member",
        org=org if isinstance(org, dict) else {},
        memberships=memberships,
    )


async def require_owner(ctx: OrgContext = Depends(require_org)) -> OrgContext:
    """Same as require_org, but 403s for non-owners (team management)."""
    if not ctx.is_owner:
        raise HTTPException(status_code=403, detail="Only organization owners can do that.")
    return ctx


def sb_error(e: Exception) -> HTTPException:
    """Shared Supabase-exception -> HTTPException mapping."""
    if isinstance(e, HTTPException):
        return e
    if isinstance(e, sb.SupabaseNotConfigured):
        return HTTPException(status_code=503, detail=str(e))
    if isinstance(e, sb.SupabaseError):
        return HTTPException(status_code=502, detail=f"Supabase error: {e.message}")
    return HTTPException(status_code=500, detail=str(e))
