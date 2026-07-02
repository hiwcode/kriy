/**
 * Session auth: exchange a Google credential for backend-issued tokens, refresh,
 * and logout. Decouples the session from Google's ID-token lifetime + FedCM.
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

function url(path: string): string {
  const base = API_BASE_URL.replace(/\/$/, "");
  return `${base}${path}`;
}

export interface SessionUser {
  email: string;
  name: string;
  picture?: string;
}

export interface GoogleExchangeResult {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: SessionUser;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(url(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.detail || res.statusText);
  return data as T;
}

/** Exchange a Google ID token for a backend session. */
export function exchangeGoogleCredential(credential: string): Promise<GoogleExchangeResult> {
  return postJson<GoogleExchangeResult>("/api/v1/auth/google", { credential });
}

/** Get a fresh access token from a refresh token. */
export function refreshSession(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  return postJson("/api/v1/auth/refresh", { refresh_token: refreshToken });
}

/** Revoke a refresh token (best-effort on logout). */
export function logoutSession(refreshToken: string): Promise<{ success: boolean }> {
  return postJson("/api/v1/auth/logout", { refresh_token: refreshToken });
}
