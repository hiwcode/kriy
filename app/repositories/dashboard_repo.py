"""Repository for dashboard aggregations."""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any

import asyncpg

from app.repositories import agent_repo, prompt_library_repo


async def get_session_count(
    pool: asyncpg.Pool,
    user_id: str | None = None,
    workspace_id: int | None = None,
) -> int:
    """Total conversation sessions (optionally scoped to workspace)."""
    if workspace_id is not None:
        row = await pool.fetchrow(
            """
            SELECT COUNT(*) as n FROM agent_sessions s
            JOIN agents a ON a.id = s.agent_id
            WHERE a.workspace_id = $1
            """,
            workspace_id,
        )
    elif user_id:
        row = await pool.fetchrow(
            "SELECT COUNT(*) as n FROM agent_sessions WHERE user_id = $1",
            user_id,
        )
    else:
        row = await pool.fetchrow("SELECT COUNT(*) as n FROM agent_sessions")
    return row["n"] if row else 0


async def get_total_tokens(
    pool: asyncpg.Pool,
    user_id: str | None = None,
    limit_sessions: int = 500,
    workspace_id: int | None = None,
) -> tuple[int, int]:
    """Sum input and output tokens from recent sessions (optionally scoped to workspace)."""
    if workspace_id is not None:
        rows = await pool.fetch(
            """
            SELECT s.session_data FROM agent_sessions s
            JOIN agents a ON a.id = s.agent_id
            WHERE a.workspace_id = $1
            ORDER BY s.last_update_time DESC
            LIMIT $2
            """,
            workspace_id,
            limit_sessions,
        )
    elif user_id:
        rows = await pool.fetch(
            """
            SELECT session_data FROM agent_sessions
            WHERE user_id = $1
            ORDER BY last_update_time DESC
            LIMIT $2
            """,
            user_id,
            limit_sessions,
        )
    else:
        rows = await pool.fetch(
            "SELECT session_data FROM agent_sessions ORDER BY last_update_time DESC LIMIT $1",
            limit_sessions,
        )
    total_input = 0
    total_output = 0
    for row in rows:
        data = row["session_data"]
        if isinstance(data, str):
            data = json.loads(data)
        for ev in data.get("events", []):
            usage = ev.get("usage_metadata") or {}
            total_input += usage.get("prompt_token_count") or usage.get("input_tokens") or 0
            total_output += usage.get("candidates_token_count") or usage.get("output_tokens") or 0
    return total_input, total_output


async def get_daily_usage(
    pool: asyncpg.Pool,
    user_id: str | None = None,
    days: int = 7,
    workspace_id: int | None = None,
) -> list[dict[str, Any]]:
    """Daily tokens and conversations for the last N days (optionally scoped to workspace)."""
    now = datetime.utcnow()
    result = {i: {"tokens": 0, "conversations": 0} for i in range(days)}
    cutoff = (now - timedelta(days=days)).timestamp()

    if workspace_id is not None:
        rows = await pool.fetch(
            """
            SELECT s.session_data, s.last_update_time
            FROM agent_sessions s
            JOIN agents a ON a.id = s.agent_id
            WHERE a.workspace_id = $1 AND s.last_update_time >= $2
            ORDER BY s.last_update_time DESC
            """,
            workspace_id,
            cutoff,
        )
    elif user_id:
        rows = await pool.fetch(
            """
            SELECT session_data, last_update_time
            FROM agent_sessions
            WHERE user_id = $1 AND last_update_time >= $2
            ORDER BY last_update_time DESC
            """,
            user_id,
            cutoff,
        )
    else:
        rows = await pool.fetch(
            "SELECT session_data, last_update_time FROM agent_sessions WHERE last_update_time >= $1 ORDER BY last_update_time DESC",
            cutoff,
        )

    for row in rows:
        lut = row["last_update_time"]
        if isinstance(lut, (int, float)):
            session_dt = datetime.utcfromtimestamp(lut)
        else:
            session_dt = lut.replace(tzinfo=None) if getattr(lut, "tzinfo", None) else lut
        day_diff = (now.date() - session_dt.date()).days
        if 0 <= day_diff < days:
            result[day_diff]["conversations"] += 1

        data = row["session_data"]
        if isinstance(data, str):
            data = json.loads(data)
        tokens = 0
        for ev in data.get("events", []):
            usage = ev.get("usage_metadata") or {}
            tokens += usage.get("prompt_token_count") or usage.get("input_tokens") or 0
            tokens += usage.get("candidates_token_count") or usage.get("output_tokens") or 0

        if 0 <= day_diff < days:
            result[day_diff]["tokens"] += tokens

    # Return oldest first for chart (left to right)
    return [
        {
            "name": (now - timedelta(days=days - 1 - i)).strftime("%a"),
            "tokens": result[days - 1 - i]["tokens"],
            "conversations": result[days - 1 - i]["conversations"],
        }
        for i in range(days)
    ]


async def get_tokens_per_agent(
    pool: asyncpg.Pool,
    user_id: str | None = None,
    limit_sessions_per_agent: int = 200,
    agent_user_id: int | None = None,
    workspace_id: int | None = None,
) -> list[dict[str, Any]]:
    """Tokens and cost per agent (optionally scoped to workspace)."""
    agents = await agent_repo.list_agents(
        pool,
        limit=50,
        offset=0,
        user_id=agent_user_id if workspace_id is None else None,
        workspace_id=workspace_id,
    )
    result = []
    for a in agents:
        agent_id = a["id"]
        name = a.get("label") or a.get("name", "")
        if workspace_id is not None:
            rows = await pool.fetch(
                """
                SELECT session_data FROM agent_sessions
                WHERE agent_id = $1
                ORDER BY last_update_time DESC
                LIMIT $2
                """,
                agent_id,
                limit_sessions_per_agent,
            )
        elif user_id:
            rows = await pool.fetch(
                """
                SELECT session_data FROM agent_sessions
                WHERE agent_id = $1 AND user_id = $2
                ORDER BY last_update_time DESC
                LIMIT $3
                """,
                agent_id,
                user_id,
                limit_sessions_per_agent,
            )
        else:
            rows = await pool.fetch(
                "SELECT session_data FROM agent_sessions WHERE agent_id = $1 ORDER BY last_update_time DESC LIMIT $2",
                agent_id,
                limit_sessions_per_agent,
            )
        input_tokens = 0
        output_tokens = 0
        for row in rows:
            data = row["session_data"]
            if isinstance(data, str):
                data = json.loads(data)
            for ev in data.get("events", []):
                usage = ev.get("usage_metadata") or {}
                input_tokens += usage.get("prompt_token_count") or usage.get("input_tokens") or 0
                output_tokens += usage.get("candidates_token_count") or usage.get("output_tokens") or 0
        total = input_tokens + output_tokens
        # gemini-2.5-flash pricing per 1M tokens
        cost = (input_tokens * 0.15 + output_tokens * 0.60) / 1_000_000
        result.append({
            "id": agent_id,
            "name": name,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "tokens": total,
            "estimated_cost": round(cost, 4),
        })
    return result


async def get_agent_stats(
    pool: asyncpg.Pool,
    user_id: str | None = None,
    limit: int = 10,
    agent_user_id: int | None = None,
    workspace_id: int | None = None,
) -> list[dict[str, Any]]:
    """Agents with session count and last activity (optionally scoped to workspace)."""
    agents = await agent_repo.list_agents(
        pool,
        limit=limit,
        offset=0,
        user_id=agent_user_id if workspace_id is None else None,
        workspace_id=workspace_id,
    )
    result = []
    for a in agents:
        agent_id = a["id"]
        if workspace_id is not None:
            row = await pool.fetchrow(
                """
                SELECT COUNT(*) as session_count,
                       MAX(last_update_time) as last_active
                FROM agent_sessions
                WHERE agent_id = $1
                """,
                agent_id,
            )
        elif user_id:
            row = await pool.fetchrow(
                """
                SELECT COUNT(*) as session_count,
                       MAX(last_update_time) as last_active
                FROM agent_sessions
                WHERE agent_id = $1 AND user_id = $2
                """,
                agent_id,
                user_id,
            )
        else:
            row = await pool.fetchrow(
                "SELECT COUNT(*) as session_count, MAX(last_update_time) as last_active FROM agent_sessions WHERE agent_id = $1",
                agent_id,
            )
        count = row["session_count"] if row else 0
        last_ts = row["last_active"] if row and row["last_active"] else None
        last_ts_val = None
        if last_ts is not None:
            if hasattr(last_ts, "timestamp"):
                last_ts_val = last_ts.timestamp()
            elif isinstance(last_ts, (int, float)):
                last_ts_val = float(last_ts)
        result.append({
            "id": agent_id,
            "name": a.get("label") or a.get("name", ""),
            "session_count": count,
            "last_active": last_ts_val,
            "url": f"/agents/{agent_id}",
        })
    return result


async def get_recent_activity(
    pool: asyncpg.Pool,
    user_id: str | None = None,
    limit: int = 10,
    prompt_user_id: int | None = None,
    workspace_id: int | None = None,
) -> list[dict[str, Any]]:
    """Recent sessions and prompts combined (optionally scoped to workspace)."""
    activities = []

    # Recent sessions
    if workspace_id is not None:
        rows = await pool.fetch(
            """
            SELECT s.agent_id, s.session_id, s.session_data, s.last_update_time,
                   a.label as agent_label
            FROM agent_sessions s
            JOIN agents a ON a.id = s.agent_id
            WHERE a.workspace_id = $1
            ORDER BY s.last_update_time DESC
            LIMIT $2
            """,
            workspace_id,
            limit,
        )
    elif user_id:
        rows = await pool.fetch(
            """
            SELECT s.agent_id, s.session_id, s.session_data, s.last_update_time,
                   a.label as agent_label
            FROM agent_sessions s
            JOIN agents a ON a.id = s.agent_id
            WHERE s.user_id = $1
            ORDER BY s.last_update_time DESC
            LIMIT $2
            """,
            user_id,
            limit,
        )
    else:
        rows = await pool.fetch(
            """
            SELECT s.agent_id, s.session_id, s.session_data, s.last_update_time,
                   a.label as agent_label
            FROM agent_sessions s
            JOIN agents a ON a.id = s.agent_id
            ORDER BY s.last_update_time DESC
            LIMIT $1
            """,
            limit,
        )
    for row in rows:
        data = row["session_data"]
        if isinstance(data, str):
            data = json.loads(data)
        title = (data.get("state") or {}).get("title") or "New conversation"
        lut = row["last_update_time"]
        ts = float(lut) if isinstance(lut, (int, float)) else (lut.timestamp() if hasattr(lut, "timestamp") else 0)
        activities.append({
            "id": f"session-{row['session_id']}",
            "type": "conversation",
            "agent": row["agent_label"] or "Agent",
            "title": title[:80] + ("..." if len(title) > 80 else ""),
            "timestamp": ts,
            "url": f"/agents/{row['agent_id']}?session={row['session_id']}",
        })

    # Recent prompts (most recent first)
    prompts = await prompt_library_repo.list_prompts(
        pool,
        limit=max(limit // 2, 3),
        offset=0,
        sort_field="createdat",
        sort_order="desc",
        user_id=prompt_user_id if workspace_id is None else None,
        workspace_id=workspace_id,
    )
    items = prompts if isinstance(prompts, list) else prompts
    for p in items:
        ts = p.get("createdat") or p.get("updatedat")
        ts_val = 0
        if ts:
            if hasattr(ts, "timestamp"):
                ts_val = ts.timestamp()
            elif isinstance(ts, (int, float)):
                ts_val = ts
        activities.append({
            "id": f"prompt-{p.get('id')}",
            "type": "prompt",
            "agent": "-",
            "title": (p.get("title") or "Untitled")[:80],
            "timestamp": ts_val,
            "url": "/prompt-library",
        })

    activities.sort(key=lambda x: x["timestamp"], reverse=True)
    return activities[:limit]
