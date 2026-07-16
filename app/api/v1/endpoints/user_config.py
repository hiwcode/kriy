from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

import asyncpg

from app.core.security import AuthContext, api_key_auth, get_auth_context, require_google_auth
from app.deps import get_db
from app.repositories import user_config_repo, user_api_key_repo
from typing import Any

from app.schemas.response import ApiResponse
from app.schemas.user_config import UserConfigUpdate

router = APIRouter(
    prefix="/user-config",
    tags=["user-config"],
    dependencies=[Depends(api_key_auth)],
)

# Secret fields are write-only: never echoed back to the client or cached in
# Redis in plaintext (that would defeat encryption-at-rest). We return a
# boolean `<field>_set` so the UI can still show "configured".
_SECRET_FIELDS = (
    "google_api_key", "openai_api_key", "anthropic_api_key", "opik_api_key",
    "slack_bot_token", "slack_signing_secret", "slack_app_token", "gmail_app_password",
)


def _redact_secrets(config: dict) -> dict:
    out = dict(config)
    for f in _SECRET_FIELDS:
        if f in out:
            out[f"{f}_set"] = bool(out.get(f))
            out[f] = None
    return out


@router.get("/", response_model=ApiResponse)
async def get_config(
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
) -> dict:
    """Get current user's config. Requires Google auth."""
    if auth.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google sign-in required",
        )
    from app.core import cache

    cached = await cache.get(f"user_config:{auth.user_id}")
    if cached is not None:
        return {"success": True, "message": "Config fetched", "data": cached, "pagination": None}

    config = await user_config_repo.get_config(pool, auth.user_id)
    if not config:
        config = {
            "user_id": auth.user_id,
            "google_api_key": None,
            "openai_api_key": None,
            "anthropic_api_key": None,
            "default_model": "gemini-3.1-flash-lite",
            "opik_api_key": None,
            "opik_workspace": None,
            "opik_project_name": "atelier",
            "opik_url_override": None,
            "opik_enabled": False,
            "slack_bot_token": None,
            "slack_signing_secret": None,
            "slack_app_token": None,
            "slack_bot_user_id": None,
            "slack_default_channel": None,
            "slack_default_agent_id": None,
            "slack_enabled": False,
            "gmail_address": None,
            "gmail_app_password": None,
        }
    config = _redact_secrets(config)
    await cache.set(f"user_config:{auth.user_id}", config, ttl=600)
    return {
        "success": True,
        "message": "Config fetched",
        "data": config,
        "pagination": None,
    }


@router.patch("/", response_model=ApiResponse)
async def update_config(
    data: UserConfigUpdate,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
) -> dict:
    """Update current user's config. Requires Google auth."""
    if auth.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google sign-in required",
        )
    payload = data.model_dump(exclude_unset=True)
    kwargs: dict[str, Any] = {"pool": pool, "user_id": auth.user_id}
    if "google_api_key" in payload:
        kwargs["google_api_key"] = payload["google_api_key"]
    if "openai_api_key" in payload:
        kwargs["openai_api_key"] = payload["openai_api_key"]
    if "anthropic_api_key" in payload:
        kwargs["anthropic_api_key"] = payload["anthropic_api_key"]
    if "default_model" in payload:
        kwargs["default_model"] = payload["default_model"]
    for field in (
        "opik_api_key",
        "opik_workspace",
        "opik_project_name",
        "opik_url_override",
        "opik_enabled",
        "slack_bot_token",
        "slack_signing_secret",
        "slack_app_token",
        "slack_bot_user_id",
        "slack_default_channel",
        "slack_default_agent_id",
        "slack_enabled",
        "gmail_address",
        "gmail_app_password",
    ):
        if field in payload:
            kwargs[field] = payload[field]
    config = await user_config_repo.upsert_config(**kwargs)
    from app.core import cache
    await cache.delete(f"user_config:{auth.user_id}")
    return {
        "success": True,
        "message": "Config updated",
        "data": _redact_secrets(config) if config else config,
        "pagination": None,
    }


@router.post("/api-key/generate", response_model=ApiResponse)
async def generate_api_key(
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Generate or regenerate a user API key. Returns the raw key once - copy it now."""
    raw_key, key_prefix = await user_api_key_repo.generate_key(pool, auth.user_id)
    return {
        "success": True,
        "message": "API key generated. Copy it now - it will not be shown again.",
        "data": {
            "api_key": raw_key,
            "key_prefix": key_prefix,
        },
        "pagination": None,
    }


@router.get("/api-key", response_model=ApiResponse)
async def get_api_key_info(
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Get API key info (prefix for display). Does not return the raw key."""
    info = await user_api_key_repo.get_key_info(pool, auth.user_id)
    return {
        "success": True,
        "message": "API key info",
        "data": info or {"key_prefix": None, "created_at": None},
        "pagination": None,
    }


@router.delete("/api-key", response_model=ApiResponse)
async def revoke_api_key(
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Revoke the user's API key."""
    await user_api_key_repo.revoke_key(pool, auth.user_id)
    return {
        "success": True,
        "message": "API key revoked",
        "data": None,
        "pagination": None,
    }
