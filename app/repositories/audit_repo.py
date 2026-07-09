"""Repository for the audit log (one row per mutating request)."""

from __future__ import annotations

import json
from typing import Any

import asyncpg


async def record(
    pool: asyncpg.Pool,
    *,
    user_id: int | None,
    email: str | None,
    workspace_id: int | None,
    action: str | None,
    resource_type: str | None,
    resource_id: str | None,
    method: str,
    path: str,
    status_code: int | None,
    ip: str | None,
    user_agent: str | None,
    detail: dict[str, Any] | None = None,
) -> None:
    await pool.execute(
        """
        INSERT INTO audit_log
            (user_id, email, workspace_id, action, resource_type, resource_id,
             method, path, status_code, ip, user_agent, detail)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb);
        """,
        user_id,
        email,
        workspace_id,
        action,
        resource_type,
        resource_id,
        method,
        path,
        status_code,
        ip,
        user_agent,
        json.dumps(detail) if detail is not None else None,
    )


# --------------------------------------------------------------------------- #
# Workspace activity feed (a curated, user-facing view over the audit log)
# --------------------------------------------------------------------------- #

# Only these actions/resources are surfaced in the feed (no auth noise, no
# failed requests, only things a user would recognize as "activity").
_FEED_ACTIONS = ["create", "update", "delete"]
_FEED_RESOURCES = [
    "agents",
    "mcp-connections",
    "database-connections",
    "skills",
    "prompt-library",
    "schedules",
    "workflows",
    "workspaces",
]

# resource_type (URL segment) -> (table, name column). Used to resolve a
# friendly name at read time. Values are hardcoded (never user input).
_RESOURCE_TABLE: dict[str, tuple[str, str]] = {
    "agents": ("agents", "name"),
    "mcp-connections": ("mcp_connections", "name"),
    "database-connections": ("database_connections", "name"),
    "skills": ("skills", "name"),
    "prompt-library": ("prompt_library", "title"),
    "schedules": ("schedules", "name"),
    "workflows": ("workflows", "name"),
    "workspaces": ("workspaces", "name"),
}


# Shared filter for the feed (same params in list + count: $1 workspace, $2 actions, $3 resources).
_FEED_WHERE = """
        WHERE workspace_id = $1
          AND status_code >= 200 AND status_code < 300
          AND action = ANY($2::text[])
          AND resource_type = ANY($3::text[])
"""


async def list_workspace_activity(
    pool: asyncpg.Pool, workspace_id: int, *, limit: int = 20, offset: int = 0
) -> list[dict[str, Any]]:
    """Recent successful create/update/delete events in a workspace, newest first.

    Deduplicates consecutive identical actions on the same resource so that,
    e.g., five back-to-back "create agent 'demo_assistant'" entries collapse
    into one (keeping the most recent).
    """
    rows = await pool.fetch(
        f"""
        SELECT DISTINCT ON (user_id, action, resource_type, resource_id)
               id, user_id, email, action, resource_type, resource_id, created_at
        FROM audit_log
        {_FEED_WHERE}
        ORDER BY user_id, action, resource_type, resource_id, created_at DESC;
        """,
        workspace_id,
        _FEED_ACTIONS,
        _FEED_RESOURCES,
    )
    # Re-sort by time and apply pagination in Python (DISTINCT ON needs its
    # own ORDER BY which conflicts with created_at DESC + LIMIT).
    rows = sorted(rows, key=lambda r: r["created_at"], reverse=True)
    page = rows[offset : offset + limit]
    return [dict(r) for r in page]


async def count_workspace_activity(pool: asyncpg.Pool, workspace_id: int) -> int:
    """Total number of deduplicated feed events in a workspace."""
    total = await pool.fetchval(
        f"""
        SELECT COUNT(*) FROM (
            SELECT DISTINCT ON (user_id, action, resource_type, resource_id) id
            FROM audit_log
            {_FEED_WHERE}
        ) sub;
        """,
        workspace_id,
        _FEED_ACTIONS,
        _FEED_RESOURCES,
    )
    return int(total or 0)


async def resolve_resource_names(
    pool: asyncpg.Pool, rows: list[dict[str, Any]]
) -> dict[tuple[str, int], str]:
    """Batch-resolve friendly names for the resources referenced by feed rows.

    Groups ids by resource type and does one query per type. Missing/deleted
    resources simply won't appear in the result (caller falls back to id).
    """
    wanted: dict[str, set[int]] = {}
    for r in rows:
        rid = r.get("resource_id")
        rtype = r.get("resource_type")
        if rid and str(rid).isdigit() and rtype in _RESOURCE_TABLE:
            wanted.setdefault(rtype, set()).add(int(rid))

    names: dict[tuple[str, int], str] = {}
    for rtype, ids in wanted.items():
        table, col = _RESOURCE_TABLE[rtype]
        try:
            recs = await pool.fetch(
                f"SELECT id, {col} AS name FROM {table} WHERE id = ANY($1::int[]);",
                list(ids),
            )
            for rec in recs:
                if rec["name"]:
                    names[(rtype, rec["id"])] = rec["name"]
        except Exception:  # noqa: BLE001 — unknown/renamed column: just skip names
            continue
    return names
