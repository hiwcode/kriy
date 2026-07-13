"""Schedule tool for agents - allows agents to create, list, and delete scheduled tasks."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

import asyncpg
from google.adk.tools import FunctionTool

logger = logging.getLogger(__name__)


def make_schedule_tools(pool: asyncpg.Pool, workspace_id: int | None = None, created_by: int | None = None, default_agent_id: int | None = None) -> list[FunctionTool]:
    """Create schedule tools with the database pool baked in."""

    async def create_schedule(
        name: str,
        message: str,
        agent_id: int = 0,
        schedule_type: str = "one_time",
        cron_expression: str | None = None,
        run_at: str | None = None,
        description: str | None = None,
        max_runs: int | None = None,
    ) -> str:
        """Create a new scheduled task for an agent.

        Use schedule_type='one_time' with run_at (ISO datetime like '2025-01-15T10:30:00Z') for one-time tasks.
        Use schedule_type='recurring' with cron_expression (like '0 9 * * *' for daily at 9am) for recurring tasks.

        Common cron patterns:
        - '*/5 * * * *' = every 5 minutes
        - '0 * * * *' = every hour
        - '0 9 * * *' = daily at 9:00 AM UTC
        - '0 9 * * 1-5' = weekdays at 9:00 AM UTC
        - '0 0 * * 0' = weekly on Sunday midnight
        - '0 0 1 * *' = monthly on the 1st

        Args:
            name: A descriptive name for this schedule
            message: The message/prompt to send to the agent
            agent_id: The ID of the agent to run. Defaults to the current agent (yourself) if omitted or 0.
            schedule_type: Either 'one_time' or 'recurring'
            cron_expression: Cron expression for recurring schedules (5-field format)
            run_at: ISO datetime string for one-time schedules (e.g. '2025-01-15T10:30:00Z')
            description: Optional description of what this schedule does
            max_runs: Optional maximum number of runs for recurring schedules
        """
        from app.schemas.schedule import ScheduleCreate
        from app.services import schedule_service

        if not agent_id and default_agent_id:
            agent_id = default_agent_id

        parsed_run_at = None
        if run_at:
            try:
                parsed_run_at = datetime.fromisoformat(run_at.replace("Z", "+00:00"))
            except ValueError:
                return json.dumps({"error": f"Invalid datetime format: {run_at}. Use ISO format like '2025-01-15T10:30:00Z'"})

        try:
            data = ScheduleCreate(
                name=name,
                description=description,
                agent_id=agent_id,
                message=message,
                schedule_type=schedule_type,
                cron_expression=cron_expression,
                run_at=parsed_run_at,
                max_runs=max_runs,
            )
            result = await schedule_service.create_schedule(
                pool, data, created_by=created_by, workspace_id=workspace_id,
            )
            return json.dumps({
                "success": True,
                "schedule_id": result["id"],
                "name": result["name"],
                "schedule_type": result["schedule_type"],
                "next_run_at": str(result.get("next_run_at")),
            })
        except Exception as e:
            return json.dumps({"error": str(e)})

    async def list_schedules() -> str:
        """List all active and paused schedules in the current workspace."""
        from app.services import schedule_service

        try:
            items, total = await schedule_service.list_schedules(
                pool, workspace_id=workspace_id, created_by=created_by, limit=50, offset=0,
            )
            schedules = []
            for s in items:
                schedules.append({
                    "id": s["id"],
                    "name": s["name"],
                    "agent_id": s["agent_id"],
                    "agent_name": s.get("agent_name"),
                    "schedule_type": s["schedule_type"],
                    "cron_expression": s.get("cron_expression"),
                    "status": s["status"],
                    "next_run_at": str(s.get("next_run_at")),
                    "last_run_at": str(s.get("last_run_at")),
                    "last_run_status": s.get("last_run_status"),
                    "run_count": s["run_count"],
                })
            return json.dumps({"total": total, "schedules": schedules})
        except Exception as e:
            return json.dumps({"error": str(e)})

    async def delete_schedule(schedule_id: int) -> str:
        """Delete a scheduled task by its ID.

        Args:
            schedule_id: The ID of the schedule to delete
        """
        from app.services import schedule_service

        try:
            deleted = await schedule_service.delete_schedule(
                pool, schedule_id, workspace_id=workspace_id, created_by=created_by,
            )
            if deleted:
                return json.dumps({"success": True, "message": f"Schedule {schedule_id} deleted"})
            return json.dumps({"error": f"Schedule {schedule_id} not found"})
        except Exception as e:
            return json.dumps({"error": str(e)})

    return [
        FunctionTool(func=create_schedule),
        FunctionTool(func=list_schedules),
        FunctionTool(func=delete_schedule),
    ]
