from __future__ import annotations

from typing import Any

import asyncpg


_SELECT_FIELDS = "id, name, parent_id, skill_id, workspace_id, created_by, created_at, updated_at"


def _row_to_dict(row: asyncpg.Record | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


async def create_folder(
    pool: asyncpg.Pool,
    name: str,
    parent_id: int | None = None,
    skill_id: int | None = None,
    created_by: int | None = None,
    workspace_id: int | None = None,
) -> dict[str, Any]:
    query = f"""
    INSERT INTO skill_folders (name, parent_id, skill_id, created_by, workspace_id)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING {_SELECT_FIELDS};
    """
    row = await pool.fetchrow(query, name, parent_id, skill_id, created_by, workspace_id)
    return _row_to_dict(row) or {}


async def get_folder(pool: asyncpg.Pool, folder_id: int) -> dict[str, Any] | None:
    query = f"""
    SELECT {_SELECT_FIELDS}
    FROM skill_folders
    WHERE id = $1;
    """
    row = await pool.fetchrow(query, folder_id)
    return _row_to_dict(row)


async def list_folders(
    pool: asyncpg.Pool,
    parent_id: int | None = None,
    skill_id: int | None = None,
    workspace_id: int | None = None,
    user_id: int | None = None,
) -> list[dict[str, Any]]:
    conditions: list[str] = []
    params: list[Any] = []

    if parent_id is not None:
        params.append(parent_id)
        conditions.append(f"parent_id = ${len(params)}")
    else:
        conditions.append("parent_id IS NULL")

    if skill_id is not None:
        params.append(skill_id)
        conditions.append(f"skill_id = ${len(params)}")

    if workspace_id is not None:
        params.append(workspace_id)
        conditions.append(f"workspace_id = ${len(params)}")
    elif user_id is not None:
        params.append(user_id)
        conditions.append(f"created_by = ${len(params)}")

    where_sql = "WHERE " + " AND ".join(conditions) if conditions else ""

    query = f"""
    SELECT {_SELECT_FIELDS}
    FROM skill_folders
    {where_sql}
    ORDER BY name ASC;
    """
    rows = await pool.fetch(query, *params)
    return [_row_to_dict(row) for row in rows]


async def update_folder(
    pool: asyncpg.Pool, folder_id: int, payload: dict[str, Any]
) -> dict[str, Any] | None:
    if not payload:
        return await get_folder(pool, folder_id)

    set_clauses: list[str] = []
    values: list[Any] = []
    index = 1
    for field in ("name", "parent_id", "skill_id"):
        if field in payload:
            set_clauses.append(f"{field} = ${index}")
            values.append(payload[field])
            index += 1

    set_clauses.append("updated_at = NOW()")
    query = f"""
    UPDATE skill_folders
    SET {', '.join(set_clauses)}
    WHERE id = ${index}
    RETURNING {_SELECT_FIELDS};
    """
    values.append(folder_id)
    row = await pool.fetchrow(query, *values)
    return _row_to_dict(row)


async def delete_folder(pool: asyncpg.Pool, folder_id: int) -> bool:
    result = await pool.execute("DELETE FROM skill_folders WHERE id = $1;", folder_id)
    return result.startswith("DELETE") and not result.endswith("0")


async def get_folder_path(
    pool: asyncpg.Pool, folder_id: int
) -> list[dict[str, Any]]:
    """Get the full path from root to this folder (breadcrumb)."""
    query = """
    WITH RECURSIVE path AS (
        SELECT id, name, parent_id, 0 AS depth
        FROM skill_folders
        WHERE id = $1
        UNION ALL
        SELECT sf.id, sf.name, sf.parent_id, p.depth + 1
        FROM skill_folders sf
        JOIN path p ON sf.id = p.parent_id
    )
    SELECT id, name, parent_id FROM path ORDER BY depth DESC;
    """
    rows = await pool.fetch(query, folder_id)
    return [dict(row) for row in rows]
