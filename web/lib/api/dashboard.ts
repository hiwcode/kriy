import { apiFetch } from "./client";

export interface DashboardStats {
  active_agents: number;
  total_prompts: number;
  conversations: number;
  tokens_used: number;
  estimated_cost: number;
}

export interface DashboardUsageDay {
  name: string;
  tokens: number;
  conversations: number;
}

export interface DashboardAgent {
  id: number;
  name: string;
  session_count: number;
  last_active: number | null;
  url: string;
}

export interface TokensPerAgent {
  id: number;
  name: string;
  model?: string | null;
  input_tokens: number;
  output_tokens: number;
  tokens: number;
  estimated_cost: number;
}

export interface DashboardActivity {
  id: string;
  type: "conversation" | "prompt" | "memory";
  agent: string;
  title: string;
  timestamp: number;
  url: string;
}

export interface DashboardData {
  stats: DashboardStats;
  usage_data: DashboardUsageDay[];
  agent_performance: { name: string; tasks: number }[];
  tokens_per_agent: TokensPerAgent[];
  agents: DashboardAgent[];
  recent_activity: DashboardActivity[];
}

export async function getDashboard(): Promise<DashboardData> {
  const response = await apiFetch<DashboardData>(
    `/api/v1/dashboard`,
    { method: "GET" }
  );
  return response.data!;
}
