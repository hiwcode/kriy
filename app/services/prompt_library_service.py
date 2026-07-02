from __future__ import annotations

import asyncpg

from app.core.tokens import count_tokens
from app.repositories import prompt_library_repo
from app.schemas.prompt_library import PromptLibraryCreate, PromptLibraryUpdate


async def create_prompt(
    pool: asyncpg.Pool,
    data: PromptLibraryCreate,
    created_by: int | None = None,
    workspace_id: int | None = None,
) -> dict:
    tokens = count_tokens(data.prompt)
    return await prompt_library_repo.create_prompt(
        pool,
        title=data.title,
        prompt=data.prompt,
        tokens=tokens,
        created_by=created_by,
        workspace_id=workspace_id,
        extradata=data.extradata,
        prompt_type=data.prompt_type,
    )


async def get_prompt(pool: asyncpg.Pool, prompt_id: int) -> dict | None:
    return await prompt_library_repo.get_prompt(pool, prompt_id)


async def list_prompts(
    pool: asyncpg.Pool,
    limit: int = 50,
    offset: int = 0,
    search: str | None = None,
    filters: list[dict] | None = None,
    sort_field: str | None = None,
    sort_order: str | None = None,
    user_id: int | None = None,
    workspace_id: int | None = None,
) -> tuple[list[dict], int]:
    prompts = await prompt_library_repo.list_prompts(
        pool,
        limit=limit,
        offset=offset,
        search=search,
        filters=filters,
        sort_field=sort_field,
        sort_order=sort_order,
        user_id=user_id,
        workspace_id=workspace_id,
    )
    total = await prompt_library_repo.count_prompts(
        pool,
        search=search,
        filters=filters,
        user_id=user_id,
        workspace_id=workspace_id,
    )
    return prompts, total


async def update_prompt(
    pool: asyncpg.Pool, prompt_id: int, data: PromptLibraryUpdate
) -> dict | None:
    payload = data.model_dump(exclude_unset=True)
    if not payload:
        return await prompt_library_repo.update_prompt(pool, prompt_id, payload)

    if "prompt" in payload:
        payload["tokens"] = count_tokens(payload["prompt"])

    return await prompt_library_repo.update_prompt(pool, prompt_id, payload)


async def delete_prompt(pool: asyncpg.Pool, prompt_id: int) -> bool:
    return await prompt_library_repo.delete_prompt(pool, prompt_id)


async def bulk_delete_prompts(
    pool: asyncpg.Pool,
    ids: list[int],
    user_id: int | None = None,
    workspace_id: int | None = None,
) -> list[int]:
    return await prompt_library_repo.bulk_delete_prompts(
        pool, ids, user_id=user_id, workspace_id=workspace_id
    )


async def duplicate_prompt(
    pool: asyncpg.Pool,
    prompt_id: int,
    workspace_id: int | None = None,
) -> dict | None:
    return await prompt_library_repo.duplicate_prompt(
        pool, prompt_id, workspace_id=workspace_id
    )
