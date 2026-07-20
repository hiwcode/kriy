/**
 * Outbound Webhooks API client. Atelier delivers platform events (e.g.
 * run.completed) to subscribed URLs, signed and retried.
 */

import { getAuthHeaders } from "@/lib/auth";
import { getWorkspaceHeaders } from "@/lib/api/workspaces";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

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

interface ApiResponse<T> { success: boolean; message: string; data: T }
async function unwrap<T>(path: string, options?: RequestInit): Promise<T> {
  return (await jsonFetch<ApiResponse<T>>(path, options)).data;
}

export type DeliveryStatus = "pending" | "success" | "failed";

export interface Webhook {
  id: number;
  workspace_id: number | null;
  user_id: number | null;
  url: string;
  event_types: string[];
  enabled: boolean;
  created_at: string | null;
  secret_hint: string | null;
  secret?: string; // present only on create / rotate (shown once)
}

export interface WebhookInput {
  url: string;
  event_types: string[];
}

export interface WebhookDelivery {
  id: number;
  subscription_id: number;
  event_id: string;
  type: string;
  payload: unknown;
  status: DeliveryStatus;
  attempts: number;
  response_code: number | null;
  error: string | null;
  created_at: string | null;
  delivered_at: string | null;
}

export function listWebhooks(): Promise<Webhook[]> {
  return unwrap<Webhook[]>("/api/v1/webhooks");
}

export function createWebhook(input: WebhookInput): Promise<Webhook> {
  return unwrap<Webhook>("/api/v1/webhooks", { method: "POST", body: JSON.stringify(input) });
}

export function updateWebhook(id: number, input: WebhookInput & { enabled: boolean }): Promise<Webhook> {
  return unwrap<Webhook>(`/api/v1/webhooks/${id}`, { method: "PUT", body: JSON.stringify(input) });
}

export function rotateSecret(id: number): Promise<Webhook> {
  return unwrap<Webhook>(`/api/v1/webhooks/${id}/rotate-secret`, { method: "POST" });
}

export function deleteWebhook(id: number): Promise<{ id: number }> {
  return unwrap<{ id: number }>(`/api/v1/webhooks/${id}`, { method: "DELETE" });
}

export function listDeliveries(id: number): Promise<WebhookDelivery[]> {
  return unwrap<WebhookDelivery[]>(`/api/v1/webhooks/${id}/deliveries`);
}

export function replayDelivery(deliveryId: number): Promise<{ delivery_id: number }> {
  return unwrap<{ delivery_id: number }>(`/api/v1/webhooks/deliveries/${deliveryId}/replay`, { method: "POST" });
}
