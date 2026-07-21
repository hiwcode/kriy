"""Model catalog repository — workspace-scoped price overrides/additions.

Rows here layer on top of ``app.core.model_pricing.DEFAULT_MODEL_PRICING``: a row
with a name matching a built-in overrides its price; a new name adds a model.
"""

from __future__ import annotations

import asyncpg

from app.core.model_pricing import DEFAULT_MODEL_PRICING

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
    """Built-in defaults merged with this workspace's overrides (overrides win)."""
    merged: dict[str, tuple[float, float]] = dict(DEFAULT_MODEL_PRICING)
    for r in await list_overrides(pool, workspace_id):
        merged[r["name"]] = (r["input_per_million"], r["output_per_million"])
    return merged


async def list_catalog(pool: asyncpg.Pool, workspace_id: int | None) -> list[dict]:
    """Full merged catalog for the UI: built-ins + overrides, flagged by source."""
    overrides = {r["name"]: r for r in await list_overrides(pool, workspace_id)}
    names = set(DEFAULT_MODEL_PRICING) | set(overrides)
    out: list[dict] = []
    for name in sorted(names):
        ov = overrides.get(name)
        if ov:
            out.append({
                "name": name,
                "label": ov["label"] or name,
                "input_per_million": ov["input_per_million"],
                "output_per_million": ov["output_per_million"],
                "builtin": name in DEFAULT_MODEL_PRICING,
                "custom": True,  # has a stored override/addition row
            })
        else:
            inp, outp = DEFAULT_MODEL_PRICING[name]
            out.append({
                "name": name,
                "label": name,
                "input_per_million": inp,
                "output_per_million": outp,
                "builtin": True,
                "custom": False,
            })
    return out
