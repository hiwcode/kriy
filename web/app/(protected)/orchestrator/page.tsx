"use client";

import * as React from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { PageLayout } from "@/components/ui/page-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChatBox, Message, type ChatCard } from "@/components/ui/chat-box";
import { upsertCards } from "@/components/chat/chat-cards";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  SheetClose,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ResizableDrawer } from "@/components/ui/resizable-drawer";
import { Bot, BrainCircuit, Plus, ArrowRight, Sparkles, X, MessageSquare, Settings2 } from "lucide-react";
import {
  listAgents,
  getAgent,
  updateAgent,
  runAgentStream,
  confirmToolStream,
  AgentItem,
} from "@/lib/api/agents";
import { OrchestratorFlow } from "@/components/orchestrator/orchestrator-flow";
import { OrchestratorSidebar } from "@/components/orchestrator/orchestrator-sidebar";
import { OrchestratorInspector } from "@/components/orchestrator/orchestrator-inspector";
import type { OrchestratorSelection } from "@/components/orchestrator/types";
import { AgentCapabilityStrip } from "@/components/orchestrator/agent-capabilities";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { ensureExtraFields } from "@/lib/utils";
import { toast } from "sonner";

export default function OrchestratorPage() {
  const [agents, setAgents] = React.useState<AgentItem[]>([]);
  const [orchestrators, setOrchestrators] = React.useState<AgentItem[]>([]);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [selected, setSelected] = React.useState<AgentItem | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [chatAgent, setChatAgent] = React.useState<AgentItem | null>(null);
  const [chatOpen, setChatOpen] = React.useState(false);
  const [inspected, setInspected] = React.useState<OrchestratorSelection>(null);
  const [mobilePanel, setMobilePanel] = React.useState("canvas");
  const isMobile = useIsMobile();

  const openChat = React.useCallback((agent: AgentItem) => {
    setChatAgent((prev) => {
      if (prev?.id !== agent.id) {
        setMessages([]);
        setSessionId(null);
      }
      return agent;
    });
    setChatOpen(true);
  }, []);

  React.useEffect(() => {
    listAgents({ limit: 200, offset: 0 })
      .then((r) => {
        const orch = r.items.filter((a) => a.is_orchestrator);
        setAgents(r.items);
        setOrchestrators(orch);
        setSelectedId((prev) => (prev === null && orch.length > 0 ? orch[0].id : prev));
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Could not load orchestration");
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    if (selectedId) {
      getAgent(selectedId)
        .then((agent) => {
          setSelected(agent);
          setInspected({ kind: "agent", agent });
        })
        .catch(() => {
          setSelected(null);
          setInspected(null);
        });
    } else {
      setSelected(null);
      setInspected(null);
    }
  }, [selectedId]);

  const applyUpdatedOrchestrator = React.useCallback((updated: AgentItem) => {
    setSelected(updated);
    setOrchestrators((prev) =>
      prev.map((orchestrator) => (orchestrator.id === updated.id ? updated : orchestrator))
    );
    setInspected((current) =>
      current?.kind === "agent" && current.agent.id === updated.id
        ? { kind: "agent", agent: updated }
        : current
    );
  }, []);

  const handleSendMessage = async (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, assistantMessage]);

    if (chatAgent) {
      try {
        let fullText = "";
        for await (const chunk of runAgentStream(chatAgent.id, {
          message: content,
          session_id: sessionId,
        })) {
          if (chunk.type === "session" && chunk.session_id) {
            setSessionId(chunk.session_id);
          }
          if (chunk.type === "text" && chunk.text) {
            fullText += chunk.text;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId ? { ...m, content: fullText } : m
              )
            );
          }
          if (chunk.type === "error" && chunk.error) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: `Error: ${chunk.error}` }
                  : m
              )
            );
          }
          if (chunk.type === "card" && chunk.card) {
            const card = chunk.card as ChatCard;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, cards: upsertCards(m.cards, card) }
                  : m
              )
            );
          }
          if (chunk.type === "tool_confirmation" && chunk.function_call_id) {
            setMessages((prev) => [
              ...prev,
              {
                id: `conf-${chunk.function_call_id}`,
                role: "assistant" as const,
                content: "",
                toolConfirmation: {
                  function_call_id: chunk.function_call_id!,
                  hint: chunk.hint || "Approve this action?",
                  tool_name: chunk.tool_name || "",
                  args: chunk.args || {},
                },
              },
            ]);
          }
        }
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content: `Error: ${err instanceof Error ? err.message : "Failed to run"}`,
                }
              : m
          )
        );
      }
    } else {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? { ...m, content: "Select an agent to chat with." }
            : m
        )
      );
    }
    setIsLoading(false);
  };

  const handleToolConfirmation = async (functionCallId: string, confirmed: boolean) => {
    if (!chatAgent || !sessionId) {
      toast.error("The agent session is no longer available. Start a new message and try again.");
      return;
    }

    const resumeMessageId = `resume-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: resumeMessageId, role: "assistant", content: "", timestamp: new Date() },
    ]);
    setIsLoading(true);
    try {
      let fullText = "";
      for await (const chunk of confirmToolStream(chatAgent.id, {
        session_id: sessionId,
        function_call_id: functionCallId,
        confirmed,
      })) {
        if (chunk.type === "text" && chunk.text) {
          fullText += chunk.text;
          setMessages((prev) =>
            prev.map((message) =>
              message.id === resumeMessageId ? { ...message, content: fullText } : message
            )
          );
        }
        if (chunk.type === "card" && chunk.card) {
          const card = chunk.card as ChatCard;
          setMessages((prev) =>
            prev.map((message) =>
              message.id === resumeMessageId
                ? { ...message, cards: upsertCards(message.cards, card) }
                : message
            )
          );
        }
        if (chunk.type === "error" && chunk.error) {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === resumeMessageId
                ? { ...message, content: `Error: ${chunk.error}` }
                : message
            )
          );
        }
        if (chunk.type === "tool_confirmation" && chunk.function_call_id) {
          setMessages((prev) => [
            ...prev,
            {
              id: `conf-${chunk.function_call_id}`,
              role: "assistant" as const,
              content: "",
              toolConfirmation: {
                function_call_id: chunk.function_call_id!,
                hint: chunk.hint || "Approve this action?",
                tool_name: chunk.tool_name || "",
                args: chunk.args || {},
              },
            },
          ]);
        }
      }
    } catch (error) {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === resumeMessageId
            ? {
                ...message,
                content: `Error: ${error instanceof Error ? error.message : "Could not resume the agent"}`,
              }
            : message
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = React.useCallback(
    (agentId: number) => {
      if (!selected) return;
      const next = Array.from(new Set([...(selected.sub_agent_ids ?? []), agentId]));
      updateAgent(selected.id, { sub_agent_ids: next }, { notify: false })
        .then((updated) => {
          applyUpdatedOrchestrator(updated);
          toast.success("Agent connected");
        })
        .catch((error) => toast.error(error instanceof Error ? error.message : "Could not connect agent"));
    },
    [applyUpdatedOrchestrator, selected]
  );

  const handleDisconnect = React.useCallback(
    (agentId: number) => {
      if (!selected) return;
      const next = (selected.sub_agent_ids ?? []).filter((id) => id !== agentId);
      updateAgent(selected.id, { sub_agent_ids: next }, { notify: false })
        .then((updated) => {
          applyUpdatedOrchestrator(updated);
          setInspected({ kind: "agent", agent: updated });
          toast.success("Agent disconnected");
        })
        .catch((error) => toast.error(error instanceof Error ? error.message : "Could not disconnect agent"));
    },
    [applyUpdatedOrchestrator, selected]
  );

  const handleDisconnectA2a = React.useCallback(
    (url: string) => {
      if (!selected) return;
      const extra = ensureExtraFields(selected.extra_fields);
      const list = ((extra.a2a_connections as { url?: string; name?: string }[]) ?? []).filter(
        (c) => c?.url !== url
      );
      updateAgent(selected.id, {
        extra_fields: { ...extra, a2a_connections: list },
      }, { notify: false })
        .then((updated) => {
          applyUpdatedOrchestrator(updated);
          setInspected({ kind: "agent", agent: updated });
          toast.success("External agent disconnected");
        })
        .catch((error) => toast.error(error instanceof Error ? error.message : "Could not disconnect external agent"));
    },
    [applyUpdatedOrchestrator, selected]
  );

  const handleConnectA2a = React.useCallback(
    (url: string, name: string) => {
      if (!selected) return;
      const extra = ensureExtraFields(selected.extra_fields);
      const list = ((extra.a2a_connections as { url?: string; name?: string }[]) ?? []).slice();
      if (list.some((c) => c?.url === url.trim())) return;
      list.push({ url: url.trim(), name: (name || "external_agent").trim() || "external_agent" });
      updateAgent(selected.id, {
        extra_fields: { ...extra, a2a_connections: list },
      }, { notify: false })
        .then((updated) => {
          applyUpdatedOrchestrator(updated);
          toast.success("External agent connected");
        })
        .catch((error) => toast.error(error instanceof Error ? error.message : "Could not connect external agent"));
    },
    [applyUpdatedOrchestrator, selected]
  );

  const handleSaveLayout = React.useCallback(
    (positions: Record<string, { x: number; y: number }>) => {
      if (!selected) return;
      const extra = ensureExtraFields(selected.extra_fields);
      updateAgent(
        selected.id,
        { extra_fields: { ...extra, orchestrator_layout: positions } },
        { notify: false }
      )
        .then((updated) => {
          applyUpdatedOrchestrator(updated);
        })
        .catch(() => toast.error("Could not save the canvas layout"));
    },
    [applyUpdatedOrchestrator, selected]
  );

  if (loading) {
    return (
      <AppLayout>
        <PageLayout title="Orchestration studio" subtitle="Design and inspect multi-agent flows.">
          <div className="flex h-[calc(100dvh-14rem)] min-h-[560px] gap-2">
            <Skeleton className="w-72 shrink-0 rounded-xl" />
            <Skeleton className="flex-1 rounded-xl" />
            <Skeleton className="w-72 shrink-0 rounded-xl" />
          </div>
        </PageLayout>
      </AppLayout>
    );
  }

  const selectedExtra = ensureExtraFields(selected?.extra_fields);
  const externalCount = Array.isArray(selectedExtra.a2a_connections)
    ? selectedExtra.a2a_connections.length
    : 0;
  const connectedCount = (selected?.sub_agent_ids ?? []).length + externalCount;

  const library = (
    <OrchestratorSidebar
      orchestrators={orchestrators}
      agents={agents}
      selectedId={selectedId}
      onSelectOrchestrator={setSelectedId}
      onConnect={handleConnect}
      onConnectA2a={handleConnectA2a}
    />
  );

  const canvas = (
    <OrchestratorFlow
      orchestrator={selected}
      agents={agents}
      onConnect={handleConnect}
      onDisconnect={handleDisconnect}
      onDisconnectA2a={handleDisconnectA2a}
      onSelect={(selection) => {
        setInspected(selection);
        if (isMobile) setMobilePanel("inspector");
      }}
      onSaveLayout={handleSaveLayout}
    />
  );

  const inspector = (
    <OrchestratorInspector
      selection={inspected}
      onChat={openChat}
      onDisconnectAgent={handleDisconnect}
      onDisconnectExternal={handleDisconnectA2a}
    />
  );

  return (
    <AppLayout>
      <PageLayout
        title="Orchestration studio"
        subtitle="Compose a team of specialized agents, inspect their capabilities, and test the flow."
        actions={
          <Button asChild>
            <Link href="/agents/new">
              <Plus data-icon="inline-start" />
              New orchestrator
            </Link>
          </Button>
        }
      >
        <div className="flex h-[calc(100dvh-14rem)] min-h-[560px] flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex min-h-14 items-center justify-between gap-3 border-b px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BrainCircuit className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {selected?.label || selected?.name || "Select an orchestrator"}
                </p>
                <p className="text-xs text-muted-foreground">Canvas changes save automatically</p>
              </div>
              {selected && <Badge variant="outline">{connectedCount} connected</Badge>}
            </div>
            {selected && (
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => openChat(selected)}>
                  <MessageSquare data-icon="inline-start" />
                  <span className="hidden sm:inline">Test flow</span>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/agents/${selected.id}`}>
                    <Settings2 data-icon="inline-start" />
                    <span className="hidden sm:inline">Configure</span>
                  </Link>
                </Button>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1">
            {isMobile ? (
              <Tabs
                value={mobilePanel}
                onValueChange={setMobilePanel}
                className="flex h-full flex-col gap-0"
              >
                <TabsList className="m-2 grid w-auto grid-cols-3">
                  <TabsTrigger value="library">Agents</TabsTrigger>
                  <TabsTrigger value="canvas">Canvas</TabsTrigger>
                  <TabsTrigger value="inspector">Inspector</TabsTrigger>
                </TabsList>
                <TabsContent value="library" className="min-h-0 flex-1">{library}</TabsContent>
                <TabsContent value="canvas" className="min-h-0 flex-1">{canvas}</TabsContent>
                <TabsContent value="inspector" className="min-h-0 flex-1">{inspector}</TabsContent>
              </Tabs>
            ) : (
              <ResizablePanelGroup orientation="horizontal">
                <ResizablePanel defaultSize={280} minSize={240} maxSize={340}>
                  {library}
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel defaultSize={760} minSize={420}>
                  {canvas}
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel defaultSize={300} minSize={260} maxSize={380}>
                  {inspector}
                </ResizablePanel>
              </ResizablePanelGroup>
            )}
          </div>
        </div>

        {/* Chat overlay — lockClose so an in-progress run isn't lost by an accidental dismiss */}
        <ResizableDrawer open={chatOpen} onOpenChange={setChatOpen} defaultWidth={560} lockClose>
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    {chatAgent?.is_orchestrator ? (
                      <Sparkles className="size-[18px]" />
                    ) : (
                      <Bot className="size-[18px]" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <SheetTitle className="truncate text-base">
                      {chatAgent?.label || chatAgent?.name || "Chat"}
                    </SheetTitle>
                    <SheetDescription className="text-xs">
                      {chatAgent?.is_orchestrator ? "Orchestrator" : "Agent"}
                    </SheetDescription>
                    <AgentCapabilityStrip agent={chatAgent ?? undefined} compact limit={3} className="mt-1.5" />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {chatAgent && (
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/agents/${chatAgent.id}`}>
                        <ArrowRight data-icon="inline-start" />
                        Edit
                      </Link>
                    </Button>
                  )}
                  <SheetClose asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="Close chat">
                      <X />
                    </Button>
                  </SheetClose>
                </div>
              </div>
              <div className="min-h-0 flex-1">
                {chatAgent && (
                  <ChatBox
                    messages={messages}
                    onSendMessage={handleSendMessage}
                    onToolConfirmation={handleToolConfirmation}
                    isLoading={isLoading}
                    placeholder={`Message ${chatAgent.label || chatAgent.name}...`}
                    emptyState={
                      <div className="py-8 text-center">
                        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10">
                          {chatAgent.is_orchestrator ? (
                            <Sparkles className="size-6 text-primary" />
                          ) : (
                            <Bot className="size-6 text-primary" />
                          )}
                        </div>
                        <h3 className="font-medium text-foreground">
                          {chatAgent.label || chatAgent.name}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {chatAgent.is_orchestrator
                            ? `${(chatAgent.sub_agent_ids ?? []).length +
                                (Array.isArray((chatAgent.extra_fields as Record<string, unknown>)?.a2a_connections)
                                  ? ((chatAgent.extra_fields as Record<string, unknown>).a2a_connections as unknown[]).length
                                  : 0)} sub-agent(s) connected`
                            : "Start a conversation"}
                        </p>
                      </div>
                    }
                  />
                )}
              </div>
            </div>
        </ResizableDrawer>
      </PageLayout>
    </AppLayout>
  );
}
