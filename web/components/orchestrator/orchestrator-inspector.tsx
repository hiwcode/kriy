"use client";

import Link from "next/link";
import { Bot, BrainCircuit, ExternalLink, Globe, MessageSquare, Unplug } from "lucide-react";
import { AgentCapabilityStrip, getAgentCapabilities } from "@/components/orchestrator/agent-capabilities";
import type { OrchestratorSelection } from "@/components/orchestrator/types";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AgentItem } from "@/lib/api/agents";
import { ensureExtraFields } from "@/lib/utils";

function connectedAgentCount(agent: AgentItem): number {
  const extra = ensureExtraFields(agent.extra_fields);
  const external = Array.isArray(extra.a2a_connections) ? extra.a2a_connections.length : 0;
  return (agent.sub_agent_ids ?? []).length + external;
}

export function OrchestratorInspector({
  selection,
  onChat,
  onDisconnectAgent,
  onDisconnectExternal,
}: {
  selection: OrchestratorSelection;
  onChat: (agent: AgentItem) => void;
  onDisconnectAgent: (agentId: number) => void;
  onDisconnectExternal: (url: string) => void;
}) {
  if (!selection) {
    return (
      <Empty className="h-full rounded-none border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Bot />
          </EmptyMedia>
          <EmptyTitle>Select an agent</EmptyTitle>
          <EmptyDescription>
            Choose a node to inspect its model, capabilities, and actions.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (selection.kind === "external") {
    return (
      <div className="flex h-full flex-col bg-card">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Globe className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{selection.label}</p>
            <p className="text-xs text-muted-foreground">External A2A agent</p>
          </div>
        </div>
        <Separator />
        <div className="flex flex-1 flex-col gap-5 p-4">
          <section className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Endpoint</p>
            <code className="break-all rounded-md bg-muted px-2.5 py-2 font-mono text-xs">
              {selection.url}
            </code>
          </section>
          <Button variant="outline" asChild>
            <a href={selection.url} target="_blank" rel="noreferrer">
              <ExternalLink data-icon="inline-start" />
              Open endpoint
            </a>
          </Button>
          <Button variant="outline" onClick={() => onDisconnectExternal(selection.url)}>
            <Unplug data-icon="inline-start" />
            Disconnect
          </Button>
        </div>
      </div>
    );
  }

  const agent = selection.agent;
  const isOrchestrator = agent.is_orchestrator;
  const capabilities = getAgentCapabilities(agent);

  return (
    <TooltipProvider>
      <div className="flex h-full min-w-0 flex-col bg-card">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {isOrchestrator ? <BrainCircuit className="size-4" /> : <Bot className="size-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{agent.label || agent.name}</p>
            <p className="text-xs text-muted-foreground">
              {isOrchestrator ? "Orchestrator" : "Local agent"}
            </p>
          </div>
        </div>

        <Separator />

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-5 p-4">
            {agent.description && (
              <p className="text-sm leading-relaxed text-muted-foreground">{agent.description}</p>
            )}

            <section className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">Capabilities</p>
                <span className="text-xs text-muted-foreground">{capabilities.length}</span>
              </div>
              <AgentCapabilityStrip agent={agent} limit={8} />
            </section>

            <Separator />

            <section className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Model</span>
                <code className="max-w-40 truncate font-mono text-xs">{agent.model || "Default"}</code>
              </div>
              {isOrchestrator && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Connected agents</span>
                  <span className="font-medium">{connectedAgentCount(agent)}</span>
                </div>
              )}
            </section>
          </div>
        </ScrollArea>

        <Separator />

        <div className="grid grid-cols-2 gap-2 p-3">
          <Button onClick={() => onChat(agent)}>
            <MessageSquare data-icon="inline-start" />
            Chat
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/agents/${agent.id}`}>
              <ExternalLink data-icon="inline-start" />
              Edit
            </Link>
          </Button>
          {!isOrchestrator && (
            <Button
              variant="ghost"
              className="col-span-2"
              onClick={() => onDisconnectAgent(agent.id)}
            >
              <Unplug data-icon="inline-start" />
              Disconnect from flow
            </Button>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
