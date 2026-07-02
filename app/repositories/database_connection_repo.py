"""Repository for database connections used by agent query tool."""

from __future__ import annotations

from typing import Any

import asyncpg

from app.core.encryption import decrypt, encrypt
from app.db.filters import build_order_by, build_where

_ALLOWED_FILTER_FIELDS: dict[str, str] = {
    "name": "name",
    "read_only": "read_only",
    "max_rows": "max_rows",
    "created_at": "created_at",
    "updated_at": "updated_at",
    "created_by": "created_by",
}

_SEARCH_FIELDS = ("name",)

_ALLOWED_SORT_FIELDS: dict[str, str] = {
    "id": "id",
    "name": "name",
    "read_only": "read_only",
    "max_rows": "max_rows",
    "created_at": "created_at",
    "updated_at": "updated_at",
}


def _row_to_dict(row: asyncpg.Record | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


async def create_database_connection(
    pool: asyncpg.Pool,
    name: str,
    connection_url: str,
    read_only: bool = True,
    max_rows: int = 100,
    created_by: int | None = None,
    workspace_id: int | None = None,
) -> dict[str, Any]:
    """Create a database connection config."""
    encrypted_url = encrypt(connection_url)
    row = await pool.fetchrow(
        """
        INSERT INTO database_connections (name, connection_url, read_only, max_rows, created_by, workspace_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, name, connection_url, read_only, max_rows, created_at, updated_at, created_by, workspace_id
        """,
        name,
        encrypted_url,
        read_only,
        max_rows,
        created_by,
        workspace_id,
    )
    result = _row_to_dict(row) or {}
    if result.get("connection_url"):
        result["connection_url"] = decrypt(result["connection_url"])
    return result


async def get_database_connection(
    pool: asyncpg.Pool,
    connection_id: int,
) -> dict[str, Any] | None:
    """Get a database connection by id."""
    row = await pool.fetchrow(
        """
        SELECT id, name, connection_url, read_only, max_rows, created_at, updated_at, created_by, workspace_id
        FROM database_connections
        WHERE id = $1
        """,
        connection_id,
    )
    result = _row_to_dict(row)
    if result and result.get("connection_url"):
        result["connection_url"] = decrypt(result["connection_url"])
    return result


async def list_database_connections(
    pool: asyncpg.Pool,
    limit: int = 100,
    offset: int = 0,
    search: str | None = None,
    filters: list[dict[str, Any]] | None = None,
    sort_field: str | None = None,
    sort_order: str | None = None,
    user_id: int | None = None,
    workspace_id: int | None = None,
) -> list[dict[str, Any]]:
    """List database connections (without exposing full URL in list)."""
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
        default="created_at",
    )
    query = f"""
        SELECT id, name, read_only, max_rows, created_at, updated_at
        FROM database_connections
        {where_sql}
        {order_sql}
        LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}
        """
    rows = await pool.fetch(query, *params, limit, offset)
    return [_row_to_dict(r) or {} for r in rows]


async def count_database_connections(
    pool: asyncpg.Pool,
    search: str | None = None,
    filters: list[dict[str, Any]] | None = None,
    user_id: int | None = None,
    workspace_id: int | None = None,
) -> int:
    """Count database connections matching filters."""
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
    row = await pool.fetchrow(
        f"""
        SELECT COUNT(*)::int
        FROM database_connections
        {where_sql}
        """,
        *params,
    )
    return row[0] if row else 0


async def update_database_connection(
    pool: asyncpg.Pool,
    connection_id: int,
    *,
    name: str | None = None,
    connection_url: str | None = None,
    read_only: bool | None = None,
    max_rows: int | None = None,
) -> dict[str, Any] | None:
    """Update a database connection."""
    updates = []
    values: list[Any] = []
    i = 1
    if name is not None:
        updates.append(f"name = ${i}")
        values.append(name)
        i += 1
    if connection_url is not None:
        updates.append(f"connection_url = ${i}")
        values.append(encrypt(connection_url))
        i += 1
    if read_only is not None:
        updates.append(f"read_only = ${i}")
        values.append(read_only)
        i += 1
    if max_rows is not None:
        updates.append(f"max_rows = ${i}")
        values.append(max_rows)
        i += 1
    if not updates:
        return await get_database_connection(pool, connection_id)
    updates.append("updated_at = NOW()")
    values.append(connection_id)
    row = await pool.fetchrow(
        f"""
        UPDATE database_connections
        SET {", ".join(updates)}
        WHERE id = ${i}
        RETURNING id, name, connection_url, read_only, max_rows, created_at, updated_at, created_by, workspace_id
        """,
        *values,
    )
    result = _row_to_dict(row)
    if result and result.get("connection_url"):
        result["connection_url"] = decrypt(result["connection_url"])
    return result


async def delete_database_connection(
    pool: asyncpg.Pool,
    connection_id: int,
) -> bool:
    """Delete a database connection."""
    result = await pool.execute(
        "DELETE FROM database_connections WHERE id = $1",
        connection_id,
    )
    return "DELETE" in result and "0" not in result.split()[-1]
