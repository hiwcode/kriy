/**
 * Notifications API: REST history + a live WebSocket.
 */

import { getAuthHeaders, getAuthToken } from "@/lib/auth";
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

export type NotificationLevel = "info" | "success" | "warning" | "error";

export interface AppNotification {
  id: number;
  title: string;
  body: string;
  level: NotificationLevel;
  source: string | null;
  link: string | null;
  read: boolean;
  created_at: string | null;
}

/** Standard API envelope used across the app. */
interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  pagination?: { limit?: number; offset?: number; total?: number; page?: number; page_size?: number } | null;
}

export interface NotificationsPage {
  items: AppNotification[];
  total: number;
}

export async function listNotifications(limit = 20, offset = 0): Promise<NotificationsPage> {
  const res = await jsonFetch<ApiResponse<AppNotification[]>>(
    `/api/v1/notifications?limit=${limit}&offset=${offset}`
  );
  return { items: res.data ?? [], total: res.pagination?.total ?? (res.data?.length ?? 0) };
}

export async function getUnreadCount(): Promise<{ unread: number }> {
  const res = await jsonFetch<ApiResponse<{ unread: number }>>("/api/v1/notifications/unread-count");
  return { unread: res.data?.unread ?? 0 };
}

export function markNotificationRead(id: number): Promise<unknown> {
  return jsonFetch(`/api/v1/notifications/${id}/read`, { method: "POST" });
}

export function markAllNotificationsRead(): Promise<{ read: number }> {
  return jsonFetch<{ read: number }>("/api/v1/notifications/read-all", { method: "POST" });
}

export interface NotificationSocketHandlers {
  onNotification?: (n: AppNotification, unread: number) => void;
  onUnread?: (unread: number) => void;
}

/**
 * Open the notifications WebSocket. Authenticates via ?token= (or ?api_key=).
 * Auto-reconnects with backoff. Returns a function to close it.
 */
export function connectNotifications(handlers: NotificationSocketHandlers): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const wsBase = API_BASE_URL.replace(/^http/, "ws").replace(/\/$/, "");

  const connect = () => {
    if (closed) return;
    const token = getAuthToken();
    const apiKey = process.env.NEXT_PUBLIC_API_KEY ?? "";
    const auth = token ? `token=${encodeURIComponent(token)}` : apiKey ? `api_key=${encodeURIComponent(apiKey)}` : "";
    if (!auth) return; // not authenticated yet

    ws = new WebSocket(`${wsBase}/api/v1/notifications/ws?${auth}`);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "notification" && msg.notification) {
          handlers.onNotification?.(msg.notification, msg.unread ?? 0);
        } else if (msg.type === "unread") {
          handlers.onUnread?.(msg.unread ?? 0);
        }
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      if (closed) return;
      retry += 1;
      const delay = Math.min(1000 * 2 ** Math.min(retry, 5), 30000); // capped backoff
      timer = setTimeout(connect, delay);
    };
    ws.onopen = () => {
      retry = 0;
    };
    ws.onerror = () => {
      ws?.close();
    };
  };

  connect();

  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    ws?.close();
  };
}
