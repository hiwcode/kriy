import { getAuthHeaders } from "@/lib/auth";
import { getWorkspaceHeaders } from "@/lib/api/workspaces";
import { apiFetch, ApiPagination } from "./client";
import { toast } from "sonner";

export interface AgentItem {
  id: number;
  name: string;
  label: string;
  model: string;
  description: string | null;
  system_prompt: string | null;
  system_prompt_id: number | null;
  instruction: string | null;
  instruction_prompt_id: number | null;
  tools: Array<{
    type: string;
    name?: string;
    mcp_connection_id?: number;
    tool_names?: string[];
    database_connection_id?: number;
  }>;
  extra_fields: Record<string, unknown>;
  is_orchestrator: boolean;
  sub_agent_ids: number[];
  skill_ids: number[];
  created_at: string;
  updated_at: string;
  created_by: number | null;
}

export interface AgentFilter {
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

export interface ListAgentParams {
  limit: number;
  offset: number;
  search?: string;
  filters?: AgentFilter[];
  sortField?: string;
  sortOrder?: "asc" | "desc";
}

export interface ListAgentResult {
  items: AgentItem[];
  pagination: ApiPagination;
}

export async function listAgents(
  params: ListAgentParams,
  signal?: AbortSignal
): Promise<ListAgentResult> {
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

  const response = await apiFetch<AgentItem[]>(
    `/api/v1/agents?${searchParams.toString()}`,
    { method: "GET", signal }
  );

  return {
    items: response.data ?? [],
    pagination: response.pagination ?? {},
  };
}

export interface AgentPayload {
  name: string;
  label: string;
  model?: string;
  description?: string | null;
  system_prompt?: string | null;
  system_prompt_id?: number | null;
  instruction?: string | null;
  instruction_prompt_id?: number | null;
  tools?: Array<{
    type: string;
    name?: string;
    mcp_connection_id?: number;
    tool_names?: string[];
    database_connection_id?: number;
  }>;
  extra_fields?: Record<string, unknown>;
  is_orchestrator?: boolean;
  sub_agent_ids?: number[];
  skill_ids?: number[];
}

export async function createAgent(
  payload: AgentPayload
): Promise<AgentItem> {
  try {
    const response = await apiFetch<AgentItem>("/api/v1/agents/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    toast.success("Agent created");
    return response.data!;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to create agent");
    throw error;
  }
}

export async function updateAgent(
  id: number,
  payload: Partial<AgentPayload>
): Promise<AgentItem> {
  try {
    const response = await apiFetch<AgentItem>(`/api/v1/agents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    toast.success("Agent updated");
    return response.data!;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to update agent");
    throw error;
  }
}

export async function getAgent(id: number): Promise<AgentItem> {
  const response = await apiFetch<AgentItem>(`/api/v1/agents/${id}`, {
    method: "GET",
  });
  return response.data!;
}

export async function deleteAgent(id: number): Promise<void> {
  try {
    await apiFetch<null>(`/api/v1/agents/${id}`, {
      method: "DELETE",
    });
    toast.success("Agent deleted");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to delete agent");
    throw error;
  }
}

export async function bulkDeleteAgents(ids: number[]): Promise<number[]> {
  try {
    const response = await apiFetch<{ deleted_ids: number[] }>(
      "/api/v1/agents/bulk-delete",
      {
        method: "POST",
        body: JSON.stringify({ ids }),
      }
    );
    toast.success(`${response.data?.deleted_ids?.length ?? 0} agent(s) deleted`);
    return response.data?.deleted_ids ?? [];
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to delete agents");
    throw error;
  }
}

export async function getBuiltinTools(): Promise<string[]> {
  const response = await apiFetch<string[]>(
    "/api/v1/agents/builtin-tools/list",
    { method: "GET" }
  );
  return response.data ?? [];
}

export interface AgentSessionItem {
  session_id: string;
  title: string;
  created_at: number;
  last_updated: number;
  message_count: number;
}

export interface AgentSessionFilter {
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

export interface ListAgentSessionsParams {
  limit: number;
  offset: number;
  search?: string;
  filters?: AgentSessionFilter[];
  sortField?: string;
  sortOrder?: "asc" | "desc";
}

export interface ListAgentSessionsResult {
  items: AgentSessionItem[];
  pagination: ApiPagination;
}

export async function listAgentSessions(
  agentId: number,
  params: ListAgentSessionsParams,
  signal?: AbortSignal
): Promise<ListAgentSessionsResult> {
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

  const response = await apiFetch<AgentSessionItem[]>(
    `/api/v1/agents/${agentId}/sessions?${searchParams.toString()}`,
    { method: "GET", signal }
  );

  return {
    items: response.data ?? [],
    pagination: response.pagination ?? {},
  };
}

export interface SessionHistoryExchange {
  user_message: string;
  agent_response: string;
  /** Reconstructed plan/todo/info cards emitted by the agent that turn. */
  agent_cards?: Record<string, unknown>[];
  timestamp: number;
}

export interface SessionHistoryData {
  history: SessionHistoryExchange[];
  state: Record<string, unknown>;
}

export async function getSessionHistory(
  agentId: number,
  sessionId: string
): Promise<SessionHistoryData> {
  const response = await apiFetch<SessionHistoryData>(
    `/api/v1/agents/${agentId}/sessions/${sessionId}`,
    { method: "GET" }
  );
  return response.data!;
}

export async function createAgentSession(
  agentId: number
): Promise<{ session_id: string }> {
  try {
    const response = await apiFetch<{ session_id: string }>(
      `/api/v1/agents/${agentId}/sessions`,
      { method: "POST" }
    );
    toast.success("Session created");
    return response.data!;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to create session");
    throw error;
  }
}

/** Create a session without a toast — used to key a run before sending. */
export async function createSessionSilent(agentId: number): Promise<string> {
  const response = await apiFetch<{ session_id: string }>(
    `/api/v1/agents/${agentId}/sessions`,
    { method: "POST" }
  );
  return response.data!.session_id;
}

export interface RunStatus {
  active: boolean;
  finished_recently: boolean;
}

/** Whether a run for this session is still going (or finished within the replay window). */
export async function getRunStatus(
  agentId: number,
  sessionId: string
): Promise<RunStatus> {
  const response = await apiFetch<RunStatus>(
    `/api/v1/agents/${agentId}/runs/${sessionId}/status`,
    { method: "GET" }
  );
  return response.data ?? { active: false, finished_recently: false };
}

/** Stop an in-flight run. */
export async function stopRun(agentId: number, sessionId: string): Promise<boolean> {
  const response = await apiFetch<{ stopped: boolean }>(
    `/api/v1/agents/${agentId}/runs/${sessionId}/stop`,
    { method: "POST" }
  );
  return response.data?.stopped ?? false;
}

/** Re-attach to a background run: replays what was missed, then tails live. */
export async function* reattachRunStream(
  agentId: number,
  sessionId: string
): AsyncGenerator<{ type: string; text?: string; session_id?: string; error?: string; function_call_id?: string; hint?: string; tool_name?: string; args?: Record<string, unknown>; card?: Record<string, unknown> }> {
  const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
  const url = `${API_BASE_URL}/api/v1/agents/${agentId}/runs/${sessionId}/stream`;
  const response = await fetch(url, {
    method: "GET",
    headers: { ...getAuthHeaders(), ...getWorkspaceHeaders() },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || response.statusText);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          yield JSON.parse(line.slice(6));
        } catch {
          // skip invalid JSON
        }
      }
    }
  }
}

export async function deleteAgentSession(
  agentId: number,
  sessionId: string
): Promise<void> {
  try {
    await apiFetch<null>(
      `/api/v1/agents/${agentId}/sessions/${sessionId}`,
      { method: "DELETE" }
    );
    toast.success("Session deleted");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to delete session");
    throw error;
  }
}

export interface AgentMemoryItem {
  id: number;
  agent_id: number;
  user_id: string;
  session_id: string | null;
  content: string;
  memory_type: string;
  confidence: number;
  created_at: number;
  updated_at: number;
}

export interface ListAgentMemoriesParams {
  limit?: number;
  offset?: number;
  search?: string;
}

export interface ListAgentMemoriesResult {
  items: AgentMemoryItem[];
  pagination: ApiPagination;
}

export async function listAgentMemories(
  agentId: number,
  params: ListAgentMemoriesParams = {},
  signal?: AbortSignal
): Promise<ListAgentMemoriesResult> {
  const searchParams = new URLSearchParams();
  searchParams.set("limit", String(params.limit ?? 50));
  searchParams.set("offset", String(params.offset ?? 0));
  if (params.search) {
    searchParams.set("search", params.search);
  }
  const response = await apiFetch<AgentMemoryItem[]>(
    `/api/v1/agents/${agentId}/memories?${searchParams.toString()}`,
    { method: "GET", signal }
  );
  return {
    items: response.data ?? [],
    pagination: response.pagination ?? {},
  };
}

export async function createAgentMemory(
  agentId: number,
  data: { content: string; memory_type?: string }
): Promise<{ id: number }> {
  try {
    const response = await apiFetch<{ id: number }>(
      `/api/v1/agents/${agentId}/memories`,
      {
        method: "POST",
        body: JSON.stringify({
          content: data.content,
          memory_type: data.memory_type ?? "fact",
        }),
      }
    );
    toast.success("Memory created");
    return response.data ?? { id: 0 };
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to create memory");
    throw error;
  }
}

export async function syncAgentMemories(
  agentId: number,
  replace = false
): Promise<{ count: number }> {
  try {
    const response = await apiFetch<{ count: number }>(
      `/api/v1/agents/${agentId}/memories/sync?replace=${replace}`,
      { method: "POST" }
    );
    toast.success(`Memories synced (${response.data?.count ?? 0})`);
    return response.data ?? { count: 0 };
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to sync memories");
    throw error;
  }
}

export async function deleteAgentMemory(
  agentId: number,
  memoryId: number
): Promise<void> {
  try {
    await apiFetch<null>(
      `/api/v1/agents/${agentId}/memories/${memoryId}`,
      { method: "DELETE" }
    );
    toast.success("Memory deleted");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to delete memory");
    throw error;
  }
}

export interface AgentTraceItem {
  session_id: string;
  title: string;
  created_at: number;
  last_updated: number;
  event_count: number;
  tool_call_count: number;
  input_tokens: number;
  output_tokens: number;
  model?: string | null; // model that produced the session's tokens
  estimated_cost?: number; // priced per-event by the recorded model
}

export interface ListAgentTracesParams {
  limit?: number;
  offset?: number;
  search?: string;
}

export interface ListAgentTracesResult {
  items: AgentTraceItem[];
  pagination: ApiPagination;
}

export async function listAgentTraces(
  agentId: number,
  params: ListAgentTracesParams = {},
  signal?: AbortSignal
): Promise<ListAgentTracesResult> {
  const searchParams = new URLSearchParams();
  searchParams.set("limit", String(params.limit ?? 50));
  searchParams.set("offset", String(params.offset ?? 0));
  if (params.search) {
    searchParams.set("search", params.search);
  }
  const response = await apiFetch<AgentTraceItem[]>(
    `/api/v1/agents/${agentId}/traces?${searchParams.toString()}`,
    { method: "GET", signal }
  );
  return {
    items: response.data ?? [],
    pagination: response.pagination ?? {},
  };
}

export interface TraceStep {
  event_id: string;
  invocation_id: string;
  author: string;
  timestamp: number;
  type: "text" | "tool_call" | "tool_response" | "other";
  text?: string;
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  tool_response?: unknown;
  usage?: Record<string, unknown>;
  model?: string | null; // model that produced this event
  cost?: number; // per-event cost priced by its model
}

export interface TraceDetail {
  session_id: string;
  state: Record<string, unknown>;
  steps: TraceStep[];
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  estimated_cost?: number;
}

export async function getTraceDetail(
  agentId: number,
  sessionId: string
): Promise<TraceDetail> {
  const response = await apiFetch<TraceDetail>(
    `/api/v1/agents/${agentId}/traces/${sessionId}`,
    { method: "GET" }
  );
  return response.data!;
}

export interface AgentRunParams {
  message: string;
  session_id?: string | null;
  document_ids?: number[];
}

export async function* confirmToolStream(
  agentId: number,
  params: { session_id: string; function_call_id: string; confirmed: boolean }
): AsyncGenerator<{ type: string; text?: string; error?: string; function_call_id?: string; hint?: string; tool_name?: string; args?: Record<string, unknown>; card?: Record<string, unknown> }> {
  const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

  const response = await fetch(`${API_BASE_URL}/api/v1/agents/${agentId}/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...getWorkspaceHeaders(),
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || response.statusText);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          yield JSON.parse(line.slice(6));
        } catch {}
      }
    }
  }
}

export async function* runAgentStream(
  agentId: number,
  params: AgentRunParams
): AsyncGenerator<{ type: string; text?: string; session_id?: string; error?: string; function_call_id?: string; hint?: string; tool_name?: string; args?: Record<string, unknown>; card?: Record<string, unknown> }> {
  const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

  const url = `${API_BASE_URL}/api/v1/agents/${agentId}/run`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...getWorkspaceHeaders(),
    },
    body: JSON.stringify({
      message: params.message,
      session_id: params.session_id,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || response.statusText);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          yield data;
        } catch {
          // skip invalid JSON
        }
      }
    }
  }
}
