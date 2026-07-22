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
        "gemini-3.1-flash-lite",
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


async def list_invites_for_email(pool: asyncpg.Pool, email: str) -> list[dict[str, Any]]:
    """Pending, unexpired invitations addressed to this email (newest first)."""
    rows = await pool.fetch(
        """
        SELECT i.id, i.workspace_id, i.email, i.role, i.invited_by, i.expires_at,
               i.status, i.created_at, w.name AS workspace_name
        FROM workspace_invites i
        JOIN workspaces w ON w.id = i.workspace_id
        WHERE lower(i.email) = lower($1)
          AND i.status = 'pending' AND i.expires_at > NOW()
        ORDER BY i.created_at DESC
        """,
        email,
    )
    return [dict(r) for r in rows]


async def get_invite(pool: asyncpg.Pool, invite_id: int) -> dict[str, Any] | None:
    row = await pool.fetchrow(
        "SELECT id, workspace_id, email, role, invited_by, expires_at, status, created_at "
        "FROM workspace_invites WHERE id = $1",
        invite_id,
    )
    return dict(row) if row else None


async def accept_invite_by_id(
    pool: asyncpg.Pool, invite_id: int, user_id: int
) -> dict[str, Any] | None:
    """Accept a pending invite the caller owns (email checked by the endpoint)."""
    invite = await get_invite(pool, invite_id)
    if not invite or invite["status"] != "pending":
        return None
    await add_member(pool, invite["workspace_id"], user_id, invite["role"])
    await pool.execute(
        "UPDATE workspace_invites SET status = 'accepted' WHERE id = $1",
        invite_id,
    )
    return await get_workspace(pool, invite["workspace_id"])


async def decline_invite(pool: asyncpg.Pool, invite_id: int) -> bool:
    r = await pool.execute(
        "UPDATE workspace_invites SET status = 'declined' WHERE id = $1 AND status = 'pending'",
        invite_id,
    )
    return r.split()[-1] != "0"


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


# Primary, user-facing resource types (counted toward the transfer total).
TRANSFERABLE_RESOURCE_TYPES = (
    "agents",
    "prompts",
    "skills",
    "mcp_connections",
    "database_connections",
    "schedules",
    "workflows",
    "events",
    "webhooks",
    "gates",
    "documents",
)


async def _move_scoped(
    conn: asyncpg.Connection,
    table: str,
    target_workspace_id: int,
    source_workspace_id: int,
    resource_ids: list[int] | None,
) -> list[int]:
    """Move rows of ``table`` from source→target workspace, returning moved ids.

    Always scoped to the source workspace so a caller can never move another
    workspace's rows by passing foreign ids.
    """
    if resource_ids:
        rows = await conn.fetch(
            f"UPDATE {table} SET workspace_id = $1 "
            f"WHERE workspace_id = $2 AND id = ANY($3::int[]) RETURNING id",
            target_workspace_id, source_workspace_id, resource_ids,
        )
    else:
        rows = await conn.fetch(
            f"UPDATE {table} SET workspace_id = $1 WHERE workspace_id = $2 RETURNING id",
            target_workspace_id, source_workspace_id,
        )
    return [r["id"] for r in rows]


async def _move_by_agent(
    conn: asyncpg.Connection, table: str, target_workspace_id: int, agent_ids: list[int]
) -> int:
    """Re-scope a dependent table (keyed by agent_id) to the target workspace."""
    if not agent_ids:
        return 0
    res = await conn.execute(
        f"UPDATE {table} SET workspace_id = $1 WHERE agent_id = ANY($2::int[])",
        target_workspace_id, agent_ids,
    )
    return int(res.split()[-1])


async def transfer_resources(
    pool: asyncpg.Pool,
    source_workspace_id: int,
    target_workspace_id: int,
    resource_type: str,
    resource_ids: list[int] | None = None,
) -> dict[str, int]:
    """Transfer resources from one workspace to another.

    Each primary resource is re-scoped by updating its ``workspace_id``. Dependent
    rows that carry their own ``workspace_id`` are moved alongside their parent so
    workspace-scoped views stay consistent:

    - agents → agent_sessions, agent_memories, documents (by agent_id)
    - skills → skill_files, skill_folders (by skill_id)
    - gates  → gate_decisions (decision history)

    Everything runs in a single transaction, so a partial failure rolls back.

    Args:
        resource_type: one of TRANSFERABLE_RESOURCE_TYPES, or "all".
        resource_ids: restrict to these ids (only meaningful for a single type;
            ignored semantics for "all" where every resource is moved).

    Returns:
        Counts keyed by resource type, including dependents (sessions, memories,
        documents, gate_decisions, skill_files, skill_folders).
    """
    counts = {k: 0 for k in TRANSFERABLE_RESOURCE_TYPES}
    counts.update({"sessions": 0, "memories": 0, "gate_decisions": 0,
                   "skill_files": 0, "skill_folders": 0})

    def want(kind: str) -> bool:
        return resource_type in (kind, "all")

    async with pool.acquire() as conn:
        async with conn.transaction():
            # Agents (+ sessions, memories, documents keyed by agent_id)
            if want("agents"):
                agent_ids = await _move_scoped(
                    conn, "agents", target_workspace_id, source_workspace_id, resource_ids
                )
                counts["agents"] = len(agent_ids)
                if agent_ids:
                    counts["sessions"] = await _move_by_agent(
                        conn, "agent_sessions", target_workspace_id, agent_ids)
                    counts["memories"] = await _move_by_agent(
                        conn, "agent_memories", target_workspace_id, agent_ids)
                    counts["documents"] += await _move_by_agent(
                        conn, "documents", target_workspace_id, agent_ids)

            # Prompts
            if want("prompts"):
                counts["prompts"] = len(await _move_scoped(
                    conn, "prompt_library", target_workspace_id, source_workspace_id, resource_ids))

            # Skills (+ skill_files, skill_folders keyed by skill_id)
            if want("skills"):
                skill_ids = await _move_scoped(
                    conn, "skills", target_workspace_id, source_workspace_id, resource_ids)
                counts["skills"] = len(skill_ids)
                if skill_ids:
                    fr = await conn.execute(
                        "UPDATE skill_files SET workspace_id = $1 WHERE skill_id = ANY($2::int[])",
                        target_workspace_id, skill_ids)
                    counts["skill_files"] = int(fr.split()[-1])
                    dr = await conn.execute(
                        "UPDATE skill_folders SET workspace_id = $1 WHERE skill_id = ANY($2::int[])",
                        target_workspace_id, skill_ids)
                    counts["skill_folders"] = int(dr.split()[-1])

            # MCP connections
            if want("mcp_connections"):
                counts["mcp_connections"] = len(await _move_scoped(
                    conn, "mcp_connections", target_workspace_id, source_workspace_id, resource_ids))

            # Database connections
            if want("database_connections"):
                counts["database_connections"] = len(await _move_scoped(
                    conn, "database_connections", target_workspace_id, source_workspace_id, resource_ids))

            # Schedules
            if want("schedules"):
                counts["schedules"] = len(await _move_scoped(
                    conn, "schedules", target_workspace_id, source_workspace_id, resource_ids))

            # Workflows
            if want("workflows"):
                counts["workflows"] = len(await _move_scoped(
                    conn, "workflows", target_workspace_id, source_workspace_id, resource_ids))

            # Event types (the workspace's event registry)
            if want("events"):
                counts["events"] = len(await _move_scoped(
                    conn, "event_types", target_workspace_id, source_workspace_id, resource_ids))

            # Webhook subscriptions (deliveries follow via subscription_id)
            if want("webhooks"):
                counts["webhooks"] = len(await _move_scoped(
                    conn, "webhook_subscriptions", target_workspace_id, source_workspace_id, resource_ids))

            # Decision gates (+ gate_decisions history)
            if want("gates"):
                gate_ids = await _move_scoped(
                    conn, "decision_gates", target_workspace_id, source_workspace_id, resource_ids)
                counts["gates"] = len(gate_ids)
                if resource_ids:
                    if gate_ids:
                        gd = await conn.execute(
                            "UPDATE gate_decisions SET workspace_id = $1 "
                            "WHERE matched_gate_id = ANY($2::int[])",
                            target_workspace_id, gate_ids)
                        counts["gate_decisions"] = int(gd.split()[-1])
                else:
                    # Move the whole workspace's decision history (incl. default
                    # allow/deny rows with no matched_gate_id).
                    gd = await conn.execute(
                        "UPDATE gate_decisions SET workspace_id = $1 WHERE workspace_id = $2",
                        target_workspace_id, source_workspace_id)
                    counts["gate_decisions"] = int(gd.split()[-1])

            # Standalone documents (agent-attached docs already moved above; in
            # "all" this catches the rest, which now excludes the moved ones).
            if want("documents"):
                counts["documents"] += len(await _move_scoped(
                    conn, "documents", target_workspace_id, source_workspace_id, resource_ids))

    return counts

