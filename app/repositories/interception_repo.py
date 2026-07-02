"""Repository for interception decision records."""

from __future__ import annotations

import json
from typing import Any

import asyncpg

_SELECT = (
    "id, agent_id, action, decision, mode, changed, original_payload, "
    "final_payload, reason, confidence, applied_policies, latency_ms, user_id, created_at"
)


def _row_to_dict(row: asyncpg.Record | None) -> dict[str, Any] | None:
    if row is None:
        return None
    d = dict(row)
    for key in ("original_payload", "final_payload", "applied_policies"):
        v = d.get(key)
        if isinstance(v, str):
            try:
                d[key] = json.loads(v)
            except (ValueError, TypeError):
                pass
    return d


async def insert_decision(
    pool: asyncpg.Pool,
    *,
    agent_id: int,
    action: str,
    decision: str,
    mode: str,
    changed: bool,
    original_payload: Any,
    final_payload: Any,
    reason: str,
    confidence: float,
    applied_policies: list[str],
    latency_ms: int,
    user_id: int | None,
) -> None:
    sql = """
        INSERT INTO interception_decisions
            (agent_id, action, decision, mode, changed, original_payload,
             final_payload, reason, confidence, applied_policies, latency_ms, user_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12);
    """
    await pool.execute(
        sql,
        agent_id,
        action,
        decision,
        mode,
        changed,
        json.dumps(original_payload, default=str),
        json.dumps(final_payload, default=str),
        reason,
        confidence,
        json.dumps(applied_policies or []),
        latency_ms,
        user_id,
    )


async def list_decisions(
    pool: asyncpg.Pool,
    agent_id: int,
    *,
    limit: int = 20,
    offset: int = 0,
    decision: str | None = None,
    action: str | None = None,
    search: str | None = None,
) -> tuple[list[dict], int]:
    where = "WHERE agent_id = $1"
    params: list[Any] = [agent_id]
    if decision and decision != "all":
        params.append(decision)
        where += f" AND decision = ${len(params)}"
    if action and action != "all":
        params.append(action)
        where += f" AND action = ${len(params)}"
    if search:
        params.append(f"%{search}%")
        where += f" AND (action ILIKE ${len(params)} OR reason ILIKE ${len(params)})"

    count_row = await pool.fetchrow(
        f"SELECT COUNT(*) AS n FROM interception_decisions {where};", *params
    )
    total = int(count_row["n"]) if count_row else 0

    params_with_paging = [*params, limit, offset]
    rows = await pool.fetch(
        f"SELECT {_SELECT} FROM interception_decisions {where} "
        f"ORDER BY created_at DESC LIMIT ${len(params) + 1} OFFSET ${len(params) + 2};",
        *params_with_paging,
    )
    return [_row_to_dict(r) for r in rows if r is not None], total  # type: ignore[misc]


async def distinct_actions(pool: asyncpg.Pool, agent_id: int) -> list[str]:
    """Distinct action/event names seen for an agent (for the filter dropdown)."""
    rows = await pool.fetch(
        "SELECT DISTINCT action FROM interception_decisions "
        "WHERE agent_id = $1 ORDER BY action;",
        agent_id,
    )
    return [r["action"] for r in rows if r and r["action"]]


async def recent_for_proposal(
    pool: asyncpg.Pool, agent_id: int, *, limit: int = 100
) -> list[dict]:
    rows = await pool.fetch(
        f"SELECT {_SELECT} FROM interception_decisions WHERE agent_id = $1 "
        f"ORDER BY created_at DESC LIMIT $2;",
        agent_id,
        limit,
    )
    return [_row_to_dict(r) for r in rows if r is not None]  # type: ignore[misc]
