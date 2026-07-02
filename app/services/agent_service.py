from __future__ import annotations

from typing import Any

import asyncpg

from app.repositories import agent_repo
from app.schemas.agent import AgentCreate, AgentUpdate


async def create_agent(
    pool: asyncpg.Pool,
    data: AgentCreate,
    created_by: int | None = None,
    workspace_id: int | None = None,
) -> dict:
    return await agent_repo.create_agent(
        pool,
        name=data.name,
        label=data.label,
        model=data.model,
        description=data.description,
        system_prompt=data.system_prompt,
        system_prompt_id=data.system_prompt_id,
        instruction=data.instruction,
        instruction_prompt_id=data.instruction_prompt_id,
        tools=data.tools,
        extra_fields=data.extra_fields,
        is_orchestrator=data.is_orchestrator,
        sub_agent_ids=data.sub_agent_ids,
        skill_ids=data.skill_ids,
        created_by=created_by,
        workspace_id=workspace_id,
    )


async def get_agent(pool: asyncpg.Pool, agent_id: int) -> dict | None:
    return await agent_repo.get_agent(pool, agent_id)


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
) -> tuple[list[dict], int]:
    agents = await agent_repo.list_agents(
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
    total = await agent_repo.count_agents(
        pool,
        search=search,
        filters=filters,
        user_id=user_id,
        workspace_id=workspace_id,
    )
    return agents, total


async def update_agent(
    pool: asyncpg.Pool, agent_id: int, data: AgentUpdate
) -> dict | None:
    payload = data.model_dump(exclude_unset=True)
    return await agent_repo.update_agent(pool, agent_id, payload)


async def delete_agent(pool: asyncpg.Pool, agent_id: int) -> bool:
    return await agent_repo.delete_agent(pool, agent_id)


async def bulk_delete_agents(
    pool: asyncpg.Pool,
    ids: list[int],
    user_id: int | None = None,
    workspace_id: int | None = None,
) -> list[int]:
    return await agent_repo.bulk_delete_agents(pool, ids, user_id, workspace_id)


async def get_agents_by_ids(
    pool: asyncpg.Pool, agent_ids: list[int]
) -> list[dict]:
    return await agent_repo.get_agents_by_ids(pool, agent_ids)
