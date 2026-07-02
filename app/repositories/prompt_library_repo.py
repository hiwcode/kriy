from __future__ import annotations

from typing import Any

import json

import asyncpg

from app.db.filters import build_order_by, build_where


def _row_to_dict(row: asyncpg.Record | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


_ALLOWED_FILTER_FIELDS: dict[str, str] = {
    "title": "title",
    "prompt": "prompt",
    "prompt_type": "prompt_type",
    "createdby": "createdby",
    "tokens": "tokens",
    "createdat": "createdat",
    "updatedat": "updatedat",
}

_SEARCH_FIELDS = ("title", "prompt", "createdby")

_ALLOWED_SORT_FIELDS: dict[str, str] = {
    "id": "id",
    "title": "title",
    "prompt_type": "prompt_type",
    "createdby": "createdby",
    "tokens": "tokens",
    "createdat": "createdat",
    "updatedat": "updatedat",
}


async def create_prompt(
    pool: asyncpg.Pool,
    title: str,
    prompt: str,
    tokens: int | None,
    created_by: int | None = None,
    workspace_id: int | None = None,
    extradata: Any = None,
    prompt_type: str = "instructions",
) -> dict[str, Any]:
    query = """
    INSERT INTO prompt_library (title, prompt, createdby, tokens, extradata, prompt_type, workspace_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, title, prompt, createdby, tokens, extradata, prompt_type, createdat, updatedat, workspace_id;
    """
    row = await pool.fetchrow(
        query,
        title,
        prompt,
        created_by,
        tokens,
        _to_jsonb(extradata),
        prompt_type or "instructions",
        workspace_id,
    )
    return _row_to_dict(row) or {}


async def get_prompt(pool: asyncpg.Pool, prompt_id: int) -> dict[str, Any] | None:
    query = """
    SELECT id, title, prompt, createdby, tokens, extradata, prompt_type, createdat, updatedat, workspace_id
    FROM prompt_library
    WHERE id = $1;
    """
    row = await pool.fetchrow(query, prompt_id)
    return _row_to_dict(row)


async def list_prompts(
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
        clause = f"createdby = ${len(params)}"
        where_sql = ("WHERE " + clause) if not where_sql else where_sql + " AND " + clause
    order_sql = build_order_by(
        sort_field=sort_field,
        sort_order=sort_order,
        allowed_fields=_ALLOWED_SORT_FIELDS,
        default="id",
    )
    query = f"""
    SELECT id, title, prompt, createdby, tokens, extradata, prompt_type, createdat, updatedat, workspace_id
    FROM prompt_library
    {where_sql}
    {order_sql}
    LIMIT ${len(params) + 1} OFFSET ${len(params) + 2};
    """
    rows = await pool.fetch(query, *params, limit, offset)
    return [dict(row) for row in rows]


async def count_prompts(
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
        clause = f"createdby = ${len(params)}"
        where_sql = ("WHERE " + clause) if not where_sql else where_sql + " AND " + clause
    query = f"""
    SELECT COUNT(*)
    FROM prompt_library
    {where_sql};
    """
    return int(await pool.fetchval(query, *params))


async def update_prompt(
    pool: asyncpg.Pool, prompt_id: int, payload: dict[str, Any]
) -> dict[str, Any] | None:
    if not payload:
        return await get_prompt(pool, prompt_id)

    set_clauses: list[str] = []
    values: list[Any] = []
    index = 1
    for field in ("title", "prompt", "tokens", "extradata", "prompt_type"):
        if field in payload:
            set_clauses.append(f"{field} = ${index}")
            if field == "extradata":
                values.append(_to_jsonb(payload[field]))
            else:
                values.append(payload[field])
            index += 1

    set_clauses.append("updatedat = NOW()")
    query = f"""
    UPDATE prompt_library
    SET {', '.join(set_clauses)}
    WHERE id = ${index}
    RETURNING id, title, prompt, createdby, tokens, extradata, prompt_type, createdat, updatedat, workspace_id;
    """
    values.append(prompt_id)
    row = await pool.fetchrow(query, *values)
    return _row_to_dict(row)


async def delete_prompt(pool: asyncpg.Pool, prompt_id: int) -> bool:
    query = "DELETE FROM prompt_library WHERE id = $1;"
    result = await pool.execute(query, prompt_id)
    return result.startswith("DELETE") and not result.endswith("0")


async def bulk_delete_prompts(
    pool: asyncpg.Pool,
    ids: list[int],
    user_id: int | None = None,
    workspace_id: int | None = None,
) -> list[int]:
    if not ids:
        return []
    if workspace_id is not None:
        query = """
        DELETE FROM prompt_library
        WHERE id = ANY($1::int[]) AND workspace_id = $2
        RETURNING id;
        """
        rows = await pool.fetch(query, ids, workspace_id)
    elif user_id is not None:
        query = """
        DELETE FROM prompt_library
        WHERE id = ANY($1::int[]) AND createdby = $2
        RETURNING id;
        """
        rows = await pool.fetch(query, ids, user_id)
    else:
        query = """
        DELETE FROM prompt_library
        WHERE id = ANY($1::int[])
        RETURNING id;
        """
        rows = await pool.fetch(query, ids)
    return [row["id"] for row in rows]


async def duplicate_prompt(
    pool: asyncpg.Pool,
    prompt_id: int,
    workspace_id: int | None = None,
) -> dict[str, Any] | None:
    if workspace_id is not None:
        query = """
        INSERT INTO prompt_library (title, prompt, createdby, tokens, extradata, prompt_type, workspace_id)
        SELECT title, prompt, createdby, tokens, extradata, COALESCE(prompt_type, 'instructions'), $2
        FROM prompt_library
        WHERE id = $1
        RETURNING id, title, prompt, createdby, tokens, extradata, prompt_type, createdat, updatedat, workspace_id;
        """
        row = await pool.fetchrow(query, prompt_id, workspace_id)
    else:
        query = """
        INSERT INTO prompt_library (title, prompt, createdby, tokens, extradata, prompt_type, workspace_id)
        SELECT title, prompt, createdby, tokens, extradata, COALESCE(prompt_type, 'instructions'), workspace_id
        FROM prompt_library
        WHERE id = $1
        RETURNING id, title, prompt, createdby, tokens, extradata, prompt_type, createdat, updatedat, workspace_id;
        """
        row = await pool.fetchrow(query, prompt_id)
    return _row_to_dict(row)


def _to_jsonb(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value)
