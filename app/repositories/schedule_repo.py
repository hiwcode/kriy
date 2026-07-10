"""Repository for schedule CRUD operations."""
from __future__ import annotations

from typing import Any
from datetime import datetime, timezone

import asyncpg


def _row_to_dict(row: asyncpg.Record | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


_SELECT_FIELDS = (
    "id, name, description, agent_id, message, schedule_type, cron_expression, "
    "run_at, next_run_at, last_run_at, last_run_status, last_run_result, "
    "status, run_count, max_runs, max_retries, retry_count, retry_delay_seconds, "
    "next_retry_at, workspace_id, created_by, created_at, updated_at"
)


async def create_schedule(
    pool: asyncpg.Pool,
    *,
    name: str,
    agent_id: int,
    message: str,
    schedule_type: str = "one_time",
    cron_expression: str | None = None,
    run_at: datetime | None = None,
    next_run_at: datetime | None = None,
    max_runs: int | None = None,
    max_retries: int = 0,
    retry_delay_seconds: int = 60,
    description: str | None = None,
    workspace_id: int | None = None,
    created_by: int | None = None,
) -> dict[str, Any]:
    sql = f"""
        INSERT INTO schedules (name, description, agent_id, message, schedule_type,
            cron_expression, run_at, next_run_at, max_runs, max_retries, retry_delay_seconds,
            workspace_id, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING {_SELECT_FIELDS}
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            sql, name, description, agent_id, message, schedule_type,
            cron_expression, run_at, next_run_at, max_runs, max_retries,
            retry_delay_seconds, workspace_id, created_by,
        )
    return _row_to_dict(row)


async def get_schedule(pool: asyncpg.Pool, schedule_id: int) -> dict[str, Any] | None:
    sql = f"SELECT {_SELECT_FIELDS} FROM schedules WHERE id = $1"
    async with pool.acquire() as conn:
        row = await conn.fetchrow(sql, schedule_id)
    return _row_to_dict(row)


async def list_schedules(
    pool: asyncpg.Pool,
    *,
    workspace_id: int | None = None,
    created_by: int | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    conditions = []
    params: list[Any] = []
    idx = 1

    if workspace_id is not None:
        conditions.append(f"s.workspace_id = ${idx}")
        params.append(workspace_id)
        idx += 1
    if created_by is not None:
        conditions.append(f"s.created_by = ${idx}")
        params.append(created_by)
        idx += 1
    if status is not None:
        conditions.append(f"s.status = ${idx}")
        params.append(status)
        idx += 1

    where = " AND ".join(conditions) if conditions else "TRUE"

    count_sql = f"SELECT COUNT(*) FROM schedules s WHERE {where}"
    data_sql = f"""
        SELECT s.{_SELECT_FIELDS.replace(', ', ', s.')}, a.name as agent_name
        FROM schedules s
        LEFT JOIN agents a ON a.id = s.agent_id
        WHERE {where}
        ORDER BY s.created_at DESC
        LIMIT ${idx} OFFSET ${idx + 1}
    """
    params.extend([limit, offset])

    async with pool.acquire() as conn:
        total = await conn.fetchval(count_sql, *params[:-2])
        rows = await conn.fetch(data_sql, *params)

    return [dict(r) for r in rows], total or 0


async def update_schedule(
    pool: asyncpg.Pool,
    schedule_id: int,
    **kwargs: Any,
) -> dict[str, Any] | None:
    allowed = {
        "name", "description", "message", "cron_expression", "run_at",
        "next_run_at", "last_run_at", "last_run_status", "last_run_result",
        "status", "run_count", "max_runs", "schedule_type",
        "max_retries", "retry_count", "retry_delay_seconds", "next_retry_at",
    }
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return await get_schedule(pool, schedule_id)

    updates["updated_at"] = datetime.now(timezone.utc)
    set_parts = []
    params: list[Any] = []
    for idx, (col, val) in enumerate(updates.items(), 1):
        set_parts.append(f"{col} = ${idx}")
        params.append(val)

    params.append(schedule_id)
    sql = f"""
        UPDATE schedules SET {', '.join(set_parts)}
        WHERE id = ${len(params)}
        RETURNING {_SELECT_FIELDS}
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(sql, *params)
    return _row_to_dict(row)


async def delete_schedule(pool: asyncpg.Pool, schedule_id: int) -> bool:
    sql = "DELETE FROM schedules WHERE id = $1"
    async with pool.acquire() as conn:
        result = await conn.execute(sql, schedule_id)
    return result == "DELETE 1"


async def get_due_schedules(pool: asyncpg.Pool) -> list[dict[str, Any]]:
    """Get all active schedules that are due: either next_run_at or next_retry_at is past."""
    sql = f"""
        SELECT {_SELECT_FIELDS} FROM schedules
        WHERE status = 'active'
          AND (
            (next_run_at IS NOT NULL AND next_run_at <= NOW())
            OR (next_retry_at IS NOT NULL AND next_retry_at <= NOW())
          )
        ORDER BY COALESCE(next_retry_at, next_run_at) ASC
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql)
    return [dict(r) for r in rows]
