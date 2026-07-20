"""Decision gates — a rules-based, synchronous pre-action gate.

Apps that want a proposed action vetted *before* they commit it call
``POST /events/decide`` with ``{type, payload}``. We evaluate the workspace's
enabled gates (rules) for that event type in priority order; the first rule whose
conditions match decides the verdict (``allow``/``deny``). If none match, the
default is ``allow`` (v1). No SDK — any system that can make an HTTP call can use
it, and the app enforces the verdict.

``/gates`` is the builder's CRUD; ``/gates/test`` dry-runs a sample payload and
returns which rule fired, so a rule set can be verified before it goes live.
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
from app.repositories import gate_repo
from app.schemas.response import ApiResponse
from app.services import agent_run_service, agent_service, gate_evaluator

router = APIRouter(
    prefix="/gates",
    tags=["gates"],
    dependencies=[Depends(api_key_auth)],
)
# Mounted at the same /events prefix as ingest; this is the synchronous sibling
# of the fire-and-forget POST /events notifier.
decide_router = APIRouter(
    prefix="/events",
    tags=["gates"],
    dependencies=[Depends(api_key_auth)],
)


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #


class GateIn(BaseModel):
    name: str = Field(..., min_length=1)
    event_types: list[str] = Field(
        default_factory=list, description="Event types this gate applies to", min_length=1
    )
    conditions: dict = Field(
        default_factory=lambda: {"match": "all", "conditions": []},
        description="AND/OR/NONE condition tree (see gate_evaluator)",
    )
    action: str = Field("deny", pattern="^(allow|deny)$", description="Verdict when the rule matches")
    reason: str = Field("", description="Human-readable reason returned on a match")
    enabled: bool = True
    priority: int = Field(0, description="Higher is evaluated first; first match wins")
    allow_override: bool = Field(
        False, description="If this gate denies, mark the verdict overridable (soft deny)"
    )


class GateOut(GateIn):
    id: int
    user_id: int | None = None
    workspace_id: int | None = None


class DecideIn(BaseModel):
    type: str = Field(..., min_length=1, description="e.g. 'refund.requested'")
    payload: Any = Field(None, description="The proposed action's data to evaluate")


class EvaluateIn(BaseModel):
    """A single, possibly-unsaved rule + a sample payload — for the builder's
    live preview before the rule is saved."""

    type: str = Field("test.event", min_length=1)
    payload: Any = None
    conditions: dict = Field(default_factory=lambda: {"match": "all", "conditions": []})
    action: str = Field("deny", pattern="^(allow|deny)$")
    reason: str = ""


class GateChatMessage(BaseModel):
    role: str
    content: str = Field(..., min_length=1)


class GateChatRequest(BaseModel):
    messages: list[GateChatMessage] = Field(..., min_length=1)
    agent_id: int | None = Field(None, description="Agent to compile with; defaults to the workspace's first")


class CompiledGate(BaseModel):
    name: str = ""
    event_types: list[str] = Field(default_factory=list)
    action: str = "deny"
    reason: str = ""
    allow_override: bool = False
    conditions: dict = Field(default_factory=lambda: {"match": "all", "conditions": []})


class GateChatResponse(BaseModel):
    reply: str
    gate: CompiledGate | None = None


class DecisionOut(BaseModel):
    event: str
    decision: str = Field(..., description="'allow' or 'deny'")
    reason: str = ""
    matched_gate_id: int | None = None
    matched_gate_name: str | None = None
    overridable: bool = Field(False, description="A soft deny the caller may override")
    evaluated: int = Field(0, description="How many gates were considered for this event type")


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _ws_id(workspace: dict | None) -> int | None:
    return workspace["id"] if workspace else None


async def _owned_gate(gate_id: int, pool: asyncpg.Pool, workspace: dict | None) -> dict:
    gate = await gate_repo.get(pool, gate_id)
    if not gate or gate.get("workspace_id") != _ws_id(workspace):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gate not found")
    return gate


def _decide(gates: list[dict], *, payload: Any, event_type: str) -> dict:
    """First matching gate (already in priority order) wins. Default is ALLOW —
    an action is only blocked when a rule explicitly matches and denies it. If no
    rule matches (or the event is ungated), it is allowed."""
    for g in gates:
        if gate_evaluator.evaluate(g.get("conditions"), payload=payload, event_type=event_type):
            return {
                "decision": g["action"],
                "reason": g.get("reason") or "",
                "matched_gate_id": g["id"],
                "matched_gate_name": g["name"],
                # A deny from an override-flagged gate is advisory: the caller may proceed.
                "overridable": bool(g.get("allow_override")) and g["action"] == "deny",
            }
    return {
        "decision": "allow",
        "reason": "",
        "matched_gate_id": None,
        "matched_gate_name": None,
        "overridable": False,
    }


def _validate(conditions: Any) -> None:
    try:
        gate_evaluator.validate_conditions(conditions)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc


def _clean_events(event_types: list[str]) -> list[str]:
    cleaned = [e.strip() for e in (event_types or []) if e and e.strip()]
    if not cleaned:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="at least one event type is required"
        )
    return cleaned


# --------------------------------------------------------------------------- #
# Natural-language compiler (like /workflows/chat)
# --------------------------------------------------------------------------- #

_GATE_COMPILE_INSTRUCTIONS = (
    "You design 'decision gates' — rules that ALLOW or DENY an action before it runs. "
    "An app sends an event (e.g. 'refund.requested') with a JSON payload; a gate inspects "
    "the payload and decides. Based on the conversation, design ONE gate.\n\n"
    "A gate has: name (short), event_types (a JSON array of event types it applies to, e.g. "
    "['refund.requested'] or ['loan.disburse','loan.topup']), action ('deny' to block or 'allow' "
    "to permit when it matches), reason (short explanation returned on a match), allow_override "
    "(true only if a deny should be advisory/soft so the caller may still proceed), and conditions "
    "(a tree).\n\n"
    "conditions tree — a GROUP is "
    '{"match": "all"|"any"|"none", "conditions": [ ...nodes ]} (all=AND, any=OR, none=NOR). '
    'A LEAF is {"field": <dot-path>, "op": <operator>, "value": <v>}. Fields are dot paths into '
    "the event: 'payload.user.role', 'payload.amount', 'payload.items.0.sku', or 'type' for the "
    "event name. Operators: eq, ne, gt, gte, lt, lte, in, not_in (value is a list), contains, "
    "not_contains, matches (value is a regex string), exists, not_exists. Groups nest, so "
    "'role is admin AND (amount > 500 OR currency is USD)' is nested groups.\n\n"
    "Remember the model is default-ALLOW: an action is blocked only when a rule explicitly "
    "matches and denies it. Write 'deny' gates for the specific cases to block; everything else "
    "passes. To build a strict allow-list, add a catch-all 'deny' at the lowest priority plus "
    "'allow' gates above it for what's permitted.\n\n"
    "If the request is ambiguous (which event? what to gate?), ask ONE short clarifying question "
    "and return no gate yet. Otherwise confirm what you built.\n\n"
    "Respond with ONLY one JSON object, no prose outside it, no code fences:\n"
    '{"reply": "<message to the user>", "gate": {"name": "...", "event_types": ["..."], '
    '"action": "deny", "reason": "...", "allow_override": false, '
    '"conditions": {"match": "all", "conditions": [ ... ]}}}\n'
    'Omit the "gate" key (or set it null) when you are only asking a question.'
)


def _extract_json_object(text: str) -> dict | None:
    """Best-effort: pull the first balanced {...} object out of the model's text."""
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


async def _run_compiler(pool: asyncpg.Pool, agent_id: int, prompt: str, auth: AuthContext) -> str:
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


def _normalize_conditions(c: Any) -> dict:
    """Coerce a compiled tree into a valid root group the builder can render."""
    if isinstance(c, dict) and "match" in c and isinstance(c.get("conditions"), list):
        return c
    if isinstance(c, dict) and c.get("op"):  # a bare leaf → wrap it
        return {"match": "all", "conditions": [c]}
    return {"match": "all", "conditions": []}


async def _compiler_agent_id(
    pool: asyncpg.Pool, auth: AuthContext, workspace: dict | None, requested: int | None
) -> int | None:
    """The agent used purely as the compiler LLM: the requested one (access-checked)
    or the workspace's first agent."""
    if requested is not None:
        agent = await agent_service.get_agent(pool, requested)
        if not agent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
        await require_resource_access(agent, pool, auth)
        return requested
    agents, _ = await agent_service.list_agents(
        pool, limit=1, user_id=auth.user_id, workspace_id=_ws_id(workspace)
    )
    return agents[0]["id"] if agents else None


# --------------------------------------------------------------------------- #
# Decide (production gate)
# --------------------------------------------------------------------------- #


@decide_router.post("/decide", response_model=DecisionOut)
async def decide(
    data: DecideIn,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> DecisionOut:
    """Evaluate the workspace's gates for this event and return a verdict. The
    caller must perform this *before* the action and honor the result. Every
    verdict is recorded in the decision audit log."""
    ws_id = _ws_id(workspace)
    gates = await gate_repo.find_matching(pool, workspace_id=ws_id, event_type=data.type)
    result = _decide(gates, payload=data.payload, event_type=data.type)
    await gate_repo.log_decision(
        pool,
        workspace_id=ws_id,
        user_id=auth.user_id,
        event_type=data.type,
        decision=result["decision"],
        overridable=result["overridable"],
        matched_gate_id=result["matched_gate_id"],
        matched_gate_name=result["matched_gate_name"],
        reason=result["reason"],
        payload=data.payload,
    )
    return DecisionOut(event=data.type, evaluated=len(gates), **result)


# --------------------------------------------------------------------------- #
# Gate CRUD (builder)
# --------------------------------------------------------------------------- #


@router.get("", response_model=ApiResponse)
async def list_gates(
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    gates = await gate_repo.list_for_workspace(pool, _ws_id(workspace))
    return {"success": True, "message": "Gates fetched", "data": gates, "pagination": None}


@router.post("", response_model=ApiResponse)
async def create_gate(
    data: GateIn,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    _validate(data.conditions)
    gate = await gate_repo.create(
        pool,
        user_id=auth.user_id,
        workspace_id=_ws_id(workspace),
        name=data.name,
        event_types=_clean_events(data.event_types),
        conditions=data.conditions,
        action=data.action,
        reason=data.reason,
        enabled=data.enabled,
        priority=data.priority,
        allow_override=data.allow_override,
    )
    return {"success": True, "message": "Gate created", "data": gate, "pagination": None}


@router.post("/test", response_model=ApiResponse)
async def test_gates(
    data: DecideIn,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    """Dry-run: evaluate a sample payload against the live gates and return the
    verdict plus a per-gate trace (which rule matched). No side effects."""
    gates = await gate_repo.find_matching(pool, workspace_id=_ws_id(workspace), event_type=data.type)
    trace = [
        {
            "gate_id": g["id"],
            "name": g["name"],
            "action": g["action"],
            "matched": gate_evaluator.evaluate(
                g.get("conditions"), payload=data.payload, event_type=data.type
            ),
        }
        for g in gates
    ]
    result = _decide(gates, payload=data.payload, event_type=data.type)
    return {
        "success": True,
        "message": "Evaluated",
        "data": {"event": data.type, "evaluated": len(gates), "trace": trace, **result},
        "pagination": None,
    }


@router.post("/evaluate", response_model=ApiResponse)
async def evaluate_draft(
    data: EvaluateIn,
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Evaluate one (possibly unsaved) rule against a sample payload. Powers the
    builder's live preview — no DB, no side effects."""
    _validate(data.conditions)
    matched = gate_evaluator.evaluate(
        data.conditions, payload=data.payload, event_type=data.type
    )
    return {
        "success": True,
        "message": "Evaluated",
        "data": {
            "matched": matched,
            "action": data.action,  # what this rule would decide if it fires
            "reason": data.reason if matched else "",
        },
        "pagination": None,
    }


@router.post("/chat", response_model=ApiResponse)
async def gate_chat(
    data: GateChatRequest,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    """Compile a plain-English description into a gate spec (name/event/action/
    conditions). The user reviews it in the editor and saves. Same pattern as
    /workflows/chat; uses an agent purely as the compiler LLM."""
    agent_id = await _compiler_agent_id(pool, auth, workspace, data.agent_id)
    if agent_id is None:
        return {
            "success": True,
            "message": "Gate chat",
            "data": GateChatResponse(
                reply="Create an agent first so I can compile rules from your description.",
                gate=None,
            ),
            "pagination": None,
        }

    convo = "\n".join(f"{m.role.upper()}: {m.content}" for m in data.messages)
    prompt = _GATE_COMPILE_INSTRUCTIONS + "\n\nCONVERSATION SO FAR:\n" + convo
    text = await _run_compiler(pool, agent_id, prompt, auth)

    obj = _extract_json_object(text)
    if not isinstance(obj, dict):
        return {
            "success": True,
            "message": "Gate chat",
            "data": GateChatResponse(
                reply=text.strip() or "Which event should this gate apply to, and what should it allow or deny?",
                gate=None,
            ),
            "pagination": None,
        }

    reply = str(obj.get("reply") or "").strip()
    raw = obj.get("gate")
    compiled: CompiledGate | None = None
    if isinstance(raw, dict):
        # Tolerate the model emitting a single event_type or a string.
        if "event_types" not in raw and raw.get("event_type"):
            raw["event_types"] = [raw["event_type"]]
        if isinstance(raw.get("event_types"), str):
            raw["event_types"] = [raw["event_types"]]
        try:
            compiled = CompiledGate(**raw)
            if compiled.action not in ("allow", "deny"):
                compiled.action = "deny"
            compiled.conditions = _normalize_conditions(compiled.conditions)
            # If the model produced an unusable tree, hand back an empty one to fix.
            try:
                gate_evaluator.validate_conditions(compiled.conditions)
            except ValueError:
                compiled.conditions = {"match": "all", "conditions": []}
        except Exception:  # noqa: BLE001 — malformed spec → treat as a plain reply
            compiled = None

    if not reply:
        reply = "Here's the gate I put together — review and save it." if compiled else (
            "What event should this gate apply to, and what should it allow or deny?"
        )
    return {
        "success": True,
        "message": "Gate chat",
        "data": GateChatResponse(reply=reply, gate=compiled),
        "pagination": None,
    }


@router.get("/decisions", response_model=ApiResponse)
async def list_decisions(
    limit: int = Query(100, ge=1, le=500),
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    """Recent /events/decide verdicts for this workspace (the audit log)."""
    rows = await gate_repo.list_decisions(pool, _ws_id(workspace), limit=limit)
    return {"success": True, "message": "Decisions fetched", "data": rows, "pagination": None}


@router.get("/{gate_id}", response_model=ApiResponse)
async def get_gate(
    gate_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    gate = await _owned_gate(gate_id, pool, workspace)
    return {"success": True, "message": "Gate fetched", "data": gate, "pagination": None}


@router.put("/{gate_id}", response_model=ApiResponse)
async def update_gate(
    gate_id: int,
    data: GateIn,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    await _owned_gate(gate_id, pool, workspace)
    _validate(data.conditions)
    updated = await gate_repo.update(
        pool,
        gate_id,
        name=data.name,
        event_types=_clean_events(data.event_types),
        conditions=data.conditions,
        action=data.action,
        reason=data.reason,
        enabled=data.enabled,
        priority=data.priority,
        allow_override=data.allow_override,
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gate not found")
    return {"success": True, "message": "Gate updated", "data": updated, "pagination": None}


@router.delete("/{gate_id}", response_model=ApiResponse)
async def delete_gate(
    gate_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    await _owned_gate(gate_id, pool, workspace)
    await gate_repo.delete(pool, gate_id)
    return {"success": True, "message": "Gate deleted", "data": {"id": gate_id}, "pagination": None}
