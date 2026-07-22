/**
 * Model catalog API client.
 *
 * Models available for agents, each with per-1M-token pricing used to compute
 * actual cost. The catalog is entirely user-managed (no built-in models) and
 * scoped to the workspace.
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
  if (!headers.has("Content-Type") && options.body) headers.set("Content-Type", "application/json");
  for (const [k, v] of Object.entries(getAuthHeaders())) if (!headers.has(k)) headers.set(k, v);
  for (const [k, v] of Object.entries(getWorkspaceHeaders())) if (!headers.has(k)) headers.set(k, v);
  const res = await fetch(buildUrl(path), { ...options, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.detail || data?.message || res.statusText);
  return data as T;
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

async function unwrap<T>(path: string, options?: RequestInit): Promise<T> {
  return (await jsonFetch<ApiResponse<T>>(path, options)).data;
}

export interface ModelPricing {
  name: string;
  label: string;
  input_per_million: number;
  output_per_million: number;
  builtin?: boolean; // deprecated — no built-in models; always false
  custom?: boolean; // always true (every model is user-managed)
}

export interface ModelInput {
  name: string;
  label: string;
  input_per_million: number;
  output_per_million: number;
}

export function listModels(): Promise<ModelPricing[]> {
  return unwrap<ModelPricing[]>("/api/v1/models");
}

export function upsertModel(input: ModelInput): Promise<ModelPricing> {
  return unwrap<ModelPricing>("/api/v1/models", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteModel(name: string): Promise<{ name: string }> {
  return unwrap<{ name: string }>(`/api/v1/models/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

/** Build a pricing lookup { name -> {input, output} } from the catalog. */
export function pricingMap(models: ModelPricing[]): Record<string, { input: number; output: number }> {
  const map: Record<string, { input: number; output: number }> = {};
  for (const m of models) map[m.name] = { input: m.input_per_million, output: m.output_per_million };
  return map;
}
