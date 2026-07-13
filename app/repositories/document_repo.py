"""Repository for document metadata (files stored in object storage)."""

from __future__ import annotations

from typing import Any

import asyncpg

_COLS = "id, name, mime_type, size_bytes, bucket_key, url, agent_id, session_id, user_id, workspace_id, created_at"


def is_visible(doc: dict[str, Any], agent_id: int | None, session_id: str | None) -> bool:
    """Resource-level scope check for a single document.

    A document is visible to an agent when it belongs to that agent AND is either:
      - agent-level (session_id IS NULL) — a shared / knowledge-base doc, or
      - owned by the current session (doc.session_id == session_id).

    Session uploads never leak across sessions: when running without a session
    (scheduled / A2A runs), only agent-level docs are visible.
    """
    if agent_id is None or doc.get("agent_id") != agent_id:
        return False
    doc_session = doc.get("session_id")
    if doc_session is None:
        return True
    return doc_session == session_id


async def create(
    pool: asyncpg.Pool,
    *,
    name: str,
    mime_type: str,
    size_bytes: int,
    bucket_key: str | None = None,
    url: str | None = None,
    agent_id: int | None = None,
    session_id: str | None = None,
    user_id: int | None,
    workspace_id: int | None,
) -> dict[str, Any]:
    row = await pool.fetchrow(
        f"""
        INSERT INTO documents (name, mime_type, size_bytes, bucket_key, url, agent_id, session_id, user_id, workspace_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING {_COLS};
        """,
        name, mime_type, size_bytes, bucket_key, url, agent_id, session_id, user_id, workspace_id,
    )
    return dict(row)


async def get(pool: asyncpg.Pool, doc_id: int) -> dict[str, Any] | None:
    row = await pool.fetchrow(f"SELECT {_COLS} FROM documents WHERE id = $1;", doc_id)
    return dict(row) if row else None


async def list_for_session(
    pool: asyncpg.Pool, agent_id: int, session_id: str | None, *, limit: int = 50
) -> list[dict[str, Any]]:
    """List docs an agent may see in a session: this session's uploads plus
    agent-level (session_id IS NULL) shared docs.

    When session_id is None (scheduled / A2A runs), the `= $2` clause matches
    nothing, so only agent-level docs are returned — never another session's.
    """
    rows = await pool.fetch(
        f"""
        SELECT {_COLS} FROM documents
        WHERE agent_id = $1 AND (session_id = $2 OR session_id IS NULL)
        ORDER BY created_at DESC
        LIMIT $3;
        """,
        agent_id, session_id, limit,
    )
    return [dict(r) for r in rows]


async def list_for_agent(
    pool: asyncpg.Pool, agent_id: int, *, limit: int = 50, offset: int = 0
) -> list[dict[str, Any]]:
    rows = await pool.fetch(
        f"""
        SELECT {_COLS} FROM documents
        WHERE agent_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3;
        """,
        agent_id, limit, offset,
    )
    return [dict(r) for r in rows]


async def count_for_agent(pool: asyncpg.Pool, agent_id: int) -> int:
    val = await pool.fetchval(
        "SELECT COUNT(*) FROM documents WHERE agent_id = $1;",
        agent_id,
    )
    return int(val or 0)


async def list_for_workspace(
    pool: asyncpg.Pool, workspace_id: int | None, *, limit: int = 50, offset: int = 0
) -> list[dict[str, Any]]:
    rows = await pool.fetch(
        f"""
        SELECT {_COLS} FROM documents
        WHERE workspace_id IS NOT DISTINCT FROM $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3;
        """,
        workspace_id, limit, offset,
    )
    return [dict(r) for r in rows]


async def count_for_workspace(pool: asyncpg.Pool, workspace_id: int | None) -> int:
    val = await pool.fetchval(
        "SELECT COUNT(*) FROM documents WHERE workspace_id IS NOT DISTINCT FROM $1;",
        workspace_id,
    )
    return int(val or 0)


async def delete(pool: asyncpg.Pool, doc_id: int) -> bool:
    res = await pool.execute("DELETE FROM documents WHERE id = $1;", doc_id)
    return res.endswith("1")
