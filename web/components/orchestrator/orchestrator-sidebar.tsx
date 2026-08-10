"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bot,
  ChevronDown,
  Globe,
  GripVertical,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { AgentCapabilityStrip } from "@/components/orchestrator/agent-capabilities";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn, ensureExtraFields } from "@/lib/utils";
import type { AgentItem } from "@/lib/api/agents";

interface OrchestratorSidebarProps {
  orchestrators: AgentItem[];
  agents: AgentItem[];
  selectedId: number | null;
  onSelectOrchestrator: (id: number) => void;
  onConnect?: (agentId: number) => void;
  onConnectA2a?: (url: string, name: string) => void;
}

export function OrchestratorSidebar({
  orchestrators,
  agents,
  selectedId,
  onSelectOrchestrator,
  onConnect,
  onConnectA2a,
}: OrchestratorSidebarProps) {
  const [a2aUrl, setA2aUrl] = React.useState("");
  const [a2aName, setA2aName] = React.useState("");
  const [a2aOpen, setA2aOpen] = React.useState(false);
  const [a2aError, setA2aError] = React.useState<string | null>(null);
  const [agentQuery, setAgentQuery] = React.useState("");

  const selectedOrchestrator = orchestrators.find((item) => item.id === selectedId);
  const connectedIds = selectedOrchestrator?.sub_agent_ids ?? [];
  const availableAgents = agents.filter((agent) => !agent.is_orchestrator && !connectedIds.includes(agent.id));
  const query = agentQuery.trim().toLowerCase();
  const filteredAgents = availableAgents.filter((agent) =>
    `${agent.label} ${agent.name} ${agent.description ?? ""}`.toLowerCase().includes(query)
  );
  const extra = ensureExtraFields(selectedOrchestrator?.extra_fields);
  const externalConnections = (
    (extra.a2a_connections as { url?: string; name?: string }[] | undefined) ?? []
  ).filter((connection) => connection?.url);
  const connectedCount = connectedIds.length + externalConnections.length;

  const handleDragStart = (event: React.DragEvent, agentId: number) => {
    event.dataTransfer.setData("application/agent-id", String(agentId));
    event.dataTransfer.effectAllowed = "move";
  };

  const connectExternalAgent = () => {
    const url = a2aUrl.trim();
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      setA2aError("Enter a valid HTTP or HTTPS URL.");
      return;
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      setA2aError("The URL must use HTTP or HTTPS.");
      return;
    }
    if (externalConnections.some((connection) => connection.url === url)) {
      setA2aError("This external agent is already connected.");
      return;
    }

    onConnectA2a?.(url, a2aName.trim());
    setA2aUrl("");
    setA2aName("");
    setA2aError(null);
    setA2aOpen(false);
  };

  return (
    <TooltipProvider>
      <div className="flex h-full min-w-0 flex-col bg-card">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Agent library</p>
            <p className="truncate text-sm font-semibold">
              {connectedCount} connected · {availableAgents.length} available
            </p>
          </div>
          <Button asChild size="icon-sm" variant="ghost" aria-label="Create agent">
            <Link href="/agents/new">
              <Plus />
            </Link>
          </Button>
        </div>

        <Separator />

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-5 p-3">
            <section className="flex flex-col gap-2">
              <p className="px-1 text-xs font-medium text-muted-foreground">Orchestrator</p>
              {orchestrators.length === 0 ? (
                <Empty className="border p-4">
                  <EmptyHeader>
                    <EmptyTitle>No orchestrator</EmptyTitle>
                    <EmptyDescription>Create an agent and enable orchestration.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="flex flex-col gap-1">
                  {orchestrators.map((orchestrator) => (
                    <Button
                      key={orchestrator.id}
                      type="button"
                      variant={selectedId === orchestrator.id ? "secondary" : "ghost"}
                      className="h-auto w-full justify-start px-3 py-2.5"
                      onClick={() => onSelectOrchestrator(orchestrator.id)}
                    >
                      <Sparkles data-icon="inline-start" />
                      <span className="min-w-0 flex-1 truncate text-left">
                        {orchestrator.label || orchestrator.name}
                      </span>
                    </Button>
                  ))}
                </div>
              )}
            </section>

            <Separator />

            {selectedOrchestrator && (
              <section className="flex flex-col gap-3">
                <div className="flex items-end justify-between gap-2 px-1">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Available agents</p>
                    <p className="text-xs text-muted-foreground">Drag an agent onto the canvas</p>
                  </div>
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={agentQuery}
                    onChange={(event) => setAgentQuery(event.target.value)}
                    placeholder="Search agents"
                    aria-label="Search available agents"
                    className="pl-9"
                  />
                </div>

                {filteredAgents.length === 0 ? (
                  <Empty className="border p-4">
                    <EmptyHeader>
                      <EmptyTitle>{availableAgents.length === 0 ? "All agents connected" : "No matches"}</EmptyTitle>
                      <EmptyDescription>
                        {availableAgents.length === 0
                          ? "Connected agents are visible on the canvas."
                          : "Try a different name or description."}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <div className="flex flex-col gap-2">
                    {filteredAgents.map((agent) => (
                      <div
                        key={agent.id}
                        draggable
                        onDragStart={(event) => handleDragStart(event, agent.id)}
                        className="group flex cursor-grab items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-muted/40 active:cursor-grabbing"
                      >
                        <GripVertical className="size-4 shrink-0 text-muted-foreground/60" />
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <Bot className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{agent.label || agent.name}</p>
                          <AgentCapabilityStrip agent={agent} compact className="mt-1" />
                        </div>
                        {onConnect && (
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Connect ${agent.label || agent.name}`}
                            onClick={() => onConnect(agent.id)}
                          >
                            <Plus />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {onConnectA2a && (
                  <Collapsible open={a2aOpen} onOpenChange={setA2aOpen}>
                    <CollapsibleTrigger asChild>
                      <Button type="button" variant="outline" className="w-full justify-between">
                        <span className="flex items-center gap-2">
                          <Globe data-icon="inline-start" />
                          External A2A agent
                        </span>
                        <ChevronDown className={cn("transition-transform", a2aOpen && "rotate-180")} />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-3">
                      <FieldGroup className="gap-3">
                        <Field data-invalid={!!a2aError}>
                          <FieldLabel htmlFor="a2a-url">Agent URL</FieldLabel>
                          <Input
                            id="a2a-url"
                            value={a2aUrl}
                            placeholder="https://agent.example.com"
                            aria-invalid={!!a2aError}
                            onChange={(event) => {
                              setA2aUrl(event.target.value);
                              setA2aError(null);
                            }}
                          />
                          <FieldError>{a2aError}</FieldError>
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="a2a-name">Display name</FieldLabel>
                          <Input
                            id="a2a-name"
                            value={a2aName}
                            placeholder="External agent"
                            onChange={(event) => setA2aName(event.target.value)}
                          />
                        </Field>
                        <Button type="button" onClick={connectExternalAgent}>
                          <Plus data-icon="inline-start" />
                          Connect agent
                        </Button>
                      </FieldGroup>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </section>
            )}
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}
