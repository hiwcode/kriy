/**
 * Workflows + Events API client.
 *
 * Event-driven automations: apps emit events; per-user workflows react by running
 * an agent. These endpoints return raw JSON (not the ApiResponse wrapper).
 */

import { getAuthHeaders } from "@/lib/auth";
import { getWorkspaceHeaders } from "@/lib/api/workspaces";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

function buildUrl(path: string): string {
  const base = API_BASE_URL.replace(/\/$/, "");
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

async function jsonFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  for (const [k, v] of Object.entries(getAuthHeaders())) {
    if (!headers.has(k)) headers.set(k, v);
  }
  for (const [k, v] of Object.entries(getWorkspaceHeaders())) {
    if (!headers.has(k)) headers.set(k, v);
  }
  const res = await fetch(buildUrl(path), { ...options, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.detail || data?.message || res.statusText);
  }
  return data as T;
}

// --------------------------------------------------------------------------- //
// Types
// --------------------------------------------------------------------------- //

export interface Workflow {
  id: number;
  user_id: number | null;
  workspace_id: number | null;
  name: string;
  event_types: string[];
  agent_id: number;
  instructions: string;
  enabled: boolean;
  priority: number;
  execution_mode: "serial" | "parallel";
  max_concurrency: number;
}

export interface WorkflowInput {
  name: string;
  event_types: string[];
  agent_id: number;
  instructions: string;
  enabled: boolean;
  priority: number;
  execution_mode: "serial" | "parallel";
  max_concurrency: number;
}

export interface WorkflowRun {
  id: number;
  workflow_id: number;
  agent_id: number;
  event_type: string;
  status: "pending" | "running" | "done" | "error";
  response: string | null;
  error: string | null;
  attempts: number;
  max_attempts: number;
  event_payload: unknown;
  created_at: string | null;
  finished_at: string | null;
}

export interface CompiledWorkflow {
  name: string;
  event_types: string[];
  instructions: string;
}

export interface WorkflowChatResponse {
  reply: string;
  workflow: CompiledWorkflow | null;
}

export interface EventType {
  id: number;
  name: string;
  description: string;
  payload_schema: Record<string, unknown> | null;
  subscribers: number; // matching Triggers
  gates: number; // matching Gates
}

/** Standard API envelope: { success, message, data, pagination }. */
interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  pagination?: { total?: number } | null;
}

/** Call an endpoint and return just the `data` payload from the envelope. */
async function unwrap<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await jsonFetch<ApiResponse<T>>(path, options);
  return res.data;
}

// --------------------------------------------------------------------------- //
// Workflows
// --------------------------------------------------------------------------- //

export function listWorkflows(): Promise<Workflow[]> {
  return unwrap<Workflow[]>("/api/v1/workflows");
}

export function createWorkflow(input: WorkflowInput): Promise<Workflow> {
  return unwrap<Workflow>("/api/v1/workflows", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateWorkflow(id: number, input: WorkflowInput): Promise<Workflow> {
  return unwrap<Workflow>(`/api/v1/workflows/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteWorkflow(id: number): Promise<{ id: number }> {
  return unwrap<{ id: number }>(`/api/v1/workflows/${id}`, { method: "DELETE" });
}

export function listWorkflowRuns(id: number, limit = 50): Promise<WorkflowRun[]> {
  return unwrap<WorkflowRun[]>(`/api/v1/workflows/${id}/runs?limit=${limit}`);
}

export function workflowChat(
  agentId: number,
  messages: { role: "user" | "assistant"; content: string }[]
): Promise<WorkflowChatResponse> {
  return unwrap<WorkflowChatResponse>("/api/v1/workflows/chat", {
    method: "POST",
    body: JSON.stringify({ agent_id: agentId, messages }),
  });
}

// --------------------------------------------------------------------------- //
// Event registry
// --------------------------------------------------------------------------- //

export function listEventTypes(): Promise<EventType[]> {
  return unwrap<EventType[]>("/api/v1/event-types");
}

export function upsertEventType(input: {
  name: string;
  description: string;
  payload_schema: Record<string, unknown> | null;
}): Promise<EventType> {
  return unwrap<EventType>("/api/v1/event-types", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteEventType(name: string): Promise<{ name: string }> {
  return unwrap<{ name: string }>(`/api/v1/event-types/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

export interface QueueRun extends WorkflowRun {
  workflow_name: string;
  execution_mode: "serial" | "parallel";
  priority: number;
}

export interface QueueData {
  runs: QueueRun[];
  counts: Record<string, number>;
}

export function listQueue(limit = 100): Promise<QueueData> {
  return unwrap<QueueData>(`/api/v1/workflows/queue/all?limit=${limit}`);
}

export function eventTypeSubscribers(name: string): Promise<Workflow[]> {
  return unwrap<Workflow[]>(
    `/api/v1/event-types/${encodeURIComponent(name)}/workflows`
  );
}
