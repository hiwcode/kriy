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

from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.core.security import AuthContext, api_key_auth, require_google_auth
from app.deps import get_current_workspace, get_db
from app.repositories import gate_repo
from app.schemas.response import ApiResponse
from app.services import gate_evaluator

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
    event_type: str = Field("*", description="Glob matched against the emitted event type")
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
    """First matching gate (already in priority order) wins. If the event is gated
    (>=1 gate matches this event type) but no rule matched, deny by default. An
    event with no gates at all is ungated and allowed."""
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
    if gates:
        return {
            "decision": "deny",
            "reason": "No matching rule (default deny)",
            "matched_gate_id": None,
            "matched_gate_name": None,
            "overridable": False,
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
        event_type=data.event_type or "*",
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
        event_type=data.event_type or "*",
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
