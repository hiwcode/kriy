"use client";

import * as React from "react";
import Link from "next/link";
import { Bot, Sparkles, Plus, GripVertical, X, Globe, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, ensureExtraFields } from "@/lib/utils";
import type { AgentItem } from "@/lib/api/agents";

interface OrchestratorSidebarProps {
  orchestrators: AgentItem[];
  agents: AgentItem[];
  selectedId: number | null;
  onSelectOrchestrator: (id: number) => void;
  onDisconnect?: (agentId: number) => void;
  onDisconnectA2a?: (url: string) => void;
  onConnectA2a?: (url: string, name: string) => void;
  onChatAgent?: (agent: AgentItem) => void;
}

export function OrchestratorSidebar({
  orchestrators,
  agents,
  selectedId,
  onSelectOrchestrator,
  onDisconnect,
  onDisconnectA2a,
  onConnectA2a,
  onChatAgent,
}: OrchestratorSidebarProps) {
  const [a2aUrl, setA2aUrl] = React.useState("");
  const [a2aName, setA2aName] = React.useState("");
  const subAgents = agents.filter((a) => !a.is_orchestrator);
  const selectedOrchestrator = orchestrators.find((o) => o.id === selectedId);
  const connectedIds = selectedOrchestrator?.sub_agent_ids ?? [];
  const availableSubAgents = subAgents.filter((a) => !connectedIds.includes(a.id));
  const connectedSubAgents = subAgents.filter((a) => connectedIds.includes(a.id));
  const extra = ensureExtraFields(selectedOrchestrator?.extra_fields);
  const a2aConnections = ((extra.a2a_connections as { url?: string; name?: string }[]) ?? []).filter(
    (c) => c?.url
  );

  const handleDragStart = (e: React.DragEvent, agentId: number) => {
    e.dataTransfer.setData("application/agent-id", String(agentId));
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="flex h-full min-w-0 w-full flex-col gap-4 overflow-auto">
      <div className="flex items-center gap-2.5 border-b border-border p-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold leading-tight text-foreground">Orchestrators</h3>
          <p className="text-xs text-muted-foreground">
            {orchestrators.length} available · select to design
          </p>
        </div>
      </div>

      <ScrollArea className="flex-1 px-2">
        <div className="space-y-1.5 pb-4">
          {orchestrators.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-center text-sm text-muted-foreground">
              No orchestrators yet. Create an agent and mark it as an orchestrator.
            </div>
          ) : (
            orchestrators.map((o) => (
              <div
                key={o.id}
                className={cn(
                  "flex items-center gap-1 rounded-lg border pr-1 transition-colors",
                  selectedId === o.id
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectOrchestrator(o.id)}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left",
                    selectedId === o.id ? "text-primary" : "text-foreground"
                  )}
                >
                  <Sparkles className="size-4 shrink-0" />
                  <span className="truncate font-medium">{o.label || o.name}</span>
                </button>
                {onChatAgent && (
                  <button
                    type="button"
                    onClick={() => onChatAgent(o)}
                    title="Chat with orchestrator"
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  >
                    <MessageSquare className="size-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {selectedOrchestrator && (
          <div className="space-y-2 border-t border-border pt-4">
            <h4 className=" text-sm font-medium text-foreground">
              Sub-agents
            </h4>
            <p className=" text-xs text-muted-foreground">
              Drag onto canvas to connect
            </p>
            <div className="space-y-2">
              {availableSubAgents.length === 0 ? (
                <p className=" text-sm text-muted-foreground">
                  All agents connected
                </p>
              ) : (
                availableSubAgents.map((a) => (
                  <div
                    key={a.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, a.id)}
                    className="group flex cursor-grab items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 shadow-sm transition-shadow hover:border-primary/50 hover:shadow active:cursor-grabbing"
                  >
                    <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                    <Bot className="size-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate text-sm font-medium">
                      {a.label || a.name}
                    </span>
                    {onChatAgent && (
                      <button
                        type="button"
                        onClick={() => onChatAgent(a)}
                        title="Chat with agent"
                        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-primary/10 hover:text-primary group-hover:opacity-100"
                      >
                        <MessageSquare className="size-3.5" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {(connectedSubAgents.length > 0 || a2aConnections.length > 0) && (onDisconnect || onDisconnectA2a) && (
              <div className="space-y-2 border-t border-border pt-4 mt-4">
                <h4 className=" text-sm font-medium text-foreground">
                  Connected
                </h4>
                <p className=" text-xs text-muted-foreground">
                  Click remove to disconnect
                </p>
                <div className="space-y-2">
                  {connectedSubAgents.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2"
                    >
                      <Bot className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate flex-1 text-sm font-medium">
                        {a.label || a.name}
                      </span>
                      {onChatAgent && (
                        <button
                          type="button"
                          onClick={() => onChatAgent(a)}
                          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                          title="Chat with agent"
                        >
                          <MessageSquare className="size-3.5" />
                        </button>
                      )}
                      {onDisconnect && (
                        <button
                          type="button"
                          onClick={() => onDisconnect(a.id)}
                          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title="Remove sub-agent"
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {a2aConnections.map((c) => (
                    <div
                      key={c.url}
                      className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2"
                    >
                      <Globe className="size-4 shrink-0 text-muted-foreground" aria-label="External A2A" />
                      <span className="truncate flex-1 text-sm font-medium">
                        {c.name || "External"}
                      </span>
                      {onDisconnectA2a && (
                        <button
                          type="button"
                          onClick={() => onDisconnectA2a(c.url!)}
                          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title="Remove external A2A"
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {onConnectA2a && (
              <div className="space-y-2 border-t border-border pt-4 mt-4">
                <h4 className="text-sm font-medium text-foreground">
                  Connect external A2A
                </h4>
                <p className="text-xs text-muted-foreground">
                  Add agent by URL (Agent-to-Agent protocol)
                </p>
                <div className="space-y-2">
                  <Input
                    placeholder="https://agent.example.com"
                    value={a2aUrl}
                    onChange={(e) => setA2aUrl(e.target.value)}
                    className="text-sm"
                  />
                  <Input
                    placeholder="Display name"
                    value={a2aName}
                    onChange={(e) => setA2aName(e.target.value)}
                    className="text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      const url = a2aUrl.trim();
                      if (!url) return;
                      onConnectA2a(url, a2aName.trim());
                      setA2aUrl("");
                      setA2aName("");
                    }}
                  >
                    <Globe className="size-4 mr-2" />
                    Add external agent
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      <div className="border-t border-border p-4">
        <Button variant="outline" className="w-full" asChild>
          <Link href="/agents/new">
            <Plus className="size-4 mr-2" />
            New Agent
          </Link>
        </Button>
      </div>
    </div>
  );
}
