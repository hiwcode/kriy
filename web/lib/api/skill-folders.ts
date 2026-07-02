import { apiFetch } from "./client";
import { toast } from "sonner";

export interface SkillFolderItem {
  id: number;
  name: string;
  parent_id: number | null;
  skill_id: number | null;
  workspace_id: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface SkillFolderPayload {
  name: string;
  parent_id?: number | null;
  skill_id?: number | null;
}

export async function listSkillFolders(
  parentId?: number | null
): Promise<SkillFolderItem[]> {
  const params = new URLSearchParams();
  if (parentId != null) {
    params.set("parent_id", String(parentId));
  }
  const qs = params.toString();
  const response = await apiFetch<SkillFolderItem[]>(
    `/api/v1/skill-folders/${qs ? `?${qs}` : ""}`
  );
  return response.data ?? [];
}

export async function createSkillFolder(
  payload: SkillFolderPayload
): Promise<SkillFolderItem> {
  try {
    const response = await apiFetch<SkillFolderItem>("/api/v1/skill-folders/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    toast.success("Folder created");
    return response.data!;
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Failed to create folder"
    );
    throw error;
  }
}

export async function getSkillFolder(
  id: number
): Promise<SkillFolderItem> {
  const response = await apiFetch<SkillFolderItem>(
    `/api/v1/skill-folders/${id}`
  );
  return response.data!;
}

export async function getSkillFolderPath(
  id: number
): Promise<Array<{ id: number; name: string; parent_id: number | null }>> {
  const response = await apiFetch<
    Array<{ id: number; name: string; parent_id: number | null }>
  >(`/api/v1/skill-folders/${id}/path`);
  return response.data ?? [];
}

export async function updateSkillFolder(
  id: number,
  payload: Partial<SkillFolderPayload>
): Promise<SkillFolderItem> {
  try {
    const response = await apiFetch<SkillFolderItem>(
      `/api/v1/skill-folders/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      }
    );
    toast.success("Folder updated");
    return response.data!;
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Failed to update folder"
    );
    throw error;
  }
}

export async function deleteSkillFolder(id: number): Promise<void> {
  try {
    await apiFetch<null>(`/api/v1/skill-folders/${id}`, {
      method: "DELETE",
    });
    toast.success("Folder deleted");
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Failed to delete folder"
    );
    throw error;
  }
}
