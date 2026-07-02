from __future__ import annotations

from typing import Any

import json

import asyncpg

from app.core.encryption import decrypt, decrypt_or_none, encrypt, encrypt_or_none
from app.db.filters import build_order_by, build_where


def _row_to_dict(row: asyncpg.Record | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


def _to_jsonb(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value)


_ALLOWED_FILTER_FIELDS: dict[str, str] = {
    "name": "name",
    "url": "url",
    "created_by": "created_by",
    "created_at": "created_at",
    "updated_at": "updated_at",
}

_SEARCH_FIELDS = ("name", "url")

_ALLOWED_SORT_FIELDS: dict[str, str] = {
    "id": "id",
    "name": "name",
    "url": "url",
    "created_by": "created_by",
    "created_at": "created_at",
    "updated_at": "updated_at",
}


async def create_mcp_connection(
    pool: asyncpg.Pool,
    name: str,
    url: str = "",
    transport_type: str = "streamable_http",
    headers: dict[str, str] | None = None,
    timeout_seconds: float = 60,
    created_by: int | None = None,
    workspace_id: int | None = None,
    command: str | None = None,
    args: list[str] | None = None,
    env: dict[str, str] | None = None,
) -> dict[str, Any]:
    query = """
    INSERT INTO mcp_connections (name, url, transport_type, headers, timeout_seconds, created_by, workspace_id, command, args, env)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id, name, url, transport_type, headers, timeout_seconds, created_at, updated_at, created_by, workspace_id, command, args, env;
    """
    row = await pool.fetchrow(
        query,
        name,
        encrypt(url) if url else "",
        transport_type or "streamable_http",
        encrypt(_to_jsonb(headers or {}) or "{}"),
        timeout_seconds,
        created_by,
        workspace_id,
        command,
        _to_jsonb(args or []),
        encrypt(_to_jsonb(env) or "{}") if env else None,
    )
    result = _row_to_dict(row) or {}
    return _decrypt_mcp_row(result)


def _decrypt_mcp_row(row: dict[str, Any] | None) -> dict[str, Any] | None:
    """Decrypt sensitive fields in an MCP connection row."""
    if not row:
        return row
    if row.get("url"):
        row["url"] = decrypt(row["url"])
    if row.get("headers"):
        raw = row["headers"]
        if isinstance(raw, str):
            raw = decrypt(raw)
            try:
                row["headers"] = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                row["headers"] = raw
    # Parse JSONB fields for stdio
    if row.get("args") and isinstance(row["args"], str):
        try:
            row["args"] = json.loads(row["args"])
        except (json.JSONDecodeError, TypeError):
            row["args"] = []
    if row.get("env") and isinstance(row["env"], str):
        raw = decrypt(row["env"])
        try:
            row["env"] = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            row["env"] = None
    return row


async def get_mcp_connection(
    pool: asyncpg.Pool, connection_id: int
) -> dict[str, Any] | None:
    query = """
    SELECT id, name, url, transport_type, headers, timeout_seconds, created_at, updated_at, created_by, workspace_id, command, args, env
    FROM mcp_connections
    WHERE id = $1;
    """
    row = await pool.fetchrow(query, connection_id)
    return _decrypt_mcp_row(_row_to_dict(row))


async def list_mcp_connections(
    pool: asyncpg.Pool,
    limit: int = 50,
    offset: int = 0,
    search: str | None = None,
    filters: list[dict[str, Any]] | None = None,
    sort_field: str | None = None,
    sort_order: str | None = None,
    user_id: int | None = None,
    workspace_id: int | None = None,
) -> list[dict[str, Any]]:
    where_sql, params = build_where(
        search=search,
        search_fields=_SEARCH_FIELDS,
        filters=filters,
        allowed_fields=_ALLOWED_FILTER_FIELDS,
    )
    if workspace_id is not None:
        params = list(params) + [workspace_id]
        clause = f"workspace_id = ${len(params)}"
        where_sql = ("WHERE " + clause) if not where_sql else where_sql + " AND " + clause
    elif user_id is not None:
        params = list(params) + [user_id]
        clause = f"created_by = ${len(params)}"
        where_sql = ("WHERE " + clause) if not where_sql else where_sql + " AND " + clause
    order_sql = build_order_by(
        sort_field=sort_field,
        sort_order=sort_order,
        allowed_fields=_ALLOWED_SORT_FIELDS,
        default="id",
    )
    query = f"""
    SELECT id, name, url, transport_type, headers, timeout_seconds, created_at, updated_at, created_by, workspace_id, command, args, env
    FROM mcp_connections
    {where_sql}
    {order_sql}
    LIMIT ${len(params) + 1} OFFSET ${len(params) + 2};
    """
    rows = await pool.fetch(query, *params, limit, offset)
    return [_decrypt_mcp_row(dict(row)) or {} for row in rows]


async def count_mcp_connections(
    pool: asyncpg.Pool,
    search: str | None = None,
    filters: list[dict[str, Any]] | None = None,
    user_id: int | None = None,
    workspace_id: int | None = None,
) -> int:
    where_sql, params = build_where(
        search=search,
        search_fields=_SEARCH_FIELDS,
        filters=filters,
        allowed_fields=_ALLOWED_FILTER_FIELDS,
    )
    if workspace_id is not None:
        params = list(params) + [workspace_id]
        clause = f"workspace_id = ${len(params)}"
        where_sql = ("WHERE " + clause) if not where_sql else where_sql + " AND " + clause
    elif user_id is not None:
        params = list(params) + [user_id]
        clause = f"created_by = ${len(params)}"
        where_sql = ("WHERE " + clause) if not where_sql else where_sql + " AND " + clause
    query = f"""
    SELECT COUNT(*)
    FROM mcp_connections
    {where_sql};
    """
    return int(await pool.fetchval(query, *params))


async def update_mcp_connection(
    pool: asyncpg.Pool, connection_id: int, payload: dict[str, Any]
) -> dict[str, Any] | None:
    if not payload:
        return await get_mcp_connection(pool, connection_id)

    set_clauses: list[str] = []
    values: list[Any] = []
    index = 1

    updatable = ("name", "url", "transport_type", "headers", "timeout_seconds", "command", "args", "env")
    for field in updatable:
        if field in payload:
            set_clauses.append(f"{field} = ${index}")
            if field == "headers":
                values.append(encrypt(_to_jsonb(payload[field]) or "{}"))
            elif field == "url":
                values.append(encrypt(payload[field]) if payload[field] else "")
            elif field in ("args", "env"):
                values.append(_to_jsonb(payload[field]))
            else:
                values.append(payload[field])
            index += 1

    set_clauses.append("updated_at = NOW()")
    query = f"""
    UPDATE mcp_connections
    SET {', '.join(set_clauses)}
    WHERE id = ${index}
    RETURNING id, name, url, transport_type, headers, timeout_seconds, created_at, updated_at, created_by, workspace_id;
    """
    values.append(connection_id)
    row = await pool.fetchrow(query, *values)
    return _decrypt_mcp_row(_row_to_dict(row))


async def delete_mcp_connection(pool: asyncpg.Pool, connection_id: int) -> bool:
    query = "DELETE FROM mcp_connections WHERE id = $1;"
    result = await pool.execute(query, connection_id)
    return result.startswith("DELETE") and not result.endswith("0")


async def get_mcp_connections_by_ids(
    pool: asyncpg.Pool, connection_ids: list[int]
) -> list[dict[str, Any]]:
    if not connection_ids:
        return []
    query = """
    SELECT id, name, url, transport_type, headers, timeout_seconds, created_at, updated_at, created_by, workspace_id, command, args, env
    FROM mcp_connections
    WHERE id = ANY($1::int[]);
    """
    rows = await pool.fetch(query, connection_ids)
    return [_decrypt_mcp_row(dict(row)) or {} for row in rows]
