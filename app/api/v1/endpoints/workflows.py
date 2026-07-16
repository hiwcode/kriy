"""Event-driven workflows + event ingestion.

- ``/workflows``        — per-user workflow CRUD (subscriptions: event_type -> agent + rule)
- ``/workflows/chat``   — compile a plain-English description into a workflow spec
- ``/workflows/{id}/runs`` — execution history
- ``/events``           — apps emit events here; we route to matching workflows and run them

These share the SDK/API auth (per-user API key or Google sign-in) — both resolve to a
user, which scopes everything below to that tenant.
"""

from __future__ import annotations

import json
from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.core.access import require_resource_access
from app.core.security import AuthContext, api_key_auth, require_google_auth
from app.deps import get_current_workspace, get_db
from app.repositories import event_type_repo, gate_repo, workflow_repo
from app.schemas.response import ApiResponse, Pagination
from app.services import agent_run_service, agent_service, event_dispatcher, event_worker


def _page(limit: int, offset: int, total: int) -> Pagination:
    return Pagination(
        limit=limit, offset=offset, total=total,
        page=(offset // limit) + 1 if limit else 1, page_size=limit,
    )

router = APIRouter(
    prefix="/workflows",
    tags=["workflows"],
    dependencies=[Depends(api_key_auth)],
)
events_router = APIRouter(
    prefix="/events",
    tags=["events"],
    dependencies=[Depends(api_key_auth)],
)
event_types_router = APIRouter(
    prefix="/event-types",
    tags=["event-types"],
    dependencies=[Depends(api_key_auth)],
)


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #


class WorkflowIn(BaseModel):
    name: str = Field(..., min_length=1)
    event_type: str = Field("*", description="Glob matched against the emitted event type")
    agent_id: int
    instructions: str = ""
    enabled: bool = True
    priority: int = Field(0, description="Higher runs first when several match an event")
    execution_mode: str = Field("serial", description="'serial' or 'parallel'")
    max_concurrency: int = Field(3, ge=1, le=20, description="Max concurrent runs when parallel")


class WorkflowOut(WorkflowIn):
    id: int
    user_id: int | None = None
    workspace_id: int | None = None


class WorkflowChatMessage(BaseModel):
    role: str
    content: str = Field(..., min_length=1)


class WorkflowChatRequest(BaseModel):
    agent_id: int = Field(..., description="Agent used to compile (and later run) the workflow")
    messages: list[WorkflowChatMessage] = Field(..., min_length=1)


class CompiledWorkflow(BaseModel):
    name: str = ""
    event_type: str = "*"
    instructions: str = ""


class WorkflowChatResponse(BaseModel):
    reply: str
    workflow: CompiledWorkflow | None = None


class EventIn(BaseModel):
    type: str = Field(..., min_length=1, description="e.g. 'todo.completed'")
    payload: Any = Field(None, description="Event data / context for the agent")


class EventOut(BaseModel):
    event: str
    matched: int
    run_ids: list[int]
    registered: bool = True


class EventTypeIn(BaseModel):
    name: str = Field(..., min_length=1, description="e.g. 'todo.completed'")
    description: str = ""
    payload_schema: dict | None = Field(None, description="Optional JSON Schema for the payload")


class EventTypeOut(EventTypeIn):
    id: int
    subscribers: int = 0  # matching Triggers (workflows)
    gates: int = 0  # matching Gates


class RunOut(BaseModel):
    id: int
    workflow_id: int
    agent_id: int
    event_type: str
    status: str
    response: str | None = None
    error: str | None = None
    attempts: int = 0
    max_attempts: int = 3
    event_payload: Any = None
    created_at: Any = None
    finished_at: Any = None


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


async def _require_agent_access(agent_id: int, pool: asyncpg.Pool, auth: AuthContext) -> dict:
    agent = await agent_service.get_agent(pool, agent_id)
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    await require_resource_access(agent, pool, auth)
    return agent


def _ws_id(workspace: dict | None) -> int | None:
    return workspace["id"] if workspace else None


async def _owned_workflow(workflow_id: int, pool: asyncpg.Pool, workspace: dict | None) -> dict:
    wf = await workflow_repo.get(pool, workflow_id)
    if not wf or wf.get("workspace_id") != _ws_id(workspace):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return wf


def _extract_json_object(text: str) -> dict | None:
    if not text:
        return None
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```", 2)[1] if "```" in cleaned[3:] else cleaned[3:]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
    start = cleaned.find("{")
    if start == -1:
        return None
    depth = 0
    for i in range(start, len(cleaned)):
        if cleaned[i] == "{":
            depth += 1
        elif cleaned[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    obj = json.loads(cleaned[start : i + 1])
                    return obj if isinstance(obj, dict) else None
                except json.JSONDecodeError:
                    return None
    return None


_COMPILE_INSTRUCTIONS = (
    "You design event-driven automations ('workflows'). An app emits events (e.g. "
    "'todo.completed', 'order.shipped'); a workflow reacts by running an agent with "
    "your instructions. Based on the conversation, design ONE workflow.\n\n"
    "Fields: name (short), event_type (the event glob to react to, e.g. 'todo.completed' "
    "or 'todo.*'), instructions (a concise directive the agent follows when the event "
    "fires, written so it acts through its own tools).\n\n"
    "If the request is ambiguous (especially which event to react to), ask ONE short "
    "clarifying question and return no workflow yet. Otherwise confirm what you built.\n\n"
    "Respond with ONLY a single JSON object, no prose outside it, no code fences:\n"
    '{"reply": "<message to the user>", "workflow": {"name": "...", "event_type": "...", '
    '"instructions": "..."}}\n'
    "Omit the \"workflow\" key (or set it null) when you are only asking a question."
)


async def _collect_agent_text(pool: asyncpg.Pool, agent_id: int, prompt: str, auth: AuthContext) -> str:
    full = ""
    async for chunk in agent_run_service.run_agent_stream(
        pool,
        agent_id=agent_id,
        user_input=prompt,
        session_id=None,
        user_id=str(auth.user_id),
        db_user_id=auth.user_id,
    ):
        for line in chunk.strip().split("\n"):
            if line.startswith("data: "):
                try:
                    p = json.loads(line[6:])
                except json.JSONDecodeError:
                    continue
                if p.get("type") == "text":
                    full += p.get("text", "")
                elif p.get("type") == "error":
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=p.get("error", "Agent error"),
                    )
    return full


# --------------------------------------------------------------------------- #
# Workflow CRUD
# --------------------------------------------------------------------------- #


@router.get("", response_model=ApiResponse)
async def list_workflows(
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    items = await workflow_repo.list_for_workspace(pool, _ws_id(workspace))
    total = len(items)
    return {
        "success": True,
        "message": "Workflows fetched",
        "data": items[offset : offset + limit],
        "pagination": _page(limit, offset, total),
    }


@router.post("", response_model=ApiResponse)
async def create_workflow(
    data: WorkflowIn,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    await _require_agent_access(data.agent_id, pool, auth)
    wf = await workflow_repo.create(
        pool,
        user_id=auth.user_id,
        workspace_id=_ws_id(workspace),
        name=data.name,
        event_type=data.event_type or "*",
        agent_id=data.agent_id,
        instructions=data.instructions,
        enabled=data.enabled,
        priority=data.priority,
        execution_mode=data.execution_mode,
        max_concurrency=data.max_concurrency,
    )
    return {"success": True, "message": "Workflow created", "data": wf, "pagination": None}


@router.put("/{workflow_id}", response_model=ApiResponse)
async def update_workflow(
    workflow_id: int,
    data: WorkflowIn,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    await _owned_workflow(workflow_id, pool, workspace)
    await _require_agent_access(data.agent_id, pool, auth)
    updated = await workflow_repo.update(
        pool,
        workflow_id,
        name=data.name,
        event_type=data.event_type or "*",
        agent_id=data.agent_id,
        instructions=data.instructions,
        enabled=data.enabled,
        priority=data.priority,
        execution_mode=data.execution_mode,
        max_concurrency=data.max_concurrency,
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return {"success": True, "message": "Workflow updated", "data": updated, "pagination": None}


@router.delete("/{workflow_id}", response_model=ApiResponse)
async def delete_workflow(
    workflow_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    await _owned_workflow(workflow_id, pool, workspace)
    await workflow_repo.delete(pool, workflow_id)
    return {"success": True, "message": "Workflow deleted", "data": {"id": workflow_id}, "pagination": None}


@router.get("/queue/all", response_model=ApiResponse)
async def list_queue(
    limit: int = Query(100, ge=1, le=500),
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    """Global queue view: all recent runs across workflows in the workspace."""
    ws_id = _ws_id(workspace)
    runs = await workflow_repo.list_queue(pool, ws_id, limit=limit)
    counts = await workflow_repo.count_queue(pool, ws_id)
    return {
        "success": True,
        "message": "Queue fetched",
        "data": {"runs": runs, "counts": counts},
        "pagination": None,
    }


@router.get("/{workflow_id}/runs", response_model=ApiResponse)
async def list_workflow_runs(
    workflow_id: int,
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    await _owned_workflow(workflow_id, pool, workspace)
    runs = await workflow_repo.list_runs(pool, workflow_id, limit=limit)
    return {
        "success": True,
        "message": "Runs fetched",
        "data": runs,
        "pagination": _page(limit, offset, len(runs)),
    }


@router.post("/chat", response_model=ApiResponse)
async def workflow_chat(
    data: WorkflowChatRequest,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Compile a plain-English description into a workflow spec (name/event/instructions)."""
    await _require_agent_access(data.agent_id, pool, auth)
    convo = "\n".join(f"{m.role.upper()}: {m.content}" for m in data.messages)
    prompt = _COMPILE_INSTRUCTIONS + "\n\nCONVERSATION SO FAR:\n" + convo
    text = await _collect_agent_text(pool, data.agent_id, prompt, auth)

    obj = _extract_json_object(text)
    if not isinstance(obj, dict):
        result = WorkflowChatResponse(
            reply=text.strip() or "Tell me which event to react to, and what should happen.",
            workflow=None,
        )
        return {"success": True, "message": "Workflow chat", "data": result, "pagination": None}
    reply = str(obj.get("reply") or "").strip()
    wf = obj.get("workflow")
    compiled = None
    if isinstance(wf, dict):
        try:
            compiled = CompiledWorkflow(**wf)
        except Exception:
            compiled = None
    if not reply:
        reply = "Here's the workflow I put together." if compiled else "What event should this react to?"
    return {
        "success": True,
        "message": "Workflow chat",
        "data": WorkflowChatResponse(reply=reply, workflow=compiled),
        "pagination": None,
    }


# --------------------------------------------------------------------------- #
# Event ingestion
# --------------------------------------------------------------------------- #


def _validate_payload(payload: Any, schema: dict | None) -> str | None:
    """Return an error string if payload violates schema, else None (soft if no validator)."""
    if not schema:
        return None
    try:
        import jsonschema  # optional dependency
    except ModuleNotFoundError:
        return None  # can't validate -> don't block
    try:
        jsonschema.validate(payload, schema)
        return None
    except jsonschema.ValidationError as e:  # type: ignore[attr-defined]
        return e.message
    except Exception:
        return None


@events_router.post("", response_model=EventOut)
async def ingest_event(
    data: EventIn,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> EventOut:
    """Emit an app event. Routes to every matching enabled workflow in the active
    workspace and runs each agent in the background. Returns immediately with the
    queued run ids. The workspace is the X-Workspace-Id header, else the caller's
    personal workspace.

    If the event type is in the registry and has a payload_schema, the payload is
    validated. Unknown (unregistered) events are still accepted but flagged
    ``registered: false`` so callers/UI can catch drift.
    """
    ws_id = _ws_id(workspace)
    registered_type = await event_type_repo.get_by_name(
        pool, workspace_id=ws_id, name=data.type
    )
    if registered_type is not None:
        err = _validate_payload(data.payload, registered_type.get("payload_schema"))
        if err:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"payload does not match schema for '{data.type}': {err}",
            )

    # Enqueue a run per matching workflow; the background worker drains the queue
    # one at a time in priority order. Wake it so queued runs start promptly.
    run_ids = await event_dispatcher.dispatch_event(
        pool, workspace_id=ws_id, event_type=data.type, payload=data.payload
    )
    if run_ids:
        event_worker.notify()
    return EventOut(
        event=data.type,
        matched=len(run_ids),
        run_ids=run_ids,
        registered=registered_type is not None,
    )


# --------------------------------------------------------------------------- #
# Event registry (catalog)
# --------------------------------------------------------------------------- #


@event_types_router.get("", response_model=ApiResponse)
async def list_event_types(
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    """The workspace's event catalog, each with a count of subscribing workflows."""
    ws_id = _ws_id(workspace)
    types = await event_type_repo.list_for_workspace(pool, ws_id)
    out: list[dict] = []
    for t in types:
        subs = await workflow_repo.find_matching(pool, workspace_id=ws_id, event_type=t["name"])
        gates = await gate_repo.find_matching(pool, workspace_id=ws_id, event_type=t["name"])
        out.append({**t, "subscribers": len(subs), "gates": len(gates)})
    return {
        "success": True,
        "message": "Event types fetched",
        "data": out[offset : offset + limit],
        "pagination": _page(limit, offset, len(out)),
    }


@event_types_router.put("", response_model=ApiResponse)
async def upsert_event_type(
    data: EventTypeIn,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    """Create or update an event type (keyed by name within the workspace)."""
    ws_id = _ws_id(workspace)
    saved = await event_type_repo.upsert(
        pool,
        user_id=auth.user_id,
        workspace_id=ws_id,
        name=data.name,
        description=data.description,
        payload_schema=data.payload_schema,
    )
    subs = await workflow_repo.find_matching(pool, workspace_id=ws_id, event_type=data.name)
    gates = await gate_repo.find_matching(pool, workspace_id=ws_id, event_type=data.name)
    return {
        "success": True,
        "message": "Event type saved",
        "data": {**saved, "subscribers": len(subs), "gates": len(gates)},
        "pagination": None,
    }


@event_types_router.get("/{name}/workflows", response_model=ApiResponse)
async def event_type_subscribers(
    name: str,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    """Which workflows run when this event fires (the routing map for one event)."""
    subs = await workflow_repo.find_matching(pool, workspace_id=_ws_id(workspace), event_type=name)
    return {"success": True, "message": "Subscribers fetched", "data": subs, "pagination": None}


@event_types_router.delete("/{name}", response_model=ApiResponse)
async def delete_event_type(
    name: str,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    deleted = await event_type_repo.delete(pool, workspace_id=_ws_id(workspace), name=name)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event type not found")
    return {"success": True, "message": "Event type deleted", "data": {"name": name}, "pagination": None}
