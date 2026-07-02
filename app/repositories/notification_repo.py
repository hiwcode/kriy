"""Repository for in-app notifications."""

from __future__ import annotations

from typing import Any

import asyncpg

_COLS = "id, user_id, workspace_id, title, body, level, source, link, read, created_at"

_VALID_LEVELS = {"info", "success", "warning", "error"}


async def create(
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
    if level not in _VALID_LEVELS:
        level = "info"
    row = await pool.fetchrow(
        f"""
        INSERT INTO notifications (user_id, workspace_id, title, body, level, source, link)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING {_COLS};
        """,
        user_id, workspace_id, title, body, level, source, link,
    )
    return dict(row)


async def list_for_user(
    pool: asyncpg.Pool,
    user_id: int,
    *,
    limit: int = 50,
    offset: int = 0,
    unread_only: bool = False,
) -> tuple[list[dict], int]:
    """Return (items, total) for the user, newest first."""
    where = "WHERE user_id = $1" + (" AND read = FALSE" if unread_only else "")
    total = int(
        await pool.fetchval(f"SELECT COUNT(*) FROM notifications {where};", user_id) or 0
    )
    rows = await pool.fetch(
        f"SELECT {_COLS} FROM notifications {where} "
        f"ORDER BY created_at DESC LIMIT $2 OFFSET $3;",
        user_id, limit, offset,
    )
    return [dict(r) for r in rows], total


async def unread_count(pool: asyncpg.Pool, user_id: int) -> int:
    return int(
        await pool.fetchval(
            "SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = FALSE;",
            user_id,
        )
        or 0
    )


async def mark_read(pool: asyncpg.Pool, notification_id: int, user_id: int) -> bool:
    res = await pool.execute(
        "UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2;",
        notification_id, user_id,
    )
    return res.endswith("1")


async def mark_all_read(pool: asyncpg.Pool, user_id: int) -> int:
    res = await pool.execute(
        "UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE;",
        user_id,
    )
    # res like "UPDATE 5"
    try:
        return int(res.split()[-1])
    except (ValueError, IndexError):
        return 0
