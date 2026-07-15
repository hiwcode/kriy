"""Gate tools for agents — let an agent manage decision gates (the /events/decide rules).

Scoped to the agent's owner (user_id) and workspace: an agent only sees/changes gates
in its own workspace. Gates are the guardrails that allow/deny an action before it runs,
so exposing them as tools lets you say "block refunds over $500" in chat and have the
agent build the rule. Assign these tools deliberately — an agent with them can also
weaken or delete existing guardrails.

The condition tree is recursive, which function-call schemas can't express, so
create/update take ``conditions_json`` as a JSON string that we parse and validate.
"""

from __future__ import annotations

import json
import logging

import asyncpg
from google.adk.tools import FunctionTool

from app.repositories import gate_repo
from app.services import gate_evaluator

logger = logging.getLogger(__name__)

# Embedded in the create/update tool docs so the model knows the tree shape.
_CONDITIONS_HELP = (
    "A JSON string of the condition tree. A GROUP is "
    '{"match": "all"|"any"|"none", "conditions": [ ...nodes ]} (all=AND, any=OR, none=NOR). '
    'A LEAF is {"field": <dot-path>, "op": <operator>, "value": <v>}. Fields are dot paths '
    "into the event: 'payload.user.role', 'payload.amount', 'payload.items.0.sku', or 'type'. "
    "Operators: eq, ne, gt, gte, lt, lte, in, not_in (value is a list), contains, not_contains, "
    "matches (value is a regex), exists, not_exists. Groups nest for AND/OR combinations. "
    'Example: {"match":"all","conditions":[{"field":"payload.amount","op":"gt","value":500}]}'
)


def make_gate_tools(
    pool: asyncpg.Pool,
    user_id: int | None,
    workspace_id: int | None = None,
) -> list[FunctionTool]:
    """Create gate-management tools with pool + owner context baked in."""

    def _owns(row: dict) -> bool:
        """Row must be in this agent's workspace and, when known, its owner's."""
        if row.get("workspace_id") != workspace_id:
            return False
        if user_id is not None and row.get("user_id") != user_id:
            return False
        return True

    def _parse_conditions(conditions_json: str) -> tuple[dict | None, str | None]:
        try:
            conditions = json.loads(conditions_json) if isinstance(conditions_json, str) else conditions_json
        except (ValueError, TypeError):
            return None, "conditions_json must be valid JSON"
        try:
            gate_evaluator.validate_conditions(conditions)
        except ValueError as e:
            return None, f"invalid conditions: {e}"
        return conditions, None

    async def list_gates() -> str:
        """List the workspace's decision gates (rules that allow/deny actions before they run)."""
        try:
            rows = await gate_repo.list_for_workspace(pool, workspace_id)
            return json.dumps({
                "gates": [
                    {
                        "id": g["id"],
                        "name": g["name"],
                        "event_type": g["event_type"],
                        "action": g["action"],
                        "enabled": g["enabled"],
                        "priority": g["priority"],
                        "allow_override": g["allow_override"],
                        "reason": g["reason"],
                        "conditions": g["conditions"],
                    }
                    for g in rows
                ]
            }, default=str)
        except Exception as e:
            return json.dumps({"error": str(e)})

    async def create_gate(
        name: str,
        event_type: str,
        conditions_json: str,
        action: str = "deny",
        reason: str = "",
        priority: int = 0,
        allow_override: bool = False,
    ) -> str:
        """Create a decision gate: when ``event_type`` fires and the conditions match, the verdict is ``action``.

        Note: once an event has any gate, a request matching no rule is denied by default
        (whitelist). Use ``action='allow'`` to permit specific cases, ``action='deny'`` to block.

        Args:
            name: A short name for the gate.
            event_type: The event glob it applies to, e.g. 'refund.requested' or 'refund.*'.
            conditions_json: {help}
            action: 'deny' to block or 'allow' to permit when the conditions match.
            reason: Short explanation returned on a match.
            priority: Higher is evaluated first; first match wins.
            allow_override: If true, a deny is advisory (overridable) so the caller may proceed.
        """
        conditions, err = _parse_conditions(conditions_json)
        if err:
            return json.dumps({"error": err})
        if action not in ("allow", "deny"):
            return json.dumps({"error": "action must be 'allow' or 'deny'"})
        try:
            g = await gate_repo.create(
                pool,
                user_id=user_id,
                workspace_id=workspace_id,
                name=name,
                event_type=event_type or "*",
                conditions=conditions,
                action=action,
                reason=reason,
                enabled=True,
                priority=priority,
                allow_override=allow_override,
            )
            return json.dumps({"success": True, "gate_id": g["id"], "name": g["name"]})
        except Exception as e:
            return json.dumps({"error": str(e)})

    async def update_gate(
        gate_id: int,
        name: str | None = None,
        event_type: str | None = None,
        conditions_json: str | None = None,
        action: str | None = None,
        reason: str | None = None,
        priority: int | None = None,
        allow_override: bool | None = None,
        enabled: bool | None = None,
    ) -> str:
        """Update fields of an existing gate (only the ones you pass). Pass ``conditions_json``
        to replace the whole condition tree."""
        try:
            existing = await gate_repo.get(pool, gate_id)
            if not existing or not _owns(existing):
                return json.dumps({"error": f"gate {gate_id} not found"})
            conditions = existing["conditions"]
            if conditions_json is not None:
                conditions, err = _parse_conditions(conditions_json)
                if err:
                    return json.dumps({"error": err})
            new_action = action if action is not None else existing["action"]
            if new_action not in ("allow", "deny"):
                return json.dumps({"error": "action must be 'allow' or 'deny'"})
            updated = await gate_repo.update(
                pool,
                gate_id,
                name=name if name is not None else existing["name"],
                event_type=event_type if event_type is not None else existing["event_type"],
                conditions=conditions,
                action=new_action,
                reason=reason if reason is not None else existing["reason"],
                enabled=enabled if enabled is not None else existing["enabled"],
                priority=priority if priority is not None else existing["priority"],
                allow_override=allow_override if allow_override is not None else existing["allow_override"],
            )
            return json.dumps({"success": True, "gate_id": updated["id"]})
        except Exception as e:
            return json.dumps({"error": str(e)})

    async def delete_gate(gate_id: int) -> str:
        """Delete a gate by id."""
        try:
            existing = await gate_repo.get(pool, gate_id)
            if not existing or not _owns(existing):
                return json.dumps({"error": f"gate {gate_id} not found"})
            await gate_repo.delete(pool, gate_id)
            return json.dumps({"success": True, "deleted": gate_id})
        except Exception as e:
            return json.dumps({"error": str(e)})

    create_gate.__doc__ = (create_gate.__doc__ or "").replace("{help}", _CONDITIONS_HELP)

    return [
        FunctionTool(func=list_gates),
        FunctionTool(func=create_gate),
        FunctionTool(func=update_gate),
        FunctionTool(func=delete_gate),
    ]
