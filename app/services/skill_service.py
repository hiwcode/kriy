from __future__ import annotations

from typing import Any

import asyncpg

from app.repositories import skill_repo
from app.repositories import skill_file_repo
from app.schemas.skill import SkillCreate, SkillUpdate


async def create_skill(
    pool: asyncpg.Pool,
    data: SkillCreate,
    created_by: int | None = None,
    workspace_id: int | None = None,
) -> dict:
    skill = await skill_repo.create_skill(
        pool,
        name=data.name,
        instructions=data.instructions,
        description=data.description,
        tools=data.tools,
        folder_id=data.folder_id,
        skill_type=data.type,
        created_by=created_by,
        workspace_id=workspace_id,
    )
    await skill_file_repo.create_file(
        pool,
        skill_id=skill["id"],
        name="SKILL.md",
        content=f"# {data.name}\n\n{data.description or ''}\n\n## Instructions\n\n{data.instructions}",
        file_type="md",
        created_by=created_by,
        workspace_id=workspace_id,
    )
    return skill


async def get_skill(pool: asyncpg.Pool, skill_id: int) -> dict | None:
    return await skill_repo.get_skill(pool, skill_id)


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
) -> tuple[list[dict], int]:
    skills = await skill_repo.list_skills(
        pool,
        limit=limit,
        offset=offset,
        search=search,
        filters=filters,
        sort_field=sort_field,
        sort_order=sort_order,
        user_id=user_id,
        workspace_id=workspace_id,
        folder_id=folder_id,
        folder_id_filter=folder_id_filter,
    )
    total = await skill_repo.count_skills(
        pool,
        search=search,
        filters=filters,
        user_id=user_id,
        workspace_id=workspace_id,
        folder_id=folder_id,
        folder_id_filter=folder_id_filter,
    )
    return skills, total


async def update_skill(
    pool: asyncpg.Pool, skill_id: int, data: SkillUpdate
) -> dict | None:
    payload = data.model_dump(exclude_unset=True)
    return await skill_repo.update_skill(pool, skill_id, payload)


async def delete_skill(pool: asyncpg.Pool, skill_id: int) -> bool:
    return await skill_repo.delete_skill(pool, skill_id)


async def bulk_delete_skills(
    pool: asyncpg.Pool,
    ids: list[int],
    user_id: int | None = None,
    workspace_id: int | None = None,
) -> list[int]:
    return await skill_repo.bulk_delete_skills(pool, ids, user_id, workspace_id)


async def get_skills_by_ids(
    pool: asyncpg.Pool, skill_ids: list[int]
) -> list[dict]:
    return await skill_repo.get_skills_by_ids(pool, skill_ids)
