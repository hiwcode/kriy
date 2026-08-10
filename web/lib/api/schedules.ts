import { apiFetch, ApiPagination } from "./client";
import { toast } from "sonner";

export interface ScheduleItem {
  id: number;
  name: string;
  description: string | null;
  agent_id: number;
  agent_name?: string;
  message: string;
  schedule_type: "one_time" | "recurring";
  cron_expression: string | null;
  run_at: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_result: string | null;
  status: "active" | "paused" | "completed" | "failed";
  run_count: number;
  max_runs: number | null;
  max_retries: number;
  retry_count: number;
  retry_delay_seconds: number;
  next_retry_at: string | null;
  workspace_id: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface ListScheduleResult {
  items: ScheduleItem[];
  pagination: ApiPagination;
}

export async function listSchedules(params: {
  limit: number;
  offset: number;
  status?: string;
}, signal?: AbortSignal): Promise<ListScheduleResult> {
  const searchParams = new URLSearchParams();
  searchParams.set("limit", String(params.limit));
  searchParams.set("offset", String(params.offset));
  if (params.status) searchParams.set("status", params.status);

  const response = await apiFetch<ScheduleItem[]>(
    `/api/v1/schedules?${searchParams.toString()}`,
    { method: "GET", signal }
  );
  return {
    items: response.data ?? [],
    pagination: response.pagination ?? {},
  };
}

export async function createSchedule(payload: {
  name: string;
  description?: string;
  agent_id: number;
  message: string;
  schedule_type: "one_time" | "recurring";
  cron_expression?: string;
  run_at?: string;
  max_runs?: number;
}): Promise<ScheduleItem> {
  try {
    const response = await apiFetch<ScheduleItem>("/api/v1/schedules/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    toast.success("Schedule created");
    return response.data!;
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Failed to create schedule"
    );
    throw error;
  }
}

export async function updateSchedule(
  id: number,
  payload: Partial<{
    name: string;
    description: string;
    message: string;
    schedule_type: string;
    cron_expression: string;
    run_at: string;
    max_runs: number;
    status: string;
  }>
): Promise<ScheduleItem> {
  try {
    const response = await apiFetch<ScheduleItem>(
      `/api/v1/schedules/${id}`,
      { method: "PATCH", body: JSON.stringify(payload) }
    );
    toast.success("Schedule updated");
    return response.data!;
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Failed to update schedule"
    );
    throw error;
  }
}

export async function deleteSchedule(id: number): Promise<void> {
  try {
    await apiFetch<null>(`/api/v1/schedules/${id}`, { method: "DELETE" });
    toast.success("Schedule deleted");
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Failed to delete schedule"
    );
    throw error;
  }
}

export async function triggerSchedule(
  id: number
): Promise<{ status: string; result?: string; error?: string }> {
  try {
    const response = await apiFetch<{
      status: string;
      result?: string;
      error?: string;
    }>(`/api/v1/schedules/${id}/trigger`, { method: "POST" });
    toast.success("Schedule triggered");
    return response.data!;
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Failed to trigger schedule"
    );
    throw error;
  }
}
