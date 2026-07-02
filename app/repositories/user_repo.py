from __future__ import annotations

from typing import Any

import asyncpg

from app.schemas.user import UserCreate, UserUpdate


def _row_to_dict(row: asyncpg.Record | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


async def create_user(pool: asyncpg.Pool, user_in: UserCreate) -> dict[str, Any]:
    query = """
    INSERT INTO users (email, full_name, is_active)
    VALUES ($1, $2, $3)
    RETURNING id, email, full_name, is_active, created_at, updated_at;
    """
    row = await pool.fetchrow(query, user_in.email, user_in.full_name, user_in.is_active)
    return _row_to_dict(row) or {}


async def get_or_create_user_by_email(
    pool: asyncpg.Pool, email: str, full_name: str | None = None
) -> dict[str, Any]:
    """Get user by email, or create if not exists."""
    row = await pool.fetchrow(
        """
        INSERT INTO users (email, full_name, is_active)
        VALUES ($1, COALESCE($2, $1), TRUE)
        ON CONFLICT (email) DO UPDATE SET
            full_name = COALESCE(EXCLUDED.full_name, users.full_name),
            updated_at = NOW()
        RETURNING id, email, full_name, is_active, created_at, updated_at;
        """,
        email,
        full_name,
    )
    return _row_to_dict(row) or {}


async def get_user(pool: asyncpg.Pool, user_id: int) -> dict[str, Any] | None:
    query = """
    SELECT id, email, full_name, is_active, created_at, updated_at
    FROM users
    WHERE id = $1;
    """
    row = await pool.fetchrow(query, user_id)
    return _row_to_dict(row)


async def list_users(pool: asyncpg.Pool, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
    query = """
    SELECT id, email, full_name, is_active, created_at, updated_at
    FROM users
    ORDER BY id
    LIMIT $1 OFFSET $2;
    """
    rows = await pool.fetch(query, limit, offset)
    return [dict(row) for row in rows]


async def count_users(pool: asyncpg.Pool) -> int:
    query = "SELECT COUNT(*) FROM users;"
    return int(await pool.fetchval(query))


async def update_user(
    pool: asyncpg.Pool, user_id: int, user_in: UserUpdate
) -> dict[str, Any] | None:
    data = user_in.model_dump(exclude_unset=True)
    if not data:
        return await get_user(pool, user_id)

    set_clauses: list[str] = []
    values: list[Any] = []
    index = 1
    for field in ("email", "full_name", "is_active"):
        if field in data:
            set_clauses.append(f"{field} = ${index}")
            values.append(data[field])
            index += 1

    set_clauses.append("updated_at = NOW()")
    query = f"""
    UPDATE users
    SET {', '.join(set_clauses)}
    WHERE id = ${index}
    RETURNING id, email, full_name, is_active, created_at, updated_at;
    """
    values.append(user_id)
    row = await pool.fetchrow(query, *values)
    return _row_to_dict(row)


async def delete_user(pool: asyncpg.Pool, user_id: int) -> bool:
    query = "DELETE FROM users WHERE id = $1;"
    result = await pool.execute(query, user_id)
    return result.startswith("DELETE") and not result.endswith("0")
