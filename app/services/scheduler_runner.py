"""Background scheduler that checks for due schedules and runs agents."""
from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any

import asyncpg
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.auth.credential_service.in_memory_credential_service import InMemoryCredentialService
from google.adk.runners import Runner
from google.genai import types

from app.agents.runtime import build_agent_from_config
from app.repositories import schedule_repo
from app.services import agent_service, schedule_service
from app.services.session_service import PostgresSessionService
from app.services.postgres_memory_service import PostgresMemoryService
from app.services.llm_key_resolver import resolve_api_key, api_key_context

logger = logging.getLogger(__name__)

_scheduler_task: asyncio.Task | None = None
_run_lock = asyncio.Lock()

CHECK_INTERVAL_SECONDS = 30


async def _execute_agent(
    pool: asyncpg.Pool,
    schedule: dict[str, Any],
    db_user_id: int | None = None,
) -> str:
    """Run the agent with the schedule's message and collect the text output."""
    agent_id = schedule["agent_id"]
    agent_config = await agent_service.get_agent(pool, agent_id)
    if not agent_config:
        return f"Error: Agent {agent_id} not found"

    # Use provided db_user_id (manual trigger) or schedule's created_by
    effective_user_id = db_user_id or schedule.get("created_by")

    env_var, api_key, _ = await resolve_api_key(pool, agent_config, effective_user_id)

    if env_var and not api_key:
        return f"Error: No API key available for this model. Set it in Config > Configuration or .env"

    # Serialize env access (same as agent_run_service._agent_run_lock)
    async with _run_lock:
        ctx = api_key_context(env_var, api_key)
        with ctx:
            agent = await build_agent_from_config(pool, agent_config, include_memory_tool=True)
            app_name = agent_config.get("name", "agent")
            session_id = str(uuid.uuid4())

            session_service = PostgresSessionService(pool, agent_id)
            memory_svc = PostgresMemoryService(
                pool, agent_id, workspace_id=agent_config.get("workspace_id"),
            )

            runner = Runner(
                app_name=app_name,
                agent=agent,
                artifact_service=InMemoryArtifactService(),
                session_service=session_service,
                memory_service=memory_svc,
                credential_service=InMemoryCredentialService(),
                auto_create_session=True,
            )

            content = types.Content(parts=[types.Part(text=schedule["message"])])
            user_id_str = str(effective_user_id) if effective_user_id else "scheduler"

            async def _run_once() -> tuple[str, bool]:
                """Run the agent once; return (text, whether any tools ran)."""
                parts: list[str] = []
                tool_activity = False
                async for event in runner.run_async(
                    user_id=user_id_str,
                    session_id=session_id,
                    new_message=content,
                ):
                    if hasattr(event, "get_function_calls") and event.get_function_calls():
                        tool_activity = True
                    if hasattr(event, "get_function_responses") and event.get_function_responses():
                        tool_activity = True
                    if event.content and event.content.parts:
                        for part in event.content.parts:
                            if part.text:
                                parts.append(part.text)
                return "".join(parts), tool_activity

            # gemini-3.1-flash-lite sometimes returns an empty first turn (no text, no
            # tool call). Retry once; if tools ran but it stayed quiet, that still
            # counts as work done.
            for attempt in range(2):
                text, tool_activity = await _run_once()
                if text.strip():
                    return text
                if tool_activity:
                    return "[completed — agent acted via tools without a text reply]"
                if attempt == 0:
                    logger.info(
                        "Schedule #%s: empty model response, retrying", schedule.get("id")
                    )
                    await asyncio.sleep(1)
            return "[No output]"


async def run_schedule_now(
    pool: asyncpg.Pool,
    schedule: dict[str, Any],
    db_user_id: int | None = None,
) -> dict:
    """Run a single schedule immediately (used by manual trigger and scheduler loop)."""
    try:
        logger.info("Running schedule #%d '%s' (agent=%d)", schedule["id"], schedule["name"], schedule["agent_id"])
        result = await _execute_agent(pool, schedule, db_user_id=db_user_id)
        await schedule_service.mark_schedule_run(pool, schedule, status="success", result=result)
        logger.info("Schedule #%d completed successfully", schedule["id"])
        return {"status": "success", "result": result[:500]}
    except Exception as e:
        error_msg = str(e)
        logger.exception("Schedule #%d failed: %s", schedule["id"], error_msg)
        await schedule_service.mark_schedule_run(pool, schedule, status="failed", result=error_msg)
        return {"status": "failed", "error": error_msg[:500]}


async def _scheduler_loop(pool: asyncpg.Pool) -> None:
    """Main loop: check for due schedules every CHECK_INTERVAL_SECONDS."""
    logger.info("Scheduler started (check interval: %ds)", CHECK_INTERVAL_SECONDS)
    while True:
        try:
            due = await schedule_repo.get_due_schedules(pool)
            if due:
                logger.info("Found %d due schedule(s)", len(due))
            for schedule in due:
                try:
                    await run_schedule_now(pool, schedule)
                except Exception:
                    logger.exception("Error processing schedule #%d", schedule["id"])
        except Exception:
            logger.exception("Error in scheduler loop")
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)


def start_scheduler(pool: asyncpg.Pool) -> asyncio.Task:
    """Start the background scheduler task. Called from app startup."""
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        return _scheduler_task
    _scheduler_task = asyncio.create_task(_scheduler_loop(pool), name="scheduler")
    return _scheduler_task


def stop_scheduler() -> None:
    """Stop the background scheduler."""
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        _scheduler_task = None
