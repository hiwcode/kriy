"""Per-session pricing snapshots.

Cost is derived on read from the live, user-configured catalog. To keep an
already-run session's cost stable when the user later edits a model's price (or
changes an agent's model), we freeze the rate for each model the first time a
session's cost is computed. Later reads reuse the frozen rate; only models that
appear in a session for the first time get resolved from the live catalog and
added to the snapshot.
"""

from __future__ import annotations

import json
from typing import Any, Iterable

import asyncpg

from app.core.model_pricing import match_pricing

Pricing = dict[str, tuple[float, float]]


def models_in_events(events: Iterable[dict]) -> set[str]:
    """The distinct models (``model_version``) that produced events in a session."""
    out: set[str] = set()
    for ev in events or []:
        m = ev.get("model_version")
        if m:
            out.add(m)
    return out


def _decode(pricing: Any) -> Pricing:
    if isinstance(pricing, str):
        pricing = json.loads(pricing)
    return {k: (float(v[0]), float(v[1])) for k, v in (pricing or {}).items()}


async def get_snapshots(
    pool: asyncpg.Pool, agent_id: int, session_ids: list[str]
) -> dict[str, Pricing]:
    """Load frozen pricing maps for the given sessions, keyed by session_id."""
    if not session_ids:
        return {}
    rows = await pool.fetch(
        "SELECT session_id, pricing FROM session_pricing_snapshots "
        "WHERE agent_id = $1 AND session_id = ANY($2::text[])",
        agent_id,
        list(session_ids),
    )
    return {r["session_id"]: _decode(r["pricing"]) for r in rows}


async def save_snapshot(
    pool: asyncpg.Pool, agent_id: int, session_id: str, pricing: Pricing
) -> None:
    """Persist a snapshot. Existing per-model rates always win, so a rate that was
    already frozen is never overwritten — only new models are added."""
    payload = json.dumps({k: [v[0], v[1]] for k, v in pricing.items()})
    await pool.execute(
        """
        INSERT INTO session_pricing_snapshots (agent_id, session_id, pricing)
        VALUES ($1, $2, $3::jsonb)
        ON CONFLICT (agent_id, session_id) DO UPDATE SET
            pricing = EXCLUDED.pricing || session_pricing_snapshots.pricing,
            updated_at = now()
        """,
        agent_id,
        session_id,
        payload,
    )


def _resolve(session_models: set[str], snapshot: Pricing | None, live: Pricing) -> tuple[Pricing, bool]:
    """Effective pricing = frozen snapshot + live rates for any not-yet-seen model."""
    eff: Pricing = dict(snapshot or {})
    added = False
    for m in session_models:
        if m and m not in eff:
            eff[m] = match_pricing(m, live)
            added = True
    return eff, added


async def effective_pricing_for_session(
    pool: asyncpg.Pool,
    agent_id: int,
    session_id: str,
    events: Iterable[dict],
    live: Pricing,
) -> Pricing:
    """Effective per-model pricing for one session, snapshotting new models."""
    snaps = await get_snapshots(pool, agent_id, [session_id])
    eff, added = _resolve(models_in_events(events), snaps.get(session_id), live)
    if added:
        try:
            await save_snapshot(pool, agent_id, session_id, eff)
        except Exception:  # never let a snapshot write break a read
            pass
    return eff


async def effective_pricing_bulk(
    pool: asyncpg.Pool,
    agent_id: int,
    sessions: list[tuple[str, list[dict]]],
    live: Pricing,
) -> dict[str, Pricing]:
    """Effective per-model pricing for many sessions of one agent (one snapshot read)."""
    snaps = await get_snapshots(pool, agent_id, [sid for sid, _ in sessions])
    result: dict[str, Pricing] = {}
    to_save: list[tuple[str, Pricing]] = []
    for sid, events in sessions:
        eff, added = _resolve(models_in_events(events), snaps.get(sid), live)
        result[sid] = eff
        if added:
            to_save.append((sid, eff))
    for sid, eff in to_save:
        try:
            await save_snapshot(pool, agent_id, sid, eff)
        except Exception:
            pass
    return result
