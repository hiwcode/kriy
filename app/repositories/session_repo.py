"""Repository for agent session queries."""

from __future__ import annotations

import json
from typing import Any

import asyncpg

from app.agents.ui_tools import UI_TOOL_NAMES, build_ui_card


def _extract_cards_from_parts(parts: list) -> list[dict]:
    """Rebuild UI cards from persisted presentational tool-call parts.

    The agent's ``plan`` / ``todo_write`` / ``show_card`` calls are stored in the
    session events as function-call parts, so cards survive a reload without any
    extra storage — we just reconstruct them the same way the live stream does.
    """
    cards: list[dict] = []
    for p in parts:
        if not isinstance(p, dict):
            continue
        fc = p.get("function_call") or p.get("functionCall")
        if isinstance(fc, dict) and fc.get("name") in UI_TOOL_NAMES:
            args = fc.get("args")
            card = build_ui_card(fc["name"], args if isinstance(args, dict) else {})
            if card:
                cards.append(card)
    return cards


def _parse_session_row(row: asyncpg.Record) -> dict[str, Any]:
    """Parse a session row (from list_sessions_paginated) into session dict."""
    created_at = row["created_at"]
    if hasattr(created_at, "timestamp"):
        created_at = int(created_at.timestamp())
    last_updated = row["last_update_time"]
    if isinstance(last_updated, (int, float)):
        last_updated = int(last_updated)
    return {
        "session_id": row["session_id"],
        "title": row["title"] or "New conversation",
        "created_at": created_at,
        "last_updated": last_updated,
        "message_count": row["message_count"],
    }


async def list_sessions(
    pool: asyncpg.Pool,
    agent_id: int,
    user_id: str | None = "user",
) -> list[dict[str, Any]]:
    """List sessions for an agent and user (legacy, fetches all)."""
    rows = await list_sessions_paginated(
        pool,
        agent_id=agent_id,
        user_id=user_id,
        limit=1000,
        offset=0,
    )
    return rows


# Sort field to SQL column mapping
_SORT_FIELDS: dict[str, str] = {
    "title": "title",
    "session_id": "session_id",
    "last_update_time": "last_update_time",
    "created_at": "created_at",
    "message_count": "message_count",
}


async def list_sessions_paginated(
    pool: asyncpg.Pool,
    agent_id: int,
    user_id: str | None = "user",
    limit: int = 50,
    offset: int = 0,
    search: str | None = None,
    filters: list[dict[str, Any]] | None = None,
    sort_field: str | None = None,
    sort_order: str | None = None,
) -> list[dict[str, Any]]:
    """List sessions with search, filter, sort, pagination.
    When user_id is None, returns sessions from ALL users for the agent (workspace mode).
    """
    if user_id is not None:
        agent_filter = "WHERE agent_id = $1 AND user_id = $2"
        params: list[Any] = [agent_id, user_id]
        param_idx = 3
    else:
        agent_filter = "WHERE agent_id = $1"
        params = [agent_id]
        param_idx = 2

    base = f"""
        WITH session_rows AS (
            SELECT
                session_id,
                last_update_time,
                created_at,
                COALESCE(session_data->'state'->>'title', 'New conversation') AS title,
                jsonb_array_length(COALESCE(session_data->'events', '[]'::jsonb)) AS message_count
            FROM agent_sessions
            {agent_filter}
        )
    """
    where_clauses = []

    if search:
        where_clauses.append(f"title::text ILIKE ${param_idx}")
        params.append(f"%{search}%")
        param_idx += 1

    if filters:
        for f in filters:
            field = f.get("filter_field")
            op = f.get("filter_op")
            value = f.get("filter_value")
            if not field or not op:
                continue
            col = _SORT_FIELDS.get(field)
            if not col:
                continue
            if op == "contains" and value is not None:
                where_clauses.append(f"{col}::text ILIKE ${param_idx}")
                params.append(f"%{value}%")
                param_idx += 1
            elif op == "equals" and value is not None:
                where_clauses.append(f"{col} = ${param_idx}")
                params.append(int(value) if field == "message_count" else value)
                param_idx += 1

    where_sql = ""
    if where_clauses:
        where_sql = " WHERE " + " AND ".join(where_clauses)

    order_col = _SORT_FIELDS.get(sort_field or "last_update_time", "last_update_time")
    order_dir = "DESC" if (sort_order or "desc").lower() == "desc" else "ASC"

    query = f"""
        {base}
        SELECT session_id, last_update_time, created_at, title, message_count
        FROM session_rows
        {where_sql}
        ORDER BY {order_col} {order_dir}
        LIMIT ${param_idx} OFFSET ${param_idx + 1}
    """
    params.extend([limit, offset])

    rows = await pool.fetch(query, *params)
    return [_parse_session_row(r) for r in rows]


async def count_sessions(
    pool: asyncpg.Pool,
    agent_id: int,
    user_id: str | None = "user",
    search: str | None = None,
    filters: list[dict[str, Any]] | None = None,
) -> int:
    """Count sessions matching filters."""
    if user_id is not None:
        agent_filter = "WHERE agent_id = $1 AND user_id = $2"
        params: list[Any] = [agent_id, user_id]
        param_idx = 3
    else:
        agent_filter = "WHERE agent_id = $1"
        params = [agent_id]
        param_idx = 2

    base = f"""
        WITH session_rows AS (
            SELECT
                session_id,
                COALESCE(session_data->'state'->>'title', 'New conversation') AS title,
                jsonb_array_length(COALESCE(session_data->'events', '[]'::jsonb)) AS message_count
            FROM agent_sessions
            {agent_filter}
        )
    """
    where_clauses = []

    if search:
        where_clauses.append(f"title::text ILIKE ${param_idx}")
        params.append(f"%{search}%")
        param_idx += 1

    if filters:
        for f in filters:
            field = f.get("filter_field")
            op = f.get("filter_op")
            value = f.get("filter_value")
            if not field or not op:
                continue
            col = _SORT_FIELDS.get(field)
            if not col:
                continue
            if op == "contains" and value is not None:
                where_clauses.append(f"{col}::text ILIKE ${param_idx}")
                params.append(f"%{value}%")
                param_idx += 1
            elif op == "equals" and value is not None:
                where_clauses.append(f"{col} = ${param_idx}")
                params.append(int(value) if field == "message_count" else value)
                param_idx += 1

    where_sql = ""
    if where_clauses:
        where_sql = " WHERE " + " AND ".join(where_clauses)

    row = await pool.fetchrow(
        f"""
        {base}
        SELECT COUNT(*)::int FROM session_rows {where_sql}
        """,
        *params,
    )
    return row[0] if row else 0


async def get_session_history(
    pool: asyncpg.Pool,
    agent_id: int,
    session_id: str,
    user_id: str | None = "user",
) -> dict[str, Any] | None:
    """Get session data and extract history for display."""
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

    history = []
    current_exchange = None
    for event in events:
        author = event.get("author", "")
        content = event.get("content") or {}
        if not isinstance(content, dict):
            continue
        parts = content.get("parts") or []
        if not isinstance(parts, list):
            parts = []
        text = "".join(p.get("text", "") or "" for p in parts if isinstance(p, dict)).strip()
        cards = _extract_cards_from_parts(parts)
        timestamp = event.get("timestamp", 0)

        if author == "user":
            if not text:
                continue
            if current_exchange:
                history.append(current_exchange)
            current_exchange = {
                "user_message": text,
                "agent_response": "",
                "agent_cards": [],
                "timestamp": timestamp,
            }
        elif current_exchange:
            # An agent turn may be text, cards, or both (e.g. a tool-only turn).
            if not text and not cards:
                continue
            if text:
                if current_exchange["agent_response"]:
                    current_exchange["agent_response"] += "\n" + text
                else:
                    current_exchange["agent_response"] = text
            if cards:
                current_exchange["agent_cards"].extend(cards)

    if current_exchange:
        history.append(current_exchange)

    return {
        "history": history,
        "state": state,
    }


async def get_sessions_with_data(
    pool: asyncpg.Pool,
    agent_id: int,
    user_id: str | None = "user",
) -> list[tuple[str, dict]]:
    """Get all sessions with full session_data for memory extraction."""
    if user_id is not None:
        rows = await pool.fetch(
            """
            SELECT session_id, session_data
            FROM agent_sessions
            WHERE agent_id = $1 AND user_id = $2
            ORDER BY last_update_time DESC
            """,
            agent_id,
            user_id,
        )
    else:
        rows = await pool.fetch(
            """
            SELECT session_id, session_data
            FROM agent_sessions
            WHERE agent_id = $1
            ORDER BY last_update_time DESC
            """,
            agent_id,
        )
    result = []
    for row in rows:
        data = row["session_data"]
        if isinstance(data, str):
            data = json.loads(data)
        result.append((row["session_id"], data))
    return result


async def delete_session(
    pool: asyncpg.Pool,
    agent_id: int,
    session_id: str,
    user_id: str | None = "user",
) -> bool:
    """Delete a session."""
    if user_id is not None:
        result = await pool.execute(
            """
            DELETE FROM agent_sessions
            WHERE agent_id = $1 AND user_id = $2 AND session_id = $3
            """,
            agent_id,
            user_id,
            session_id,
        )
    else:
        result = await pool.execute(
            """
            DELETE FROM agent_sessions
            WHERE agent_id = $1 AND session_id = $2
            """,
            agent_id,
            session_id,
        )
    return "DELETE" in result and "0" not in result.split()[-1]
