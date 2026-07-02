"""Repository for agent trace extraction from session events."""

from __future__ import annotations

import json
from typing import Any

import asyncpg


def _parse_event(event: dict) -> dict[str, Any]:
    """Parse a single event into trace step format."""
    author = event.get("author", "")
    content = event.get("content") or {}
    parts = content.get("parts", [])
    timestamp = event.get("timestamp", 0)
    invocation_id = event.get("invocation_id", "")
    event_id = event.get("id", "")

    result: dict[str, Any] = {
        "event_id": event_id,
        "invocation_id": invocation_id,
        "author": author,
        "timestamp": timestamp,
        "usage": event.get("usage_metadata") or {},
    }

    # Text content
    text_parts = [p.get("text", "") or "" for p in parts or [] if p.get("text")]
    if text_parts:
        result["type"] = "text"
        result["text"] = "".join(text_parts).strip()
        return result

    # Function calls (tool invocations)
    for p in parts or []:
        fc = p.get("function_call") or p.get("functionCall")
        if fc:
            result["type"] = "tool_call"
            result["tool_name"] = fc.get("name", "")
            result["tool_args"] = fc.get("args") or {}
            return result

    # Function responses (tool results)
    for p in parts or []:
        fr = p.get("function_response") or p.get("functionResponse")
        if fr:
            result["type"] = "tool_response"
            result["tool_name"] = fr.get("name", "")
            result["tool_response"] = fr.get("response")
            return result

    result["type"] = "other"
    return result


async def list_traces(
    pool: asyncpg.Pool,
    agent_id: int,
    user_id: str | None = "user",
    limit: int = 50,
    offset: int = 0,
    search: str | None = None,
) -> list[dict[str, Any]]:
    """List traces (sessions) for an agent with summary stats, pagination, search.
    When user_id is None, returns traces from ALL users (workspace mode).
    """
    params: list[Any] = [agent_id]
    where = "WHERE agent_id = $1"
    idx = 2
    if user_id is not None:
        where += f" AND user_id = ${idx}"
        params.append(user_id)
        idx += 1
    if search and search.strip():
        where += f" AND COALESCE(session_data->'state'->>'title', '') ILIKE ${idx}"
        params.append(f"%{search.strip()}%")
        idx += 1
    query = f"""
        SELECT session_id, session_data, last_update_time
        FROM agent_sessions
        {where}
        ORDER BY last_update_time DESC
        LIMIT ${idx} OFFSET ${idx + 1}
    """
    params.extend([limit, offset])
    rows = await pool.fetch(query, *params)
    traces = []
    for row in rows:
        data = row["session_data"]
        if isinstance(data, str):
            data = json.loads(data)
        state = data.get("state", {})
        events = data.get("events", [])

        tool_calls = 0
        total_input_tokens = 0
        total_output_tokens = 0
        for ev in events:
            usage = ev.get("usage_metadata") or {}
            total_input_tokens += usage.get("prompt_token_count") or usage.get("input_tokens") or 0
            total_output_tokens += usage.get("candidates_token_count") or usage.get("output_tokens") or 0
            content = ev.get("content") or {}
            for p in content.get("parts") or []:
                if p.get("function_call") or p.get("functionCall") or p.get("function_response") or p.get("functionResponse"):
                    tool_calls += 1

        traces.append({
            "session_id": row["session_id"],
            "title": state.get("title") or "New conversation",
            "created_at": events[0].get("timestamp") if events else row["last_update_time"],
            "last_updated": row["last_update_time"],
            "event_count": len(events),
            "tool_call_count": tool_calls,
            "input_tokens": total_input_tokens,
            "output_tokens": total_output_tokens,
        })
    return traces


async def count_traces(
    pool: asyncpg.Pool,
    agent_id: int,
    user_id: str | None = "user",
    search: str | None = None,
) -> int:
    """Count trace sessions matching criteria."""
    params: list[Any] = [agent_id]
    where = "WHERE agent_id = $1"
    idx = 2
    if user_id is not None:
        where += f" AND user_id = ${idx}"
        params.append(user_id)
        idx += 1
    if search and search.strip():
        where += f" AND COALESCE(session_data->'state'->>'title', '') ILIKE ${idx}"
        params.append(f"%{search.strip()}%")
        idx += 1
    row = await pool.fetchrow(f"SELECT COUNT(*)::int FROM agent_sessions {where}", *params)
    return row[0] if row else 0


async def get_trace_detail(
    pool: asyncpg.Pool,
    agent_id: int,
    session_id: str,
    user_id: str | None = "user",
) -> dict[str, Any] | None:
    """Get full trace detail for a session: all events with tool calls, responses, usage."""
    if user_id is not None:
        row = await pool.fetchrow(
            """
            SELECT session_data FROM agent_sessions
            WHERE agent_id = $1 AND user_id = $2 AND session_id = $3
            """,
            agent_id,
            user_id,
            session_id,
        )
    else:
        row = await pool.fetchrow(
            """
            SELECT session_data FROM agent_sessions
            WHERE agent_id = $1 AND session_id = $2
            """,
            agent_id,
            session_id,
        )
    if not row:
        return None
    data = row["session_data"]
    if isinstance(data, str):
        data = json.loads(data)
    events = data.get("events", [])
    state = data.get("state", {})

    steps = []
    total_input = 0
    total_output = 0
    for ev in events:
        step = _parse_event(ev)
        usage = step.get("usage") or {}
        total_input += usage.get("prompt_token_count") or usage.get("input_tokens") or 0
        total_output += usage.get("candidates_token_count") or usage.get("output_tokens") or 0
        steps.append(step)

    return {
        "session_id": session_id,
        "state": state,
        "steps": steps,
        "total_input_tokens": total_input,
        "total_output_tokens": total_output,
        "total_tokens": total_input + total_output,
    }
