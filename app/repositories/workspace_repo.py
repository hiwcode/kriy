from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime
from typing import Any

import asyncpg

from app.core.tokens import count_tokens

logger = logging.getLogger(__name__)


def _hash_invite_token(token: str) -> str:
    """Hash an invite token for storage/lookup (same scheme as user API keys).

    The raw token is only ever shown once, at creation; the DB stores just this
    hash, so a database leak can't be used to accept invites.
    """
    return hashlib.sha256(token.encode()).hexdigest()


async def get_workspace(pool: asyncpg.Pool, workspace_id: int) -> dict[str, Any] | None:
    row = await pool.fetchrow(
        "SELECT id, name, slug, is_personal, created_by, created_at, updated_at FROM workspaces WHERE id = $1",
        workspace_id,
    )
    return dict(row) if row else None


async def get_personal_workspace(pool: asyncpg.Pool, user_id: int) -> dict[str, Any] | None:
    row = await pool.fetchrow(
        "SELECT id, name, slug, is_personal, created_by, created_at, updated_at FROM workspaces WHERE created_by = $1 AND is_personal = TRUE",
        user_id,
    )
    return dict(row) if row else None


async def list_workspaces_for_user(
    pool: asyncpg.Pool,
    user_id: int,
    limit: int = 50,
    offset: int = 0,
) -> list[dict[str, Any]]:
    rows = await pool.fetch(
        """
        SELECT w.id, w.name, w.slug, w.is_personal, w.created_by, w.created_at, w.updated_at,
               wm.role as member_role
        FROM workspaces w
        INNER JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = $1
        ORDER BY w.is_personal DESC, w.name ASC
        LIMIT $2 OFFSET $3
        """,
        user_id,
        limit,
        offset,
    )
    return [dict(r) for r in rows]


async def create_workspace(
    pool: asyncpg.Pool,
    name: str,
    slug: str,
    created_by: int,
    is_personal: bool = False,
) -> dict[str, Any]:
    row = await pool.fetchrow(
        """
        INSERT INTO workspaces (name, slug, is_personal, created_by)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, slug, is_personal, created_by, created_at, updated_at
        """,
        name,
        slug,
        is_personal,
        created_by,
    )
    return dict(row) if row else {}


async def create_personal_workspace(pool: asyncpg.Pool, user_id: int) -> dict[str, Any]:
    slug = f"personal-{user_id}"
    row = await pool.fetchrow(
        """
        INSERT INTO workspaces (name, slug, is_personal, created_by)
        VALUES ('Personal', $1, TRUE, $2)
        RETURNING id, name, slug, is_personal, created_by, created_at, updated_at
        """,
        slug,
        user_id,
    )
    if row:
        await pool.execute(
            "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING",
            row["id"],
            user_id,
        )
        # Seed demo agent + prompts for the brand-new personal workspace
        try:
            await _seed_demo_data(pool, row["id"], user_id)
        except Exception:
            logger.exception("Failed to seed demo data for user %s", user_id)
        return dict(row)
    return {}


# ---------------------------------------------------------------------------
# Demo data seeding for new personal workspaces
# ---------------------------------------------------------------------------

_DEMO_SYSTEM_PROMPT = (
    "You are a friendly and knowledgeable AI assistant. "
    "Be concise, accurate, and helpful in your responses. "
    "When you don't know something, say so honestly. "
    "Use markdown formatting when it improves readability."
)

_DEMO_INSTRUCTION = (
    "Help the user with their questions. Provide clear, well-structured answers. "
    "If the user asks about this workspace, explain that this is their personal "
    "AI workspace where they can create custom agents, manage prompts, and connect tools."
)


async def _seed_demo_data(
    pool: asyncpg.Pool,
    workspace_id: int,
    user_id: int,
) -> None:
    """Create a demo agent with demo prompts for a brand-new personal workspace."""

    # 1. Create a system prompt in the prompt library
    sys_row = await pool.fetchrow(
        """
        INSERT INTO prompt_library (title, prompt, createdby, tokens, prompt_type, workspace_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
        """,
        "Friendly Assistant",
        _DEMO_SYSTEM_PROMPT,
        user_id,
        count_tokens(_DEMO_SYSTEM_PROMPT),
        "system",
        workspace_id,
    )

    # 2. Create an instruction prompt in the prompt library
    instr_row = await pool.fetchrow(
        """
        INSERT INTO prompt_library (title, prompt, createdby, tokens, prompt_type, workspace_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
        """,
        "General Instructions",
        _DEMO_INSTRUCTION,
        user_id,
        count_tokens(_DEMO_INSTRUCTION),
        "instructions",
        workspace_id,
    )

    sys_prompt_id = sys_row["id"] if sys_row else None
    instr_prompt_id = instr_row["id"] if instr_row else None

    # 3. Create demo agent referencing both prompts
    await pool.execute(
        """
        INSERT INTO agents (
            name, label, model, description,
            system_prompt, system_prompt_id,
            instruction, instruction_prompt_id,
            tools, extra_fields, is_orchestrator, sub_agent_ids,
            created_by, workspace_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        """,
        "demo_assistant",
        "Demo Assistant",
        "gemini-2.5-flash",
        "A friendly demo assistant to help you get started with your AI workspace.",
        _DEMO_SYSTEM_PROMPT,
        sys_prompt_id,
        _DEMO_INSTRUCTION,
        instr_prompt_id,
        json.dumps([]),
        json.dumps({}),
        False,
        [],
        user_id,
        workspace_id,
    )


async def get_or_create_personal_workspace(pool: asyncpg.Pool, user_id: int) -> dict[str, Any]:
    existing = await get_personal_workspace(pool, user_id)
    if existing:
        return existing
    return await create_personal_workspace(pool, user_id)


async def user_is_member(pool: asyncpg.Pool, workspace_id: int, user_id: int) -> bool:
    row = await pool.fetchrow(
        "SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
        workspace_id,
        user_id,
    )
    return row is not None


async def user_can_manage_workspace(pool: asyncpg.Pool, workspace_id: int, user_id: int) -> bool:
    row = await pool.fetchrow(
        "SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
        workspace_id,
        user_id,
    )
    return row is not None and row["role"] in ("owner", "admin")


async def get_member_role(pool: asyncpg.Pool, workspace_id: int, user_id: int) -> str | None:
    """Return the user's role in the workspace (owner | admin | member), or None."""
    row = await pool.fetchrow(
        "SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
        workspace_id,
        user_id,
    )
    return row["role"] if row else None


async def list_members(pool: asyncpg.Pool, workspace_id: int) -> list[dict[str, Any]]:
    rows = await pool.fetch(
        """
        SELECT wm.user_id, wm.role, wm.created_at, u.email, u.full_name
        FROM workspace_members wm
        JOIN users u ON u.id = wm.user_id
        WHERE wm.workspace_id = $1
        ORDER BY CASE wm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.email
        """,
        workspace_id,
    )
    return [dict(r) for r in rows]


async def add_member(
    pool: asyncpg.Pool,
    workspace_id: int,
    user_id: int,
    role: str = "member",
) -> None:
    await pool.execute(
        """
        INSERT INTO workspace_members (workspace_id, user_id, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role
        """,
        workspace_id,
        user_id,
        role,
    )


async def remove_member(pool: asyncpg.Pool, workspace_id: int, user_id: int) -> bool:
    r = await pool.execute(
        "DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
        workspace_id,
        user_id,
    )
    return r.split()[-1] != "0"


async def update_member_role(
    pool: asyncpg.Pool,
    workspace_id: int,
    user_id: int,
    role: str,
) -> bool:
    r = await pool.execute(
        "UPDATE workspace_members SET role = $1 WHERE workspace_id = $2 AND user_id = $3",
        role,
        workspace_id,
        user_id,
    )
    return r.split()[-1] != "0"


async def create_invite(
    pool: asyncpg.Pool,
    workspace_id: int,
    email: str,
    role: str,
    invited_by: int,
    token: str,
    expires_at: datetime,
) -> dict[str, Any]:
    row = await pool.fetchrow(
        """
        INSERT INTO workspace_invites (workspace_id, email, role, invited_by, token, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, workspace_id, email, role, invited_by, expires_at, status, created_at
        """,
        workspace_id,
        email.lower().strip(),
        role,
        invited_by,
        _hash_invite_token(token),
        expires_at,
    )
    return dict(row) if row else {}


async def get_invite_by_token(pool: asyncpg.Pool, token: str) -> dict[str, Any] | None:
    row = await pool.fetchrow(
        """
        SELECT i.*, w.name as workspace_name
        FROM workspace_invites i
        JOIN workspaces w ON w.id = i.workspace_id
        WHERE i.token = $1 AND i.status = 'pending' AND i.expires_at > NOW()
        """,
        _hash_invite_token(token),
    )
    return dict(row) if row else None


async def list_invites(pool: asyncpg.Pool, workspace_id: int) -> list[dict[str, Any]]:
    rows = await pool.fetch(
        """
        SELECT id, workspace_id, email, role, invited_by, expires_at, status, created_at
        FROM workspace_invites
        WHERE workspace_id = $1 AND status = 'pending'
        ORDER BY created_at DESC
        """,
        workspace_id,
    )
    return [dict(r) for r in rows]


async def accept_invite(pool: asyncpg.Pool, token: str, user_id: int) -> dict[str, Any] | None:
    invite = await get_invite_by_token(pool, token)
    if not invite:
        return None
    await add_member(pool, invite["workspace_id"], user_id, invite["role"])
    await pool.execute(
        "UPDATE workspace_invites SET status = 'accepted' WHERE id = $1",
        invite["id"],
    )
    return await get_workspace(pool, invite["workspace_id"])


async def update_workspace(
    pool: asyncpg.Pool,
    workspace_id: int,
    *,
    name: str | None = None,
    slug: str | None = None,
) -> dict[str, Any] | None:
    if name is None and slug is None:
        return await get_workspace(pool, workspace_id)
    updates = []
    params: list[Any] = []
    i = 1
    if name is not None:
        updates.append(f"name = ${i}")
        params.append(name)
        i += 1
    if slug is not None:
        updates.append(f"slug = ${i}")
        params.append(slug)
        i += 1
    params.append(workspace_id)
    row = await pool.fetchrow(
        f"""
        UPDATE workspaces SET {', '.join(updates)}, updated_at = NOW()
        WHERE id = ${i}
        RETURNING id, name, slug, is_personal, created_by, created_at, updated_at
        """,
        *params,
    )
    return dict(row) if row else None


async def delete_workspace(pool: asyncpg.Pool, workspace_id: int) -> bool:
    r = await pool.execute("DELETE FROM workspaces WHERE id = $1", workspace_id)
    return r.split()[-1] != "0"


async def transfer_resources(
    pool: asyncpg.Pool,
    source_workspace_id: int,
    target_workspace_id: int,
    resource_type: str,
    resource_ids: list[int] | None = None,
) -> dict[str, int]:
    """
    Transfer resources from one workspace to another.
    
    Args:
        pool: Database connection pool
        source_workspace_id: Source workspace ID
        target_workspace_id: Target workspace ID
        resource_type: Type of resources to transfer (agents, prompts, mcp_connections, database_connections, all)
        resource_ids: Specific resource IDs to transfer. If None, all resources will be transferred.
        
    Returns:
        Dictionary with counts of transferred resources
    """
    counts = {
        "agents": 0,
        "prompts": 0,
        "skills": 0,
        "mcp_connections": 0,
        "database_connections": 0,
        "schedules": 0,
        "workflows": 0,
        "events": 0,
        "sessions": 0,
        "memories": 0,
    }
    
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Transfer agents (and their sessions, traces, fact memory via workspace_id)
            if resource_type in ("agents", "all"):
                if resource_ids:
                    result = await conn.execute(
                        """
                        UPDATE agents
                        SET workspace_id = $1
                        WHERE workspace_id = $2 AND id = ANY($3::int[])
                        """,
                        target_workspace_id,
                        source_workspace_id,
                        resource_ids,
                    )
                    n_agents = int(result.split()[-1])
                    # Move sessions and memories for transferred agents to target workspace
                    if n_agents > 0:
                        sess_result = await conn.execute(
                            """
                            UPDATE agent_sessions
                            SET workspace_id = $1
                            WHERE agent_id = ANY($2::int[]) AND (workspace_id = $3 OR workspace_id IS NULL)
                            """,
                            target_workspace_id,
                            resource_ids,
                            source_workspace_id,
                        )
                        counts["sessions"] = int(sess_result.split()[-1])
                        mem_result = await conn.execute(
                            """
                            UPDATE agent_memories
                            SET workspace_id = $1
                            WHERE agent_id = ANY($2::int[]) AND (workspace_id = $3 OR workspace_id IS NULL)
                            """,
                            target_workspace_id,
                            resource_ids,
                            source_workspace_id,
                        )
                        counts["memories"] = int(mem_result.split()[-1])
                else:
                    # Update sessions/memories first (while agents still have source workspace_id)
                    sess_result = await conn.execute(
                        """
                        UPDATE agent_sessions
                        SET workspace_id = $1
                        WHERE agent_id IN (SELECT id FROM agents WHERE workspace_id = $2)
                          AND (workspace_id = $2 OR workspace_id IS NULL)
                        """,
                        target_workspace_id,
                        source_workspace_id,
                    )
                    counts["sessions"] = int(sess_result.split()[-1])
                    mem_result = await conn.execute(
                        """
                        UPDATE agent_memories
                        SET workspace_id = $1
                        WHERE agent_id IN (SELECT id FROM agents WHERE workspace_id = $2)
                          AND (workspace_id = $2 OR workspace_id IS NULL)
                        """,
                        target_workspace_id,
                        source_workspace_id,
                    )
                    counts["memories"] = int(mem_result.split()[-1])
                    result = await conn.execute(
                        """
                        UPDATE agents
                        SET workspace_id = $1
                        WHERE workspace_id = $2
                        """,
                        target_workspace_id,
                        source_workspace_id,
                    )
                    n_agents = int(result.split()[-1])
                counts["agents"] = n_agents
            
            # Transfer prompts
            if resource_type in ("prompts", "all"):
                if resource_ids:
                    result = await conn.execute(
                        """
                        UPDATE prompt_library
                        SET workspace_id = $1
                        WHERE workspace_id = $2 AND id = ANY($3::int[])
                        """,
                        target_workspace_id,
                        source_workspace_id,
                        resource_ids,
                    )
                else:
                    result = await conn.execute(
                        """
                        UPDATE prompt_library
                        SET workspace_id = $1
                        WHERE workspace_id = $2
                        """,
                        target_workspace_id,
                        source_workspace_id,
                    )
                counts["prompts"] = int(result.split()[-1])

            # Transfer skills
            if resource_type in ("skills", "all"):
                if resource_ids:
                    result = await conn.execute(
                        """
                        UPDATE skills
                        SET workspace_id = $1
                        WHERE workspace_id = $2 AND id = ANY($3::int[])
                        """,
                        target_workspace_id,
                        source_workspace_id,
                        resource_ids,
                    )
                else:
                    result = await conn.execute(
                        """
                        UPDATE skills
                        SET workspace_id = $1
                        WHERE workspace_id = $2
                        """,
                        target_workspace_id,
                        source_workspace_id,
                    )
                counts["skills"] = int(result.split()[-1])

            # Transfer MCP connections
            if resource_type in ("mcp_connections", "all"):
                if resource_ids:
                    result = await conn.execute(
                        """
                        UPDATE mcp_connections
                        SET workspace_id = $1
                        WHERE workspace_id = $2 AND id = ANY($3::int[])
                        """,
                        target_workspace_id,
                        source_workspace_id,
                        resource_ids,
                    )
                else:
                    result = await conn.execute(
                        """
                        UPDATE mcp_connections
                        SET workspace_id = $1
                        WHERE workspace_id = $2
                        """,
                        target_workspace_id,
                        source_workspace_id,
                    )
                counts["mcp_connections"] = int(result.split()[-1])
            
            # Transfer database connections
            if resource_type in ("database_connections", "all"):
                if resource_ids:
                    result = await conn.execute(
                        """
                        UPDATE database_connections
                        SET workspace_id = $1
                        WHERE workspace_id = $2 AND id = ANY($3::int[])
                        """,
                        target_workspace_id,
                        source_workspace_id,
                        resource_ids,
                    )
                else:
                    result = await conn.execute(
                        """
                        UPDATE database_connections
                        SET workspace_id = $1
                        WHERE workspace_id = $2
                        """,
                        target_workspace_id,
                        source_workspace_id,
                    )
                counts["database_connections"] = int(result.split()[-1])

            # Transfer schedules
            if resource_type in ("schedules", "all"):
                if resource_ids:
                    result = await conn.execute(
                        "UPDATE schedules SET workspace_id = $1 "
                        "WHERE workspace_id = $2 AND id = ANY($3::int[])",
                        target_workspace_id, source_workspace_id, resource_ids,
                    )
                else:
                    result = await conn.execute(
                        "UPDATE schedules SET workspace_id = $1 WHERE workspace_id = $2",
                        target_workspace_id, source_workspace_id,
                    )
                counts["schedules"] = int(result.split()[-1])

            # Transfer workflows
            if resource_type in ("workflows", "all"):
                if resource_ids:
                    result = await conn.execute(
                        "UPDATE workflows SET workspace_id = $1 "
                        "WHERE workspace_id = $2 AND id = ANY($3::int[])",
                        target_workspace_id, source_workspace_id, resource_ids,
                    )
                else:
                    result = await conn.execute(
                        "UPDATE workflows SET workspace_id = $1 WHERE workspace_id = $2",
                        target_workspace_id, source_workspace_id,
                    )
                counts["workflows"] = int(result.split()[-1])

            # Transfer event types (the workspace's event registry)
            if resource_type in ("events", "all"):
                if resource_ids:
                    result = await conn.execute(
                        "UPDATE event_types SET workspace_id = $1 "
                        "WHERE workspace_id = $2 AND id = ANY($3::int[])",
                        target_workspace_id, source_workspace_id, resource_ids,
                    )
                else:
                    result = await conn.execute(
                        "UPDATE event_types SET workspace_id = $1 WHERE workspace_id = $2",
                        target_workspace_id, source_workspace_id,
                    )
                counts["events"] = int(result.split()[-1])

    return counts

