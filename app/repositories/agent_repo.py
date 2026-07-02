from __future__ import annotations

from typing import Any

import json

import asyncpg

from app.db.filters import build_order_by, build_where


def _row_to_dict(row: asyncpg.Record | None) -> dict[str, Any] | None:
    if row is None:
        return None
    d = dict(row)
    if "extra_fields" in d:
        d["extra_fields"] = _normalize_extra_fields(d["extra_fields"])
    return d


def _to_jsonb(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value)


def _normalize_extra_fields(value: Any) -> dict[str, Any]:
    """Ensure extra_fields is a dict; parse from string or fix corrupted char-index dict."""
    if value is None:
        return {}
    if isinstance(value, dict):
        keys = list(value.keys())
        if len(keys) > 10:
            numeric_keys = [k for k in keys if isinstance(k, str) and k.isdigit()]
            if len(numeric_keys) == len(keys):
                sorted_keys = sorted(numeric_keys, key=int)
                joined = "".join(str(value.get(k, "")) for k in sorted_keys)
                try:
                    parsed = json.loads(joined)
                    return parsed if isinstance(parsed, dict) else {}
                except json.JSONDecodeError:
                    pass
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


_ALLOWED_FILTER_FIELDS: dict[str, str] = {
    "name": "name",
    "label": "label",
    "model": "model",
    "description": "description",
    "is_orchestrator": "is_orchestrator",
    "created_by": "created_by",
    "workspace_id": "workspace_id",
    "created_at": "created_at",
    "updated_at": "updated_at",
}

_SEARCH_FIELDS = ("name", "label", "description")

_ALLOWED_SORT_FIELDS: dict[str, str] = {
    "id": "id",
    "name": "name",
    "label": "label",
    "model": "model",
    "is_orchestrator": "is_orchestrator",
    "created_by": "created_by",
    "workspace_id": "workspace_id",
    "created_at": "created_at",
    "updated_at": "updated_at",
}


async def create_agent(
    pool: asyncpg.Pool,
    name: str,
    label: str,
    model: str,
    description: str | None = None,
    system_prompt: str | None = None,
    system_prompt_id: int | None = None,
    instruction: str | None = None,
    instruction_prompt_id: int | None = None,
    tools: list[dict[str, Any]] | None = None,
    extra_fields: dict[str, Any] | None = None,
    is_orchestrator: bool = False,
    sub_agent_ids: list[int] | None = None,
    skill_ids: list[int] | None = None,
    created_by: int | None = None,
    workspace_id: int | None = None,
) -> dict[str, Any]:
    query = """
    INSERT INTO agents (
        name, label, model, description, system_prompt, system_prompt_id,
        instruction, instruction_prompt_id, tools, extra_fields, is_orchestrator,
        sub_agent_ids, skill_ids, created_by, workspace_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING id, name, label, model, description, system_prompt, system_prompt_id,
        instruction, instruction_prompt_id, tools, extra_fields, is_orchestrator,
        sub_agent_ids, skill_ids, created_at, updated_at, created_by, workspace_id;
    """
    row = await pool.fetchrow(
        query,
        name,
        label,
        model,
        description,
        system_prompt,
        system_prompt_id,
        instruction,
        instruction_prompt_id,
        _to_jsonb(tools or []),
        _to_jsonb(_normalize_extra_fields(extra_fields or {})),
        is_orchestrator,
        sub_agent_ids or [],
        skill_ids or [],
        created_by,
        workspace_id,
    )
    return _row_to_dict(row) or {}


async def get_agent(pool: asyncpg.Pool, agent_id: int) -> dict[str, Any] | None:
    query = """
    SELECT id, name, label, model, description, system_prompt, system_prompt_id,
        instruction, instruction_prompt_id, tools, extra_fields, is_orchestrator,
        sub_agent_ids, skill_ids, created_at, updated_at, created_by, workspace_id
    FROM agents
    WHERE id = $1;
    """
    row = await pool.fetchrow(query, agent_id)
    return _row_to_dict(row)


async def get_agent_by_name(pool: asyncpg.Pool, name: str) -> dict[str, Any] | None:
    query = """
    SELECT id, name, label, model, description, system_prompt, system_prompt_id,
        instruction, instruction_prompt_id, tools, extra_fields, is_orchestrator,
        sub_agent_ids, skill_ids, created_at, updated_at, created_by
    FROM agents
    WHERE name = $1;
    """
    row = await pool.fetchrow(query, name)
    return _row_to_dict(row)


async def list_agents(
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
        clause = f"(created_by = ${len(params)} OR workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = ${len(params)}))"
        where_sql = ("WHERE " + clause) if not where_sql else where_sql + " AND " + clause
    order_sql = build_order_by(
        sort_field=sort_field,
        sort_order=sort_order,
        allowed_fields=_ALLOWED_SORT_FIELDS,
        default="id",
    )
    limit_idx = len(params) + 1
    offset_idx = len(params) + 2
    query = f"""
    SELECT id, name, label, model, description, system_prompt, system_prompt_id,
        instruction, instruction_prompt_id, tools, extra_fields, is_orchestrator,
        sub_agent_ids, skill_ids, created_at, updated_at, created_by, workspace_id
    FROM agents
    {where_sql}
    {order_sql}
    LIMIT ${limit_idx} OFFSET ${offset_idx};
    """
    rows = await pool.fetch(query, *params, limit, offset)
    return [dict(row) for row in rows]


async def count_agents(
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
        clause = f"(created_by = ${len(params)} OR workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = ${len(params)}))"
        where_sql = ("WHERE " + clause) if not where_sql else where_sql + " AND " + clause
    query = f"""
    SELECT COUNT(*)
    FROM agents
    {where_sql};
    """
    return int(await pool.fetchval(query, *params))


async def update_agent(
    pool: asyncpg.Pool, agent_id: int, payload: dict[str, Any]
) -> dict[str, Any] | None:
    if not payload:
        return await get_agent(pool, agent_id)

    set_clauses: list[str] = []
    values: list[Any] = []
    index = 1

    updatable = (
        "name",
        "label",
        "model",
        "description",
        "system_prompt",
        "system_prompt_id",
        "instruction",
        "instruction_prompt_id",
        "tools",
        "extra_fields",
        "is_orchestrator",
        "sub_agent_ids",
        "skill_ids",
    )
    for field in updatable:
        if field in payload:
            set_clauses.append(f"{field} = ${index}")
            if field == "extra_fields":
                values.append(_to_jsonb(_normalize_extra_fields(payload[field])))
            elif field == "tools":
                values.append(_to_jsonb(payload[field]))
            elif field in ("sub_agent_ids", "skill_ids"):
                values.append(payload[field] or [])
            else:
                values.append(payload[field])
            index += 1

    set_clauses.append("updated_at = NOW()")
    query = f"""
    UPDATE agents
    SET {', '.join(set_clauses)}
    WHERE id = ${index}
    RETURNING id, name, label, model, description, system_prompt, system_prompt_id,
        instruction, instruction_prompt_id, tools, extra_fields, is_orchestrator,
        sub_agent_ids, created_at, updated_at, created_by, workspace_id;
    """
    values.append(agent_id)
    row = await pool.fetchrow(query, *values)
    return _row_to_dict(row)


async def delete_agent(pool: asyncpg.Pool, agent_id: int) -> bool:
    result = await pool.execute("DELETE FROM agents WHERE id = $1;", agent_id)
    return result.startswith("DELETE") and not result.endswith("0")


async def bulk_delete_agents(
    pool: asyncpg.Pool,
    ids: list[int],
    user_id: int | None = None,
    workspace_id: int | None = None,
) -> list[int]:
    if not ids:
        return []
    if workspace_id is not None:
        rows = await pool.fetch(
            "DELETE FROM agents WHERE id = ANY($1::int[]) AND workspace_id = $2 RETURNING id;",
            ids,
            workspace_id,
        )
    elif user_id is not None:
        rows = await pool.fetch(
            "DELETE FROM agents WHERE id = ANY($1::int[]) AND (created_by = $2 OR workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = $2)) RETURNING id;",
            ids,
            user_id,
        )
    else:
        rows = await pool.fetch(
            "DELETE FROM agents WHERE id = ANY($1::int[]) RETURNING id;",
            ids,
        )
    return [r["id"] for r in rows]


async def get_agents_by_ids(
    pool: asyncpg.Pool, agent_ids: list[int]
) -> list[dict[str, Any]]:
    if not agent_ids:
        return []
    query = """
    SELECT id, name, label, model, description, system_prompt, system_prompt_id,
        instruction, instruction_prompt_id, tools, extra_fields, is_orchestrator,
        sub_agent_ids, skill_ids, created_at, updated_at, created_by, workspace_id
    FROM agents
    WHERE id = ANY($1::int[]);
    """
    rows = await pool.fetch(query, agent_ids)
    return [dict(row) for row in rows]
