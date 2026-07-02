"""Service layer for schedule operations."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import asyncpg
from croniter import croniter

from app.repositories import schedule_repo
from app.schemas.schedule import ScheduleCreate, ScheduleUpdate


def _compute_next_run(schedule_type: str, cron_expression: str | None, run_at: datetime | None) -> datetime | None:
    """Compute the next run time based on schedule type."""
    if schedule_type == "one_time" and run_at:
        return run_at
    if schedule_type == "recurring" and cron_expression:
        now = datetime.now(timezone.utc)
        cron = croniter(cron_expression, now)
        return cron.get_next(datetime).replace(tzinfo=timezone.utc)
    return None


async def create_schedule(
    pool: asyncpg.Pool,
    data: ScheduleCreate,
    created_by: int | None = None,
    workspace_id: int | None = None,
) -> dict:
    next_run = _compute_next_run(data.schedule_type, data.cron_expression, data.run_at)
    return await schedule_repo.create_schedule(
        pool,
        name=data.name,
        description=data.description,
        agent_id=data.agent_id,
        message=data.message,
        schedule_type=data.schedule_type,
        cron_expression=data.cron_expression,
        run_at=data.run_at,
        next_run_at=next_run,
        max_runs=data.max_runs,
        workspace_id=workspace_id,
        created_by=created_by,
    )


async def get_schedule(pool: asyncpg.Pool, schedule_id: int) -> dict | None:
    return await schedule_repo.get_schedule(pool, schedule_id)


async def list_schedules(
    pool: asyncpg.Pool,
    *,
    workspace_id: int | None = None,
    created_by: int | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict], int]:
    return await schedule_repo.list_schedules(
        pool, workspace_id=workspace_id, created_by=created_by,
        status=status, limit=limit, offset=offset,
    )


async def update_schedule(
    pool: asyncpg.Pool,
    schedule_id: int,
    data: ScheduleUpdate,
) -> dict | None:
    updates = data.model_dump(exclude_unset=True)
    # Recompute next_run if schedule params changed
    if "cron_expression" in updates or "run_at" in updates or "schedule_type" in updates:
        existing = await schedule_repo.get_schedule(pool, schedule_id)
        if existing:
            stype = updates.get("schedule_type", existing["schedule_type"])
            cron_expr = updates.get("cron_expression", existing["cron_expression"])
            run_at = updates.get("run_at", existing["run_at"])
            updates["next_run_at"] = _compute_next_run(stype, cron_expr, run_at)
    return await schedule_repo.update_schedule(pool, schedule_id, **updates)


async def delete_schedule(pool: asyncpg.Pool, schedule_id: int) -> bool:
    return await schedule_repo.delete_schedule(pool, schedule_id)


async def mark_schedule_run(
    pool: asyncpg.Pool,
    schedule: dict[str, Any],
    status: str,
    result: str | None = None,
) -> dict | None:
    """Update schedule after a run: bump count, set next_run, mark complete if done."""
    new_count = schedule["run_count"] + 1
    updates: dict[str, Any] = {
        "run_count": new_count,
        "last_run_at": datetime.now(timezone.utc),
        "last_run_status": status,
        "last_run_result": (result or "")[:2000],
    }

    if schedule["schedule_type"] == "one_time":
        updates["status"] = "completed"
        updates["next_run_at"] = None
    elif schedule["schedule_type"] == "recurring":
        if schedule.get("max_runs") and new_count >= schedule["max_runs"]:
            updates["status"] = "completed"
            updates["next_run_at"] = None
        elif schedule.get("cron_expression"):
            now = datetime.now(timezone.utc)
            cron = croniter(schedule["cron_expression"], now)
            updates["next_run_at"] = cron.get_next(datetime).replace(tzinfo=timezone.utc)
        else:
            updates["status"] = "completed"
            updates["next_run_at"] = None

    return await schedule_repo.update_schedule(pool, schedule["id"], **updates)
