import type { AgentItem } from "@/lib/api/agents";

export type OrchestratorSelection =
  | { kind: "agent"; agent: AgentItem }
  | { kind: "external"; label: string; url: string }
  | null;
