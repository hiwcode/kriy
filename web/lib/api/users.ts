import { apiFetch } from "./client";

export interface UserInfo {
  id: number;
  email: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const USER_INFO_KEY = "atelier_user_info";

/**
 * Fetch the currently authenticated user's info from GET /api/v1/users/me.
 * Caches the result in localStorage so subsequent calls are instant.
 */
export async function getCurrentUser(): Promise<UserInfo> {
  const response = await apiFetch<UserInfo>("/api/v1/users/me", {
    method: "GET",
  });
  const user = response.data!;
  if (typeof window !== "undefined") {
    localStorage.setItem(USER_INFO_KEY, JSON.stringify(user));
  }
  return user;
}

/** Get the cached user info from localStorage (no network call). */
export function getCachedUserInfo(): UserInfo | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(USER_INFO_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as UserInfo;
  } catch {
    localStorage.removeItem(USER_INFO_KEY);
    return null;
  }
}

/** Clear cached user info (call on sign-out). */
export function clearCachedUserInfo(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(USER_INFO_KEY);
  }
}
