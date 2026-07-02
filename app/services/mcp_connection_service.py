from __future__ import annotations

from typing import Any

import asyncpg

from app.repositories import mcp_connection_repo
from app.schemas.mcp_connection import McpConnectionCreate, McpConnectionUpdate


async def create_mcp_connection(
    pool: asyncpg.Pool,
    data: McpConnectionCreate,
    created_by: int | None = None,
    workspace_id: int | None = None,
) -> dict:
    return await mcp_connection_repo.create_mcp_connection(
        pool,
        name=data.name,
        url=data.url,
        transport_type=data.transport_type,
        headers=data.headers,
        timeout_seconds=data.timeout_seconds,
        created_by=created_by,
        workspace_id=workspace_id,
        command=data.command,
        args=data.args,
        env=data.env,
    )


async def get_mcp_connection(
    pool: asyncpg.Pool, connection_id: int
) -> dict | None:
    return await mcp_connection_repo.get_mcp_connection(pool, connection_id)


async def list_mcp_connections(
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
    connections = await mcp_connection_repo.list_mcp_connections(
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
    total = await mcp_connection_repo.count_mcp_connections(
        pool,
        search=search,
        filters=filters,
        user_id=user_id,
        workspace_id=workspace_id,
    )
    return connections, total


async def update_mcp_connection(
    pool: asyncpg.Pool, connection_id: int, data: McpConnectionUpdate
) -> dict | None:
    payload = data.model_dump(exclude_unset=True)
    return await mcp_connection_repo.update_mcp_connection(
        pool, connection_id, payload
    )


async def delete_mcp_connection(
    pool: asyncpg.Pool, connection_id: int
) -> bool:
    return await mcp_connection_repo.delete_mcp_connection(
        pool, connection_id
    )


async def get_mcp_connections_by_ids(
    pool: asyncpg.Pool, connection_ids: list[int]
) -> list[dict]:
    return await mcp_connection_repo.get_mcp_connections_by_ids(
        pool, connection_ids
    )
