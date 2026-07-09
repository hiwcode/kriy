"""Background worker that drains the workflow_runs queue.

Emitting an event only *enqueues* runs (status='pending'). This worker claims them
and executes each. Workflows with execution_mode='serial' run one at a time;
workflows with execution_mode='parallel' run up to max_concurrency concurrently.

Lifecycle mirrors scheduler_runner: start_worker(pool) on startup, stop_worker() on
shutdown. ``notify()`` wakes the worker immediately after an emit so queued runs don't
wait for the next poll.
"""

from __future__ import annotations

import asyncio
import logging

import asyncpg

from app.repositories import workflow_repo
from app.services import event_dispatcher

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 5.0

_worker_task: asyncio.Task | None = None
_wake = asyncio.Event()


def notify() -> None:
    """Wake the worker now (call right after enqueuing runs)."""
    _wake.set()


async def _drain(pool: asyncpg.Pool) -> int:
    """Process pending runs, respecting each workflow's execution mode."""
    processed = 0

    # 1) Claim and run serial workflows one at a time (original behavior).
    while True:
        run = await workflow_repo.claim_next_run(pool)
        if run is None:
            break

        # Check if this run's workflow is parallel — if so, skip it here
        # and let the parallel pass handle it.
        wf = await workflow_repo.get(pool, run["workflow_id"])
        if wf and wf.get("execution_mode") == "parallel":
            # Put it back as pending so the parallel pass picks it up.
            await pool.execute(
                "UPDATE workflow_runs SET status = 'pending', attempts = attempts - 1 WHERE id = $1;",
                run["id"],
            )
            break  # Move to parallel pass

        await event_dispatcher.run_claimed(pool, run)
        processed += 1

    # 2) Process parallel workflows: claim batches per workflow.
    parallel_wfs = await pool.fetch(
        """
        SELECT DISTINCT w.id, w.max_concurrency
          FROM workflows w
          JOIN workflow_runs wr ON wr.workflow_id = w.id
         WHERE w.execution_mode = 'parallel'
           AND wr.status = 'pending'
           AND (wr.next_attempt_at IS NULL OR wr.next_attempt_at <= NOW());
        """
    )

    for wf_row in parallel_wfs:
        wf_id = wf_row["id"]
        max_conc = wf_row["max_concurrency"] or 3

        # How many slots are free?
        running = await workflow_repo.count_running_for_workflow(pool, wf_id)
        slots = max(0, max_conc - running)
        if slots == 0:
            continue

        runs = await workflow_repo.claim_runs_for_workflow(pool, wf_id, limit=slots)
        if not runs:
            continue

        # Run them concurrently.
        tasks = [
            asyncio.create_task(event_dispatcher.run_claimed(pool, r))
            for r in runs
        ]
        await asyncio.gather(*tasks, return_exceptions=True)
        processed += len(runs)

    return processed


async def _loop(pool: asyncpg.Pool) -> None:
    logger.info("Workflow event worker started (poll %.0fs)", POLL_INTERVAL_SECONDS)
    while True:
        try:
            n = await _drain(pool)
            if n:
                logger.info("Workflow worker processed %d run(s)", n)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 — never let the loop die
            logger.exception("Workflow worker tick failed")
        # Sleep until woken by an emit or the poll interval elapses.
        try:
            await asyncio.wait_for(_wake.wait(), timeout=POLL_INTERVAL_SECONDS)
        except asyncio.TimeoutError:
            pass
        _wake.clear()


def start_worker(pool: asyncpg.Pool) -> None:
    global _worker_task
    if _worker_task is not None and not _worker_task.done():
        return
    _worker_task = asyncio.create_task(_loop(pool))


def stop_worker() -> None:
    global _worker_task
    if _worker_task is not None:
        _worker_task.cancel()
        _worker_task = None
