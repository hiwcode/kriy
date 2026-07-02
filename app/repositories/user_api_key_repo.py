from __future__ import annotations

import hashlib
import secrets

import asyncpg


def _hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


async def generate_key(pool: asyncpg.Pool, user_id: int) -> tuple[str, str]:
    """
    Generate a new API key for the user. Replaces any existing key.
    Format: ate-{random}. Returns (raw_key, key_prefix). Raw key is shown once; prefix is for display.
    """
    suffix = secrets.token_urlsafe(32)
    raw_key = f"ate-{suffix}"
    key_hash = _hash_key(raw_key)
    key_prefix = "ate-***"

    await pool.execute(
        """
        INSERT INTO user_api_keys (user_id, key_hash, key_prefix)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id) DO UPDATE SET
            key_hash = EXCLUDED.key_hash,
            key_prefix = EXCLUDED.key_prefix;
        """,
        user_id,
        key_hash,
        key_prefix,
    )
    return raw_key, key_prefix


async def get_user_by_key(pool: asyncpg.Pool, raw_key: str) -> int | None:
    """Look up user_id by API key. Returns None if not found."""
    key_hash = _hash_key(raw_key)
    row = await pool.fetchrow(
        "SELECT user_id FROM user_api_keys WHERE key_hash = $1;",
        key_hash,
    )
    return row["user_id"] if row else None


async def get_key_info(pool: asyncpg.Pool, user_id: int) -> dict | None:
    """Get key prefix (for display) and created_at. Does not return the raw key."""
    row = await pool.fetchrow(
        """
        SELECT key_prefix, created_at
        FROM user_api_keys
        WHERE user_id = $1;
        """,
        user_id,
    )
    return dict(row) if row else None


async def revoke_key(pool: asyncpg.Pool, user_id: int) -> bool:
    """Remove the user's API key. Returns True if a key existed."""
    r = await pool.execute(
        "DELETE FROM user_api_keys WHERE user_id = $1;",
        user_id,
    )
    return r.split()[-1] != "0"
