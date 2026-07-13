from __future__ import annotations

import json
import os
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel

from app.core.access import require_resource_access
from app.core.security import AuthContext, api_key_auth, require_google_auth
from app.deps import get_db, get_current_workspace
from app.repositories import memory_repo, session_repo, trace_repo
from app.schemas.agent import AgentCreate, AgentUpdate, AgentBulkDelete
from app.schemas.response import ApiResponse, Pagination
from app.services import agent_service, agent_run_service, memory_service, run_manager

import asyncpg


class AgentRunRequest(BaseModel):
    message: str
    session_id: str | None = None
    document_ids: list[int] | None = None


class ToolConfirmRequest(BaseModel):
    session_id: str
    function_call_id: str
    confirmed: bool


def _session_user_id(agent: dict, auth: AuthContext) -> str:
    """Derive session user_id for **write** operations (run, create memory).
    Always returns the current user's numeric DB id so we know who created
    a session / memory.
    """
    return str(auth.user_id)


def _read_user_id(agent: dict, auth: AuthContext) -> str | None:
    """Derive user_id filter for **read** operations.
    When the agent belongs to a workspace, returns None so that all
    workspace members see every session / memory / trace for the agent.
    For personal (non-workspace) agents, returns the current user's id.
    """
    if agent.get("workspace_id"):
        return None  # workspace-scoped → show all users' data
    return str(auth.user_id)


async def _require_agent_access(
    agent_id: int,
    pool: asyncpg.Pool,
    auth: AuthContext,
) -> dict:
    """Get agent if it exists and user has access. Raises 404 otherwise."""
    agent = await agent_service.get_agent(pool, agent_id)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found"
        )
    await require_resource_access(agent, pool, auth)
    return agent


router = APIRouter(
    prefix="/agents",
    tags=["agents"],
    dependencies=[Depends(api_key_auth)],
)


@router.post("/", response_model=ApiResponse, status_code=status.HTTP_201_CREATED)
async def create_agent(
    data: AgentCreate,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    workspace_id = workspace["id"] if workspace else None
    agent = await agent_service.create_agent(
        pool, data, created_by=auth.user_id, workspace_id=workspace_id
    )
    from app.core import cache
    await cache.delete_pattern(f"agents:ws:{workspace_id}:*")
    return {
        "success": True,
        "message": "Agent created",
        "data": agent,
        "pagination": None,
    }


@router.get("/", response_model=ApiResponse)
async def list_agents(
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

    # Cache simple unfiltered list calls (the most common pattern from the UI)
    from app.core import cache

    cache_key = None
    if not search and not parsed_filters and not sort_field:
        cache_key = f"agents:ws:{workspace_id}:u:{auth.user_id}:{limit}:{offset}"
        cached = await cache.get(cache_key)
        if cached is not None:
            return cached

    try:
        agents, total = await agent_service.list_agents(
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
        "message": "Agents fetched",
        "data": agents,
        "pagination": pagination.model_dump(),
    }
    if cache_key:
        await cache.set(cache_key, result, ttl=300)
    return result


@router.get("/builtin-tools/list", response_model=ApiResponse)
async def list_builtin_tools() -> dict:
    """List available builtin tool names for agent configuration."""
    from app.core import cache

    cached = await cache.get("builtin_tools")
    if cached is not None:
        return {"success": True, "message": "Builtin tools fetched", "data": cached, "pagination": None}

    from app.agents.tool_registry import get_all_builtin_tool_names

    names = get_all_builtin_tool_names()
    # Add special tool types that are handled separately in _build_tools
    names.append("schedule")
    names.append("workflow")  # CRUD the user's event-driven workflows
    names.append("events")    # CRUD the user's event-type registry
    names.append("notify")    # send the user an in-app notification
    names.append("send_email")  # send email via the user's configured Gmail
    names.append("call_api")  # make HTTP requests to external APIs
    names.append("web_search")  # search the web via Google Custom Search
    names.append("analyze_document")  # vision-based analysis of an uploaded document
    names.append("analyze_image")     # vision-based analysis of an uploaded image
    names.append("self_learning")  # let the agent save skills from conversations
    names.append("ui")        # render plan / todo / info cards in the chat UI

    await cache.set("builtin_tools", names, ttl=86400)
    return {
        "success": True,
        "message": "Builtin tools fetched",
        "data": names,
        "pagination": None,
    }


@router.get("/{agent_id}", response_model=ApiResponse)
async def get_agent(
    agent_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    agent = await _require_agent_access(agent_id, pool, auth)
    return {
        "success": True,
        "message": "Agent fetched",
        "data": agent,
        "pagination": None,
    }


@router.patch("/{agent_id}", response_model=ApiResponse)
async def update_agent(
    agent_id: int,
    data: AgentUpdate,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    await _require_agent_access(agent_id, pool, auth)
    agent = await agent_service.update_agent(pool, agent_id, data)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found"
        )
    from app.core import cache
    ws_id = agent.get("workspace_id")
    await cache.delete_pattern(f"agents:ws:{ws_id}:*")
    return {
        "success": True,
        "message": "Agent updated",
        "data": agent,
        "pagination": None,
    }


@router.delete("/{agent_id}", response_model=ApiResponse, status_code=status.HTTP_200_OK)
async def delete_agent(
    agent_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    agent = await _require_agent_access(agent_id, pool, auth)
    deleted = await agent_service.delete_agent(pool, agent_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found"
        )
    from app.core import cache
    await cache.delete_pattern(f"agents:ws:{agent.get('workspace_id')}:*")
    return {
        "success": True,
        "message": "Agent deleted",
        "data": None,
        "pagination": None,
    }


@router.get("/{agent_id}/sessions", response_model=ApiResponse)
async def list_agent_sessions(
    agent_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    search: str | None = Query(None, min_length=1),
    filters: str | None = Query(None),
    sort_field: str | None = Query(None, alias="sortField", min_length=1),
    sort_order: str | None = Query(None, alias="sortOrder", min_length=1),
) -> dict:
    """List chat sessions for an agent with search, filter, sort, pagination."""
    agent = await _require_agent_access(agent_id, pool, auth)
    session_user_id = _read_user_id(agent, auth)
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
    try:
        sessions = await session_repo.list_sessions_paginated(
            pool,
            agent_id=agent_id,
            user_id=session_user_id,
            limit=limit,
            offset=offset,
            search=search,
            filters=parsed_filters,
            sort_field=sort_field or "last_update_time",
            sort_order=sort_order or "desc",
        )
        total = await session_repo.count_sessions(
            pool,
            agent_id=agent_id,
            user_id=session_user_id,
            search=search,
            filters=parsed_filters,
        )
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    return {
        "success": True,
        "message": "Sessions fetched",
        "data": sessions,
        "pagination": Pagination(
            limit=limit, offset=offset, total=total, page=1, page_size=limit
        ),
    }


@router.get("/{agent_id}/sessions/{session_id}", response_model=ApiResponse)
async def get_session_history(
    agent_id: int,
    session_id: str,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Get chat history for a session."""
    agent = await _require_agent_access(agent_id, pool, auth)
    session_user_id = _read_user_id(agent, auth)
    result = await session_repo.get_session_history(
        pool, agent_id, session_id, session_user_id
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    return {
        "success": True,
        "message": "History fetched",
        "data": result,
        "pagination": None,
    }


@router.post("/{agent_id}/sessions", response_model=ApiResponse)
async def create_agent_session(
    agent_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Create a new chat session. Returns session_id for use in run."""
    import uuid

    await _require_agent_access(agent_id, pool, auth)
    session_id = str(uuid.uuid4())
    return {
        "success": True,
        "message": "Session created",
        "data": {"session_id": session_id},
        "pagination": None,
    }


@router.delete("/{agent_id}/sessions/{session_id}", response_model=ApiResponse)
async def delete_agent_session(
    agent_id: int,
    session_id: str,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Delete a chat session."""
    agent = await _require_agent_access(agent_id, pool, auth)
    session_user_id = _read_user_id(agent, auth)
    deleted = await session_repo.delete_session(
        pool, agent_id, session_id, session_user_id
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    return {
        "success": True,
        "message": "Session deleted",
        "data": None,
        "pagination": None,
    }


class CreateMemoryRequest(BaseModel):
    content: str
    memory_type: str = "fact"


@router.post("/{agent_id}/memories", response_model=ApiResponse)
async def create_agent_memory(
    agent_id: int,
    data: CreateMemoryRequest,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Manually add a fact/memory for an agent."""
    await _require_agent_access(agent_id, pool, auth)
    session_user_id = str(auth.user_id)  # writes always owned by current user
    if not data.content or not data.content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Content is required"
        )
    memory_id = await memory_repo.create_memory(
        pool,
        agent_id=agent_id,
        user_id=session_user_id,
        content=data.content.strip(),
        memory_type=data.memory_type or "fact",
        confidence=1.0,
    )
    return {
        "success": True,
        "message": "Memory added",
        "data": {"id": memory_id},
        "pagination": None,
    }


@router.get("/{agent_id}/memories", response_model=ApiResponse)
async def list_agent_memories(
    agent_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    search: str | None = Query(None),
) -> dict:
    """List extracted memories for an agent with pagination and search."""
    agent = await _require_agent_access(agent_id, pool, auth)
    session_user_id = _read_user_id(agent, auth)
    memories = await memory_repo.list_memories(
        pool, agent_id, session_user_id, limit, offset, search
    )
    total = await memory_repo.count_memories(
        pool, agent_id, session_user_id, search
    )
    return {
        "success": True,
        "message": "Memories fetched",
        "data": memories,
        "pagination": {"total": total, "limit": limit, "offset": offset},
    }


@router.post("/{agent_id}/memories/sync", response_model=ApiResponse)
async def sync_agent_memories(
    agent_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    replace: bool = Query(False, description="Replace existing memories"),
) -> dict:
    """Extract memories from sessions and store them."""
    agent = await _require_agent_access(agent_id, pool, auth)
    session_user_id = _read_user_id(agent, auth)
    count = await memory_service.extract_and_store_memories(
        pool, agent_id, session_user_id, replace_existing=replace,
        db_user_id=auth.user_id,
    )
    return {
        "success": True,
        "message": f"Extracted {count} memories",
        "data": {"count": count},
        "pagination": None,
    }


@router.delete("/{agent_id}/memories/{memory_id}", response_model=ApiResponse)
async def delete_agent_memory(
    agent_id: int,
    memory_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Delete a specific memory."""
    agent = await _require_agent_access(agent_id, pool, auth)
    session_user_id = _read_user_id(agent, auth)
    deleted = await memory_repo.delete_memory(pool, memory_id, agent_id, session_user_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Memory not found"
        )
    return {
        "success": True,
        "message": "Memory deleted",
        "data": None,
        "pagination": None,
    }


@router.get("/{agent_id}/traces", response_model=ApiResponse)
async def list_agent_traces(
    agent_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    search: str | None = Query(None),
) -> dict:
    """List traces (sessions with tool/usage stats) for an agent with pagination and search."""
    agent = await _require_agent_access(agent_id, pool, auth)
    session_user_id = _read_user_id(agent, auth)
    traces = await trace_repo.list_traces(
        pool, agent_id, session_user_id, limit, offset, search
    )
    total = await trace_repo.count_traces(
        pool, agent_id, session_user_id, search
    )
    return {
        "success": True,
        "message": "Traces fetched",
        "data": traces,
        "pagination": {"total": total, "limit": limit, "offset": offset},
    }


@router.get("/{agent_id}/traces/{session_id}", response_model=ApiResponse)
async def get_trace_detail(
    agent_id: int,
    session_id: str,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Get full trace detail: events, tool calls, tool responses, token usage."""
    agent = await _require_agent_access(agent_id, pool, auth)
    session_user_id = _read_user_id(agent, auth)
    trace = await trace_repo.get_trace_detail(
        pool, agent_id, session_id, session_user_id
    )
    if not trace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Trace not found"
        )
    return {
        "success": True,
        "message": "Trace fetched",
        "data": trace,
        "pagination": None,
    }


_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


@router.post("/{agent_id}/run")
async def run_agent(
    agent_id: int,
    data: AgentRunRequest,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
):
    """Start (or attach to) an agent run and stream it via SSE.

    The run executes in a detached background task, so it survives the client
    disconnecting (navigating away). This endpoint just subscribes to that run's
    output; leaving and returning re-attaches instead of killing the work.
    """
    import uuid

    await _require_agent_access(agent_id, pool, auth)
    session_user_id = str(auth.user_id)

    # Need a stable session id up front so the run is keyed and re-attachable.
    session_id = data.session_id or str(uuid.uuid4())
    key = run_manager.run_key(agent_id, session_id)

    if not run_manager.is_active(key):
        run_manager.start(
            key,
            lambda: agent_run_service.run_agent_stream(
                pool,
                agent_id=agent_id,
                user_input=data.message,
                session_id=session_id,
                user_id=session_user_id,
                db_user_id=auth.user_id,
                document_ids=data.document_ids,
            ),
        )

    return StreamingResponse(
        run_manager.subscribe(key),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.get("/{agent_id}/runs/{session_id}/status", response_model=ApiResponse)
async def run_status(
    agent_id: int,
    session_id: str,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Is a run for this session still going (or finished within the replay window)?"""
    await _require_agent_access(agent_id, pool, auth)
    st = run_manager.status(run_manager.run_key(agent_id, session_id))
    return {"success": True, "message": "Run status", "data": st, "pagination": None}


@router.get("/{agent_id}/runs/{session_id}/stream")
async def reattach_run(
    agent_id: int,
    session_id: str,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
):
    """Re-attach to an in-flight (or just-finished) run: replays its output, then tails live."""
    await _require_agent_access(agent_id, pool, auth)
    return StreamingResponse(
        run_manager.subscribe(run_manager.run_key(agent_id, session_id)),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.post("/{agent_id}/runs/{session_id}/stop", response_model=ApiResponse)
async def stop_run(
    agent_id: int,
    session_id: str,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Stop an in-flight run."""
    await _require_agent_access(agent_id, pool, auth)
    stopped = run_manager.stop(run_manager.run_key(agent_id, session_id))
    return {"success": True, "message": "Run stopped" if stopped else "No active run", "data": {"stopped": stopped}, "pagination": None}


@router.post("/{agent_id}/confirm")
async def confirm_tool(
    agent_id: int,
    data: ToolConfirmRequest,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
):
    """Send tool confirmation response and resume agent execution via SSE."""
    await _require_agent_access(agent_id, pool, auth)
    session_user_id = str(auth.user_id)

    async def generate():
        async for chunk in agent_run_service.confirm_tool_stream(
            pool,
            agent_id=agent_id,
            session_id=data.session_id,
            function_call_id=data.function_call_id,
            confirmed=data.confirmed,
            user_id=session_user_id,
            db_user_id=auth.user_id,
        ):
            yield chunk

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# Serve artifacts from the SAME dir the tools write to (bash, run_python, file
# tools). Override with ATELIER_WORKSPACE_DIR. Previously hardcoded to a Desktop
# path, which never matched where generated files actually landed.
from app.agents.tool_registry import WORKSPACE_DIR as _WORKSPACE_DIR
_ALLOWED_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico",
    ".pdf", ".txt", ".json", ".csv", ".html", ".md",
}

# Extensions that can execute as active content in the browser — served as a
# download (attachment, neutral type) instead of inline to prevent stored XSS.
_ACTIVE_EXTENSIONS = {".html", ".htm", ".svg", ".xml", ".xhtml"}

# Safe inline content types for renderable artifacts (charts, images, docs).
_INLINE_MEDIA_TYPES = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
    ".ico": "image/x-icon", ".pdf": "application/pdf", ".txt": "text/plain",
    ".json": "application/json", ".csv": "text/csv", ".md": "text/plain",
}

# Separate router without auth for serving workspace files (used by <img> tags)
workspace_router = APIRouter(prefix="/agents", tags=["agents"])


@workspace_router.get("/workspace-file/{file_path:path}")
async def serve_workspace_file(file_path: str, sig: str | None = Query(default=None)):
    """Serve a file from the agent workspace (temp dir) for inline display.

    Access is gated by an HMAC signature over the relative path (minted by the
    tool that created the file). A valid `sig` is always required — the shared
    file namespace means the signature is the only cross-session guard.
    """
    from app.core import workspace_signing

    # Always require a valid HMAC signature — the file namespace is shared, so
    # this is the only thing stopping cross-session artifact reads.
    if not workspace_signing.verify_path(file_path, sig):
        raise HTTPException(status_code=403, detail="Invalid or missing signature")

    safe_path = (_WORKSPACE_DIR / file_path).resolve()
    try:
        safe_path.relative_to(_WORKSPACE_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")

    if not safe_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    ext = safe_path.suffix.lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=403, detail=f"File type {ext} not allowed")

    # Active content (html/svg/xml) is served as a neutral download so it can't
    # execute as script in the app origin; images/pdf/etc render inline as before.
    if ext in _ACTIVE_EXTENSIONS:
        return FileResponse(
            safe_path,
            media_type="application/octet-stream",
            content_disposition_type="attachment",
        )
    return FileResponse(safe_path, media_type=_INLINE_MEDIA_TYPES.get(ext))


@router.post("/bulk-delete", response_model=ApiResponse)
async def bulk_delete(
    payload: AgentBulkDelete,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    workspace_id = workspace["id"] if workspace else None
    deleted_ids = await agent_service.bulk_delete_agents(
        pool, payload.ids, user_id=auth.user_id, workspace_id=workspace_id
    )
    from app.core import cache
    await cache.delete_pattern(f"agents:ws:{workspace_id}:*")
    return {
        "success": True,
        "message": "Agents deleted",
        "data": {"deleted_ids": deleted_ids},
        "pagination": None,
    }
