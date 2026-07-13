from __future__ import annotations

from typing import Any

import json

import asyncpg

from app.db.filters import build_order_by, build_where


def _row_to_dict(row: asyncpg.Record | None) -> dict[str, Any] | None:
    if row is None:
        return None
    d = dict(row)
    # Ensure tools is always a parsed list (guard against string JSONB)
    if "tools" in d and isinstance(d["tools"], str):
        try:
            d["tools"] = json.loads(d["tools"])
        except (json.JSONDecodeError, TypeError):
            d["tools"] = []
    return d


def _to_jsonb(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value)


_ALLOWED_FILTER_FIELDS: dict[str, str] = {
    "name": "name",
    "description": "description",
    "created_by": "created_by",
    "workspace_id": "workspace_id",
    "created_at": "created_at",
    "updated_at": "updated_at",
    "folder_id": "folder_id",
    "type": "type",
}

_SEARCH_FIELDS = ("name", "description")

_ALLOWED_SORT_FIELDS: dict[str, str] = {
    "id": "id",
    "name": "name",
    "created_by": "created_by",
    "created_at": "created_at",
    "updated_at": "updated_at",
    "type": "type",
}

_SELECT_FIELDS = "id, name, description, instructions, tools, folder_id, type, source, workspace_id, created_by, created_at, updated_at"


async def create_skill(
    pool: asyncpg.Pool,
    name: str,
    instructions: str,
    description: str | None = None,
    tools: list[dict[str, Any]] | None = None,
    folder_id: int | None = None,
    skill_type: str = "skill",
    created_by: int | None = None,
    workspace_id: int | None = None,
    source: str | None = None,
) -> dict[str, Any]:
    query = f"""
    INSERT INTO skills (name, description, instructions, tools, folder_id, type, created_by, workspace_id, source)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING {_SELECT_FIELDS};
    """
    row = await pool.fetchrow(
        query,
        name,
        description,
        instructions,
        _to_jsonb(tools or []),
        folder_id,
        skill_type,
        created_by,
        workspace_id,
        source,
    )
    return _row_to_dict(row) or {}


async def get_skill(pool: asyncpg.Pool, skill_id: int) -> dict[str, Any] | None:
    query = f"""
    SELECT {_SELECT_FIELDS}
    FROM skills
    WHERE id = $1;
    """
    row = await pool.fetchrow(query, skill_id)
    return _row_to_dict(row)


async def list_skills(
    pool: asyncpg.Pool,
    limit: int = 50,
    offset: int = 0,
    search: str | None = None,
    filters: list[dict[str, Any]] | None = None,
    sort_field: str | None = None,
    sort_order: str | None = None,
    user_id: int | None = None,
    workspace_id: int | None = None,
    folder_id: int | None = None,
    folder_id_filter: bool = False,
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

    if folder_id_filter:
        if folder_id is not None:
            params = list(params) + [folder_id]
            clause = f"folder_id = ${len(params)}"
        else:
            clause = "folder_id IS NULL"
        where_sql = ("WHERE " + clause) if not where_sql else where_sql + " AND " + clause

    order_sql = build_order_by(
        sort_field=sort_field,
        sort_order=sort_order,
        allowed_fields=_ALLOWED_SORT_FIELDS,
        default="id",
    )
    query = f"""
    SELECT {_SELECT_FIELDS}
    FROM skills
    {where_sql}
    {order_sql}
    LIMIT ${len(params) + 1} OFFSET ${len(params) + 2};
    """
    rows = await pool.fetch(query, *params, limit, offset)
    return [_row_to_dict(row) for row in rows]


async def count_skills(
    pool: asyncpg.Pool,
    search: str | None = None,
    filters: list[dict[str, Any]] | None = None,
    user_id: int | None = None,
    workspace_id: int | None = None,
    folder_id: int | None = None,
    folder_id_filter: bool = False,
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

    if folder_id_filter:
        if folder_id is not None:
            params = list(params) + [folder_id]
            clause = f"folder_id = ${len(params)}"
        else:
            clause = "folder_id IS NULL"
        where_sql = ("WHERE " + clause) if not where_sql else where_sql + " AND " + clause

    query = f"""
    SELECT COUNT(*)
    FROM skills
    {where_sql};
    """
    return int(await pool.fetchval(query, *params))


async def update_skill(
    pool: asyncpg.Pool,
    skill_id: int,
    payload: dict[str, Any],
    *,
    workspace_id: int | None = None,
) -> dict[str, Any] | None:
    if not payload:
        return await get_skill(pool, skill_id)

    set_clauses: list[str] = []
    values: list[Any] = []
    index = 1
    for field in ("name", "description", "instructions", "tools", "folder_id", "type"):
        if field in payload:
            set_clauses.append(f"{field} = ${index}")
            if field == "tools":
                values.append(_to_jsonb(payload[field]))
            else:
                values.append(payload[field])
            index += 1

    set_clauses.append("updated_at = NOW()")
    values.append(skill_id)
    where = f"id = ${len(values)}"
    # Defense-in-depth: when a workspace is supplied, refuse to update a skill
    # outside it (the id is already agent-scoped at the tool boundary).
    if workspace_id is not None:
        values.append(workspace_id)
        where += f" AND workspace_id IS NOT DISTINCT FROM ${len(values)}"
    query = f"""
    UPDATE skills
    SET {', '.join(set_clauses)}
    WHERE {where}
    RETURNING {_SELECT_FIELDS};
    """
    row = await pool.fetchrow(query, *values)
    return _row_to_dict(row)


async def delete_skill(pool: asyncpg.Pool, skill_id: int) -> bool:
    result = await pool.execute("DELETE FROM skills WHERE id = $1;", skill_id)
    return result.startswith("DELETE") and not result.endswith("0")


async def bulk_delete_skills(
    pool: asyncpg.Pool,
    ids: list[int],
    user_id: int | None = None,
    workspace_id: int | None = None,
) -> list[int]:
    if not ids:
        return []
    if workspace_id is not None:
        query = """
        DELETE FROM skills
        WHERE id = ANY($1::int[]) AND workspace_id = $2
        RETURNING id;
        """
        rows = await pool.fetch(query, ids, workspace_id)
    elif user_id is not None:
        query = """
        DELETE FROM skills
        WHERE id = ANY($1::int[]) AND created_by = $2
        RETURNING id;
        """
        rows = await pool.fetch(query, ids, user_id)
    else:
        query = """
        DELETE FROM skills
        WHERE id = ANY($1::int[])
        RETURNING id;
        """
        rows = await pool.fetch(query, ids)
    return [row["id"] for row in rows]


async def get_skills_by_ids(
    pool: asyncpg.Pool, skill_ids: list[int]
) -> list[dict[str, Any]]:
    if not skill_ids:
        return []
    query = f"""
    SELECT {_SELECT_FIELDS}
    FROM skills
    WHERE id = ANY($1::int[]);
    """
    rows = await pool.fetch(query, skill_ids)
    return [_row_to_dict(row) for row in rows]
