from __future__ import annotations

from typing import Any

import asyncpg

from app.db.base import close_db as _close_db
from app.db.base import init_db as _init_db


async def init_db(app: Any | None = None) -> asyncpg.Pool:
    return await _init_db(app)


async def close_db(app: Any | None = None) -> None:
    await _close_db(app)
