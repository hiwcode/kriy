import { apiFetch } from "./client";
import { getAuthHeaders } from "@/lib/auth";
import { getWorkspaceHeaders } from "@/lib/api/workspaces";
import { toast } from "sonner";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export interface DocumentItem {
  id: number;
  name: string;
  mime_type: string;
  size_bytes: number;
  r2_key: string | null;
  url: string | null;
  user_id: number | null;
  workspace_id: number | null;
  created_at: string;
  /** Viewable/downloadable URL (presigned or signed-local), set on upload. */
  download_url?: string | null;
}

export async function uploadDocuments(files: File[], agentId: number, sessionId?: string): Promise<DocumentItem[]> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  formData.append("agent_id", String(agentId));
  if (sessionId) formData.append("session_id", sessionId);

  const headers: Record<string, string> = {
    ...getAuthHeaders(),
    ...getWorkspaceHeaders(),
  };

  const res = await fetch(`${API_BASE_URL}/api/v1/documents/upload`, {
    method: "POST",
    headers,
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.detail || data?.message || "Upload failed";
    toast.error(msg);
    throw new Error(msg);
  }
  toast.success(`Uploaded ${files.length} file(s)`);
  return data.data;
}

export async function listDocuments(limit = 50): Promise<DocumentItem[]> {
  const res = await apiFetch<DocumentItem[]>(`/api/v1/documents?limit=${limit}`, { method: "GET" });
  return res.data ?? [];
}

/** Documents uploaded in a specific chat session (for re-rendering attachment chips). */
export async function listSessionDocuments(agentId: number, sessionId: string): Promise<DocumentItem[]> {
  const res = await apiFetch<DocumentItem[]>(
    `/api/v1/documents?agent_id=${agentId}&session_id=${encodeURIComponent(sessionId)}`,
    { method: "GET" }
  );
  return res.data ?? [];
}
