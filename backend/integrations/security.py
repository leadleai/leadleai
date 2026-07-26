"""
Security helpers for the OAuth flow:

* Fernet symmetric encryption for tokens at rest (key from TOKEN_ENCRYPTION_KEY).
* Signed, time-limited `state` for CSRF protection (carries the user id so the
  callback can attribute the connection without a cross-site cookie).
* Signed bearer "session" tokens that identify the current user from the SPA.

All keys are read from environment variables — nothing is hardcoded.
"""
import base64
import os
import hashlib
import uuid
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

SESSION_SECRET = os.environ.get("SESSION_SECRET", "")
_STATE_SALT = "oauth-state"
_SESSION_SALT = "user-session"
STATE_MAX_AGE = 600          # 10 minutes to complete the consent screen
SESSION_MAX_AGE = 60 * 60 * 24 * 30  # 30 days


def _require_secret() -> str:
    if not SESSION_SECRET:
        raise RuntimeError("SESSION_SECRET is not set")
    return SESSION_SECRET


# ── Token encryption at rest ────────────────────────────────────────────────
def _fernet() -> Fernet:
    key = os.environ.get("TOKEN_ENCRYPTION_KEY")
    if not key:
        raise RuntimeError("TOKEN_ENCRYPTION_KEY is not set")
    # Accept either a proper Fernet key or any passphrase (derived deterministically).
    try:
        return Fernet(key)
    except (ValueError, TypeError):
        derived = base64.urlsafe_b64encode(hashlib.sha256(key.encode()).digest())
        return Fernet(derived)


def encrypt(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    return _fernet().encrypt(value.encode()).decode()


def decrypt(token: Optional[str]) -> Optional[str]:
    if token is None:
        return None
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return None


# ── CSRF state (signed, timed, carries user id) ─────────────────────────────
def _state_serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(_require_secret(), salt=_STATE_SALT)


def make_state(user_id: str, org_id: str, platform: str) -> str:
    """Signed CSRF state. Carries the org so the callback — which arrives as a
    plain browser redirect with no Authorization header — can still file the
    tokens under the right tenant. It is signed, so the org id cannot be
    tampered with in transit."""
    return _state_serializer().dumps(
        {"uid": user_id, "org": org_id, "platform": platform, "nonce": uuid.uuid4().hex}
    )


def verify_state(state: str, platform: str) -> dict:
    """Return {"uid", "org"} from a valid state, or raise ValueError."""
    try:
        data = _state_serializer().loads(state, max_age=STATE_MAX_AGE)
    except SignatureExpired:
        raise ValueError("state expired")
    except BadSignature:
        raise ValueError("invalid state")
    if data.get("platform") != platform:
        raise ValueError("state/platform mismatch")
    if not data.get("org"):
        raise ValueError("state missing organization")
    return {"uid": data["uid"], "org": data["org"]}


# ── User session tokens (REMOVED) ───────────────────────────────────────────
# There used to be new_user_token()/read_user_token() here: self-issued bearer
# tokens that minted a brand-new random user id on demand — anyone who called
# GET /api/integrations/session got a valid identity. Real authentication now
# comes from Supabase Auth (see backend/auth.py), so they are gone.
