import { apiFetch, ApiPagination } from "./client";
import { toast } from "sonner";

export interface McpConnectionItem {
  id: number;
  name: string;
  url: string;
  transport_type: string;
  headers: Record<string, unknown>;
  command?: string | null;
  args?: string[];
  env?: Record<string, string> | null;
  timeout_seconds: number;
  created_at: string;
  updated_at: string;
  created_by: number | null;
}

export interface McpConnectionFilter {
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

export interface ListMcpConnectionParams {
  limit: number;
  offset: number;
  search?: string;
  filters?: McpConnectionFilter[];
  sortField?: string;
  sortOrder?: "asc" | "desc";
}

export interface ListMcpConnectionResult {
  items: McpConnectionItem[];
  pagination: ApiPagination;
}

export async function listMcpConnections(
  params: ListMcpConnectionParams,
  signal?: AbortSignal
): Promise<ListMcpConnectionResult> {
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

  const response = await apiFetch<McpConnectionItem[]>(
    `/api/v1/mcp-connections?${searchParams.toString()}`,
    { method: "GET", signal }
  );

  return {
    items: response.data ?? [],
    pagination: response.pagination ?? {},
  };
}

export interface McpConnectionPayload {
  name: string;
  url?: string;
  transport_type?: string;
  headers?: Record<string, string>;
  command?: string | null;
  args?: string[];
  env?: Record<string, string> | null;
  timeout_seconds?: number;
}

export async function createMcpConnection(
  payload: McpConnectionPayload
): Promise<McpConnectionItem> {
  try {
    const response = await apiFetch<McpConnectionItem>(
      "/api/v1/mcp-connections/",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
    toast.success("MCP connection created");
    return response.data!;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to create MCP connection");
    throw error;
  }
}

export async function updateMcpConnection(
  id: number,
  payload: Partial<McpConnectionPayload>
): Promise<McpConnectionItem> {
  try {
    const response = await apiFetch<McpConnectionItem>(
      `/api/v1/mcp-connections/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      }
    );
    toast.success("MCP connection updated");
    return response.data!;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to update MCP connection");
    throw error;
  }
}

export async function getMcpConnection(id: number): Promise<McpConnectionItem> {
  const response = await apiFetch<McpConnectionItem>(
    `/api/v1/mcp-connections/${id}`,
    {
      method: "GET",
    }
  );
  return response.data!;
}

export async function deleteMcpConnection(id: number): Promise<void> {
  try {
    await apiFetch<null>(`/api/v1/mcp-connections/${id}`, {
      method: "DELETE",
    });
    toast.success("MCP connection deleted");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to delete MCP connection");
    throw error;
  }
}

export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export async function listMcpConnectionTools(
  id: number
): Promise<McpToolInfo[]> {
  const response = await apiFetch<McpToolInfo[]>(
    `/api/v1/mcp-connections/${id}/tools`,
    { method: "GET" }
  );
  return response.data ?? [];
}

export interface CallMcpToolResult {
  content: Array<{ type?: string; text?: string }>;
  isError: boolean;
  structuredContent?: Record<string, unknown>;
}

export async function callMcpTool(
  connectionId: number,
  toolName: string,
  arguments_: Record<string, unknown> = {}
): Promise<CallMcpToolResult> {
  const response = await apiFetch<CallMcpToolResult>(
    `/api/v1/mcp-connections/${connectionId}/tools/call`,
    {
      method: "POST",
      body: JSON.stringify({ name: toolName, arguments: arguments_ }),
    }
  );
  return response.data!;
}
