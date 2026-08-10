import { apiFetch, ApiPagination } from "./client";
import { toast } from "sonner";

export type PromptType = "system" | "instructions";

export interface PromptLibraryItem {
  id: number;
  title: string;
  prompt: string;
  createdby: number | null;
  tokens: number | null;
  extradata: Record<string, unknown> | null;
  prompt_type: PromptType;
  createdat: string;
  updatedat: string;
}

export interface PromptLibraryFilter {
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

export interface ListPromptParams {
  limit: number;
  offset: number;
  search?: string;
  filters?: PromptLibraryFilter[];
  sortField?: string;
  sortOrder?: "asc" | "desc";
}

export interface ListPromptResult {
  items: PromptLibraryItem[];
  pagination: ApiPagination;
}

export async function listPrompts(
  params: ListPromptParams,
  signal?: AbortSignal
): Promise<ListPromptResult> {
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

  const response = await apiFetch<PromptLibraryItem[]>(
    `/api/v1/prompt-library?${searchParams.toString()}`,
    { method: "GET", signal }
  );

  return {
    items: response.data ?? [],
    pagination: response.pagination ?? {},
  };
}

export interface PromptPayload {
  title: string;
  prompt: string;
  extradata?: Record<string, unknown> | null;
  prompt_type?: PromptType;
}

export async function createPrompt(payload: PromptPayload): Promise<PromptLibraryItem> {
  try {
    const response = await apiFetch<PromptLibraryItem>("/api/v1/prompt-library/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    toast.success("Prompt created");
    return response.data;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to create prompt");
    throw error;
  }
}

export async function updatePrompt(
  id: number,
  payload: Partial<PromptPayload>
): Promise<PromptLibraryItem> {
  try {
    const response = await apiFetch<PromptLibraryItem>(
      `/api/v1/prompt-library/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      }
    );
    toast.success("Prompt updated");
    return response.data;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to update prompt");
    throw error;
  }
}

export async function deletePrompt(id: number): Promise<void> {
  try {
    await apiFetch<null>(`/api/v1/prompt-library/${id}`, {
      method: "DELETE",
    });
    toast.success("Prompt deleted");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to delete prompt");
    throw error;
  }
}

export async function bulkDeletePrompts(ids: number[]): Promise<number[]> {
  try {
    const response = await apiFetch<{ deleted_ids: number[] }>(
      "/api/v1/prompt-library/bulk-delete",
      {
        method: "POST",
        body: JSON.stringify({ ids }),
      }
    );
    toast.success(`${response.data?.deleted_ids?.length ?? 0} prompt(s) deleted`);
    return response.data?.deleted_ids ?? [];
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to delete prompts");
    throw error;
  }
}

export async function duplicatePrompt(id: number): Promise<PromptLibraryItem> {
  try {
    const response = await apiFetch<PromptLibraryItem>(
      `/api/v1/prompt-library/${id}/duplicate`,
      { method: "POST" }
    );
    toast.success("Prompt duplicated");
    return response.data;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to duplicate prompt");
    throw error;
  }
}
