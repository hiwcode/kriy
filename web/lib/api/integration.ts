/**
 * Integration API client.
 *
 * These endpoints return raw JSON (NOT wrapped in ApiResponse),
 * so we use a lightweight fetch helper instead of apiFetch.
 */

import { getAuthHeaders } from "@/lib/auth";
import { getWorkspaceHeaders } from "@/lib/api/workspaces";
import { toast } from "sonner";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

function buildUrl(path: string): string {
  const base = API_BASE_URL.replace(/\/$/, "");
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

async function integrationFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  const authH = getAuthHeaders();
  for (const [k, v] of Object.entries(authH)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  const wsH = getWorkspaceHeaders();
  for (const [k, v] of Object.entries(wsH)) {
    if (!headers.has(k)) headers.set(k, v);
  }

  const response = await fetch(buildUrl(path), { ...options, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      data?.detail || data?.message || response.statusText
    );
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntegrationAgent {
  id: number;
  name: string;
  label: string;
  model: string;
  description: string | null;
  a2a_url: string | null;
}

export interface IntegrationSession {
  session_id: string;
  title: string | null;
  last_update_time: number | null;
  message_count: number | null;
}

export interface ChatSyncResponse {
  session_id: string;
  response: string;
}


// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export async function listIntegrationAgents(): Promise<IntegrationAgent[]> {
  return integrationFetch<IntegrationAgent[]>(
    "/api/v1/integration/agents"
  );
}

export async function getIntegrationAgent(
  agentId: number
): Promise<IntegrationAgent> {
  return integrationFetch<IntegrationAgent>(
    `/api/v1/integration/agents/${agentId}`
  );
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function listIntegrationSessions(
  agentId: number,
  limit = 50,
  offset = 0
): Promise<IntegrationSession[]> {
  return integrationFetch<IntegrationSession[]>(
    `/api/v1/integration/agents/${agentId}/sessions?limit=${limit}&offset=${offset}`
  );
}

export async function createIntegrationSession(
  agentId: number
): Promise<IntegrationSession> {
  try {
    const result = await integrationFetch<IntegrationSession>(
      `/api/v1/integration/agents/${agentId}/sessions`,
      { method: "POST" }
    );
    toast.success("Session created");
    return result;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to create session");
    throw error;
  }
}

export async function getIntegrationSessionHistory(
  agentId: number,
  sessionId: string
): Promise<Record<string, unknown>> {
  return integrationFetch<Record<string, unknown>>(
    `/api/v1/integration/agents/${agentId}/sessions/${sessionId}`
  );
}

export async function deleteIntegrationSession(
  agentId: number,
  sessionId: string
): Promise<void> {
  try {
    await integrationFetch<unknown>(
      `/api/v1/integration/agents/${agentId}/sessions/${sessionId}`,
      { method: "DELETE" }
    );
    toast.success("Session deleted");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to delete session");
    throw error;
  }
}


// ---------------------------------------------------------------------------
// Chat (sync)
// ---------------------------------------------------------------------------

export async function chatSync(
  agentId: number,
  message: string,
  sessionId?: string | null
): Promise<ChatSyncResponse> {
  return integrationFetch<ChatSyncResponse>(
    `/api/v1/integration/agents/${agentId}/chat/sync`,
    {
      method: "POST",
      body: JSON.stringify({ message, session_id: sessionId }),
    }
  );
}

// ---------------------------------------------------------------------------
// Chat (SSE streaming)
// ---------------------------------------------------------------------------

export async function* chatStream(
  agentId: number,
  message: string,
  sessionId?: string | null
): AsyncGenerator<{
  type: string;
  text?: string;
  session_id?: string;
  error?: string;
}> {
  const url = buildUrl(
    `/api/v1/integration/agents/${agentId}/chat`
  );
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...getWorkspaceHeaders(),
    },
    body: JSON.stringify({ message, session_id: sessionId }),
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

// ---------------------------------------------------------------------------
// A2A management
// ---------------------------------------------------------------------------

export async function reloadA2A(
  agentId: number
): Promise<{
  mounted: boolean;
  agent_id: number;
  a2a_url: string;
  agent_card_url: string;
}> {
  try {
    const result = await integrationFetch<{
      mounted: boolean;
      agent_id: number;
      a2a_url: string;
      agent_card_url: string;
    }>(
      `/api/v1/integration/agents/${agentId}/a2a/reload`,
      { method: "POST" }
    );
    toast.success("A2A reloaded");
    return result;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to reload A2A");
    throw error;
  }
}
