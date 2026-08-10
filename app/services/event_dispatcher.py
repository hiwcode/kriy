"""Event dispatcher: route an emitted app event to each matching user workflow.

An app emits an event (``todo.completed``) with a payload. For the emitting user we
find every enabled workflow whose ``event_types`` patterns match, create a ``workflow_run``
row for each, and run the workflow's agent in the background with the event context +
the workflow's instructions. Two users subscribed to the same event run their own
agents doing their own thing — multi-tenant by construction.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import asyncpg

from app.repositories import workflow_repo
from app.services import agent_run_service

logger = logging.getLogger(__name__)

# Exponential backoff between retries: 30s, 60s, 120s, ... capped at 10 min.
_BACKOFF_BASE = 30.0
_BACKOFF_MAX = 600.0


def _build_message(event_type: str, payload: Any, instructions: str) -> str:
    parts = [f"EVENT: {event_type}"]
    if payload is not None:
        parts.append("CONTEXT:\n" + json.dumps(payload, indent=2, default=str))
    if instructions:
        parts.append(instructions)
    return "\n\n".join(parts)


async def _collect_agent_text(
    pool: asyncpg.Pool, agent_id: int, message: str, owner_id: int | None
) -> str:
    """Run the agent once (with its tools) and return its concatenated text."""
    full = ""
    async for chunk in agent_run_service.run_agent_stream(
        pool,
        agent_id=agent_id,
        user_input=message,
        session_id=None,
        user_id=str(owner_id),
        db_user_id=owner_id,
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
                    raise RuntimeError(p.get("error", "agent error"))
    return full


async def dispatch_event(
    pool: asyncpg.Pool,
    *,
    workspace_id: int | None,
    event_type: str,
    payload: Any,
) -> list[int]:
    """Find matching workflows and enqueue a pending run for each (priority copied
    from the workflow). Returns the enqueued run ids. A background worker drains the
    queue — nothing is executed here, so emits never fan out all at once."""
    workflows = await workflow_repo.find_matching(
        pool, workspace_id=workspace_id, event_type=event_type
    )
    run_ids: list[int] = []
    for wf in workflows:
        run_id = await workflow_repo.create_run(
            pool,
            workflow_id=wf["id"],
            agent_id=wf["agent_id"],
            user_id=wf["user_id"],
            event_type=event_type,
            event_payload=payload,
            priority=wf.get("priority", 0),
        )
        run_ids.append(run_id)
    return run_ids


async def run_claimed(pool: asyncpg.Pool, run: dict) -> None:
    """Execute one already-claimed run (status='running') and record the outcome.

    Never raises — failures are written to the run row so the worker keeps going.
    """
    run_id = run["id"]
    try:
        workflow = await workflow_repo.get(pool, run["workflow_id"])
        if not workflow:
            await workflow_repo.finish_run(
                pool, run_id, status="error", error="workflow was deleted"
            )
            return
        message = _build_message(
            run["event_type"], run.get("event_payload"), workflow.get("instructions") or ""
        )
        text = await _collect_agent_text(
            pool, workflow["agent_id"], message, workflow.get("user_id")
        )
        await workflow_repo.finish_run(pool, run_id, status="done", response=text)
        # Outbound: notify webhook subscribers the run finished (never blocks/raises).
        from app.services import webhook_service
        await webhook_service.deliver_run_completed(pool, workflow=workflow, run=run, result=text)
    except Exception as exc:  # noqa: BLE001 — record, don't propagate into the worker
        attempts = run.get("attempts", 1)
        max_attempts = run.get("max_attempts", 3)
        if attempts < max_attempts:
            delay = min(_BACKOFF_BASE * (2 ** (attempts - 1)), _BACKOFF_MAX)
            logger.warning(
                "workflow run %s failed (attempt %d/%d), retrying in %ss: %s",
                run_id, attempts, max_attempts, delay, exc,
            )
            await workflow_repo.requeue_run(
                pool, run_id, delay_seconds=delay, error=str(exc)[:500]
            )
        else:
            logger.warning("workflow run %s failed permanently: %s", run_id, exc)
            await workflow_repo.finish_run(pool, run_id, status="error", error=str(exc)[:500])
