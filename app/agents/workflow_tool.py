"""Workflow tools for agents — let an agent manage its own event-driven workflows.

Scoped to the agent's owner (user_id): an agent can only see/change workflows that
belong to the user who owns it. ``default_agent_id`` lets the agent wire a workflow
to itself without being told its own id.
"""

from __future__ import annotations

import json
import logging

import asyncpg
from google.adk.tools import FunctionTool

from app.repositories import workflow_repo

logger = logging.getLogger(__name__)


def make_workflow_tools(
    pool: asyncpg.Pool,
    user_id: int | None,
    workspace_id: int | None = None,
    default_agent_id: int | None = None,
) -> list[FunctionTool]:
    """Create workflow-management tools with pool + owner context baked in."""

    async def list_workflows() -> str:
        """List the workspace's event-driven workflows (what runs when an event fires)."""
        try:
            rows = await workflow_repo.list_for_workspace(pool, workspace_id)
            return json.dumps({
                "workflows": [
                    {
                        "id": w["id"],
                        "name": w["name"],
                        "event_type": w["event_type"],
                        "agent_id": w["agent_id"],
                        "enabled": w["enabled"],
                        "priority": w["priority"],
                        "instructions": w["instructions"],
                    }
                    for w in rows
                ]
            }, default=str)
        except Exception as e:
            return json.dumps({"error": str(e)})

    async def create_workflow(
        name: str,
        event_type: str,
        instructions: str,
        agent_id: int | None = None,
        priority: int = 0,
    ) -> str:
        """Create a workflow: when ``event_type`` fires, run an agent with ``instructions``.

        Args:
            name: A short name for the workflow.
            event_type: The event to react to, e.g. 'todo.completed' (glob ok: 'todo.*').
            instructions: What the agent should do when the event fires (it acts via its tools).
            agent_id: Which agent runs it. Defaults to the current agent.
            priority: Higher runs first when several workflows match one event.
        """
        target_agent = agent_id or default_agent_id
        if not target_agent:
            return json.dumps({"error": "agent_id is required"})
        try:
            wf = await workflow_repo.create(
                pool,
                user_id=user_id,
                workspace_id=workspace_id,
                name=name,
                event_type=event_type or "*",
                agent_id=int(target_agent),
                instructions=instructions,
                enabled=True,
                priority=priority,
            )
            return json.dumps({"success": True, "workflow_id": wf["id"], "name": wf["name"]})
        except Exception as e:
            return json.dumps({"error": str(e)})

    async def update_workflow(
        workflow_id: int,
        name: str | None = None,
        event_type: str | None = None,
        instructions: str | None = None,
        agent_id: int | None = None,
        priority: int | None = None,
        enabled: bool | None = None,
    ) -> str:
        """Update fields of an existing workflow (only the ones you pass)."""
        try:
            existing = await workflow_repo.get(pool, workflow_id)
            if not existing or existing.get("workspace_id") != workspace_id:
                return json.dumps({"error": f"workflow {workflow_id} not found"})
            updated = await workflow_repo.update(
                pool,
                workflow_id,
                name=name if name is not None else existing["name"],
                event_type=event_type if event_type is not None else existing["event_type"],
                agent_id=int(agent_id) if agent_id is not None else existing["agent_id"],
                instructions=instructions if instructions is not None else existing["instructions"],
                enabled=enabled if enabled is not None else existing["enabled"],
                priority=priority if priority is not None else existing["priority"],
            )
            return json.dumps({"success": True, "workflow_id": updated["id"]})
        except Exception as e:
            return json.dumps({"error": str(e)})

    async def delete_workflow(workflow_id: int) -> str:
        """Delete a workflow by id."""
        try:
            existing = await workflow_repo.get(pool, workflow_id)
            if not existing or existing.get("workspace_id") != workspace_id:
                return json.dumps({"error": f"workflow {workflow_id} not found"})
            await workflow_repo.delete(pool, workflow_id)
            return json.dumps({"success": True, "deleted": workflow_id})
        except Exception as e:
            return json.dumps({"error": str(e)})

    return [
        FunctionTool(func=list_workflows),
        FunctionTool(func=create_workflow),
        FunctionTool(func=update_workflow),
        FunctionTool(func=delete_workflow),
    ]
