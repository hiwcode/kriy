import { apiFetch } from "./client";

export interface ActivityItem {
  id: number;
  action: "create" | "update" | "delete" | string;
  resource_type: string;
  resource_id: string | null;
  resource_name: string | null;
  actor_email: string | null;
  actor_user_id: number | null;
  created_at: string | null;
}

export interface ActivityPage {
  items: ActivityItem[];
  total: number;
}

/** Recent create/update/delete events in the current workspace (from the audit log). */
export async function listWorkspaceActivity(
  limit = 20,
  offset = 0
): Promise<ActivityPage> {
  const res = await apiFetch<ActivityItem[]>(
    `/api/v1/activity?limit=${limit}&offset=${offset}`
  );
  return { items: res.data ?? [], total: res.pagination?.total ?? (res.data?.length ?? 0) };
}
