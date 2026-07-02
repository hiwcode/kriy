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
from app.core.policies import enforce_policies, filter_applicable, match_policies, policy_guidance
from app.core.security import AuthContext, api_key_auth, require_google_auth
from app.deps import get_db, get_current_workspace
from app.repositories import agent_repo, interception_repo, session_repo, trace_repo
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


class DecisionRequest(BaseModel):
    """A decision point intercepted from an external codebase.

    The agent observes ``action`` + ``payload`` (+ optional ``schema`` / ``context``)
    and returns a verdict: allow, deny, or modify. ``mutable_fields`` restricts which
    top-level payload keys the agent may change (None = any, [] = none).
    """

    action: str = Field(..., min_length=1, description="e.g. 'http.post', 'db.update', 'fn.charge'")
    payload: Any = Field(None, description="The data about to be sent / written / passed")
    payload_schema: dict | None = Field(
        None, alias="schema", description="JSON Schema of the payload (validates modifications)"
    )
    context: dict | None = Field(None, description="Arbitrary context to help the agent decide")
    mutable_fields: list[str] | None = Field(
        None, description="Top-level keys the agent may modify (None = any, [] = none)"
    )
    mode: str = Field("enforce", description="observe | suggest | enforce (advisory; for logging)")
    session_id: str | None = None

    model_config = {"populate_by_name": True}


class DecisionResponse(BaseModel):
    decision: str  # allow | deny | modify
    payload: Any
    original_payload: Any
    changed: bool
    reason: str
    confidence: float
    mode: str
    session_id: str | None = None
    latency_ms: int
    applied_policies: list[str] = []


class PolicyRule(BaseModel):
    field: str
    op: str
    value: Any = None


class Policy(BaseModel):
    name: str = Field(..., min_length=1)
    action: str = Field("*", description="Glob matched against the decision action")
    enabled: bool = True
    guidance: str | None = None
    rules: list[PolicyRule] = []
    # WHEN: conditions gate whether this policy applies (matched against payload +
    # context). Empty = always. ``match`` is 'all' (AND) or 'any' (OR).
    conditions: list[PolicyRule] = []
    match: str = "all"


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
# Decide — agentic interception for external codebases
# ---------------------------------------------------------------------------


_DECISION_SYSTEM = (
    "You are an interception decision engine sitting in the path of a real "
    "application action (an API call, a DB write, or a function call). "
    "Given the action and its payload, decide whether to ALLOW it as-is, "
    "DENY it, or MODIFY the payload before it proceeds.\n\n"
    "Rules:\n"
    "- Only change fields when there is a clear, justified reason.\n"
    "- If 'mutable_fields' is provided, you may ONLY change those top-level keys.\n"
    "- Keep the payload valid against the provided JSON schema if given.\n"
    "- Prefer 'allow' unless you are confident a change or block is warranted.\n\n"
    "Respond with ONLY a single JSON object, no prose, no code fences:\n"
    '{"decision":"allow|deny|modify","payload":<full payload to use>,'
    '"reason":"<short reason>","confidence":<0..1>}'
)


def _build_decision_prompt(data: "DecisionRequest") -> str:
    parts = [f"ACTION: {data.action}"]
    parts.append("PAYLOAD:\n" + json.dumps(data.payload, indent=2, default=str))
    if data.payload_schema:
        parts.append("SCHEMA:\n" + json.dumps(data.payload_schema, indent=2, default=str))
    if data.context:
        parts.append("CONTEXT:\n" + json.dumps(data.context, indent=2, default=str))
    if data.mutable_fields is not None:
        parts.append("MUTABLE_FIELDS: " + json.dumps(data.mutable_fields))
    parts.append("\n" + _DECISION_SYSTEM)
    return "\n\n".join(parts)


def _extract_verdict(text: str) -> dict | None:
    """Pull the first JSON object out of the model's response."""
    if not text:
        return None
    cleaned = text.strip()
    # strip ``` / ```json fences
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```", 2)[1] if "```" in cleaned[3:] else cleaned[3:]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    # fall back to first balanced {...}
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
                    return json.loads(cleaned[start : i + 1])
                except json.JSONDecodeError:
                    return None
    return None


def _validate_schema(payload: Any, schema: dict | None) -> bool:
    if not schema:
        return True
    try:
        import jsonschema  # optional dependency

        jsonschema.validate(payload, schema)
        return True
    except ModuleNotFoundError:
        return True  # can't validate -> don't block
    except Exception:
        return False


def _enforce_verdict(
    verdict: dict,
    original: Any,
    mutable_fields: list[str] | None,
    schema: dict | None,
) -> tuple[str, Any, str, float]:
    """Apply safety rails. Returns (decision, final_payload, reason, confidence)."""
    decision = str(verdict.get("decision", "allow")).lower()
    if decision not in {"allow", "deny", "modify"}:
        decision = "allow"
    reason = str(verdict.get("reason", ""))[:500]
    try:
        confidence = max(0.0, min(1.0, float(verdict.get("confidence", 0.0))))
    except (TypeError, ValueError):
        confidence = 0.0

    if decision == "deny":
        return "deny", original, reason, confidence
    if decision == "allow":
        return "allow", original, reason, confidence

    # modify
    proposed = verdict.get("payload", original)

    if mutable_fields == []:
        return "allow", original, (reason + " (no mutable fields)").strip(), confidence

    # restrict to allowed top-level keys when both are dicts
    if isinstance(original, dict) and isinstance(proposed, dict):
        final = dict(original)
        allowed = proposed.keys() if mutable_fields is None else mutable_fields
        for key in allowed:
            if key in proposed:
                final[key] = proposed[key]
    else:
        final = proposed  # non-dict payloads: full replacement

    if not _validate_schema(final, schema):
        return "allow", original, (reason + " (reverted: schema validation failed)").strip(), confidence

    changed = final != original
    return ("modify" if changed else "allow"), final, reason, confidence


@router.post("/agents/{agent_id}/decide", response_model=DecisionResponse)
async def decide(
    agent_id: int,
    data: DecisionRequest,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> DecisionResponse:
    """Agentic interception: have an agent observe/allow/deny/modify an action's payload.

    Used by the Atelier SDKs to put an agent in the decision path of external
    codebases (API calls, DB writes, function calls). Returns a safety-railed verdict.
    """
    import time

    agent = await _require_agent(agent_id, pool, auth)
    user_id = _user_id_str(auth)

    # Custom-logic policies attached to this agent (extra_fields.policies).
    all_policies = (agent.get("extra_fields") or {}).get("policies") or []
    # Policies whose ACTION targets this call (governs whether the action is
    # policy-controlled at all), then those whose CONDITIONS also apply here.
    action_policies = match_policies(all_policies, data.action)
    applicable = filter_applicable(action_policies, data.payload, data.context)

    started = time.monotonic()
    session_id = data.session_id
    fired: list[str] = []

    # --- Deterministic pass FIRST (no model call) ---------------------------
    # Rules run in code, so a rule-based verdict is instant and quota-free.
    det_decision, det_payload, det_fired, det_reasons = enforce_policies(data.payload, applicable)
    has_guidance = any(p.get("guidance") for p in applicable)

    if det_decision == "deny":
        # Authoritative block — never consult the model.
        decision, final_payload = "deny", data.payload
        reason = "; ".join(det_reasons) or "Denied by policy"
        confidence, fired = 1.0, det_fired
    elif action_policies and not has_guidance:
        # This action is governed by rule-only policies (any guidance ones didn't
        # apply here) — decide deterministically, no LLM. If conditions excluded
        # every policy for this caller, that's simply an allow.
        if det_decision == "modify":
            decision, final_payload = "modify", det_payload
        else:
            decision, final_payload = "allow", data.payload
        reason = "; ".join(det_reasons) or "Allowed by policy"
        confidence, fired = 1.0, det_fired
    else:
        # Need the model: an applicable policy has natural-language guidance, or no
        # policy targets this action at all (pure agent judgment).
        guidance = policy_guidance(applicable)
        prompt = _build_decision_prompt(data)
        if guidance:
            prompt = guidance + "\n\n" + prompt

        full_text = ""
        async for chunk in agent_run_service.run_agent_stream(
            pool,
            agent_id=agent_id,
            user_input=prompt,
            session_id=session_id,
            user_id=user_id,
            db_user_id=auth.user_id,
        ):
            for line in chunk.strip().split("\n"):
                if line.startswith("data: "):
                    try:
                        p = json.loads(line[6:])
                        if p.get("type") == "text":
                            full_text += p.get("text", "")
                        elif p.get("type") == "session":
                            session_id = p.get("session_id", session_id)
                        elif p.get("type") == "error":
                            raise HTTPException(
                                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                                detail=p.get("error", "Agent error"),
                            )
                    except json.JSONDecodeError:
                        pass

        verdict = _extract_verdict(full_text)
        if verdict is None:
            decision, final_payload, reason, confidence = "allow", data.payload, (
                "Could not parse a verdict; allowing unchanged."
            ), 0.0
        else:
            decision, final_payload, reason, confidence = _enforce_verdict(
                verdict, data.payload, data.mutable_fields, data.payload_schema
            )

        # Deterministic policies on top of the agent's verdict (authoritative).
        pol_decision, pol_payload, fired, pol_reasons = enforce_policies(final_payload, applicable)
        if pol_decision == "deny":
            decision, final_payload = "deny", data.payload
            reason = "; ".join(pol_reasons) or reason
        elif pol_decision == "modify":
            final_payload = pol_payload
            decision = "modify" if final_payload != data.payload else decision
            reason = "; ".join([r for r in [reason, *pol_reasons] if r])

    latency_ms = int((time.monotonic() - started) * 1000)
    changed = final_payload != data.payload

    # Best-effort: log the decision for the Decisions view + policy proposals.
    try:
        await interception_repo.insert_decision(
            pool,
            agent_id=agent_id,
            action=data.action,
            decision=decision,
            mode=data.mode,
            changed=changed,
            original_payload=data.payload,
            final_payload=final_payload,
            reason=reason,
            confidence=confidence,
            applied_policies=fired,
            latency_ms=latency_ms,
            user_id=auth.user_id,
        )
    except Exception:  # never fail the decision because logging failed
        pass

    return DecisionResponse(
        decision=decision,
        payload=final_payload,
        original_payload=data.payload,
        changed=changed,
        reason=reason,
        confidence=confidence,
        mode=data.mode,
        session_id=session_id,
        latency_ms=latency_ms,
        applied_policies=fired,
    )


@router.get("/agents/{agent_id}/policies", response_model=ApiResponse)
async def get_policies(
    agent_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    limit: int = Query(20, ge=1, le=500),
    offset: int = Query(0, ge=0),
    action: str | None = Query(None, description="Filter by event/action glob or exact"),
    search: str | None = Query(None, description="Search by policy name or action"),
) -> dict:
    """List the custom-logic policies attached to an agent (paginated)."""
    agent = await _require_agent(agent_id, pool, auth)
    raw = (agent.get("extra_fields") or {}).get("policies") or []
    policies = [Policy(**p) for p in raw if isinstance(p, dict)]

    if action and action != "all":
        policies = [p for p in policies if fnmatch.fnmatch(p.action or "", action)]
    if search:
        q = search.lower()
        policies = [
            p for p in policies
            if q in (p.name or "").lower() or q in (p.action or "").lower()
        ]

    total = len(policies)
    page_items = policies[offset : offset + limit]
    page = (offset // limit) + 1 if limit else 1
    return {
        "success": True,
        "message": "Policies fetched",
        "data": [p.model_dump() for p in page_items],
        "pagination": Pagination(
            limit=limit, offset=offset, total=total, page=page, page_size=limit
        ),
    }


@router.put("/agents/{agent_id}/policies", response_model=ApiResponse)
async def set_policies(
    agent_id: int,
    policies: list[Policy],
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Replace the custom-logic policies attached to an agent."""
    agent = await _require_agent(agent_id, pool, auth)
    extra = dict(agent.get("extra_fields") or {})
    extra["policies"] = [p.model_dump() for p in policies]
    await agent_service.update_agent(pool, agent_id, AgentUpdate(extra_fields=extra))
    return {
        "success": True,
        "message": "Policies saved",
        "data": [p.model_dump() for p in policies],
        "pagination": None,
    }


# ---------------------------------------------------------------------------
# Decisions log + AI policy proposals
# ---------------------------------------------------------------------------


class DecisionRecord(BaseModel):
    id: int
    action: str
    decision: str
    mode: str
    changed: bool
    original_payload: Any = None
    final_payload: Any = None
    reason: str | None = None
    confidence: float | None = None
    applied_policies: list[str] = []
    latency_ms: int | None = None
    created_at: Any = None


@router.get("/agents/{agent_id}/decisions", response_model=ApiResponse)
async def list_decisions(
    agent_id: int,
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    decision: str | None = Query(None, description="Filter: allow | deny | modify | all"),
    action: str | None = Query(None, description="Filter by event/action name"),
    search: str | None = Query(None, description="Search across action and reason"),
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Recent interception decisions for an agent (shadow + enforce)."""
    await _require_agent(agent_id, pool, auth)
    items, total = await interception_repo.list_decisions(
        pool, agent_id, limit=limit, offset=offset,
        decision=decision, action=action, search=search,
    )
    page = (offset // limit) + 1 if limit else 1
    return {
        "success": True,
        "message": "Decisions fetched",
        "data": [DecisionRecord(**i).model_dump() for i in items],
        "pagination": Pagination(
            limit=limit, offset=offset, total=total, page=page, page_size=limit
        ),
    }


@router.get("/agents/{agent_id}/decisions/actions", response_model=ApiResponse)
async def list_decision_actions(
    agent_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Distinct event/action names seen for an agent (for the filter dropdown)."""
    await _require_agent(agent_id, pool, auth)
    actions = await interception_repo.distinct_actions(pool, agent_id)
    return {"success": True, "message": "Actions fetched", "data": actions, "pagination": None}


def _changed_fields(original: Any, final: Any) -> list[str]:
    if not isinstance(original, dict) or not isinstance(final, dict):
        return []
    keys = set(original) | set(final)
    return [k for k in keys if original.get(k) != final.get(k)]


def _summarize_decisions(decisions: list[dict]) -> str:
    lines = []
    for d in decisions[:80]:
        fields = _changed_fields(d.get("original_payload"), d.get("final_payload"))
        lines.append(
            f"- action={d.get('action')} decision={d.get('decision')}"
            + (f" changed_fields={fields}" if fields else "")
            + (f" reason={d.get('reason')!r}" if d.get("reason") else "")
        )
    return "\n".join(lines)


def _extract_json_array(text: str) -> list | None:
    if not text:
        return None
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```", 2)[1] if "```" in cleaned[3:] else cleaned[3:]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
    start = cleaned.find("[")
    if start == -1:
        return None
    depth = 0
    for i in range(start, len(cleaned)):
        if cleaned[i] == "[":
            depth += 1
        elif cleaned[i] == "]":
            depth -= 1
            if depth == 0:
                try:
                    parsed = json.loads(cleaned[start : i + 1])
                    return parsed if isinstance(parsed, list) else None
                except json.JSONDecodeError:
                    return None
    return None


_PROPOSE_INSTRUCTIONS = (
    "You design reusable interception policies. Based on the recent decisions below, "
    "propose up to 5 policies that GENERALIZE the recurring patterns so they can run "
    "deterministically without you in the loop.\n\n"
    "Each policy: {\"name\", \"action\" (glob like 'db.update.*'), \"enabled\": true, "
    "\"guidance\" (short), \"rules\": [{\"field\", \"op\", \"value\"}]}.\n"
    "Allowed ops: max, min, mask, redact, deny_above, deny_below, deny_if_present, "
    "required, allow_values.\n"
    "Do NOT duplicate existing policies: {existing}.\n"
    "Respond with ONLY a JSON array (no prose, no code fences)."
)


@router.post("/agents/{agent_id}/policies/propose", response_model=list[Policy])
async def propose_policies(
    agent_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> list[Policy]:
    """Ask the agent to propose deterministic policies from recent decisions."""
    agent = await _require_agent(agent_id, pool, auth)
    recent = await interception_repo.recent_for_proposal(pool, agent_id, limit=100)
    if not recent:
        return []

    existing = [p.get("name") for p in (agent.get("extra_fields") or {}).get("policies") or []]
    prompt = (
        "RECENT DECISIONS:\n"
        + _summarize_decisions(recent)
        + "\n\n"
        # .replace (not .format) — the template contains literal { } from JSON examples.
        + _PROPOSE_INSTRUCTIONS.replace("{existing}", json.dumps(existing))
    )

    full_text = ""
    async for chunk in agent_run_service.run_agent_stream(
        pool,
        agent_id=agent_id,
        user_input=prompt,
        session_id=None,
        user_id=_user_id_str(auth),
        db_user_id=auth.user_id,
    ):
        for line in chunk.strip().split("\n"):
            if line.startswith("data: "):
                try:
                    p = json.loads(line[6:])
                    if p.get("type") == "text":
                        full_text += p.get("text", "")
                except json.JSONDecodeError:
                    pass

    arr = _extract_json_array(full_text) or []
    proposals: list[Policy] = []
    for item in arr:
        if isinstance(item, dict):
            try:
                proposals.append(Policy(**item))
            except Exception:
                continue
    return proposals


# ---------------------------------------------------------------------------
# Conversational policy builder
# ---------------------------------------------------------------------------


class PolicyChatMessage(BaseModel):
    role: str = Field(..., description="user | assistant")
    content: str = Field(..., min_length=1)


class PolicyChatRequest(BaseModel):
    """A turn in the plain-English policy builder.

    The full conversation is replayed each call (the builder is stateless);
    ``content`` of a single user message also covers the editor's one-shot
    "describe it in plain English -> Generate" box.
    """

    messages: list[PolicyChatMessage] = Field(..., min_length=1)


class PolicyChatResponse(BaseModel):
    reply: str
    policies: list[Policy] = []


_POLICY_CHAT_INSTRUCTIONS = (
    "You are a policy-design assistant for an agentic interception system. You help a "
    "non-technical user turn plain-English intentions into enforceable policies that "
    "guard an agent's actions.\n\n"
    "A policy is: {\"name\", \"action\" (a glob like 'db.update.*' matched against the "
    "intercepted action; '*' means all actions), \"enabled\": true, \"guidance\" (a short "
    "natural-language note sent to the agent), \"rules\": [{\"field\", \"op\", \"value\"}]}.\n"
    "Allowed rule ops: max, min, mask, redact, deny_above, deny_below, deny_if_present, "
    "required, allow_values.\n\n"
    "Prefer structured RULES for anything mechanically checkable (numeric caps, masking "
    "PII, required/forbidden fields, allowed value sets) — rules are enforced "
    "deterministically in code and cannot be talked around. Use GUIDANCE only for "
    "judgment that genuinely cannot be expressed as a rule.\n\n"
    "Converse naturally: if the request is ambiguous, ask ONE short clarifying question "
    "and return no policies yet; otherwise briefly confirm what you built. Always return "
    "the COMPLETE set of policies designed so far in this conversation, not a diff. Do "
    "not duplicate existing policies by name: {existing}.\n\n"
    "Respond with ONLY a single JSON object — no prose outside it, no code fences:\n"
    '{"reply": "<your message to the user>", "policies": [ <policy objects> ]}'
)


def _build_policy_chat_prompt(messages: list[PolicyChatMessage], existing: list) -> str:
    convo = "\n".join(f"{m.role.upper()}: {m.content}" for m in messages)
    # .replace (not .format) — the template contains literal { } from JSON examples.
    instructions = _POLICY_CHAT_INSTRUCTIONS.replace("{existing}", json.dumps(existing))
    return instructions + "\n\nCONVERSATION SO FAR:\n" + convo


async def _collect_agent_text(
    pool: asyncpg.Pool, agent_id: int, prompt: str, auth: AuthContext
) -> str:
    """Run the agent once and return its concatenated text output."""
    full_text = ""
    async for chunk in agent_run_service.run_agent_stream(
        pool,
        agent_id=agent_id,
        user_input=prompt,
        session_id=None,
        user_id=_user_id_str(auth),
        db_user_id=auth.user_id,
    ):
        for line in chunk.strip().split("\n"):
            if line.startswith("data: "):
                try:
                    p = json.loads(line[6:])
                    if p.get("type") == "text":
                        full_text += p.get("text", "")
                    elif p.get("type") == "error":
                        raise HTTPException(
                            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail=p.get("error", "Agent error"),
                        )
                except json.JSONDecodeError:
                    pass
    return full_text


@router.post("/agents/{agent_id}/policies/chat", response_model=PolicyChatResponse)
async def policy_chat(
    agent_id: int,
    data: PolicyChatRequest,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> PolicyChatResponse:
    """Build policies conversationally from plain English.

    The model replies in natural language and compiles the user's intent into
    structured, deterministically-enforced policies. The caller decides whether
    to save the returned policies (via PUT /policies). Nothing is persisted here.
    """
    agent = await _require_agent(agent_id, pool, auth)
    existing = [
        p.get("name")
        for p in (agent.get("extra_fields") or {}).get("policies") or []
        if isinstance(p, dict)
    ]
    prompt = _build_policy_chat_prompt(data.messages, existing)
    full_text = await _collect_agent_text(pool, agent_id, prompt, auth)

    obj = _extract_verdict(full_text)
    if not isinstance(obj, dict):
        # Model didn't return the expected envelope — surface its prose, no policies.
        return PolicyChatResponse(reply=full_text.strip() or "Sorry, I couldn't build that. Try rephrasing.", policies=[])

    reply = str(obj.get("reply") or "").strip()
    policies: list[Policy] = []
    for item in obj.get("policies") or []:
        if isinstance(item, dict):
            try:
                policies.append(Policy(**item))
            except Exception:
                continue
    if not reply:
        reply = (
            f"Here {'is' if len(policies) == 1 else 'are'} {len(policies)} "
            f"polic{'y' if len(policies) == 1 else 'ies'} based on that."
            if policies
            else "Tell me what this agent should and shouldn't be allowed to do."
        )
    return PolicyChatResponse(reply=reply, policies=policies)


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
