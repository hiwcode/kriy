"""
Integration API – programmatic access to agents, sessions, and chat.

These endpoints mirror the browser-based UI but are designed for
external integrations, SDKs, and A2A consumers.  They share the
same authentication tokens (Google OAuth / API key) as the rest of
the API.

Prefix: /api/v1/integration
"""

from __future__ import annotations

import fnmatch
import json
import uuid
from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.core.access import require_resource_access
from app.core.config import settings
from app.core.security import AuthContext, api_key_auth, require_google_auth
from app.deps import get_db, get_current_workspace
from app.repositories import agent_repo, session_repo, trace_repo
from app.schemas.agent import AgentUpdate
from app.schemas.response import ApiResponse, Pagination
from app.services import agent_service, agent_run_service

router = APIRouter(
    prefix="/integration",
    tags=["integration"],
    dependencies=[Depends(api_key_auth)],
)


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------


class ChatRequest(BaseModel):
    """Send a message to an agent (creates a session when session_id is omitted)."""
    message: str = Field(..., min_length=1, description="User message")
    session_id: str | None = Field(None, description="Existing session (auto-created if omitted)")


class SessionOut(BaseModel):
    session_id: str
    title: str | None = None
    last_update_time: float | None = None
    message_count: int | None = None


class AgentCardOut(BaseModel):
    id: int
    name: str
    label: str
    model: str
    description: str | None = None
    a2a_url: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _require_agent(
    agent_id: int,
    pool: asyncpg.Pool,
    auth: AuthContext,
) -> dict[str, Any]:
    """Validate agent exists and user has access. Returns agent dict."""
    agent = await agent_service.get_agent(pool, agent_id)
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    await require_resource_access(agent, pool, auth)
    return agent


def _user_id_str(auth: AuthContext) -> str:
    return str(auth.user_id)


def _read_user_id(agent: dict, auth: AuthContext) -> str | None:
    if agent.get("workspace_id"):
        return None
    return str(auth.user_id)


# ---------------------------------------------------------------------------
# Agent discovery
# ---------------------------------------------------------------------------


@router.get("/agents", response_model=list[AgentCardOut])
async def list_available_agents(
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> list[dict]:
    """List all agents accessible to the authenticated user with their A2A URLs."""
    workspace_id = workspace["id"] if workspace else None
    agents, _ = await agent_service.list_agents(
        pool, limit=200, offset=0, user_id=auth.user_id, workspace_id=workspace_id,
    )
    base = settings.BACKEND_URL.rstrip("/")
    result: list[dict] = []
    for a in agents:
        result.append({
            "id": a["id"],
            "name": a.get("name", ""),
            "label": a.get("label", ""),
            "model": a.get("model", ""),
            "description": a.get("description"),
            "a2a_url": f"{base}/a2a/{a['id']}/",
        })
    return result


@router.get("/agents/{agent_id}", response_model=AgentCardOut)
async def get_agent_info(
    agent_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Get a single agent's info including its A2A endpoint."""
    agent = await _require_agent(agent_id, pool, auth)
    base = settings.BACKEND_URL.rstrip("/")
    return {
        "id": agent["id"],
        "name": agent.get("name", ""),
        "label": agent.get("label", ""),
        "model": agent.get("model", ""),
        "description": agent.get("description"),
        "a2a_url": f"{base}/a2a/{agent['id']}/",
    }


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------


@router.get("/agents/{agent_id}/sessions", response_model=list[SessionOut])
async def list_sessions(
    agent_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[dict]:
    """List chat sessions for an agent."""
    agent = await _require_agent(agent_id, pool, auth)
    uid = _read_user_id(agent, auth)
    sessions = await session_repo.list_sessions_paginated(
        pool,
        agent_id=agent_id,
        user_id=uid,
        limit=limit,
        offset=offset,
        sort_field="last_update_time",
        sort_order="desc",
    )
    return [
        {
            "session_id": s.get("session_id", ""),
            "title": s.get("title"),
            "last_update_time": s.get("last_update_time"),
            "message_count": s.get("message_count"),
        }
        for s in sessions
    ]


@router.post("/agents/{agent_id}/sessions", response_model=SessionOut)
async def create_session(
    agent_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Create a new empty session for the agent."""
    await _require_agent(agent_id, pool, auth)
    session_id = str(uuid.uuid4())
    return {
        "session_id": session_id,
        "title": None,
        "last_update_time": None,
        "message_count": 0,
    }


@router.get("/agents/{agent_id}/sessions/{session_id}")
async def get_session_history(
    agent_id: int,
    session_id: str,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Get full chat history for a session."""
    agent = await _require_agent(agent_id, pool, auth)
    uid = _read_user_id(agent, auth)
    result = await session_repo.get_session_history(pool, agent_id, session_id, uid)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return {"session_id": session_id, **result}


@router.delete("/agents/{agent_id}/sessions/{session_id}")
async def delete_session(
    agent_id: int,
    session_id: str,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Delete a chat session."""
    agent = await _require_agent(agent_id, pool, auth)
    uid = _read_user_id(agent, auth)
    deleted = await session_repo.delete_session(pool, agent_id, session_id, uid)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return {"deleted": True, "session_id": session_id}


# ---------------------------------------------------------------------------
# Chat (SSE streaming)
# ---------------------------------------------------------------------------


@router.post("/agents/{agent_id}/chat")
async def chat(
    agent_id: int,
    data: ChatRequest,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
):
    """
    Send a message and stream the agent's response as SSE.

    SSE event types:
    - ``session``  – ``{ "type": "session", "session_id": "..." }``
    - ``text``     – ``{ "type": "text", "text": "..." }``
    - ``error``    – ``{ "type": "error", "error": "..." }``

    If ``session_id`` is omitted a new session is created automatically.
    """
    await _require_agent(agent_id, pool, auth)
    user_id = _user_id_str(auth)

    async def generate():
        async for chunk in agent_run_service.run_agent_stream(
            pool,
            agent_id=agent_id,
            user_input=data.message,
            session_id=data.session_id,
            user_id=user_id,
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


# ---------------------------------------------------------------------------
# Chat (non-streaming / synchronous)
# ---------------------------------------------------------------------------


@router.post("/agents/{agent_id}/chat/sync")
async def chat_sync(
    agent_id: int,
    data: ChatRequest,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """
    Send a message and receive the complete response (non-streaming).

    Useful for simple integrations that don't support SSE.
    Returns ``{ "session_id": "...", "response": "..." }``.
    """
    await _require_agent(agent_id, pool, auth)
    user_id = _user_id_str(auth)

    full_text = ""
    session_id = data.session_id

    async for chunk in agent_run_service.run_agent_stream(
        pool,
        agent_id=agent_id,
        user_input=data.message,
        session_id=session_id,
        user_id=user_id,
        db_user_id=auth.user_id,
    ):
        # Parse SSE data lines
        for line in chunk.strip().split("\n"):
            if line.startswith("data: "):
                try:
                    payload = json.loads(line[6:])
                    if payload.get("type") == "text":
                        full_text += payload.get("text", "")
                    elif payload.get("type") == "session":
                        session_id = payload.get("session_id", session_id)
                    elif payload.get("type") == "error":
                        raise HTTPException(
                            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail=payload.get("error", "Agent error"),
                        )
                except json.JSONDecodeError:
                    pass

    return {"session_id": session_id, "response": full_text}


# ---------------------------------------------------------------------------
# Traces
# ---------------------------------------------------------------------------


@router.get("/agents/{agent_id}/sessions/{session_id}/traces")
async def get_session_traces(
    agent_id: int,
    session_id: str,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Get execution traces for a specific session."""
    agent = await _require_agent(agent_id, pool, auth)
    uid = _read_user_id(agent, auth)
    detail = await trace_repo.get_trace_detail(pool, agent_id, session_id, uid)
    return {"session_id": session_id, "traces": detail or []}


# ---------------------------------------------------------------------------
# A2A management
# ---------------------------------------------------------------------------


@router.post("/agents/{agent_id}/a2a/reload")
async def reload_agent_a2a(
    agent_id: int,
    request: Request,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """
    (Re-)mount the A2A endpoint for a specific agent.

    Call this after creating or updating an agent so its A2A card
    is available without restarting the server.
    """
    agent = await _require_agent(agent_id, pool, auth)

    try:
        from app.a2a.server import build_a2a_app
        from starlette.routing import Mount
        from starlette.applications import Starlette

        fastapi_app = request.app
        mount_path = f"/a2a/{agent_id}/"

        # Remove existing mount if present
        fastapi_app.routes[:] = [
            r for r in fastapi_app.routes
            if not (isinstance(r, Mount) and r.path == mount_path.rstrip("/"))
        ]

        starlette_app = await build_a2a_app(pool, agent, mount_path=mount_path)
        fastapi_app.mount(mount_path, starlette_app)
        await starlette_app.router.startup()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to mount A2A: {e}",
        )

    base = settings.BACKEND_URL.rstrip("/")
    return {
        "mounted": True,
        "agent_id": agent_id,
        "a2a_url": f"{base}/a2a/{agent_id}/",
        "agent_card_url": f"{base}/a2a/{agent_id}/.well-known/agent.json",
    }
