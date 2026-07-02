"""Background worker that drains the workflow_runs queue.

Emitting an event only *enqueues* runs (status='pending'). This worker claims them
one at a time — highest priority first, then oldest — and executes each. Serial
execution (one run at a time) keeps load and LLM rate-limits in check instead of
firing every matching workflow at once.

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
    """Process every currently-pending run, one at a time, in priority order."""
    processed = 0
    while True:
        run = await workflow_repo.claim_next_run(pool)
        if run is None:
            return processed
        await event_dispatcher.run_claimed(pool, run)
        processed += 1


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
