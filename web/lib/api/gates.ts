/**
 * Decision Gates API client.
 *
 * A rules-based, synchronous pre-action gate. Apps POST a proposed action to
 * /events/decide and get an allow/deny verdict back. Gates are built here as
 * recursive AND/OR/NONE condition trees.
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

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

async function unwrap<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await jsonFetch<ApiResponse<T>>(path, options);
  return res.data;
}

// --------------------------------------------------------------------------- //
// Condition tree types
// --------------------------------------------------------------------------- //

export type MatchKind = "all" | "any" | "none";

export type LeafOp =
  | "eq" | "ne"
  | "gt" | "gte" | "lt" | "lte"
  | "in" | "not_in"
  | "contains" | "not_contains"
  | "matches"
  | "exists" | "not_exists";

export interface LeafCondition {
  field: string;
  op: LeafOp;
  value?: unknown;
}

export interface GroupCondition {
  match: MatchKind;
  conditions: ConditionNode[];
}

export type ConditionNode = LeafCondition | GroupCondition;

export function isGroup(node: ConditionNode): node is GroupCondition {
  return (node as GroupCondition).match !== undefined;
}

// --------------------------------------------------------------------------- //
// Gate types
// --------------------------------------------------------------------------- //

export type GateAction = "allow" | "deny";

export interface Gate {
  id: number;
  user_id: number | null;
  workspace_id: number | null;
  name: string;
  event_types: string[];
  conditions: GroupCondition;
  action: GateAction;
  reason: string;
  enabled: boolean;
  priority: number;
  allow_override: boolean;
}

export interface GateInput {
  name: string;
  event_types: string[];
  conditions: GroupCondition;
  action: GateAction;
  reason: string;
  enabled: boolean;
  priority: number;
  allow_override: boolean;
}

export interface Decision {
  event: string;
  decision: GateAction;
  reason: string;
  matched_gate_id: number | null;
  matched_gate_name: string | null;
  overridable: boolean;
  evaluated: number;
}

export interface GateDecision {
  id: number;
  event_type: string;
  decision: GateAction;
  overridable: boolean;
  matched_gate_id: number | null;
  matched_gate_name: string | null;
  reason: string;
  payload: unknown;
  created_at: string | null;
}

export interface DraftResult {
  matched: boolean;
  action: GateAction; // what this rule would decide if it fires
  reason: string;
}

export interface CompiledGate {
  name: string;
  event_types: string[];
  action: GateAction;
  reason: string;
  allow_override: boolean;
  conditions: GroupCondition;
}

export interface GateChatResult {
  reply: string;
  gate: CompiledGate | null;
}

// --------------------------------------------------------------------------- //
// CRUD
// --------------------------------------------------------------------------- //

export function listGates(): Promise<Gate[]> {
  return unwrap<Gate[]>("/api/v1/gates");
}

export function createGate(input: GateInput): Promise<Gate> {
  return unwrap<Gate>("/api/v1/gates", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateGate(id: number, input: GateInput): Promise<Gate> {
  return unwrap<Gate>(`/api/v1/gates/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteGate(id: number): Promise<{ id: number }> {
  return unwrap<{ id: number }>(`/api/v1/gates/${id}`, { method: "DELETE" });
}

/** Recent /events/decide verdicts (the audit log). */
export function listDecisions(limit = 100): Promise<GateDecision[]> {
  return unwrap<GateDecision[]>(`/api/v1/gates/decisions?limit=${limit}`);
}

/** Compile a plain-English description into a gate spec (AI builds the rule). */
export function gateChat(
  messages: { role: "user" | "assistant"; content: string }[],
  agentId?: number
): Promise<GateChatResult> {
  return unwrap<GateChatResult>("/api/v1/gates/chat", {
    method: "POST",
    body: JSON.stringify({ messages, agent_id: agentId ?? null }),
  });
}

/** Evaluate a single (unsaved) rule against a sample payload — builder preview. */
export function evaluateDraft(input: {
  type: string;
  payload: unknown;
  conditions: GroupCondition;
  action: GateAction;
  reason: string;
}): Promise<DraftResult> {
  return unwrap<DraftResult>("/api/v1/gates/evaluate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Dry-run against all live gates for an event type (with per-gate trace). */
export function testGates(type: string, payload: unknown): Promise<{
  event: string;
  evaluated: number;
  decision: GateAction;
  reason: string;
  matched_gate_id: number | null;
  matched_gate_name: string | null;
  trace: { gate_id: number; name: string; action: GateAction; matched: boolean }[];
}> {
  return unwrap("/api/v1/gates/test", {
    method: "POST",
    body: JSON.stringify({ type, payload }),
  });
}
