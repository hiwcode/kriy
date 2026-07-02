"""In-memory registry of active agent runs, decoupled from the HTTP request.

Problem it solves: previously the agent executed *inside* the SSE response
generator, so when the browser navigated away Starlette cancelled the generator
and the run died mid-flight. Here the run executes in a detached background task
that keeps going regardless of the client. The SSE endpoint merely *subscribes*
to the run's output (replaying what it missed, then tailing live), so a user can
leave and come back — or open a second tab — without losing the run.

Single-process, in-memory: fine for the local/dev server and a single backend
instance. For multi-instance prod this would move to Redis pub/sub, but the
run's output is also persisted to the session either way, so history survives.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import AsyncGenerator, Awaitable, Callable

logger = logging.getLogger(__name__)

# How long a finished run is kept so a returning client can replay its tail
# and we can report "finished while you were away".
_FINISHED_TTL_SECONDS = 180.0

_DONE = object()  # sentinel pushed to subscribers when a run completes


class ActiveRun:
    def __init__(self) -> None:
        self.buffer: list[str] = []            # every SSE chunk emitted so far
        self.subscribers: list[asyncio.Queue] = []
        self.done: bool = False
        self.finished_at: float | None = None
        self.task: asyncio.Task | None = None


# key = f"{agent_id}:{session_id}"
_runs: dict[str, ActiveRun] = {}


def run_key(agent_id: int, session_id: str) -> str:
    return f"{agent_id}:{session_id}"


def _purge() -> None:
    """Drop finished runs past their TTL."""
    now = time.monotonic()
    stale = [
        k for k, r in _runs.items()
        if r.done and r.finished_at is not None and (now - r.finished_at) > _FINISHED_TTL_SECONDS
    ]
    for k in stale:
        _runs.pop(k, None)


def is_active(key: str) -> bool:
    run = _runs.get(key)
    return run is not None and not run.done


def status(key: str) -> dict:
    """Report whether a run is active, or finished within the replay window."""
    run = _runs.get(key)
    if run is None:
        return {"active": False, "finished_recently": False}
    if not run.done:
        return {"active": True, "finished_recently": False}
    recent = run.finished_at is not None and (time.monotonic() - run.finished_at) <= _FINISHED_TTL_SECONDS
    return {"active": False, "finished_recently": recent}


def start(key: str, stream_factory: Callable[[], AsyncGenerator[str, None]]) -> ActiveRun:
    """Start a detached run that broadcasts `stream_factory()`'s chunks.

    If a run is already active for this key it is returned as-is (no double run).
    """
    _purge()
    existing = _runs.get(key)
    if existing is not None and not existing.done:
        return existing

    run = ActiveRun()
    _runs[key] = run

    async def _drive() -> None:
        try:
            async for chunk in stream_factory():
                # Atomic section (no await): append + fan-out can't interleave
                # with a subscriber registering, so no chunk is missed or dup'd.
                run.buffer.append(chunk)
                for q in run.subscribers:
                    q.put_nowait(chunk)
        except asyncio.CancelledError:
            stop_chunk = f"data: {json.dumps({'type': 'error', 'error': 'Run stopped.'})}\n\n"
            run.buffer.append(stop_chunk)
            for q in run.subscribers:
                q.put_nowait(stop_chunk)
            logger.info("Run %s cancelled", key)
        except Exception as e:  # noqa: BLE001 — surface any failure to subscribers
            logger.exception("Detached run %s failed", key)
            err = f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
            run.buffer.append(err)
            for q in run.subscribers:
                q.put_nowait(err)
        finally:
            run.done = True
            run.finished_at = time.monotonic()
            for q in run.subscribers:
                q.put_nowait(_DONE)

    run.task = asyncio.create_task(_drive())
    logger.info("Started detached run %s", key)
    return run


async def subscribe(key: str) -> AsyncGenerator[str, None]:
    """Yield a run's buffered output, then live output until it completes.

    Safe to call for an active OR a recently-finished run (replays its tail).
    Yields nothing if the key is unknown.
    """
    run = _runs.get(key)
    if run is None:
        return

    q: asyncio.Queue = asyncio.Queue()
    # Atomic: snapshot the buffer and register the queue with no await between,
    # so the driver's fan-out can't slip a chunk into exactly one of them.
    snapshot = list(run.buffer)
    already_done = run.done
    run.subscribers.append(q)

    try:
        for chunk in snapshot:
            yield chunk
        if already_done:
            return
        while True:
            item = await q.get()
            if item is _DONE:
                return
            yield item
    finally:
        try:
            run.subscribers.remove(q)
        except ValueError:
            pass


def stop(key: str) -> bool:
    """Cancel an active run. Returns True if one was running."""
    run = _runs.get(key)
    if run is None or run.done or run.task is None:
        return False
    run.task.cancel()
    return True
