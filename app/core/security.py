from __future__ import annotations

from dataclasses import dataclass

import asyncpg
from fastapi import Depends, Header, HTTPException, status

from app.db.get_db import get_db
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.core.config import settings


def _parse_api_keys(raw_keys: str) -> set[str]:
    return {key.strip() for key in raw_keys.split(",") if key.strip()}


@dataclass
class AuthContext:
    """Auth result: user_id when Google auth, None for API key."""

    user_id: int | None
    auth_type: str  # "api_key" | "google"
    email: str | None


async def api_key_auth(
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    authorization: str | None = Header(None),
    pool: asyncpg.Pool = Depends(get_db),
) -> str:
    """
    Accept either X-API-Key or Authorization: Bearer <google_id_token>.
    Returns auth identifier: 'api_key', 'user_api_key:{user_id}', or 'google:{email}'.
    """
    expected_keys = _parse_api_keys(settings.API_KEYS)

    # 1. Bearer token: our own session access token first (fast, local), then Google.
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Bearer token",
            )
        # Backend-issued access token (no network, no Google/FedCM dependency).
        from app.core.auth_tokens import verify_access_token

        claims = verify_access_token(token)
        if claims and claims.get("sub"):
            return f"session:{claims['sub']}"

        client_id = settings.GOOGLE_CLIENT_ID
        if not client_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Google OAuth not configured (GOOGLE_CLIENT_ID)",
            )
        try:
            idinfo = id_token.verify_oauth2_token(
                token,
                google_requests.Request(),
                client_id,
            )
            email = idinfo.get("email") or idinfo.get("sub", "unknown")
            return f"google:{email}"
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired Google token",
            ) from e
        except Exception as e:
            # Network error (TransportError, ConnectionError) when fetching Google certs
            err_name = type(e).__name__
            if "Transport" in err_name or "Connection" in err_name or "MaxRetry" in err_name:
                # Fall back to API key when present (e.g. offline / DNS issues)
                if x_api_key and expected_keys and x_api_key in expected_keys:
                    return x_api_key
                if x_api_key and pool:
                    from app.repositories import user_api_key_repo
                    user_id = await user_api_key_repo.get_user_by_key(pool, x_api_key)
                    if user_id is not None:
                        return f"user_api_key:{user_id}"
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Unable to verify Google token (network unavailable). Please check your connection or use API key.",
                ) from e
            raise

    # 2. Global API key auth
    if x_api_key and expected_keys and x_api_key in expected_keys:
        return x_api_key

    # 3. Per-user API key auth
    if x_api_key and pool:
        from app.repositories import user_api_key_repo
        user_id = await user_api_key_repo.get_user_by_key(pool, x_api_key)
        if user_id is not None:
            return f"user_api_key:{user_id}"

    # No valid auth
    if not expected_keys and not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No auth configured (API_KEYS or GOOGLE_CLIENT_ID)",
        )
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid API key or missing Authorization",
    )


async def get_auth_context(
    auth_id: str = Depends(api_key_auth),
    pool: asyncpg.Pool = Depends(get_db),
) -> AuthContext:
    """Resolve auth to AuthContext with user_id for Google or per-user API key auth."""
    if auth_id.startswith("user_api_key:"):
        try:
            user_id = int(auth_id.split(":", 1)[1])
            return AuthContext(
                user_id=user_id,
                auth_type="api_key",
                email=None,
            )
        except (ValueError, IndexError):
            pass
    if auth_id.startswith("session:"):
        try:
            return AuthContext(
                user_id=int(auth_id.split(":", 1)[1]),
                auth_type="session",
                email=None,
            )
        except (ValueError, IndexError):
            pass
    if auth_id.startswith("google:") and pool:
        email = auth_id[7:]
        try:
            from app.repositories import user_repo

            user = await user_repo.get_or_create_user_by_email(pool, email)
            return AuthContext(
                user_id=user["id"],
                auth_type="google",
                email=email,
            )
        except Exception:
            pass
        return AuthContext(user_id=None, auth_type="google", email=email)
    return AuthContext(user_id=None, auth_type="api_key", email=None)


async def require_google_auth(
    auth: AuthContext = Depends(get_auth_context),
) -> AuthContext:
    """Require Google sign-in (user_id must be set). Raises 401 if API key only."""
    if auth.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google sign-in required",
        )
    return auth
