"""In-process WebSocket hub for live notifications.

Tracks active WebSocket connections per user and pushes JSON payloads to them.
Single-process (one uvicorn worker) — fine for dev; a multi-worker deployment would
need a shared pub/sub (e.g. Redis) behind the same interface.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

# user_id -> set of connected WebSockets
_connections: dict[int, set[Any]] = {}
_lock = asyncio.Lock()


async def register(user_id: int, websocket: Any) -> None:
    async with _lock:
        _connections.setdefault(user_id, set()).add(websocket)
    logger.info("Notification WS connected: user=%s (total=%d)", user_id, _count(user_id))


async def unregister(user_id: int, websocket: Any) -> None:
    async with _lock:
        conns = _connections.get(user_id)
        if conns:
            conns.discard(websocket)
            if not conns:
                _connections.pop(user_id, None)


def _count(user_id: int) -> int:
    return len(_connections.get(user_id, ()))


async def broadcast(user_id: int, payload: dict[str, Any]) -> None:
    """Send a JSON payload to all of a user's live connections (best-effort)."""
    conns = list(_connections.get(user_id, ()))
    if not conns:
        return
    data = json.dumps(payload, default=str)
    dead = []
    for ws in conns:
        try:
            await ws.send_text(data)
        except Exception:  # noqa: BLE001 — drop broken sockets
            dead.append(ws)
    for ws in dead:
        await unregister(user_id, ws)
