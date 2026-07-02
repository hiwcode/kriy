"""Notify tool for agents — push an in-app notification to the agent's owner.

Delivered live over the notifications WebSocket (and persisted for history).
"""

from __future__ import annotations

import json
import logging

import asyncpg
from google.adk.tools import FunctionTool

from app.services import notification_service

logger = logging.getLogger(__name__)


def make_notify_tools(
    pool: asyncpg.Pool,
    user_id: int | None,
    workspace_id: int | None = None,
    source: str | None = None,
) -> list[FunctionTool]:
    """Create the notify tool with pool + owner context baked in."""

    async def notify(title: str, body: str = "", level: str = "info") -> str:
        """Send an in-app notification to the user.

        Use this to alert the user about something noteworthy (a task finished, a
        threshold crossed, an action needed). It appears live in their notification bell.

        Args:
            title: Short headline for the notification.
            body: Optional detail text.
            level: One of 'info', 'success', 'warning', 'error' (controls the styling).
        """
        if user_id is None:
            return json.dumps({"error": "no user context"})
        try:
            row = await notification_service.notify(
                pool,
                user_id=user_id,
                title=title,
                body=body,
                level=level,
                source=source,
                workspace_id=workspace_id,
            )
            return json.dumps({"success": True, "notification_id": row["id"]})
        except Exception as e:  # noqa: BLE001
            return json.dumps({"error": str(e)})

    return [FunctionTool(func=notify)]
