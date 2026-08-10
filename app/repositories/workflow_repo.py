"""Repository for event-driven workflows and their runs."""

from __future__ import annotations

import fnmatch
import json
from typing import Any

import asyncpg

_COLS = (
    "id, user_id, workspace_id, name, event_types, enabled, agent_id, "
    "instructions, priority, execution_mode, max_concurrency, created_at, updated_at"
)


def _row(r: asyncpg.Record | None) -> dict[str, Any] | None:
    return dict(r) if r is not None else None


# --------------------------------------------------------------------------- #
# Workflows
# --------------------------------------------------------------------------- #


async def list_for_workspace(pool: asyncpg.Pool, workspace_id: int | None) -> list[dict]:
    rows = await pool.fetch(
        f"SELECT {_COLS} FROM workflows WHERE workspace_id IS NOT DISTINCT FROM $1 ORDER BY id DESC;",
        workspace_id,
    )
    return [dict(r) for r in rows]


async def get(pool: asyncpg.Pool, workflow_id: int) -> dict | None:
    return _row(
        await pool.fetchrow(f"SELECT {_COLS} FROM workflows WHERE id = $1;", workflow_id)
    )


async def create(
    pool: asyncpg.Pool,
    *,
    user_id: int | None,
    workspace_id: int | None,
    name: str,
    event_types: list[str],
    agent_id: int,
    instructions: str,
    enabled: bool = True,
    priority: int = 0,
    execution_mode: str = "serial",
    max_concurrency: int = 3,
) -> dict:
    row = await pool.fetchrow(
        f"""
        INSERT INTO workflows (user_id, workspace_id, name, event_types, agent_id, instructions, enabled, priority, execution_mode, max_concurrency)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING {_COLS};
        """,
        user_id, workspace_id, name, event_types, agent_id, instructions, enabled, priority,
        execution_mode, max_concurrency,
    )
    return dict(row)


async def update(
    pool: asyncpg.Pool,
    workflow_id: int,
    *,
    name: str,
    event_types: list[str],
    agent_id: int,
    instructions: str,
    enabled: bool,
    priority: int = 0,
    execution_mode: str = "serial",
    max_concurrency: int = 3,
) -> dict | None:
    return _row(
        await pool.fetchrow(
            f"""
            UPDATE workflows
               SET name=$2, event_types=$3, agent_id=$4, instructions=$5,
                   enabled=$6, priority=$7, execution_mode=$8, max_concurrency=$9,
                   updated_at=NOW()
             WHERE id=$1
            RETURNING {_COLS};
            """,
            workflow_id, name, event_types, agent_id, instructions, enabled, priority,
            execution_mode, max_concurrency,
        )
    )


async def delete(pool: asyncpg.Pool, workflow_id: int) -> bool:
    res = await pool.execute("DELETE FROM workflows WHERE id = $1;", workflow_id)
    return res.endswith("1")


async def find_matching(
    pool: asyncpg.Pool, *, workspace_id: int | None, event_type: str
) -> list[dict]:
    """Enabled workflows in this workspace where any of ``event_types`` matches."""
    rows = await pool.fetch(
        f"SELECT {_COLS} FROM workflows "
        f"WHERE workspace_id IS NOT DISTINCT FROM $1 AND enabled = TRUE;",
        workspace_id,
    )
    return [
        dict(r) for r in rows
        if any(fnmatch.fnmatch(event_type, p) for p in (r["event_types"] or []))
    ]


# --------------------------------------------------------------------------- #
# Runs
# --------------------------------------------------------------------------- #


async def get_run(pool: asyncpg.Pool, run_id: int) -> dict | None:
    """Return one run with workflow metadata for workspace-scoped polling."""
    row = await pool.fetchrow(
        """
        SELECT wr.id, wr.workflow_id, wr.agent_id, wr.user_id, wr.event_type,
               wr.event_payload, wr.status, wr.response, wr.error,
               wr.attempts, wr.max_attempts, wr.priority,
               wr.created_at, wr.finished_at,
               w.name AS workflow_name, w.workspace_id
          FROM workflow_runs wr
          JOIN workflows w ON w.id = wr.workflow_id
         WHERE wr.id = $1;
        """,
        run_id,
    )
    if row is None:
        return None
    result = dict(row)
    payload = result.get("event_payload")
    if isinstance(payload, str):
        try:
            result["event_payload"] = json.loads(payload)
        except (ValueError, TypeError):
            pass
    return result


async def create_run(
    pool: asyncpg.Pool,
    *,
    workflow_id: int,
    agent_id: int,
    user_id: int | None,
    event_type: str,
    event_payload: Any,
    priority: int = 0,
) -> int:
    row = await pool.fetchrow(
        """
        INSERT INTO workflow_runs (workflow_id, agent_id, user_id, event_type, event_payload, priority, status)
        VALUES ($1,$2,$3,$4,$5,$6,'pending')
        RETURNING id;
        """,
        workflow_id, agent_id, user_id, event_type,
        json.dumps(event_payload, default=str), priority,
    )
    return int(row["id"])


async def claim_next_run(pool: asyncpg.Pool) -> dict | None:
    """Atomically claim the next runnable pending run (highest priority, then oldest).

    Skips runs whose ``next_attempt_at`` is still in the future (backoff). Uses FOR
    UPDATE SKIP LOCKED so multiple workers never grab the same row, and increments
    ``attempts``. Returns the claimed run (status='running') or None.
    """
    row = await pool.fetchrow(
        """
        UPDATE workflow_runs SET status = 'running', attempts = attempts + 1
         WHERE id = (
             SELECT id FROM workflow_runs
              WHERE status = 'pending'
                AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
              ORDER BY priority DESC, created_at ASC
              FOR UPDATE SKIP LOCKED
              LIMIT 1
         )
        RETURNING id, workflow_id, agent_id, user_id, event_type, event_payload,
                  priority, attempts, max_attempts;
        """
    )
    if row is None:
        return None
    d = dict(row)
    v = d.get("event_payload")
    if isinstance(v, str):
        try:
            d["event_payload"] = json.loads(v)
        except (ValueError, TypeError):
            pass
    return d


async def claim_runs_for_workflow(
    pool: asyncpg.Pool, workflow_id: int, limit: int = 3
) -> list[dict]:
    """Claim up to `limit` pending runs for a specific workflow (parallel mode)."""
    rows = await pool.fetch(
        """
        UPDATE workflow_runs SET status = 'running', attempts = attempts + 1
         WHERE id = ANY(
             SELECT id FROM workflow_runs
              WHERE status = 'pending'
                AND workflow_id = $1
                AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
              ORDER BY priority DESC, created_at ASC
              FOR UPDATE SKIP LOCKED
              LIMIT $2
         )
        RETURNING id, workflow_id, agent_id, user_id, event_type, event_payload,
                  priority, attempts, max_attempts;
        """,
        workflow_id, limit,
    )
    result = []
    for row in rows:
        d = dict(row)
        v = d.get("event_payload")
        if isinstance(v, str):
            try:
                d["event_payload"] = json.loads(v)
            except (ValueError, TypeError):
                pass
        result.append(d)
    return result


async def count_running_for_workflow(pool: asyncpg.Pool, workflow_id: int) -> int:
    """Count currently running runs for a workflow."""
    val = await pool.fetchval(
        "SELECT COUNT(*) FROM workflow_runs WHERE workflow_id = $1 AND status = 'running';",
        workflow_id,
    )
    return int(val or 0)


async def list_queue(
    pool: asyncpg.Pool, workspace_id: int | None, *, limit: int = 100
) -> list[dict]:
    """List recent runs across all workflows in a workspace (queue view)."""
    rows = await pool.fetch(
        """
        SELECT wr.id, wr.workflow_id, wr.agent_id, wr.user_id, wr.event_type,
               wr.event_payload, wr.status, wr.response, wr.error,
               wr.attempts, wr.max_attempts, wr.priority,
               wr.created_at, wr.finished_at,
               w.name AS workflow_name, w.execution_mode
          FROM workflow_runs wr
          JOIN workflows w ON w.id = wr.workflow_id
         WHERE w.workspace_id IS NOT DISTINCT FROM $1
         ORDER BY wr.created_at DESC
         LIMIT $2;
        """,
        workspace_id, limit,
    )
    result = []
    for row in rows:
        d = dict(row)
        v = d.get("event_payload")
        if isinstance(v, str):
            try:
                d["event_payload"] = json.loads(v)
            except (ValueError, TypeError):
                pass
        result.append(d)
    return result


async def count_queue(pool: asyncpg.Pool, workspace_id: int | None) -> dict[str, int]:
    """Count runs by status across all workflows in a workspace."""
    rows = await pool.fetch(
        """
        SELECT wr.status, COUNT(*) AS cnt
          FROM workflow_runs wr
          JOIN workflows w ON w.id = wr.workflow_id
         WHERE w.workspace_id IS NOT DISTINCT FROM $1
         GROUP BY wr.status;
        """,
        workspace_id,
    )
    return {r["status"]: int(r["cnt"]) for r in rows}


async def requeue_run(
    pool: asyncpg.Pool, run_id: int, *, delay_seconds: float, error: str
) -> None:
    """Return a failed run to the queue, claimable again after ``delay_seconds``."""
    await pool.execute(
        """
        UPDATE workflow_runs
           SET status = 'pending',
               error = $2,
               next_attempt_at = NOW() + ($3 || ' seconds')::interval
         WHERE id = $1;
        """,
        run_id, error, str(delay_seconds),
    )


async def finish_run(
    pool: asyncpg.Pool,
    run_id: int,
    *,
    status: str,
    response: str | None = None,
    error: str | None = None,
) -> None:
    await pool.execute(
        """
        UPDATE workflow_runs
           SET status=$2, response=$3, error=$4, finished_at=NOW()
         WHERE id=$1;
        """,
        run_id, status, response, error,
    )


async def list_runs(
    pool: asyncpg.Pool, workflow_id: int, *, limit: int = 50
) -> list[dict]:
    rows = await pool.fetch(
        """
        SELECT id, workflow_id, agent_id, user_id, event_type, event_payload,
               status, response, error, attempts, max_attempts, created_at, finished_at
          FROM workflow_runs
         WHERE workflow_id = $1
         ORDER BY created_at DESC
         LIMIT $2;
        """,
        workflow_id, limit,
    )
    out = []
    for r in rows:
        d = dict(r)
        v = d.get("event_payload")
        if isinstance(v, str):
            try:
                d["event_payload"] = json.loads(v)
            except (ValueError, TypeError):
                pass
        out.append(d)
    return out
