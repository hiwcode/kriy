from __future__ import annotations
from typing import Any
import asyncpg

_SELECT_FIELDS = "id, skill_id, name, content, file_type, folder_id, workspace_id, created_by, created_at, updated_at"


def _row_to_dict(row: asyncpg.Record | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


async def create_file(
    pool: asyncpg.Pool,
    skill_id: int,
    name: str,
    content: str = "",
    file_type: str = "md",
    folder_id: int | None = None,
    created_by: int | None = None,
    workspace_id: int | None = None,
) -> dict[str, Any]:
    query = f"""
    INSERT INTO skill_files (skill_id, name, content, file_type, folder_id, created_by, workspace_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING {_SELECT_FIELDS};
    """
    # Strip null bytes that PostgreSQL TEXT columns can't store
    safe_content = content.replace("\x00", "") if content else ""
    row = await pool.fetchrow(query, skill_id, name, safe_content, file_type, folder_id, created_by, workspace_id)
    return _row_to_dict(row) or {}


async def get_file(pool: asyncpg.Pool, file_id: int) -> dict[str, Any] | None:
    query = f"SELECT {_SELECT_FIELDS} FROM skill_files WHERE id = $1;"
    row = await pool.fetchrow(query, file_id)
    return _row_to_dict(row)


async def list_files_by_skill(
    pool: asyncpg.Pool,
    skill_id: int,
    folder_id: int | None = None,
    folder_filter: bool = False,
) -> list[dict[str, Any]]:
    """List files in a skill, optionally filtered by folder."""
    conditions = ["skill_id = $1"]
    params: list[Any] = [skill_id]

    if folder_filter:
        if folder_id is not None:
            params.append(folder_id)
            conditions.append(f"folder_id = ${len(params)}")
        else:
            conditions.append("folder_id IS NULL")

    where_sql = "WHERE " + " AND ".join(conditions)
    query = f"SELECT {_SELECT_FIELDS} FROM skill_files {where_sql} ORDER BY name ASC;"
    rows = await pool.fetch(query, *params)
    return [_row_to_dict(row) for row in rows]


async def get_skill_tree(
    pool: asyncpg.Pool,
    skill_id: int,
) -> dict[str, Any]:
    """Get all files and folders for a skill in one call (for tree view)."""
    files_query = f"SELECT {_SELECT_FIELDS} FROM skill_files WHERE skill_id = $1 ORDER BY name ASC;"
    folders_query = "SELECT id, name, parent_id, skill_id, workspace_id, created_by, created_at, updated_at FROM skill_folders WHERE skill_id = $1 ORDER BY name ASC;"

    files = await pool.fetch(files_query, skill_id)
    folders = await pool.fetch(folders_query, skill_id)

    return {
        "files": [_row_to_dict(r) for r in files],
        "folders": [dict(r) for r in folders],
    }


async def update_file(
    pool: asyncpg.Pool, file_id: int, payload: dict[str, Any]
) -> dict[str, Any] | None:
    if not payload:
        return await get_file(pool, file_id)

    set_clauses: list[str] = []
    values: list[Any] = []
    index = 1
    for field in ("name", "content", "file_type", "folder_id"):
        if field in payload:
            set_clauses.append(f"{field} = ${index}")
            val = payload[field]
            # Strip null bytes from content
            if field == "content" and isinstance(val, str):
                val = val.replace("\x00", "")
            values.append(val)
            index += 1

    set_clauses.append("updated_at = NOW()")
    query = f"""
    UPDATE skill_files
    SET {', '.join(set_clauses)}
    WHERE id = ${index}
    RETURNING {_SELECT_FIELDS};
    """
    values.append(file_id)
    row = await pool.fetchrow(query, *values)
    return _row_to_dict(row)


async def delete_file(pool: asyncpg.Pool, file_id: int) -> bool:
    result = await pool.execute("DELETE FROM skill_files WHERE id = $1;", file_id)
    return result.startswith("DELETE") and not result.endswith("0")


async def bulk_delete_files(
    pool: asyncpg.Pool,
    ids: list[int],
    skill_id: int | None = None,
) -> list[int]:
    if not ids:
        return []
    if skill_id is not None:
        query = "DELETE FROM skill_files WHERE id = ANY($1::int[]) AND skill_id = $2 RETURNING id;"
        rows = await pool.fetch(query, ids, skill_id)
    else:
        query = "DELETE FROM skill_files WHERE id = ANY($1::int[]) RETURNING id;"
        rows = await pool.fetch(query, ids)
    return [row["id"] for row in rows]
