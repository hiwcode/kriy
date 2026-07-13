"""Redis cache layer — thin wrapper for get/set/invalidate.

Falls back silently to no-op when REDIS_URL is not set or Redis is unreachable,
so caching never breaks the app.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger(__name__)

_redis: aioredis.Redis | None = None
_PREFIX = "atelier:"


async def init_redis() -> None:
    """Connect to Redis. Call once at startup."""
    global _redis
    if not settings.REDIS_URL:
        logger.info("REDIS_URL not set — caching disabled")
        return
    try:
        _redis = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=5,
        )
        await _redis.ping()
        logger.info("Redis connected")
    except Exception:
        logger.warning("Redis connection failed — caching disabled", exc_info=True)
        _redis = None


async def close_redis() -> None:
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None


async def get(key: str) -> Any | None:
    """Get a cached value. Returns None on miss or error."""
    if _redis is None:
        return None
    try:
        raw = await _redis.get(f"{_PREFIX}{key}")
        if raw is None:
            return None
        return json.loads(raw)
    except Exception:
        return None


def _json_default(obj: Any) -> Any:
    """JSON serializer that handles Pydantic models and other non-standard types."""
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    return str(obj)


async def set(key: str, value: Any, ttl: int = 300) -> None:
    """Cache a value with TTL in seconds."""
    if _redis is None:
        return
    try:
        await _redis.set(f"{_PREFIX}{key}", json.dumps(value, default=_json_default), ex=ttl)
    except Exception:
        pass


async def incr_window(key: str, window: int) -> int | None:
    """Increment a fixed-window counter and return the new count.

    The key expires `window` seconds after its first increment. Returns None
    when Redis is unavailable (caller should fall back). Used by the rate limiter.
    """
    if _redis is None:
        return None
    try:
        full = f"{_PREFIX}{key}"
        count = await _redis.incr(full)
        if count == 1:
            await _redis.expire(full, window)
        return int(count)
    except Exception:
        return None


async def delete(key: str) -> None:
    """Delete a single cache key."""
    if _redis is None:
        return
    try:
        await _redis.delete(f"{_PREFIX}{key}")
    except Exception:
        pass


async def delete_pattern(pattern: str) -> None:
    """Delete all keys matching a pattern (e.g. 'agents:ws:5:*')."""
    if _redis is None:
        return
    try:
        cursor = None
        while cursor != 0:
            cursor, keys = await _redis.scan(
                cursor=cursor or 0, match=f"{_PREFIX}{pattern}", count=100
            )
            if keys:
                await _redis.delete(*keys)
    except Exception:
        pass
