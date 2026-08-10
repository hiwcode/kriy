"use client";

import * as React from "react";
import { Database, GraduationCap, Plug, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AgentItem } from "@/lib/api/agents";

export type AgentCapability = {
  key: string;
  label: string;
  kind: "builtin" | "mcp" | "database" | "skill";
};

function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getAgentCapabilities(agent?: AgentItem): AgentCapability[] {
  if (!agent) return [];

  const capabilities = (agent.tools ?? []).flatMap<AgentCapability>((tool, index) => {
    if (tool.type === "builtin" && tool.name) {
      return [
        {
          key: `builtin-${index}-${tool.name}`,
          label: humanize(tool.name),
          kind: "builtin",
        },
      ];
    }

    if (tool.type === "mcp") {
      if (tool.tool_names?.length) {
        return tool.tool_names.map((name) => ({
          key: `mcp-${tool.mcp_connection_id ?? index}-${name}`,
          label: humanize(name),
          kind: "mcp" as const,
        }));
      }
      return [
        {
          key: `mcp-${tool.mcp_connection_id ?? index}`,
          label: "MCP tools",
          kind: "mcp",
        },
      ];
    }

    if (tool.type === "database") {
      return [
        {
          key: `database-${tool.database_connection_id ?? index}`,
          label: "Database",
          kind: "database",
        },
      ];
    }

    return [];
  });

  const skillCount = (agent.skill_ids ?? []).length;
  if (skillCount > 0) {
    capabilities.push({
      key: "skills",
      label: `${skillCount} ${skillCount === 1 ? "skill" : "skills"}`,
      kind: "skill",
    });
  }

  return capabilities;
}

function CapabilityIcon({ kind }: { kind: AgentCapability["kind"] }) {
  if (kind === "mcp") return <Plug aria-hidden />;
  if (kind === "database") return <Database aria-hidden />;
  if (kind === "skill") return <GraduationCap aria-hidden />;
  return <Wrench aria-hidden />;
}

export function AgentCapabilityStrip({
  agent,
  limit = 2,
  compact = false,
  className,
}: {
  agent?: AgentItem;
  limit?: number;
  compact?: boolean;
  className?: string;
}) {
  const capabilities = React.useMemo(() => getAgentCapabilities(agent), [agent]);
  if (capabilities.length === 0) {
    return compact ? null : <span className="text-[10px] text-muted-foreground">No tools</span>;
  }

  const visible = capabilities.slice(0, limit);
  const remaining = capabilities.length - visible.length;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn("flex min-w-0 flex-wrap items-center gap-1", className)}
          aria-label={`${capabilities.length} configured capabilities`}
          onClick={(event) => event.stopPropagation()}
        >
          {visible.map((capability) => (
            <Badge key={capability.key} variant="secondary" className="max-w-28">
              <CapabilityIcon kind={capability.kind} />
              <span className="truncate">{capability.label}</span>
            </Badge>
          ))}
          {remaining > 0 && <Badge variant="outline">+{remaining}</Badge>}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-72">
        <p className="mb-1 font-medium">Agent capabilities</p>
        <p>{capabilities.map((capability) => capability.label).join(" · ")}</p>
      </TooltipContent>
    </Tooltip>
  );
}
