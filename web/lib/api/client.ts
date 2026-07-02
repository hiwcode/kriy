export interface ApiPagination {
  limit?: number;
  offset?: number;
  total?: number;
  page?: number;
  page_size?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  pagination?: ApiPagination | null;
}

import { getAuthToken, shouldUseApiKeyForRequests } from "@/lib/auth";
import { getWorkspaceHeaders } from "@/lib/api/workspaces";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? "";

function buildUrl(path: string): string {
  const base = API_BASE_URL.replace(/\/$/, "");
  if (path.startsWith("http")) return path;
  if (path.startsWith("/")) return `${base}${path}`;
  return `${base}/${path}`;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  // Only send API key when user has not signed in with Google (avoids data after logout)
  if (!headers.has("X-API-Key") && API_KEY && shouldUseApiKeyForRequests()) {
    headers.set("X-API-Key", API_KEY);
  }
  if (!headers.has("Authorization")) {
    const token = getAuthToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }
  // Workspace context for collaborative features
  const wsHeaders = getWorkspaceHeaders();
  for (const [k, v] of Object.entries(wsHeaders)) {
    if (!headers.has(k)) headers.set(k, v);
  }

  const response = await fetch(buildUrl(path), {
    ...options,
    headers,
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as ApiResponse<T>) : null;

  if (!response.ok) {
    const message =
      (data as { message?: string; detail?: string })?.message ||
      (data as { message?: string; detail?: string })?.detail ||
      response.statusText;
    throw new Error(message);
  }

  if (!data) {
    throw new Error("Empty response from server");
  }

  if (!data.success) {
    throw new Error(data.message || "Request failed");
  }

  return data;
}
