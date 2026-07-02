"""Database pool dependency - isolated to avoid circular imports with security."""
from __future__ import annotations

import asyncpg
from fastapi import Request


async def get_db(request: Request) -> asyncpg.Pool:
    pool = request.app.state.db_pool
    if pool is None:
        raise RuntimeError("Database pool is not initialized")
    return pool
