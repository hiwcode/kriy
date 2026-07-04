"""In-app notifications: REST history + a WebSocket for live delivery.

The WebSocket can't carry the usual auth headers from a browser, so it authenticates
via a query param: ``?token=<google id token>`` or ``?api_key=<per-user key>``.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import asyncpg
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.security import AuthContext, api_key_auth, require_google_auth
from app.deps import get_current_workspace, get_db
from app.repositories import notification_repo
from app.schemas.response import ApiResponse, Pagination
from app.services import notification_hub, notification_service

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/notifications",
    tags=["notifications"],
    dependencies=[Depends(api_key_auth)],
)
# WebSocket lives on its own router (no header-based auth dependency).
ws_router = APIRouter(tags=["notifications"])


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #


class NotificationOut(BaseModel):
    id: int
    title: str
    body: str
    level: str
    source: str | None = None
    link: str | None = None
    read: bool
    created_at: Any = None


class NotificationCreate(BaseModel):
    title: str = Field(..., min_length=1)
    body: str = ""
    level: str = "info"
    source: str | None = None
    link: str | None = None


# --------------------------------------------------------------------------- #
# REST  (standard ApiResponse envelope: { success, message, data, pagination })
# --------------------------------------------------------------------------- #


@router.get("", response_model=ApiResponse)
async def list_notifications(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    unread_only: bool = Query(False),
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    items, total = await notification_repo.list_for_user(
        pool, auth.user_id, limit=limit, offset=offset, unread_only=unread_only
    )
    page = (offset // limit) + 1 if limit else 1
    return {
        "success": True,
        "message": "Notifications fetched",
        "data": items,
        "pagination": Pagination(
            limit=limit, offset=offset, total=total, page=page, page_size=limit
        ),
    }


@router.get("/unread-count", response_model=ApiResponse)
async def unread_count(
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    n = await notification_repo.unread_count(pool, auth.user_id)
    return {"success": True, "message": "Unread count", "data": {"unread": n}, "pagination": None}


@router.post("", response_model=ApiResponse)
async def create_notification(
    data: NotificationCreate,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    """Send yourself a notification (also used by integrations to notify a user)."""
    row = await notification_service.notify(
        pool,
        user_id=auth.user_id,
        title=data.title,
        body=data.body,
        level=data.level,
        source=data.source,
        link=data.link,
        workspace_id=workspace["id"] if workspace else None,
    )
    return {"success": True, "message": "Notification created", "data": row, "pagination": None}


@router.post("/{notification_id}/read", response_model=ApiResponse)
async def mark_read(
    notification_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    ok = await notification_repo.mark_read(pool, notification_id, auth.user_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    return {"success": True, "message": "Marked read", "data": {"id": notification_id}, "pagination": None}


@router.post("/read-all", response_model=ApiResponse)
async def mark_all_read(
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    n = await notification_repo.mark_all_read(pool, auth.user_id)
    return {"success": True, "message": "Marked all read", "data": {"read": n}, "pagination": None}


# --------------------------------------------------------------------------- #
# WebSocket
# --------------------------------------------------------------------------- #


async def _resolve_ws_user(
    pool: asyncpg.Pool, token: str | None, api_key: str | None
) -> int | None:
    """Resolve a user id from a WS query token (per-user API key, backend JWT, or Google id token)."""
    if api_key:
        from app.repositories import user_api_key_repo

        uid = await user_api_key_repo.get_user_by_key(pool, api_key)
        if uid is not None:
            return uid
    if token:
        # 1) Try our own backend-issued JWT access token first.
        from app.core.auth_tokens import verify_access_token

        claims = verify_access_token(token)
        if claims and claims.get("sub"):
            try:
                return int(claims["sub"])
            except (ValueError, TypeError):
                pass

        # 2) Fall back to Google OAuth ID token.
        if settings.GOOGLE_CLIENT_ID:
            try:
                idinfo = id_token.verify_oauth2_token(
                    token, google_requests.Request(), settings.GOOGLE_CLIENT_ID
                )
                email = idinfo.get("email") or idinfo.get("sub")
                if email:
                    from app.repositories import user_repo

                    user = await user_repo.get_or_create_user_by_email(pool, email)
                    return user["id"]
            except Exception:  # noqa: BLE001 — invalid token
                pass
    return None


@ws_router.websocket("/notifications/ws")
async def notifications_ws(
    websocket: WebSocket,
    token: str | None = Query(None),
    api_key: str | None = Query(None),
) -> None:
    # WebSocket routes have no Request, so get the pool from app state directly
    # (Depends(get_db) requires a Request and fails on WS).
    pool: asyncpg.Pool | None = websocket.app.state.db_pool
    if pool is None:
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
        return
    user_id = await _resolve_ws_user(pool, token, api_key)
    if user_id is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    await notification_hub.register(user_id, websocket)
    try:
        # Send the current unread count on connect.
        unread = await notification_repo.unread_count(pool, user_id)
        await websocket.send_text(json.dumps({"type": "unread", "unread": unread}))
        # Keep the socket open; ignore any client messages (used as keepalive).
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        pass
    finally:
        await notification_hub.unregister(user_id, websocket)
