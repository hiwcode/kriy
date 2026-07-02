"""Repository for backend session refresh tokens (user_sessions)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import asyncpg


async def create_session(
    pool: asyncpg.Pool, *, user_id: int, refresh_hash: str, ttl_days: int
) -> None:
    expires_at = datetime.now(timezone.utc) + timedelta(days=ttl_days)
    await pool.execute(
        """
        INSERT INTO user_sessions (user_id, refresh_hash, expires_at)
        VALUES ($1, $2, $3);
        """,
        user_id, refresh_hash, expires_at,
    )


async def get_valid_session(pool: asyncpg.Pool, refresh_hash: str) -> dict | None:
    """Return the session if it exists, isn't revoked, and hasn't expired."""
    row = await pool.fetchrow(
        """
        SELECT id, user_id, expires_at, revoked
          FROM user_sessions
         WHERE refresh_hash = $1
           AND revoked = FALSE
           AND expires_at > NOW();
        """,
        refresh_hash,
    )
    return dict(row) if row else None


async def touch_session(pool: asyncpg.Pool, refresh_hash: str) -> None:
    await pool.execute(
        "UPDATE user_sessions SET last_used_at = NOW() WHERE refresh_hash = $1;",
        refresh_hash,
    )


async def revoke_session(pool: asyncpg.Pool, refresh_hash: str) -> bool:
    res = await pool.execute(
        "UPDATE user_sessions SET revoked = TRUE WHERE refresh_hash = $1;",
        refresh_hash,
    )
    return res.endswith("1")
