"""Repository for the per-user event-type registry."""

from __future__ import annotations

import json
from typing import Any

import asyncpg

_COLS = "id, user_id, workspace_id, name, description, payload_schema, created_at, updated_at"


def _row(r: asyncpg.Record | None) -> dict[str, Any] | None:
    if r is None:
        return None
    d = dict(r)
    v = d.get("payload_schema")
    if isinstance(v, str):
        try:
            d["payload_schema"] = json.loads(v)
        except (ValueError, TypeError):
            pass
    return d


async def list_for_workspace(pool: asyncpg.Pool, workspace_id: int | None) -> list[dict]:
    rows = await pool.fetch(
        f"SELECT {_COLS} FROM event_types WHERE workspace_id IS NOT DISTINCT FROM $1 ORDER BY name;",
        workspace_id,
    )
    return [_row(r) for r in rows]  # type: ignore[misc]


async def get_by_name(pool: asyncpg.Pool, *, workspace_id: int | None, name: str) -> dict | None:
    return _row(
        await pool.fetchrow(
            f"SELECT {_COLS} FROM event_types "
            f"WHERE workspace_id IS NOT DISTINCT FROM $1 AND name = $2;",
            workspace_id, name,
        )
    )


async def get(pool: asyncpg.Pool, event_type_id: int) -> dict | None:
    return _row(
        await pool.fetchrow(f"SELECT {_COLS} FROM event_types WHERE id = $1;", event_type_id)
    )


async def upsert(
    pool: asyncpg.Pool,
    *,
    user_id: int | None,
    workspace_id: int | None,
    name: str,
    description: str,
    payload_schema: Any | None,
) -> dict:
    """Create or update (by workspace_id+name) an event type."""
    row = await pool.fetchrow(
        f"""
        INSERT INTO event_types (user_id, workspace_id, name, description, payload_schema)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (workspace_id, name) DO UPDATE SET
            description = EXCLUDED.description,
            payload_schema = EXCLUDED.payload_schema,
            updated_at = NOW()
        RETURNING {_COLS};
        """,
        user_id, workspace_id, name, description,
        json.dumps(payload_schema) if payload_schema is not None else None,
    )
    return _row(row)  # type: ignore[return-value]


async def delete(pool: asyncpg.Pool, *, workspace_id: int | None, name: str) -> bool:
    res = await pool.execute(
        "DELETE FROM event_types WHERE workspace_id IS NOT DISTINCT FROM $1 AND name = $2;",
        workspace_id, name,
    )
    return res.endswith("1")
