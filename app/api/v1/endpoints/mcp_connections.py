from __future__ import annotations

import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.access import require_resource_access
from app.core.security import AuthContext, api_key_auth, require_google_auth
from app.deps import get_db, get_current_workspace
from app.schemas.mcp_connection import McpConnectionCreate, McpConnectionUpdate
from app.schemas.response import ApiResponse, Pagination
from app.services import mcp_connection_service, mcp_tools_service

import asyncpg

router = APIRouter(
    prefix="/mcp-connections",
    tags=["mcp-connections"],
    dependencies=[Depends(api_key_auth)],
)


@router.post("/", response_model=ApiResponse, status_code=status.HTTP_201_CREATED)
async def create_mcp_connection(
    data: McpConnectionCreate,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    workspace_id = workspace["id"] if workspace else None
    connection = await mcp_connection_service.create_mcp_connection(
        pool, data, created_by=auth.user_id, workspace_id=workspace_id
    )
    from app.core import cache
    await cache.delete_pattern(f"mcp:ws:{workspace_id}:*")
    return {
        "success": True,
        "message": "MCP connection created",
        "data": connection,
        "pagination": None,
    }


@router.get("/", response_model=ApiResponse)
async def list_mcp_connections(
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    search: str | None = Query(None, min_length=1),
    filters: str | None = Query(None),
    sort_field: str | None = Query(None, alias="sortField", min_length=1),
    sort_order: str | None = Query(None, alias="sortOrder", min_length=1),
) -> dict:
    parsed_filters: list[dict] | None = None
    if filters:
        try:
            raw_filters = json.loads(filters)
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid filters JSON",
            ) from exc
        if not isinstance(raw_filters, list):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="filters must be a list",
            )
        parsed_filters = []
        for item in raw_filters:
            if not isinstance(item, dict):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Each filter must be an object",
                )
            field = item.get("filterField") or item.get("filter_field")
            op = item.get("filterOp") or item.get("filter_op")
            value = (
                item.get("filterValue")
                if "filterValue" in item
                else item.get("filter_value")
            )
            parsed_filters.append(
                {"filter_field": field, "filter_op": op, "filter_value": value}
            )
    workspace_id = workspace["id"] if workspace else None

    from app.core import cache

    cache_key = None
    if not search and not parsed_filters and not sort_field:
        cache_key = f"mcp:ws:{workspace_id}:u:{auth.user_id}:{limit}:{offset}"
        cached = await cache.get(cache_key)
        if cached is not None:
            return cached

    try:
        connections, total = await mcp_connection_service.list_mcp_connections(
            pool,
            limit=limit,
            offset=offset,
            search=search,
            filters=parsed_filters,
            sort_field=sort_field,
            sort_order=sort_order,
            user_id=auth.user_id,
            workspace_id=workspace_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    page = (offset // limit) + 1 if limit else 1
    pagination = Pagination(limit=limit, offset=offset, total=total, page=page, page_size=limit)
    result = {
        "success": True,
        "message": "MCP connections fetched",
        "data": connections,
        "pagination": pagination.model_dump(),
    }
    if cache_key:
        await cache.set(cache_key, result, ttl=300)
    return result


@router.get("/{connection_id}/tools", response_model=ApiResponse)
async def list_mcp_connection_tools(
    connection_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """List available tools from an MCP server."""
    connection = await mcp_connection_service.get_mcp_connection(
        pool, connection_id
    )
    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="MCP connection not found",
        )
    await require_resource_access(connection, pool, auth)

    from app.core import cache

    tools_cache_key = f"mcp_tools:{connection_id}"
    cached = await cache.get(tools_cache_key)
    if cached is not None:
        return {"success": True, "message": "Tools fetched", "data": cached, "pagination": None}

    try:
        headers = connection.get("headers") or {}
        if not isinstance(headers, dict):
            headers = json.loads(headers) if isinstance(headers, str) else {}
        if not isinstance(headers, dict):
            headers = {}
        headers_str = {str(k): str(v) for k, v in headers.items()}
        tools = await mcp_tools_service.list_mcp_tools(
            url=connection.get("url") or "",
            headers=headers_str,
            timeout=float(connection.get("timeout_seconds", 60)),
            transport_type=str(connection.get("transport_type", "streamable_http")),
            command=connection.get("command"),
            args=connection.get("args"),
            env=connection.get("env"),
        )
        await cache.set(tools_cache_key, tools, ttl=600)
        return {
            "success": True,
            "message": "Tools fetched",
            "data": tools,
            "pagination": None,
        }
    except Exception as e:
        detail = str(e)
        if hasattr(e, "exceptions") and e.exceptions:
            detail = str(e.exceptions[0])
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to connect to MCP: {detail}",
        ) from e


@router.post("/{connection_id}/tools/call", response_model=ApiResponse)
async def call_mcp_tool(
    connection_id: int,
    body: dict,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Call an MCP tool by name with provided arguments."""
    connection = await mcp_connection_service.get_mcp_connection(
        pool, connection_id
    )
    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="MCP connection not found",
        )
    await require_resource_access(connection, pool, auth)
    tool_name = body.get("name") or body.get("tool_name")
    arguments = body.get("arguments") or body.get("args") or {}
    if not tool_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tool name is required (provide 'name' or 'tool_name')",
        )
    if not isinstance(arguments, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Arguments must be a JSON object",
        )
    try:
        headers = connection.get("headers") or {}
        if not isinstance(headers, dict):
            headers = json.loads(headers) if isinstance(headers, str) else {}
        if not isinstance(headers, dict):
            headers = {}
        headers_str = {str(k): str(v) for k, v in headers.items()}
        result = await mcp_tools_service.call_mcp_tool(
            url=connection.get("url") or "",
            tool_name=str(tool_name),
            arguments=arguments,
            headers=headers_str,
            timeout=float(connection.get("timeout_seconds", 60)),
            transport_type=str(connection.get("transport_type", "streamable_http")),
            command=connection.get("command"),
            args=connection.get("args"),
            env=connection.get("env"),
        )
        return {
            "success": True,
            "message": "Tool called",
            "data": result,
            "pagination": None,
        }
    except Exception as e:
        logging.getLogger(__name__).exception("MCP tool call failed: %s", e)
        detail = str(e)
        if hasattr(e, "exceptions") and e.exceptions:
            detail = str(e.exceptions[0])
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to call MCP tool: {detail}",
        ) from e


@router.get("/{connection_id}", response_model=ApiResponse)
async def get_mcp_connection(
    connection_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    connection = await mcp_connection_service.get_mcp_connection(
        pool, connection_id
    )
    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="MCP connection not found",
        )
    await require_resource_access(connection, pool, auth)
    return {
        "success": True,
        "message": "MCP connection fetched",
        "data": connection,
        "pagination": None,
    }


@router.patch("/{connection_id}", response_model=ApiResponse)
async def update_mcp_connection(
    connection_id: int,
    data: McpConnectionUpdate,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    existing = await mcp_connection_service.get_mcp_connection(
        pool, connection_id
    )
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="MCP connection not found",
        )
    await require_resource_access(existing, pool, auth)
    connection = await mcp_connection_service.update_mcp_connection(
        pool, connection_id, data
    )
    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="MCP connection not found",
        )
    from app.core import cache
    ws_id = existing.get("workspace_id")
    await cache.delete_pattern(f"mcp:ws:{ws_id}:*")
    await cache.delete(f"mcp_tools:{connection_id}")
    return {
        "success": True,
        "message": "MCP connection updated",
        "data": connection,
        "pagination": None,
    }


@router.delete(
    "/{connection_id}", response_model=ApiResponse, status_code=status.HTTP_200_OK
)
async def delete_mcp_connection(
    connection_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    existing = await mcp_connection_service.get_mcp_connection(
        pool, connection_id
    )
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="MCP connection not found",
        )
    await require_resource_access(existing, pool, auth)
    deleted = await mcp_connection_service.delete_mcp_connection(
        pool, connection_id
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="MCP connection not found",
        )
    from app.core import cache
    ws_id = existing.get("workspace_id")
    await cache.delete_pattern(f"mcp:ws:{ws_id}:*")
    await cache.delete(f"mcp_tools:{connection_id}")
    return {
        "success": True,
        "message": "MCP connection deleted",
        "data": None,
        "pagination": None,
    }
