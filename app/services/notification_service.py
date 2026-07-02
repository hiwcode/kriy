"""Create notifications: persist + push live over the WebSocket hub."""

from __future__ import annotations

import asyncpg

from app.repositories import notification_repo
from app.services import notification_hub


async def notify(
    pool: asyncpg.Pool,
    *,
    user_id: int,
    title: str,
    body: str = "",
    level: str = "info",
    source: str | None = None,
    link: str | None = None,
    workspace_id: int | None = None,
) -> dict:
    """Persist a notification for ``user_id`` and push it to their live connections."""
    row = await notification_repo.create(
        pool,
        user_id=user_id,
        title=title,
        body=body,
        level=level,
        source=source,
        link=link,
        workspace_id=workspace_id,
    )
    unread = await notification_repo.unread_count(pool, user_id)
    await notification_hub.broadcast(
        user_id, {"type": "notification", "notification": row, "unread": unread}
    )
    return row
