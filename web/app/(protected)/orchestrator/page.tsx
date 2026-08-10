"use client";

import * as React from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { PageLayout } from "@/components/ui/page-layout";
import { Button } from "@/components/ui/button";
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
import { Bot, Plus, ArrowRight, Sparkles, X, MousePointerClick } from "lucide-react";
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
import { AgentCapabilityStrip } from "@/components/orchestrator/agent-capabilities";
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
        .then(setSelected)
        .catch(() => setSelected(null));
    } else {
      setSelected(null);
    }
  }, [selectedId]);

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
          setSelected(updated);
          setOrchestrators((prev) =>
            prev.map((o) => (o.id === updated.id ? updated : o))
          );
          toast.success("Agent connected");
        })
        .catch((error) => toast.error(error instanceof Error ? error.message : "Could not connect agent"));
    },
    [selected]
  );

  const handleDisconnect = React.useCallback(
    (agentId: number) => {
      if (!selected) return;
      const next = (selected.sub_agent_ids ?? []).filter((id) => id !== agentId);
      updateAgent(selected.id, { sub_agent_ids: next }, { notify: false })
        .then((updated) => {
          setSelected(updated);
          setOrchestrators((prev) =>
            prev.map((o) => (o.id === updated.id ? updated : o))
          );
          toast.success("Agent disconnected");
        })
        .catch((error) => toast.error(error instanceof Error ? error.message : "Could not disconnect agent"));
    },
    [selected]
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
          setSelected(updated);
          setOrchestrators((prev) =>
            prev.map((o) => (o.id === updated.id ? updated : o))
          );
          toast.success("External agent disconnected");
        })
        .catch((error) => toast.error(error instanceof Error ? error.message : "Could not disconnect external agent"));
    },
    [selected]
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
          setSelected(updated);
          setOrchestrators((prev) =>
            prev.map((o) => (o.id === updated.id ? updated : o))
          );
          toast.success("External agent connected");
        })
        .catch((error) => toast.error(error instanceof Error ? error.message : "Could not connect external agent"));
    },
    [selected]
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
          setSelected(updated);
          setOrchestrators((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        })
        .catch(() => toast.error("Could not save the canvas layout"));
    },
    [selected]
  );

  if (loading) {
    return (
      <AppLayout>
        <PageLayout title="Orchestration" subtitle="Design and inspect multi-agent flows.">
          <div className="flex h-[calc(100vh-14rem)] gap-4">
            <div className="w-72 shrink-0 animate-pulse rounded-xl border bg-card" />
            <div className="flex-1 animate-pulse rounded-xl border bg-card" />
          </div>
        </PageLayout>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageLayout
        title="Orchestration"
        subtitle="Coordinate specialized agents in a visual execution flow."
        actions={
          <Button asChild>
            <Link href="/agents/new">
              <Plus className="size-4 mr-2" />
              New orchestrator
            </Link>
          </Button>
        }
      >
        <div className="flex h-[calc(100vh-14rem)] overflow-hidden rounded-xl border bg-card shadow-sm">
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize={320} minSize={260} maxSize={420}>
              <OrchestratorSidebar
                orchestrators={orchestrators}
                agents={agents}
                selectedId={selectedId}
                onSelectOrchestrator={setSelectedId}
                onDisconnect={handleDisconnect}
                onDisconnectA2a={handleDisconnectA2a}
                onConnectA2a={handleConnectA2a}
                onChatAgent={openChat}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={900} minSize={400}>
              <div className="relative h-full">
                <OrchestratorFlow
                  orchestrator={selected}
                  agents={agents}
                  onConnect={handleConnect}
                  onDisconnect={handleDisconnect}
                  onDisconnectA2a={handleDisconnectA2a}
                  onChatAgent={openChat}
                  onSaveLayout={handleSaveLayout}
                />
                {selected && (
                  <div className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full border bg-background/85 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
                    <MousePointerClick className="size-3.5 text-primary" />
                    Click to chat · hover capabilities for details
                  </div>
                )}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
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
                        <ArrowRight className="size-4" />
                        Edit
                      </Link>
                    </Button>
                  )}
                  <SheetClose asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="Close chat">
                      <X className="size-4" />
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
