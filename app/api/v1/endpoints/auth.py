"""Session auth: exchange a Google credential for our own access + refresh tokens.

This decouples the session from Google's ID-token lifetime + FedCM. The frontend
signs in with Google once, exchanges the credential here, then uses our access JWT
(refreshed via /auth/refresh) for all requests.
"""

from __future__ import annotations

from datetime import datetime, timezone

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from pydantic import BaseModel, Field

from app.core.audit import set_actor
from app.core.auth_tokens import (
    create_access_token,
    hash_refresh,
    new_refresh_token,
)
from app.core.config import settings
from app.core.rate_limit import rate_limit
from app.db.get_db import get_db
from app.repositories import auth_session_repo, user_repo

# Auth endpoints are unauthenticated and relatively expensive (Google token
# verification / DB writes) — cap per-IP to blunt credential-stuffing & abuse.
router = APIRouter(
    prefix="/auth",
    tags=["auth"],
    dependencies=[rate_limit(20, 60, "auth")],
)


class GoogleExchangeRequest(BaseModel):
    credential: str = Field(..., min_length=1, description="Google ID token from Sign-In")


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., min_length=1)


class LogoutRequest(BaseModel):
    refresh_token: str = Field(..., min_length=1)


def _verify_google(credential: str) -> dict:
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google OAuth not configured (GOOGLE_CLIENT_ID)",
        )
    try:
        return id_token.verify_oauth2_token(
            credential, google_requests.Request(), settings.GOOGLE_CLIENT_ID
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired Google token"
        ) from e


@router.post("/google")
async def exchange_google(
    data: GoogleExchangeRequest,
    request: Request,
    pool: asyncpg.Pool = Depends(get_db),
) -> dict:
    """Verify a Google credential, upsert the user, and issue a session."""
    idinfo = _verify_google(data.credential)
    email = idinfo.get("email") or idinfo.get("sub")
    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No email in token")
    name = idinfo.get("name") or email
    picture = idinfo.get("picture")

    user = await user_repo.get_or_create_user_by_email(pool, email, full_name=name)
    set_actor(request, user_id=user["id"], email=email)
    access, expires_in = create_access_token(user["id"], email)
    raw_refresh, refresh_hash = new_refresh_token()
    await auth_session_repo.create_session(
        pool, user_id=user["id"], refresh_hash=refresh_hash,
        ttl_days=settings.REFRESH_TOKEN_TTL_DAYS,
    )
    return {
        "access_token": access,
        "refresh_token": raw_refresh,
        "expires_in": expires_in,
        "user": {"email": email, "name": name, "picture": picture},
    }


# Grace window: a refresh token revoked within this many seconds is treated as a
# benign concurrent refresh (e.g. two browser tabs), not as token theft.
_REFRESH_REUSE_GRACE_SECONDS = 60


@router.post("/refresh")
async def refresh(
    data: RefreshRequest,
    request: Request,
    pool: asyncpg.Pool = Depends(get_db),
) -> dict:
    """Exchange a refresh token for a fresh access token AND a rotated refresh token.

    The presented refresh token is single-use: it is revoked and replaced on every
    call. Presenting an already-revoked token means either a concurrent refresh
    (tolerated within a short grace window) or token theft — in the latter case the
    whole session family is revoked, forcing re-authentication.
    """
    h = hash_refresh(data.refresh_token)
    session = await auth_session_repo.get_valid_session(pool, h)
    if not session:
        # Distinguish a benign race from genuine reuse of a dead token.
        stale = await auth_session_repo.get_session_any_state(pool, h)
        if stale and stale.get("revoked"):
            revoked_at = stale.get("revoked_at")
            age = (datetime.now(timezone.utc) - revoked_at).total_seconds() if revoked_at else 1e9
            if age > _REFRESH_REUSE_GRACE_SECONDS:
                # Token reuse well after rotation → treat as compromise.
                await auth_session_repo.revoke_all_for_user(pool, stale["user_id"])
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token"
        )

    user = await user_repo.get_user(pool, session["user_id"])
    email = user.get("email") if user else None
    set_actor(request, user_id=session["user_id"], email=email)

    access, expires_in = create_access_token(session["user_id"], email)
    raw_refresh, refresh_hash = new_refresh_token()
    await auth_session_repo.rotate_session(
        pool, old_hash=h, user_id=session["user_id"],
        new_hash=refresh_hash, ttl_days=settings.REFRESH_TOKEN_TTL_DAYS,
    )
    return {"access_token": access, "refresh_token": raw_refresh, "expires_in": expires_in}


@router.post("/logout")
async def logout(
    data: LogoutRequest,
    request: Request,
    pool: asyncpg.Pool = Depends(get_db),
) -> dict:
    """Revoke a refresh token."""
    h = hash_refresh(data.refresh_token)
    # Capture who is logging out (for the audit log) before the session is gone.
    session = await auth_session_repo.get_valid_session(pool, h)
    if session:
        user = await user_repo.get_user(pool, session["user_id"])
        set_actor(
            request,
            user_id=session["user_id"],
            email=user.get("email") if user else None,
        )
    await auth_session_repo.revoke_session(pool, h)
    return {"success": True}
