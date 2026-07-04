from __future__ import annotations

from pydantic import BaseModel, Field


class WorkspaceBase(BaseModel):
    name: str
    slug: str | None = None


class WorkspaceCreate(WorkspaceBase):
    name: str = Field(..., min_length=1, max_length=200)


class WorkspaceUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    slug: str | None = Field(None, min_length=1, max_length=100)


class WorkspaceOut(BaseModel):
    id: int
    name: str
    slug: str
    is_personal: bool
    created_by: int | None
    created_at: str
    updated_at: str


class WorkspaceMemberOut(BaseModel):
    user_id: int
    email: str
    full_name: str | None
    role: str
    created_at: str


class WorkspaceInviteCreate(BaseModel):
    email: str = Field(..., min_length=1)
    role: str = Field(default="member", pattern="^(admin|member)$")


class WorkspaceMemberRoleUpdate(BaseModel):
    role: str = Field(..., pattern="^(admin|member)$")


class WorkspaceInviteOut(BaseModel):
    id: int
    workspace_id: int
    email: str
    role: str
    invited_by: int
    expires_at: str
    status: str
    created_at: str


class WorkspaceInviteAccept(BaseModel):
    token: str


class WorkspaceTransferRequest(BaseModel):
    source_workspace_id: int = Field(..., description="ID of the workspace to transfer from")
    target_workspace_id: int = Field(..., description="ID of the workspace to transfer to")
    resource_type: str = Field(..., pattern="^(agents|prompts|skills|mcp_connections|database_connections|schedules|workflows|events|all)$")
    resource_ids: list[int] | None = Field(None, description="Specific resource IDs to transfer. If None, all resources will be transferred")


class WorkspaceTransferResponse(BaseModel):
    transferred_agents: int
    transferred_prompts: int
    transferred_skills: int = 0
    transferred_mcp_connections: int
    transferred_database_connections: int
    transferred_schedules: int = 0
    transferred_workflows: int = 0
    transferred_events: int = 0
    total_transferred: int
