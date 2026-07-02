/**
 * Auth token storage for API requests.
 * Persisted to localStorage until token expiry (survives tabs, browser restart).
 */

import { jwtDecode } from "jwt-decode";

let authToken: string | null = null;
let authUser: { email: string; name: string; picture?: string } | null = null;

const TOKEN_KEY = "atelier_auth_token";
const USER_KEY = "atelier_auth_user";
const REFRESH_KEY = "atelier_refresh_token";
const AUTH_MODE_KEY = "atelier_auth_mode"; // "google" = only Bearer, no API key; "anonymous" = use API key

/** Check if JWT is expired (with 5 min buffer). */
function isTokenExpired(token: string): boolean {
  try {
    const decoded = jwtDecode<{ exp?: number }>(token);
    if (!decoded.exp) return false;
    return Date.now() >= (decoded.exp - 300) * 1000;
  } catch {
    return true;
  }
}

/** Seconds until the token expires (0 if already expired). */
export function tokenExpiresIn(token?: string | null): number {
  const t = token ?? getAuthToken();
  if (!t) return 0;
  try {
    const decoded = jwtDecode<{ exp?: number }>(t);
    if (!decoded.exp) return Infinity;
    const remaining = decoded.exp - Math.floor(Date.now() / 1000);
    return remaining > 0 ? remaining : 0;
  } catch {
    return 0;
  }
}

export function getAuthToken(): string | null {
  if (authToken) {
    if (isTokenExpired(authToken)) {
      clearAuthToken();
      return null;
    }
    return authToken;
  }
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored && !isTokenExpired(stored)) {
      authToken = stored;
      return stored;
    }
    if (stored) clearAuthToken();
  }
  return null;
}

export function setAuthToken(token: string, user?: { email: string; name: string; picture?: string }): void {
  authToken = token;
  authUser = user ?? null;
  if (typeof window !== "undefined") {
    localStorage.setItem(TOKEN_KEY, token);
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      sessionStorage.setItem(AUTH_MODE_KEY, "google"); // User signed in: never fall back to API key
    } else {
      localStorage.removeItem(USER_KEY);
    }
  }
}

/** Update just the access token (e.g. after a refresh), keeping the stored user. */
export function setAccessToken(token: string): void {
  authToken = token;
  if (typeof window !== "undefined") {
    localStorage.setItem(TOKEN_KEY, token);
  }
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function setRefreshToken(token: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(REFRESH_KEY, token);
  }
}

export function clearAuthToken(): void {
  authToken = null;
  authUser = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(REFRESH_KEY);
    // Keep authMode = "google" in sessionStorage so we don't fall back to API key after logout
  }
}

/** Whether API requests should include API key. False when user signed in with Google (so logout returns 401). */
export function shouldUseApiKeyForRequests(): boolean {
  if (typeof window === "undefined") return true;
  return sessionStorage.getItem(AUTH_MODE_KEY) !== "google";
}

export function ensureAuthModeForToken(): void {
  if (typeof window === "undefined") return;
  if (getAuthToken()) {
    sessionStorage.setItem(AUTH_MODE_KEY, "google");
  }
}

export function getAuthUser(): { email: string; name: string; picture?: string } | null {
  if (authUser) return authUser;
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(USER_KEY);
    if (stored) {
      try {
        authUser = JSON.parse(stored) as { email: string; name: string; picture?: string };
        return authUser;
      } catch {
        localStorage.removeItem(USER_KEY);
      }
    }
  }
  return null;
}

/** Headers for API requests (Bearer token or empty for API key fallback). */
export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  const apiKey = process.env.NEXT_PUBLIC_API_KEY ?? "";
  if (apiKey) {
    return { "X-API-Key": apiKey };
  }
  return {};
}
