import { apiFetch } from "./client";
import { toast } from "sonner";
import { SkillFolderItem } from "./skill-folders";

export type SkillFileType = "md" | "script" | "template" | "asset" | "text" | "config";

export interface SkillFileItem {
  id: number;
  skill_id: number;
  name: string;
  content: string;
  file_type: SkillFileType;
  folder_id: number | null;
  workspace_id: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface SkillFilePayload {
  skill_id: number;
  name: string;
  content?: string;
  file_type?: SkillFileType;
  folder_id?: number | null;
}

export interface SkillTreeData {
  files: SkillFileItem[];
  folders: SkillFolderItem[];
}

export async function getSkillTree(
  skillId: number
): Promise<SkillTreeData> {
  const response = await apiFetch<SkillTreeData>(
    `/api/v1/skill-files/tree/${skillId}`
  );
  return response.data ?? { files: [], folders: [] };
}

export async function getSkillFile(id: number): Promise<SkillFileItem> {
  const response = await apiFetch<SkillFileItem>(
    `/api/v1/skill-files/${id}`
  );
  return response.data!;
}

export async function createSkillFile(
  payload: SkillFilePayload
): Promise<SkillFileItem> {
  try {
    const response = await apiFetch<SkillFileItem>("/api/v1/skill-files/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    toast.success("File created");
    return response.data!;
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Failed to create file"
    );
    throw error;
  }
}

export async function updateSkillFile(
  id: number,
  payload: Partial<Omit<SkillFilePayload, "skill_id">>
): Promise<SkillFileItem> {
  try {
    const response = await apiFetch<SkillFileItem>(
      `/api/v1/skill-files/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      }
    );
    toast.success("File saved");
    return response.data!;
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Failed to save file"
    );
    throw error;
  }
}

export async function deleteSkillFile(id: number): Promise<void> {
  try {
    await apiFetch<null>(`/api/v1/skill-files/${id}`, {
      method: "DELETE",
    });
    toast.success("File deleted");
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Failed to delete file"
    );
    throw error;
  }
}

export async function uploadSkillFiles(
  skillId: number,
  file: File,
  folderId?: number | null
): Promise<SkillTreeData> {
  const formData = new FormData();
  formData.append("file", file);

  const params = new URLSearchParams();
  if (folderId != null) params.set("folder_id", String(folderId));
  const qs = params.toString();

  // Use fetch directly since apiFetch sets Content-Type to json
  const { getAuthToken } = await import("@/lib/auth");
  const { getWorkspaceHeaders } = await import("@/lib/api/workspaces");

  const API_BASE =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const ws = getWorkspaceHeaders();
  Object.assign(headers, ws);

  const response = await fetch(
    `${API_BASE}/api/v1/skill-files/upload/${skillId}${qs ? `?${qs}` : ""}`,
    { method: "POST", headers, body: formData }
  );

  const data = await response.json();
  if (!response.ok || !data.success) {
    const msg = data.message || data.detail || "Upload failed";
    toast.error(msg);
    throw new Error(msg);
  }

  toast.success(data.message || "Files uploaded");
  return data.data ?? { files: [], folders: [] };
}

export interface InstallSkillPayload {
  url: string;
  name?: string;
  branch?: string;
  skill?: string;  // subdirectory within repo (e.g. "frontend-design")
}

export async function installSkillFromUrl(
  payload: InstallSkillPayload
): Promise<{ id: number; name: string }> {
  try {
    const response = await apiFetch<{ id: number; name: string }>(
      "/api/v1/skill-files/install",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
    toast.success(response.message || "Skill installed");
    return response.data!;
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Failed to install skill"
    );
    throw error;
  }
}
