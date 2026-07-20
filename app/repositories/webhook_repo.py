"""Repository for outbound webhook subscriptions + their delivery log."""

from __future__ import annotations

import fnmatch
import json
from typing import Any

import asyncpg

_SUB_COLS = "id, workspace_id, user_id, url, secret, event_types, enabled, created_at"
_DEL_COLS = (
    "id, subscription_id, event_id, type, payload, status, attempts, "
    "response_code, error, created_at, delivered_at"
)


def _row(r: asyncpg.Record | None) -> dict | None:
    return dict(r) if r is not None else None


# --------------------------------------------------------------------------- #
# Subscriptions
# --------------------------------------------------------------------------- #


async def list_for_workspace(pool: asyncpg.Pool, workspace_id: int | None) -> list[dict]:
    rows = await pool.fetch(
        f"SELECT {_SUB_COLS} FROM webhook_subscriptions "
        f"WHERE workspace_id IS NOT DISTINCT FROM $1 ORDER BY id DESC;",
        workspace_id,
    )
    return [dict(r) for r in rows]


async def get(pool: asyncpg.Pool, sub_id: int) -> dict | None:
    return _row(await pool.fetchrow(f"SELECT {_SUB_COLS} FROM webhook_subscriptions WHERE id = $1;", sub_id))


async def create(
    pool: asyncpg.Pool, *, workspace_id: int | None, user_id: int | None,
    url: str, secret: str, event_types: list[str],
) -> dict:
    row = await pool.fetchrow(
        f"""
        INSERT INTO webhook_subscriptions (workspace_id, user_id, url, secret, event_types)
        VALUES ($1,$2,$3,$4,$5) RETURNING {_SUB_COLS};
        """,
        workspace_id, user_id, url, secret, event_types,
    )
    return dict(row)


async def update(pool: asyncpg.Pool, sub_id: int, *, url: str, event_types: list[str], enabled: bool) -> dict | None:
    return _row(await pool.fetchrow(
        f"UPDATE webhook_subscriptions SET url=$2, event_types=$3, enabled=$4 WHERE id=$1 RETURNING {_SUB_COLS};",
        sub_id, url, event_types, enabled,
    ))


async def rotate_secret(pool: asyncpg.Pool, sub_id: int, secret: str) -> dict | None:
    return _row(await pool.fetchrow(
        f"UPDATE webhook_subscriptions SET secret=$2 WHERE id=$1 RETURNING {_SUB_COLS};",
        sub_id, secret,
    ))


async def delete(pool: asyncpg.Pool, sub_id: int) -> bool:
    res = await pool.execute("DELETE FROM webhook_subscriptions WHERE id = $1;", sub_id)
    return res.endswith("1")


async def find_matching(pool: asyncpg.Pool, *, workspace_id: int | None, event_type: str) -> list[dict]:
    """Enabled subscriptions in this workspace where any of ``event_types`` matches."""
    rows = await pool.fetch(
        f"SELECT {_SUB_COLS} FROM webhook_subscriptions "
        f"WHERE workspace_id IS NOT DISTINCT FROM $1 AND enabled = TRUE;",
        workspace_id,
    )
    return [
        dict(r) for r in rows
        if any(fnmatch.fnmatch(event_type, pat) for pat in (r["event_types"] or []))
    ]


# --------------------------------------------------------------------------- #
# Deliveries
# --------------------------------------------------------------------------- #


def _delivery_row(r: asyncpg.Record) -> dict:
    d = dict(r)
    v = d.get("payload")
    if isinstance(v, str):
        try:
            d["payload"] = json.loads(v)
        except (ValueError, TypeError):
            pass
    return d


async def log_delivery(
    pool: asyncpg.Pool, *, subscription_id: int, event_id: str, type: str,
    payload: Any, status: str, attempts: int, response_code: int | None, error: str | None,
    delivered_at: Any = None,
) -> int:
    row = await pool.fetchrow(
        """
        INSERT INTO webhook_deliveries
            (subscription_id, event_id, type, payload, status, attempts, response_code, error, delivered_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id;
        """,
        subscription_id, event_id, type, json.dumps(payload, default=str),
        status, attempts, response_code, error, delivered_at,
    )
    return int(row["id"])


async def list_deliveries(pool: asyncpg.Pool, subscription_id: int, *, limit: int = 100) -> list[dict]:
    rows = await pool.fetch(
        f"SELECT {_DEL_COLS} FROM webhook_deliveries WHERE subscription_id = $1 "
        f"ORDER BY created_at DESC LIMIT $2;",
        subscription_id, limit,
    )
    return [_delivery_row(r) for r in rows]


async def get_delivery(pool: asyncpg.Pool, delivery_id: int) -> dict | None:
    r = await pool.fetchrow(f"SELECT {_DEL_COLS} FROM webhook_deliveries WHERE id = $1;", delivery_id)
    return _delivery_row(r) if r is not None else None
