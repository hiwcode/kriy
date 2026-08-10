"""Outbound webhook subscriptions — manage where KRIY delivers platform events.

See docs/outbound-webhooks-design.md. The subscription secret is shown only once
(on create / rotate); afterwards only a hint is returned.
"""

from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.core.net_guard import assert_public_url
from app.core.security import AuthContext, api_key_auth, require_google_auth
from app.deps import get_current_workspace, get_db
from app.repositories import webhook_repo
from app.schemas.response import ApiResponse
from app.services import webhook_service

router = APIRouter(prefix="/webhooks", tags=["webhooks"], dependencies=[Depends(api_key_auth)])


class WebhookIn(BaseModel):
    url: str = Field(..., min_length=1)
    event_types: list[str] = Field(
        default_factory=lambda: ["run.completed"],
        description="Event type globs to subscribe to, e.g. ['run.completed', 'gate.*']",
        min_length=1,
    )


class WebhookUpdate(WebhookIn):
    enabled: bool = True


def _ws_id(workspace: dict | None) -> int | None:
    return workspace["id"] if workspace else None


def _public(sub: dict, *, reveal_secret: str | None = None) -> dict:
    out = {
        k: sub[k] for k in ("id", "workspace_id", "user_id", "url", "event_types", "enabled", "created_at")
    }
    secret = sub.get("secret") or ""
    out["secret_hint"] = ("…" + secret[-6:]) if secret else None
    if reveal_secret:
        out["secret"] = reveal_secret  # shown once
    return out


def _clean_events(event_types: list[str]) -> list[str]:
    cleaned = [e.strip() for e in (event_types or []) if e and e.strip()]
    return cleaned or ["run.completed"]


def _validate_url(url: str) -> None:
    try:
        assert_public_url(url)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


async def _owned(sub_id: int, pool: asyncpg.Pool, workspace: dict | None) -> dict:
    sub = await webhook_repo.get(pool, sub_id)
    if not sub or sub.get("workspace_id") != _ws_id(workspace):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")
    return sub


@router.get("", response_model=ApiResponse)
async def list_webhooks(
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    subs = await webhook_repo.list_for_workspace(pool, _ws_id(workspace))
    return {"success": True, "message": "Webhooks fetched", "data": [_public(s) for s in subs], "pagination": None}


@router.post("", response_model=ApiResponse)
async def create_webhook(
    data: WebhookIn,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    _validate_url(data.url)
    secret = webhook_service.new_secret()
    sub = await webhook_repo.create(
        pool, workspace_id=_ws_id(workspace), user_id=auth.user_id,
        url=data.url, secret=secret, event_types=_clean_events(data.event_types),
    )
    return {"success": True, "message": "Webhook created", "data": _public(sub, reveal_secret=secret), "pagination": None}


@router.put("/{sub_id}", response_model=ApiResponse)
async def update_webhook(
    sub_id: int,
    data: WebhookUpdate,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    await _owned(sub_id, pool, workspace)
    _validate_url(data.url)
    updated = await webhook_repo.update(pool, sub_id, url=data.url, event_types=_clean_events(data.event_types), enabled=data.enabled)
    return {"success": True, "message": "Webhook updated", "data": _public(updated), "pagination": None}


@router.post("/{sub_id}/rotate-secret", response_model=ApiResponse)
async def rotate_secret(
    sub_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    await _owned(sub_id, pool, workspace)
    secret = webhook_service.new_secret()
    sub = await webhook_repo.rotate_secret(pool, sub_id, secret)
    return {"success": True, "message": "Secret rotated", "data": _public(sub, reveal_secret=secret), "pagination": None}


@router.delete("/{sub_id}", response_model=ApiResponse)
async def delete_webhook(
    sub_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    await _owned(sub_id, pool, workspace)
    await webhook_repo.delete(pool, sub_id)
    return {"success": True, "message": "Webhook deleted", "data": {"id": sub_id}, "pagination": None}


@router.get("/{sub_id}/deliveries", response_model=ApiResponse)
async def list_deliveries(
    sub_id: int,
    limit: int = Query(100, ge=1, le=500),
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    await _owned(sub_id, pool, workspace)
    rows = await webhook_repo.list_deliveries(pool, sub_id, limit=limit)
    return {"success": True, "message": "Deliveries fetched", "data": rows, "pagination": None}


@router.post("/deliveries/{delivery_id}/replay", response_model=ApiResponse)
async def replay_delivery(
    delivery_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    delivery = await webhook_repo.get_delivery(pool, delivery_id)
    if delivery:
        await _owned(delivery["subscription_id"], pool, workspace)  # scope check
    sub = await webhook_service.replay(pool, delivery_id)
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delivery not found")
    return {"success": True, "message": "Delivery replayed", "data": {"delivery_id": delivery_id}, "pagination": None}
