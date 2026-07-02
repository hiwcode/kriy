from __future__ import annotations
from typing import Any
import asyncpg
from app.repositories import skill_file_repo
from app.schemas.skill_file import SkillFileCreate, SkillFileUpdate


async def create_file(pool: asyncpg.Pool, data: SkillFileCreate, created_by: int | None = None, workspace_id: int | None = None) -> dict:
    return await skill_file_repo.create_file(
        pool, skill_id=data.skill_id, name=data.name, content=data.content,
        file_type=data.file_type, folder_id=data.folder_id,
        created_by=created_by, workspace_id=workspace_id,
    )


async def get_file(pool: asyncpg.Pool, file_id: int) -> dict | None:
    return await skill_file_repo.get_file(pool, file_id)


async def list_files_by_skill(pool: asyncpg.Pool, skill_id: int, folder_id: int | None = None, folder_filter: bool = False) -> list[dict]:
    return await skill_file_repo.list_files_by_skill(pool, skill_id, folder_id=folder_id, folder_filter=folder_filter)


async def get_skill_tree(pool: asyncpg.Pool, skill_id: int) -> dict:
    return await skill_file_repo.get_skill_tree(pool, skill_id)


async def update_file(pool: asyncpg.Pool, file_id: int, data: SkillFileUpdate) -> dict | None:
    payload = data.model_dump(exclude_unset=True)
    return await skill_file_repo.update_file(pool, file_id, payload)


async def delete_file(pool: asyncpg.Pool, file_id: int) -> bool:
    return await skill_file_repo.delete_file(pool, file_id)


async def bulk_delete_files(pool: asyncpg.Pool, ids: list[int], skill_id: int | None = None) -> list[int]:
    return await skill_file_repo.bulk_delete_files(pool, ids, skill_id)
