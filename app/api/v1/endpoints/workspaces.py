from __future__ import annotations

import secrets
from datetime import datetime, timedelta

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Header, status

from app.core.security import AuthContext, api_key_auth, get_auth_context, require_google_auth
from app.deps import get_db, get_current_workspace
from app.repositories import user_repo, workspace_repo
from app.schemas.response import ApiResponse
from app.schemas.workspace import (
    WorkspaceCreate,
    WorkspaceUpdate,
    WorkspaceInviteCreate,
    WorkspaceInviteAccept,
    WorkspaceMemberRoleUpdate,
    WorkspaceTransferRequest,
)

router = APIRouter(
    prefix="/workspaces",
    tags=["workspaces"],
    dependencies=[Depends(api_key_auth)],
)


def _serialize_workspace(ws: dict) -> dict:
    return {
        "id": ws["id"],
        "name": ws["name"],
        "slug": ws["slug"],
        "is_personal": ws["is_personal"],
        "created_by": ws.get("created_by"),
        # The caller's role in this workspace (owner | admin | member), when known.
        "role": ws.get("member_role") or ws.get("role"),
        "created_at": ws["created_at"].isoformat() if hasattr(ws["created_at"], "isoformat") else str(ws["created_at"]),
        "updated_at": ws["updated_at"].isoformat() if hasattr(ws["updated_at"], "isoformat") else str(ws["updated_at"]),
    }


def _serialize_member(m: dict) -> dict:
    return {
        "user_id": m["user_id"],
        "email": m["email"],
        "full_name": m.get("full_name"),
        "role": m["role"],
        "created_at": m["created_at"].isoformat() if hasattr(m["created_at"], "isoformat") else str(m["created_at"]),
    }


def _serialize_invite(i: dict) -> dict:
    return {
        "id": i["id"],
        "workspace_id": i["workspace_id"],
        "email": i["email"],
        "role": i["role"],
        "invited_by": i["invited_by"],
        "expires_at": i["expires_at"].isoformat() if hasattr(i["expires_at"], "isoformat") else str(i["expires_at"]),
        "status": i["status"],
        "created_at": i["created_at"].isoformat() if hasattr(i["created_at"], "isoformat") else str(i["created_at"]),
    }


@router.get("/", response_model=ApiResponse)
async def list_workspaces(
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """List workspaces the user is a member of."""
    items = await workspace_repo.list_workspaces_for_user(pool, auth.user_id)
    return {
        "success": True,
        "message": "Workspaces",
        "data": [_serialize_workspace({**w, "created_at": w.get("created_at"), "updated_at": w.get("updated_at")}) for w in items],
        "pagination": None,
    }


@router.get("/me", response_model=ApiResponse)
async def get_current(
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    x_workspace_id: int | None = Header(None, alias="X-Workspace-Id"),
) -> dict:
    """Get the current workspace (from header or personal)."""
    ws = await get_current_workspace(pool, auth, x_workspace_id)
    if not ws:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    role = await workspace_repo.get_member_role(pool, ws["id"], auth.user_id)
    return {
        "success": True,
        "message": "Current workspace",
        "data": _serialize_workspace({**ws, "member_role": role}),
        "pagination": None,
    }


@router.post("/", response_model=ApiResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    data: WorkspaceCreate,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Create a new shared workspace."""
    slug = data.slug or data.name.lower().replace(" ", "-").replace("_", "-")[:50]
    slug = "".join(c for c in slug if c.isalnum() or c == "-")
    if not slug:
        slug = f"workspace-{auth.user_id}"
    slug = f"{slug}-{auth.user_id}"
    ws = await workspace_repo.create_workspace(
        pool, data.name, slug, auth.user_id, is_personal=False
    )
    await workspace_repo.add_member(pool, ws["id"], auth.user_id, "owner")
    return {
        "success": True,
        "message": "Workspace created",
        "data": _serialize_workspace({**ws, "member_role": "owner"}),
        "pagination": None,
    }


@router.get("/{workspace_id}", response_model=ApiResponse)
async def get_workspace(
    workspace_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Get workspace by ID."""
    if not await workspace_repo.user_is_member(pool, workspace_id, auth.user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    ws = await workspace_repo.get_workspace(pool, workspace_id)
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return {
        "success": True,
        "message": "Workspace",
        "data": _serialize_workspace(ws),
        "pagination": None,
    }


@router.patch("/{workspace_id}", response_model=ApiResponse)
async def update_workspace(
    workspace_id: int,
    data: WorkspaceUpdate,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Update workspace (name, slug). Admins and owners only."""
    if not await workspace_repo.user_can_manage_workspace(pool, workspace_id, auth.user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to update workspace")
    ws = await workspace_repo.get_workspace(pool, workspace_id)
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    kwargs = {}
    if data.name is not None:
        kwargs["name"] = data.name
    if data.slug is not None:
        kwargs["slug"] = data.slug
    updated = await workspace_repo.update_workspace(pool, workspace_id, **kwargs)
    return {
        "success": True,
        "message": "Workspace updated",
        "data": _serialize_workspace(updated) if updated else _serialize_workspace(ws),
        "pagination": None,
    }


@router.delete("/{workspace_id}", response_model=ApiResponse)
async def delete_workspace(
    workspace_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Delete workspace. Owner only. Cannot delete personal workspace."""
    ws = await workspace_repo.get_workspace(pool, workspace_id)
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    if ws.get("is_personal"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete personal workspace")
    members = await workspace_repo.list_members(pool, workspace_id)
    owner = next((m for m in members if m["role"] == "owner"), None)
    if not owner or owner["user_id"] != auth.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner can delete workspace")
    await workspace_repo.delete_workspace(pool, workspace_id)
    return {
        "success": True,
        "message": "Workspace deleted",
        "data": None,
        "pagination": None,
    }


@router.get("/{workspace_id}/members", response_model=ApiResponse)
async def list_members(
    workspace_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """List workspace members."""
    if not await workspace_repo.user_is_member(pool, workspace_id, auth.user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    members = await workspace_repo.list_members(pool, workspace_id)
    return {
        "success": True,
        "message": "Members",
        "data": [_serialize_member(m) for m in members],
        "pagination": None,
    }


@router.delete("/{workspace_id}/members/{user_id}")
async def remove_member(
    workspace_id: int,
    user_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Remove a member. Admins/owners can remove others; members can remove themselves."""
    if not await workspace_repo.user_is_member(pool, workspace_id, auth.user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    if user_id != auth.user_id:
        if not await workspace_repo.user_can_manage_workspace(pool, workspace_id, auth.user_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to remove members")
        # The owner can't be removed by an admin — that would orphan the workspace.
        if await workspace_repo.get_member_role(pool, workspace_id, user_id) == "owner":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot remove the workspace owner")
    await workspace_repo.remove_member(pool, workspace_id, user_id)
    return {"success": True, "message": "Member removed", "data": None, "pagination": None}


@router.patch("/{workspace_id}/members/{user_id}/role", response_model=ApiResponse)
async def change_member_role(
    workspace_id: int,
    user_id: int,
    data: WorkspaceMemberRoleUpdate,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Change a member's role. Owner only; can set 'admin' or 'member'."""
    if await workspace_repo.get_member_role(pool, workspace_id, auth.user_id) != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the workspace owner can change roles",
        )
    target_role = await workspace_repo.get_member_role(pool, workspace_id, user_id)
    if target_role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if target_role == "owner":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change the owner's role",
        )
    await workspace_repo.update_member_role(pool, workspace_id, user_id, data.role)
    return {
        "success": True,
        "message": "Role updated",
        "data": {"user_id": user_id, "role": data.role},
        "pagination": None,
    }


@router.post("/{workspace_id}/invite", response_model=ApiResponse, status_code=status.HTTP_201_CREATED)
async def create_invite(
    workspace_id: int,
    data: WorkspaceInviteCreate,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Create an invite. Admins and owners only."""
    if not await workspace_repo.user_can_manage_workspace(pool, workspace_id, auth.user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to invite")
    user = await user_repo.get_or_create_user_by_email(pool, data.email.lower().strip())
    if await workspace_repo.user_is_member(pool, workspace_id, user["id"]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User already a member")
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(days=7)
    invite = await workspace_repo.create_invite(
        pool, workspace_id, data.email, data.role, auth.user_id, token, expires_at
    )
    invite_url = f"/invite/{token}"

    # Notify the invitee in-app. Their user row exists (created above) whether or
    # not they've signed up yet, so the notification waits in their inbox until
    # they first sign in.
    try:
        from app.services import notification_service

        source_ws = await workspace_repo.get_workspace(pool, workspace_id)
        ws_name = source_ws["name"] if source_ws else "a workspace"
        await notification_service.notify(
            pool,
            user_id=user["id"],
            title="Workspace invitation",
            body=f"You've been invited to join {ws_name} as {data.role}.",
            level="info",
            source="workspace",
            link="/workspace/settings",
        )
    except Exception:  # noqa: BLE001 — notification is best-effort
        pass

    return {
        "success": True,
        "message": "Invite created",
        "data": {
            **_serialize_invite(invite),
            "invite_url": invite_url,
            "token": token,
        },
        "pagination": None,
    }


@router.get("/{workspace_id}/invites", response_model=ApiResponse)
async def list_invites(
    workspace_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """List pending invites. Admins and owners only."""
    if not await workspace_repo.user_can_manage_workspace(pool, workspace_id, auth.user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    invites = await workspace_repo.list_invites(pool, workspace_id)
    return {
        "success": True,
        "message": "Invites",
        "data": [_serialize_invite(i) for i in invites],
        "pagination": None,
    }


@router.post("/invite/accept", response_model=ApiResponse)
async def accept_invite(
    data: WorkspaceInviteAccept,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Accept an invite by token."""
    ws = await workspace_repo.accept_invite(pool, data.token, auth.user_id)
    if not ws:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired invite")
    return {
        "success": True,
        "message": "Invite accepted",
        "data": _serialize_workspace(ws),
        "pagination": None,
    }


@router.get("/invite/{token}", response_model=ApiResponse)
async def get_invite_info(
    token: str,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
) -> dict:
    """Get invite info (workspace name, etc.) for display before accepting. No auth required for public invite page."""
    invite = await workspace_repo.get_invite_by_token(pool, token)
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid or expired invite")
    return {
        "success": True,
        "message": "Invite",
        "data": {
            "workspace_name": invite.get("workspace_name"),
            "email": invite.get("email"),
            "role": invite.get("role"),
        },
        "pagination": None,
    }


def _serialize_invitation(i: dict) -> dict:
    return {
        "id": i["id"],
        "workspace_id": i["workspace_id"],
        "workspace_name": i.get("workspace_name"),
        "role": i["role"],
        "expires_at": i["expires_at"].isoformat() if hasattr(i["expires_at"], "isoformat") else str(i["expires_at"]),
    }


@router.get("/invitations/mine", response_model=ApiResponse)
async def my_invitations(
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Pending workspace invitations addressed to the current user's email."""
    me = await user_repo.get_user(pool, auth.user_id)
    email = me.get("email") if me else None
    invites = await workspace_repo.list_invites_for_email(pool, email) if email else []
    return {
        "success": True,
        "message": "Invitations",
        "data": [_serialize_invitation(i) for i in invites],
        "pagination": None,
    }


async def _require_own_invite(pool, invite_id: int, user_id: int) -> dict:
    """Load an invite and ensure it's addressed to this user's email."""
    invite = await workspace_repo.get_invite(pool, invite_id)
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    me = await user_repo.get_user(pool, user_id)
    if not me or (me.get("email") or "").lower() != (invite["email"] or "").lower():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This invitation isn't yours")
    return invite


@router.post("/invitations/{invite_id}/accept", response_model=ApiResponse)
async def accept_invitation(
    invite_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Accept an invitation addressed to you (from the in-app invitations list)."""
    invite = await _require_own_invite(pool, invite_id, auth.user_id)
    ws = await workspace_repo.accept_invite_by_id(pool, invite_id, auth.user_id)
    if not ws:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation is no longer valid")

    # Let the person who sent the invite know it was accepted.
    try:
        from app.services import notification_service

        who = (invite.get("email") or "Someone")
        await notification_service.notify(
            pool,
            user_id=invite["invited_by"],
            title="Invitation accepted",
            body=f"{who} joined {ws['name']}.",
            level="success",
            source="workspace",
            link="/workspace/settings",
        )
    except Exception:  # noqa: BLE001 — notification is best-effort
        pass

    return {
        "success": True,
        "message": "Invitation accepted",
        "data": _serialize_workspace(ws),
        "pagination": None,
    }


@router.post("/invitations/{invite_id}/decline", response_model=ApiResponse)
async def decline_invitation(
    invite_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Decline an invitation addressed to you."""
    await _require_own_invite(pool, invite_id, auth.user_id)
    await workspace_repo.decline_invite(pool, invite_id)
    return {"success": True, "message": "Invitation declined", "data": None, "pagination": None}


@router.post("/transfer", response_model=ApiResponse)
async def transfer_workspace_resources(
    data: WorkspaceTransferRequest,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """
    Transfer resources from one workspace to another.

    The caller must be the OWNER of the source workspace (transfer can move other
    members' credentialed resources) and a MEMBER of the target workspace.

    Supported resource types: agents, prompts, skills, mcp_connections,
    database_connections, schedules, workflows, events, webhooks, gates,
    documents, or "all". Dependent rows (an agent's sessions/memories/documents,
    a skill's files/folders, a gate's decision history) move with their parent.

    If resource_ids is provided, only those specific resources of the given type
    are transferred; otherwise all resources of that type are moved.
    """
    # Verify user is a member of both workspaces
    source_ws = await workspace_repo.get_workspace(pool, data.source_workspace_id)
    if not source_ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source workspace not found")
    
    target_ws = await workspace_repo.get_workspace(pool, data.target_workspace_id)
    if not target_ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target workspace not found")
    
    # Transfer moves ALL resources in the source workspace (including other
    # members' MCP/DB connections with stored credentials), so require the
    # caller to be the OWNER of the source — not merely a member.
    if await workspace_repo.get_member_role(pool, data.source_workspace_id, auth.user_id) != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be the owner of the source workspace to transfer its resources"
        )

    if not await workspace_repo.user_is_member(pool, data.target_workspace_id, auth.user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be a member of the target workspace"
        )
    
    # Perform the transfer. A name collision with an existing resource in the
    # target (agents/skills/event_types are unique per workspace by name) aborts
    # the whole transaction — surface it as a clean 409 rather than a 500.
    try:
        counts = await workspace_repo.transfer_resources(
            pool,
            data.source_workspace_id,
            data.target_workspace_id,
            data.resource_type,
            data.resource_ids,
        )
    except asyncpg.exceptions.UniqueViolationError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A resource with the same name already exists in the target workspace. "
                   "Rename or remove the conflicting resource, then try again.",
        )

    # Total counts primary resources only — dependents (sessions, memories,
    # documents-via-agent, gate_decisions, skill files/folders) ride along and
    # would otherwise inflate the number.
    total = sum(counts[k] for k in workspace_repo.TRANSFERABLE_RESOURCE_TYPES)

    return {
        "success": True,
        "message": f"Successfully transferred {total} resource(s)",
        "data": {
            "transferred_agents": counts["agents"],
            "transferred_prompts": counts["prompts"],
            "transferred_skills": counts["skills"],
            "transferred_mcp_connections": counts["mcp_connections"],
            "transferred_database_connections": counts["database_connections"],
            "transferred_schedules": counts["schedules"],
            "transferred_workflows": counts["workflows"],
            "transferred_events": counts["events"],
            "transferred_webhooks": counts["webhooks"],
            "transferred_gates": counts["gates"],
            "transferred_documents": counts["documents"],
            "transferred_sessions": counts["sessions"],
            "transferred_memories": counts["memories"],
            "transferred_gate_decisions": counts["gate_decisions"],
            "transferred_skill_files": counts["skill_files"],
            "transferred_skill_folders": counts["skill_folders"],
            "total_transferred": total,
        },
        "pagination": None,
    }
