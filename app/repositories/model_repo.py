"""Model catalog repository — the full, user-managed model catalog.

There are no built-in models. Every model and its per-1M-token price is a row here,
scoped to a workspace (``workspace_id`` NULL = personal). Cost is computed entirely
from these rows.
"""

from __future__ import annotations

import asyncpg

_COLS = "id, workspace_id, user_id, name, label, input_per_million, output_per_million, created_at, updated_at"


def _row(r: asyncpg.Record | None) -> dict | None:
    if r is None:
        return None
    d = dict(r)
    # numeric(12,4) comes back as Decimal — expose as float for JSON/pricing math.
    d["input_per_million"] = float(d["input_per_million"])
    d["output_per_million"] = float(d["output_per_million"])
    return d


async def list_overrides(pool: asyncpg.Pool, workspace_id: int | None) -> list[dict]:
    rows = await pool.fetch(
        f"SELECT {_COLS} FROM model_pricing WHERE workspace_id IS NOT DISTINCT FROM $1 ORDER BY name;",
        workspace_id,
    )
    return [_row(r) for r in rows]  # type: ignore[misc]


async def upsert(
    pool: asyncpg.Pool,
    *,
    workspace_id: int | None,
    user_id: int | None,
    name: str,
    label: str,
    input_per_million: float,
    output_per_million: float,
) -> dict:
    row = await pool.fetchrow(
        f"""
        INSERT INTO model_pricing (workspace_id, user_id, name, label, input_per_million, output_per_million)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (COALESCE(workspace_id, 0), name) DO UPDATE SET
            label = EXCLUDED.label,
            input_per_million = EXCLUDED.input_per_million,
            output_per_million = EXCLUDED.output_per_million,
            updated_at = now()
        RETURNING {_COLS};
        """,
        workspace_id, user_id, name, label, input_per_million, output_per_million,
    )
    return _row(row)  # type: ignore[return-value]


async def delete(pool: asyncpg.Pool, *, workspace_id: int | None, name: str) -> bool:
    res = await pool.execute(
        "DELETE FROM model_pricing WHERE workspace_id IS NOT DISTINCT FROM $1 AND name = $2;",
        workspace_id, name,
    )
    return res.endswith("1")


async def pricing_map(pool: asyncpg.Pool, workspace_id: int | None) -> dict[str, tuple[float, float]]:
    """This workspace's configured model prices: name -> (input, output) per 1M."""
    return {
        r["name"]: (r["input_per_million"], r["output_per_million"])
        for r in await list_overrides(pool, workspace_id)
    }


async def list_catalog(pool: asyncpg.Pool, workspace_id: int | None) -> list[dict]:
    """Full catalog for the UI — every configured model (all user-managed)."""
    return [
        {
            "name": r["name"],
            "label": r["label"] or r["name"],
            "input_per_million": r["input_per_million"],
            "output_per_million": r["output_per_million"],
            "builtin": False,
            "custom": True,
        }
        for r in await list_overrides(pool, workspace_id)
    ]
