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


async def get_session_any_state(pool: asyncpg.Pool, refresh_hash: str) -> dict | None:
    """Return the session regardless of revoked/expired — for reuse detection."""
    row = await pool.fetchrow(
        """
        SELECT id, user_id, expires_at, revoked, revoked_at
          FROM user_sessions
         WHERE refresh_hash = $1;
        """,
        refresh_hash,
    )
    return dict(row) if row else None


async def revoke_session(pool: asyncpg.Pool, refresh_hash: str) -> bool:
    res = await pool.execute(
        "UPDATE user_sessions SET revoked = TRUE, revoked_at = NOW() WHERE refresh_hash = $1;",
        refresh_hash,
    )
    return res.endswith("1")


async def revoke_all_for_user(pool: asyncpg.Pool, user_id: int) -> int:
    """Revoke every active session for a user (used on detected token reuse)."""
    res = await pool.execute(
        "UPDATE user_sessions SET revoked = TRUE, revoked_at = NOW() "
        "WHERE user_id = $1 AND revoked = FALSE;",
        user_id,
    )
    # res like "UPDATE N"
    try:
        return int(res.split()[-1])
    except (ValueError, IndexError):
        return 0


async def rotate_session(
    pool: asyncpg.Pool, *, old_hash: str, user_id: int, new_hash: str, ttl_days: int
) -> None:
    """Atomically revoke the presented refresh token and issue a fresh one."""
    expires_at = datetime.now(timezone.utc) + timedelta(days=ttl_days)
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "UPDATE user_sessions SET revoked = TRUE, revoked_at = NOW() WHERE refresh_hash = $1;",
                old_hash,
            )
            await conn.execute(
                "INSERT INTO user_sessions (user_id, refresh_hash, expires_at) VALUES ($1, $2, $3);",
                user_id, new_hash, expires_at,
            )
