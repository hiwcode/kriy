from __future__ import annotations

import asyncpg

from app.repositories import user_repo
from app.schemas.user import UserCreate, UserUpdate


async def create_user(pool: asyncpg.Pool, user_in: UserCreate) -> dict:
    return await user_repo.create_user(pool, user_in)


async def get_user(pool: asyncpg.Pool, user_id: int) -> dict | None:
    return await user_repo.get_user(pool, user_id)


async def list_users(
    pool: asyncpg.Pool, limit: int = 50, offset: int = 0
) -> tuple[list[dict], int]:
    users = await user_repo.list_users(pool, limit=limit, offset=offset)
    total = await user_repo.count_users(pool)
    return users, total


async def update_user(pool: asyncpg.Pool, user_id: int, user_in: UserUpdate) -> dict | None:
    return await user_repo.update_user(pool, user_id, user_in)


async def delete_user(pool: asyncpg.Pool, user_id: int) -> bool:
    return await user_repo.delete_user(pool, user_id)
