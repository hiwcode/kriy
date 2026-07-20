"""Repository for decision gates (the rules-based /events/decide gate)."""

from __future__ import annotations

import fnmatch
import json
from typing import Any

import asyncpg

_COLS = (
    "id, user_id, workspace_id, name, event_types, enabled, priority, "
    "conditions, action, reason, allow_override, created_at, updated_at"
)


def _row(r: asyncpg.Record | None) -> dict[str, Any] | None:
    if r is None:
        return None
    d = dict(r)
    v = d.get("conditions")
    if isinstance(v, str):
        try:
            d["conditions"] = json.loads(v)
        except (ValueError, TypeError):
            pass
    return d


async def list_for_workspace(pool: asyncpg.Pool, workspace_id: int | None) -> list[dict]:
    rows = await pool.fetch(
        f"SELECT {_COLS} FROM decision_gates "
        f"WHERE workspace_id IS NOT DISTINCT FROM $1 ORDER BY priority DESC, id ASC;",
        workspace_id,
    )
    return [_row(r) for r in rows]  # type: ignore[misc]


async def get(pool: asyncpg.Pool, gate_id: int) -> dict | None:
    return _row(
        await pool.fetchrow(f"SELECT {_COLS} FROM decision_gates WHERE id = $1;", gate_id)
    )


async def create(
    pool: asyncpg.Pool,
    *,
    user_id: int | None,
    workspace_id: int | None,
    name: str,
    event_types: list[str],
    conditions: Any,
    action: str,
    reason: str,
    enabled: bool = True,
    priority: int = 0,
    allow_override: bool = False,
) -> dict:
    row = await pool.fetchrow(
        f"""
        INSERT INTO decision_gates
            (user_id, workspace_id, name, event_types, enabled, priority, conditions, action, reason, allow_override)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING {_COLS};
        """,
        user_id, workspace_id, name, event_types, enabled, priority,
        json.dumps(conditions, default=str), action, reason, allow_override,
    )
    return _row(row)  # type: ignore[return-value]


async def update(
    pool: asyncpg.Pool,
    gate_id: int,
    *,
    name: str,
    event_types: list[str],
    conditions: Any,
    action: str,
    reason: str,
    enabled: bool,
    priority: int = 0,
    allow_override: bool = False,
) -> dict | None:
    return _row(
        await pool.fetchrow(
            f"""
            UPDATE decision_gates
               SET name=$2, event_types=$3, enabled=$4, priority=$5,
                   conditions=$6, action=$7, reason=$8, allow_override=$9, updated_at=NOW()
             WHERE id=$1
            RETURNING {_COLS};
            """,
            gate_id, name, event_types, enabled, priority,
            json.dumps(conditions, default=str), action, reason, allow_override,
        )
    )


async def delete(pool: asyncpg.Pool, gate_id: int) -> bool:
    res = await pool.execute("DELETE FROM decision_gates WHERE id = $1;", gate_id)
    return res.endswith("1")


async def find_matching(
    pool: asyncpg.Pool, *, workspace_id: int | None, event_type: str
) -> list[dict]:
    """Enabled gates in this workspace where any of ``event_types`` matches, in
    evaluation order (priority DESC, then id ASC)."""
    rows = await pool.fetch(
        f"SELECT {_COLS} FROM decision_gates "
        f"WHERE workspace_id IS NOT DISTINCT FROM $1 AND enabled = TRUE "
        f"ORDER BY priority DESC, id ASC;",
        workspace_id,
    )
    out: list[dict] = []
    for r in rows:
        d = _row(r)
        if d and any(fnmatch.fnmatch(event_type, p) for p in (d["event_types"] or [])):
            out.append(d)
    return out


# --------------------------------------------------------------------------- #
# Decision audit log
# --------------------------------------------------------------------------- #

_DECISION_COLS = (
    "id, workspace_id, user_id, event_type, decision, overridable, "
    "matched_gate_id, matched_gate_name, reason, payload, created_at"
)


def _decision_row(r: asyncpg.Record) -> dict:
    d = dict(r)
    v = d.get("payload")
    if isinstance(v, str):
        try:
            d["payload"] = json.loads(v)
        except (ValueError, TypeError):
            pass
    return d


async def log_decision(
    pool: asyncpg.Pool,
    *,
    workspace_id: int | None,
    user_id: int | None,
    event_type: str,
    decision: str,
    overridable: bool,
    matched_gate_id: int | None,
    matched_gate_name: str | None,
    reason: str,
    payload: Any,
) -> None:
    await pool.execute(
        """
        INSERT INTO gate_decisions
            (workspace_id, user_id, event_type, decision, overridable,
             matched_gate_id, matched_gate_name, reason, payload)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9);
        """,
        workspace_id, user_id, event_type, decision, overridable,
        matched_gate_id, matched_gate_name, reason,
        json.dumps(payload, default=str),
    )


async def list_decisions(
    pool: asyncpg.Pool, workspace_id: int | None, *, limit: int = 100
) -> list[dict]:
    rows = await pool.fetch(
        f"SELECT {_DECISION_COLS} FROM gate_decisions "
        f"WHERE workspace_id IS NOT DISTINCT FROM $1 ORDER BY created_at DESC LIMIT $2;",
        workspace_id, limit,
    )
    return [_decision_row(r) for r in rows]
