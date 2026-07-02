"""Repository for agent memory queries."""

from __future__ import annotations

import time
from typing import Any

import asyncpg


async def list_memories(
    pool: asyncpg.Pool,
    agent_id: int,
    user_id: str | None = "user",
    limit: int = 100,
    offset: int = 0,
    search: str | None = None,
) -> list[dict[str, Any]]:
    """List non-dismissed memories for an agent with pagination and search."""
    params: list[Any] = [agent_id]
    where = "WHERE agent_id = $1 AND (is_dismissed = FALSE OR is_dismissed IS NULL)"
    idx = 2
    if user_id is not None:
        where += f" AND user_id = ${idx}"
        params.append(user_id)
        idx += 1
    if search and search.strip():
        where += f" AND content ILIKE ${idx}"
        params.append(f"%{search.strip()}%")
        idx += 1
    query = f"""
        SELECT id, agent_id, user_id, session_id, content, memory_type,
               confidence, created_at, updated_at
        FROM agent_memories
        {where}
        ORDER BY updated_at DESC
        LIMIT ${idx} OFFSET ${idx + 1}
    """
    params.extend([limit, offset])
    rows = await pool.fetch(query, *params)
    return [
        {
            "id": r["id"],
            "agent_id": r["agent_id"],
            "user_id": r["user_id"],
            "session_id": r["session_id"],
            "content": r["content"],
            "memory_type": r["memory_type"],
            "confidence": float(r["confidence"] or 1.0),
            "created_at": r["created_at"].timestamp() if r["created_at"] else 0,
            "updated_at": r["updated_at"].timestamp() if r["updated_at"] else 0,
        }
        for r in rows
    ]


async def count_memories(
    pool: asyncpg.Pool,
    agent_id: int,
    user_id: str | None = "user",
    search: str | None = None,
) -> int:
    """Count non-dismissed memories matching criteria."""
    params: list[Any] = [agent_id]
    where = "WHERE agent_id = $1 AND (is_dismissed = FALSE OR is_dismissed IS NULL)"
    idx = 2
    if user_id is not None:
        where += f" AND user_id = ${idx}"
        params.append(user_id)
        idx += 1
    if search and search.strip():
        where += f" AND content ILIKE ${idx}"
        params.append(f"%{search.strip()}%")
        idx += 1
    row = await pool.fetchrow(f"SELECT COUNT(*)::int FROM agent_memories {where}", *params)
    return row[0] if row else 0


async def create_memory(
    pool: asyncpg.Pool,
    agent_id: int,
    user_id: str,
    content: str,
    session_id: str | None = None,
    memory_type: str = "fact",
    confidence: float = 1.0,
    workspace_id: int | None = None,
) -> int:
    """Create a memory entry. Returns the new id (0 if duplicate). workspace_id defaults from agent."""
    row = await pool.fetchrow(
        """
        INSERT INTO agent_memories
        (agent_id, user_id, session_id, content, memory_type, confidence, updated_at, workspace_id)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(),
                COALESCE($7, (SELECT workspace_id FROM agents WHERE id = $1)))
        ON CONFLICT (agent_id, user_id, LOWER(TRIM(content)), memory_type) DO NOTHING
        RETURNING id
        """,
        agent_id,
        user_id,
        session_id,
        content,
        memory_type,
        confidence,
        workspace_id,
    )
    return row["id"] if row else 0


async def delete_memory(
    pool: asyncpg.Pool,
    memory_id: int,
    agent_id: int,
    user_id: str | None = "user",
) -> bool:
    """Dismiss a memory (soft delete). It won't come back on re-sync."""
    if user_id is not None:
        result = await pool.execute(
            """
            UPDATE agent_memories SET is_dismissed = TRUE, updated_at = NOW()
            WHERE id = $1 AND agent_id = $2 AND user_id = $3
            """,
            memory_id,
            agent_id,
            user_id,
        )
    else:
        result = await pool.execute(
            """
            UPDATE agent_memories SET is_dismissed = TRUE, updated_at = NOW()
            WHERE id = $1 AND agent_id = $2
            """,
            memory_id,
            agent_id,
        )
    return "UPDATE" in result and "0" not in result.split()[-1]


async def search_memories(
    pool: asyncpg.Pool,
    agent_id: int,
    user_id: str | None = "user",
    query: str = "",
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Search memories by keyword (ILIKE) for an agent.
    When user_id is None, searches all users' memories (workspace mode).
    Falls back to listing recent memories when keyword search returns no results.
    """
    if not query or not query.strip():
        return await list_memories(pool, agent_id, user_id, limit=limit)
    pattern = f"%{query.strip()}%"
    if user_id is not None:
        rows = await pool.fetch(
            """
            SELECT id, agent_id, user_id, session_id, content, memory_type,
                   confidence, created_at, updated_at
            FROM agent_memories
            WHERE agent_id = $1 AND user_id = $2 AND content ILIKE $3
                  AND (is_dismissed = FALSE OR is_dismissed IS NULL)
            ORDER BY updated_at DESC
            LIMIT $4
            """,
            agent_id,
            user_id,
            pattern,
            limit,
        )
    else:
        rows = await pool.fetch(
            """
            SELECT id, agent_id, user_id, session_id, content, memory_type,
                   confidence, created_at, updated_at
            FROM agent_memories
            WHERE agent_id = $1 AND content ILIKE $2
                  AND (is_dismissed = FALSE OR is_dismissed IS NULL)
            ORDER BY updated_at DESC
            LIMIT $3
            """,
            agent_id,
            pattern,
            limit,
        )
    result = [
        {
            "id": r["id"],
            "agent_id": r["agent_id"],
            "user_id": r["user_id"],
            "session_id": r["session_id"],
            "content": r["content"],
            "memory_type": r["memory_type"],
            "confidence": float(r["confidence"] or 1.0),
            "created_at": r["created_at"].timestamp() if r["created_at"] else 0,
            "updated_at": r["updated_at"].timestamp() if r["updated_at"] else 0,
        }
        for r in rows
    ]
    # Fallback: when keyword search returns nothing, return recent memories
    # so the agent can answer broad queries like "what do you know about me?"
    if not result:
        return await list_memories(pool, agent_id, user_id, limit=limit)
    return result


async def get_extracted_session_ids(
    pool: asyncpg.Pool,
    agent_id: int,
    user_id: str | None = "user",
) -> set[str]:
    """Return session_ids that already have memories extracted (active or dismissed)."""
    if user_id is not None:
        rows = await pool.fetch(
            "SELECT DISTINCT session_id FROM agent_memories WHERE agent_id = $1 AND user_id = $2 AND session_id IS NOT NULL",
            agent_id, user_id,
        )
    else:
        rows = await pool.fetch(
            "SELECT DISTINCT session_id FROM agent_memories WHERE agent_id = $1 AND session_id IS NOT NULL",
            agent_id,
        )
    return {r["session_id"] for r in rows}


async def get_existing_memory_keys(
    pool: asyncpg.Pool,
    agent_id: int,
    user_id: str | None = "user",
) -> set[tuple[str, str]]:
    """Return set of (lower(content), memory_type) for active (non-dismissed) memories."""
    if user_id is not None:
        rows = await pool.fetch(
            "SELECT LOWER(TRIM(content)) AS c, memory_type FROM agent_memories WHERE agent_id = $1 AND user_id = $2 AND (is_dismissed = FALSE OR is_dismissed IS NULL)",
            agent_id, user_id,
        )
    else:
        rows = await pool.fetch(
            "SELECT LOWER(TRIM(content)) AS c, memory_type FROM agent_memories WHERE agent_id = $1 AND (is_dismissed = FALSE OR is_dismissed IS NULL)",
            agent_id,
        )
    return {(r["c"], r["memory_type"]) for r in rows}


async def get_dismissed_memory_keys(
    pool: asyncpg.Pool,
    agent_id: int,
    user_id: str | None = "user",
) -> set[tuple[str, str]]:
    """Return set of (lower(content), memory_type) for dismissed memories (blocklist)."""
    if user_id is not None:
        rows = await pool.fetch(
            "SELECT LOWER(TRIM(content)) AS c, memory_type FROM agent_memories WHERE agent_id = $1 AND user_id = $2 AND is_dismissed = TRUE",
            agent_id, user_id,
        )
    else:
        rows = await pool.fetch(
            "SELECT LOWER(TRIM(content)) AS c, memory_type FROM agent_memories WHERE agent_id = $1 AND is_dismissed = TRUE",
            agent_id,
        )
    return {(r["c"], r["memory_type"]) for r in rows}


async def deduplicate_memories(
    pool: asyncpg.Pool,
    agent_id: int,
    user_id: str | None = None,
) -> int:
    """Remove duplicate memories for an agent, keeping the oldest row per unique content."""
    if user_id is not None:
        result = await pool.execute(
            """
            DELETE FROM agent_memories
            WHERE agent_id = $1 AND user_id = $2
              AND id NOT IN (
                  SELECT MIN(id)
                  FROM agent_memories
                  WHERE agent_id = $1 AND user_id = $2
                  GROUP BY agent_id, user_id, LOWER(TRIM(content)), memory_type
              )
            """,
            agent_id, user_id,
        )
    else:
        result = await pool.execute(
            """
            DELETE FROM agent_memories
            WHERE agent_id = $1
              AND id NOT IN (
                  SELECT MIN(id)
                  FROM agent_memories
                  WHERE agent_id = $1
                  GROUP BY agent_id, user_id, LOWER(TRIM(content)), memory_type
              )
            """,
            agent_id,
        )
    try:
        return int(result.split()[-1]) if result else 0
    except ValueError:
        return 0


async def delete_active_memories_for_agent(
    pool: asyncpg.Pool,
    agent_id: int,
    user_id: str | None = "user",
) -> int:
    """Delete only active (non-dismissed) memories. Keeps dismissed as blocklist."""
    if user_id is not None:
        result = await pool.execute(
            """
            DELETE FROM agent_memories
            WHERE agent_id = $1 AND user_id = $2 AND (is_dismissed = FALSE OR is_dismissed IS NULL)
            """,
            agent_id,
            user_id,
        )
    else:
        result = await pool.execute(
            """
            DELETE FROM agent_memories
            WHERE agent_id = $1 AND (is_dismissed = FALSE OR is_dismissed IS NULL)
            """,
            agent_id,
        )
    try:
        return int(result.split()[-1]) if result else 0
    except ValueError:
        return 0


async def delete_memories_for_agent(
    pool: asyncpg.Pool,
    agent_id: int,
    user_id: str | None = "user",
) -> int:
    """Delete all memories for an agent (and optionally a specific user)."""
    if user_id is not None:
        result = await pool.execute(
            """
            DELETE FROM agent_memories
            WHERE agent_id = $1 AND user_id = $2
            """,
            agent_id,
            user_id,
        )
    else:
        result = await pool.execute(
            """
            DELETE FROM agent_memories
            WHERE agent_id = $1
            """,
            agent_id,
        )
    # Parse "DELETE N" to get count
    try:
        return int(result.split()[-1]) if result else 0
    except ValueError:
        return 0
