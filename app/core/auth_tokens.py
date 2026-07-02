"""Backend-issued session tokens.

Access token: a short-lived JWT we sign (HS256) — verified locally on every request,
no Google/network call. Refresh token: an opaque random string stored hashed in
``user_sessions``, exchanged for new access tokens. This removes the dependency on
Google's ID-token lifetime + FedCM for keeping a session alive.
"""

from __future__ import annotations

import hashlib
import secrets
import time

import jwt

from app.core.config import settings

_ALGO = "HS256"


def _secret() -> str:
    return settings.JWT_SECRET or settings.ENCRYPTION_KEY or "dev-insecure-change-me"


def create_access_token(user_id: int, email: str | None = None) -> tuple[str, int]:
    """Return (jwt, expires_in_seconds)."""
    ttl = max(60, settings.ACCESS_TOKEN_TTL_MINUTES * 60)
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "email": email,
        "type": "access",
        "iat": now,
        "exp": now + ttl,
    }
    return jwt.encode(payload, _secret(), algorithm=_ALGO), ttl


def verify_access_token(token: str) -> dict | None:
    """Return claims for a valid access token we issued, else None."""
    try:
        claims = jwt.decode(token, _secret(), algorithms=[_ALGO])
    except Exception:  # noqa: BLE001 — invalid/expired/tampered
        return None
    if claims.get("type") != "access":
        return None
    return claims


def new_refresh_token() -> tuple[str, str]:
    """Return (raw_token, sha256_hash). Store the hash; hand the raw to the client."""
    raw = secrets.token_urlsafe(48)
    return raw, hash_refresh(raw)


def hash_refresh(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()
