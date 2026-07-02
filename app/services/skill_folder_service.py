from __future__ import annotations

from typing import Any

import asyncpg

from app.repositories import skill_folder_repo
from app.schemas.skill_folder import SkillFolderCreate, SkillFolderUpdate


async def create_folder(
    pool: asyncpg.Pool,
    data: SkillFolderCreate,
    created_by: int | None = None,
    workspace_id: int | None = None,
) -> dict:
    return await skill_folder_repo.create_folder(
        pool,
        name=data.name,
        parent_id=data.parent_id,
        skill_id=data.skill_id,
        created_by=created_by,
        workspace_id=workspace_id,
    )


async def get_folder(pool: asyncpg.Pool, folder_id: int) -> dict | None:
    return await skill_folder_repo.get_folder(pool, folder_id)


async def list_folders(
    pool: asyncpg.Pool,
    parent_id: int | None = None,
    skill_id: int | None = None,
    workspace_id: int | None = None,
    user_id: int | None = None,
) -> list[dict]:
    return await skill_folder_repo.list_folders(
        pool,
        parent_id=parent_id,
        skill_id=skill_id,
        workspace_id=workspace_id,
        user_id=user_id,
    )


async def update_folder(
    pool: asyncpg.Pool, folder_id: int, data: SkillFolderUpdate
) -> dict | None:
    payload = data.model_dump(exclude_unset=True)
    return await skill_folder_repo.update_folder(pool, folder_id, payload)


async def delete_folder(pool: asyncpg.Pool, folder_id: int) -> bool:
    return await skill_folder_repo.delete_folder(pool, folder_id)


async def get_folder_path(pool: asyncpg.Pool, folder_id: int) -> list[dict]:
    return await skill_folder_repo.get_folder_path(pool, folder_id)
