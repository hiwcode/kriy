"""Event-registry tools for agents — CRUD the catalog of event types.

Scoped to the agent's owner (user_id). Event types are the shared contract apps
emit against and workflows subscribe to.
"""

from __future__ import annotations

import json
import logging

import asyncpg
from google.adk.tools import FunctionTool

from app.repositories import event_type_repo

logger = logging.getLogger(__name__)


def make_event_tools(
    pool: asyncpg.Pool,
    user_id: int | None,
    workspace_id: int | None = None,
) -> list[FunctionTool]:
    """Create event-type tools with pool + owner context baked in."""

    async def list_event_types() -> str:
        """List the registered event types and how many workflows subscribe to each."""
        try:
            rows = await event_type_repo.list_for_workspace(pool, workspace_id)
            return json.dumps({
                "event_types": [
                    {
                        "name": t["name"],
                        "description": t["description"],
                        "has_schema": t.get("payload_schema") is not None,
                    }
                    for t in rows
                ]
            })
        except Exception as e:
            return json.dumps({"error": str(e)})

    async def create_event_type(
        name: str,
        description: str = "",
        payload_schema_json: str | None = None,
    ) -> str:
        """Register (or update) an event type.

        Args:
            name: The event name, e.g. 'todo.completed'.
            description: What the event means.
            payload_schema_json: Optional JSON Schema (as a JSON string) for the payload.
        """
        schema = None
        if payload_schema_json:
            try:
                schema = json.loads(payload_schema_json)
            except json.JSONDecodeError:
                return json.dumps({"error": "payload_schema_json is not valid JSON"})
        try:
            saved = await event_type_repo.upsert(
                pool,
                user_id=user_id,
                workspace_id=workspace_id,
                name=name,
                description=description,
                payload_schema=schema,
            )
            return json.dumps({"success": True, "name": saved["name"]})
        except Exception as e:
            return json.dumps({"error": str(e)})

    async def delete_event_type(name: str) -> str:
        """Delete a registered event type by name."""
        try:
            deleted = await event_type_repo.delete(pool, workspace_id=workspace_id, name=name)
            if deleted:
                return json.dumps({"success": True, "deleted": name})
            return json.dumps({"error": f"event type '{name}' not found"})
        except Exception as e:
            return json.dumps({"error": str(e)})

    return [
        FunctionTool(func=list_event_types),
        FunctionTool(func=create_event_type),
        FunctionTool(func=delete_event_type),
    ]
