"""Per-client rate limiting.

Fixed-window limiter backed by Redis (shared across workers) with an in-memory
fallback when Redis is unavailable. Exposed as a FastAPI dependency factory:

    @router.post("/thing", dependencies=[Depends(rate_limit(20, 60, "thing"))])

Keyed by client IP (works pre-auth), scoped per-bucket so different endpoints
don't share a budget.
"""

from __future__ import annotations

import time
from collections import defaultdict

from fastapi import Depends, HTTPException, Request, status

from app.core import cache

# In-memory fallback: bucket -> list[hit_timestamps] (only used when Redis is down).
_mem: dict[str, list[float]] = defaultdict(list)


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _mem_hit(bucket: str, limit: int, window: int) -> tuple[bool, int]:
    now = time.monotonic()
    hits = [t for t in _mem[bucket] if now - t < window]
    hits.append(now)
    _mem[bucket] = hits
    if len(hits) > limit:
        return False, window
    return True, 0


async def _hit(bucket: str, limit: int, window: int) -> tuple[bool, int]:
    count = await cache.incr_window(bucket, window)
    if count is None:  # Redis unavailable — best-effort per-process limiting
        return _mem_hit(bucket, limit, window)
    if count > limit:
        return False, window
    return True, 0


def rate_limit(limit: int, window: int = 60, scope: str = "rl"):
    """Return a dependency that allows `limit` requests per `window` seconds per IP."""

    async def _dep(request: Request) -> None:
        bucket = f"ratelimit:{scope}:{_client_ip(request)}"
        allowed, retry_after = await _hit(bucket, limit, window)
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests — slow down.",
                headers={"Retry-After": str(retry_after)},
            )

    return Depends(_dep)
