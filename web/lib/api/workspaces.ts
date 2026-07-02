import { apiFetch } from "./client";
import { toast } from "sonner";

export interface Workspace {
  id: number;
  name: string;
  slug: string;
  is_personal: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  user_id: number;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
}

export interface WorkspaceInvite {
  id: number;
  workspace_id: number;
  email: string;
  role: string;
  invited_by: number;
  expires_at: string;
  status: string;
  created_at: string;
  invite_url?: string;
  token?: string;
}

const WORKSPACE_STORAGE_KEY = "atelier_active_workspace_id";

export function getStoredWorkspaceId(): number | null {
  if (typeof window === "undefined") return null;
  const s = localStorage.getItem(WORKSPACE_STORAGE_KEY);
  if (!s) return null;
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

export function setStoredWorkspaceId(id: number | null): void {
  if (typeof window === "undefined") return;
  if (id == null) {
    localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  } else {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, String(id));
  }
}

export function getWorkspaceHeaders(): Record<string, string> {
  const id = getStoredWorkspaceId();
  return id != null ? { "X-Workspace-Id": String(id) } : {};
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const res = await apiFetch<Workspace[]>("/api/v1/workspaces/");
  return res.data ?? [];
}

export async function getCurrentWorkspace(): Promise<Workspace | null> {
  const res = await apiFetch<Workspace>("/api/v1/workspaces/me", {
    headers: getWorkspaceHeaders(),
  });
  return res.data ?? null;
}

export async function createWorkspace(name: string): Promise<Workspace> {
  try {
    const res = await apiFetch<Workspace>("/api/v1/workspaces/", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    toast.success("Workspace created");
    return res.data!;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to create workspace");
    throw error;
  }
}

export async function listWorkspaceMembers(workspaceId: number): Promise<WorkspaceMember[]> {
  const res = await apiFetch<WorkspaceMember[]>(`/api/v1/workspaces/${workspaceId}/members`);
  return res.data ?? [];
}

export async function createWorkspaceInvite(
  workspaceId: number,
  email: string,
  role: "admin" | "member" = "member"
): Promise<WorkspaceInvite> {
  try {
    const res = await apiFetch<WorkspaceInvite>(`/api/v1/workspaces/${workspaceId}/invite`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    });
    toast.success("Invite sent");
    return res.data!;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to send invite");
    throw error;
  }
}

export async function listWorkspaceInvites(workspaceId: number): Promise<WorkspaceInvite[]> {
  const res = await apiFetch<WorkspaceInvite[]>(`/api/v1/workspaces/${workspaceId}/invites`);
  return res.data ?? [];
}

export async function acceptInvite(token: string): Promise<Workspace> {
  try {
    const res = await apiFetch<Workspace>("/api/v1/workspaces/invite/accept", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    toast.success("Invite accepted");
    return res.data!;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to accept invite");
    throw error;
  }
}

export async function removeMember(workspaceId: number, userId: number): Promise<void> {
  try {
    await apiFetch(`/api/v1/workspaces/${workspaceId}/members/${userId}`, {
      method: "DELETE",
    });
    toast.success("Member removed");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to remove member");
    throw error;
  }
}

export interface WorkspaceTransferRequest {
  source_workspace_id: number;
  target_workspace_id: number;
  resource_type: "agents" | "prompts" | "skills" | "mcp_connections" | "database_connections" | "all";
  resource_ids?: number[];
}

export interface WorkspaceTransferResponse {
  transferred_agents: number;
  transferred_prompts: number;
  transferred_skills: number;
  transferred_mcp_connections: number;
  transferred_database_connections: number;
  transferred_sessions: number;
  transferred_memories: number;
  total_transferred: number;
}

export async function transferResources(request: WorkspaceTransferRequest): Promise<WorkspaceTransferResponse> {
  try {
    const res = await apiFetch<WorkspaceTransferResponse>("/api/v1/workspaces/transfer", {
      method: "POST",
      body: JSON.stringify(request),
    });
    toast.success(`${res.data!.total_transferred} resource(s) transferred`);
    return res.data!;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to transfer resources");
    throw error;
  }
}
