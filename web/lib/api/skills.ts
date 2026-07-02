import { apiFetch, ApiPagination } from "./client";
import { toast } from "sonner";

export type SkillType = "skill" | "script" | "template";

export interface SkillItem {
  id: number;
  name: string;
  description: string | null;
  instructions: string;
  tools: Array<{
    type: string;
    name?: string;
    mcp_connection_id?: number;
    tool_names?: string[];
    database_connection_id?: number;
  }>;
  folder_id: number | null;
  type: SkillType;
  source: string | null;
  workspace_id: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface SkillFilter {
  filterField: string;
  filterOp:
    | "contains"
    | "equals"
    | "startsWith"
    | "endsWith"
    | "notEquals"
    | "empty"
    | "notEmpty";
  filterValue?: string | number | null;
}

export interface ListSkillParams {
  limit: number;
  offset: number;
  search?: string;
  filters?: SkillFilter[];
  sortField?: string;
  sortOrder?: "asc" | "desc";
  browse?: boolean;
  folderId?: number | null;
}

export interface ListSkillResult {
  items: SkillItem[];
  pagination: ApiPagination;
}

export async function listSkills(
  params: ListSkillParams,
  signal?: AbortSignal
): Promise<ListSkillResult> {
  const searchParams = new URLSearchParams();
  searchParams.set("limit", String(params.limit));
  searchParams.set("offset", String(params.offset));
  if (params.search) {
    searchParams.set("search", params.search);
  }
  if (params.filters && params.filters.length > 0) {
    searchParams.set("filters", JSON.stringify(params.filters));
  }
  if (params.sortField) {
    searchParams.set("sortField", params.sortField);
  }
  if (params.sortOrder) {
    searchParams.set("sortOrder", params.sortOrder);
  }
  if (params.browse) {
    searchParams.set("browse", "true");
    if (params.folderId != null) {
      searchParams.set("folderId", String(params.folderId));
    }
  }

  const response = await apiFetch<SkillItem[]>(
    `/api/v1/skills?${searchParams.toString()}`,
    { method: "GET", signal }
  );

  return {
    items: response.data ?? [],
    pagination: response.pagination ?? {},
  };
}

export interface SkillPayload {
  name: string;
  description?: string | null;
  instructions: string;
  tools?: Array<{
    type: string;
    name?: string;
    mcp_connection_id?: number;
    tool_names?: string[];
    database_connection_id?: number;
  }>;
  folder_id?: number | null;
  type?: SkillType;
}

export async function createSkill(
  payload: SkillPayload
): Promise<SkillItem> {
  try {
    const response = await apiFetch<SkillItem>("/api/v1/skills/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    toast.success("Skill created");
    return response.data!;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to create skill");
    throw error;
  }
}

export async function updateSkill(
  id: number,
  payload: Partial<SkillPayload>
): Promise<SkillItem> {
  try {
    const response = await apiFetch<SkillItem>(`/api/v1/skills/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    toast.success("Skill updated");
    return response.data!;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to update skill");
    throw error;
  }
}

export async function getSkill(id: number): Promise<SkillItem> {
  const response = await apiFetch<SkillItem>(`/api/v1/skills/${id}`, {
    method: "GET",
  });
  return response.data!;
}

export async function deleteSkill(id: number): Promise<void> {
  try {
    await apiFetch<null>(`/api/v1/skills/${id}`, {
      method: "DELETE",
    });
    toast.success("Skill deleted");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to delete skill");
    throw error;
  }
}

export async function bulkDeleteSkills(ids: number[]): Promise<number[]> {
  try {
    const response = await apiFetch<{ deleted_ids: number[] }>(
      "/api/v1/skills/bulk-delete",
      {
        method: "POST",
        body: JSON.stringify({ ids }),
      }
    );
    toast.success(`${response.data?.deleted_ids?.length ?? 0} skill(s) deleted`);
    return response.data?.deleted_ids ?? [];
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to delete skills");
    throw error;
  }
}
