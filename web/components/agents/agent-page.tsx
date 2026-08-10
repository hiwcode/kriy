"use client";

import * as React from "react";
import { History, Puzzle, Settings2, MessageSquare, Bot, Eye } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { TabLayout, TabConfig } from "@/components/ui/tab-layout";
import { ChatBox, Message } from "@/components/ui/chat-box";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";

// History item type
interface HistoryItem {
  id: string;
  title: string;
  preview: string;
  messages: number;
  tokens: number;
  date: string;
  status: "completed" | "error" | "cancelled";
}

// Sample history data
const sampleHistory: HistoryItem[] = [
  {
    id: "1",
    title: "Code review discussion",
    preview: "Can you review this React component...",
    messages: 12,
    tokens: 2450,
    date: "2024-01-15 14:30",
    status: "completed",
  },
  {
    id: "2",
    title: "Debug async function",
    preview: "I'm having issues with this async...",
    messages: 8,
    tokens: 1820,
    date: "2024-01-15 11:20",
    status: "completed",
  },
  {
    id: "3",
    title: "API integration help",
    preview: "How do I integrate with the REST API...",
    messages: 15,
    tokens: 3200,
    date: "2024-01-14 16:45",
    status: "completed",
  },
  {
    id: "4",
    title: "Database query optimization",
    preview: "This query is running slow...",
    messages: 6,
    tokens: 980,
    date: "2024-01-14 09:15",
    status: "error",
  },
  {
    id: "5",
    title: "TypeScript generics question",
    preview: "Can you explain how generics work...",
    messages: 10,
    tokens: 1650,
    date: "2024-01-13 13:00",
    status: "completed",
  },
];

// History columns
const historyColumns: ColumnDef<HistoryItem>[] = [
  {
    accessorKey: "title",
    header: "Title",
    cell: ({ row }) => (
      <div>
        <p className="font-medium">{row.original.title}</p>
        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
          {row.original.preview}
        </p>
      </div>
    ),
  },
  {
    accessorKey: "messages",
    header: "Messages",
    cell: ({ row }) => <span>{row.original.messages}</span>,
  },
  {
    accessorKey: "tokens",
    header: "Tokens",
    cell: ({ row }) => <span>{row.original.tokens.toLocaleString()}</span>,
  },
  {
    accessorKey: "date",
    header: "Date",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.status;
      return (
        <span
          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
            status === "completed"
              ? "bg-green-500/10 text-green-500"
              : status === "error"
                ? "bg-red-500/10 text-red-500"
                : "bg-yellow-500/10 text-yellow-500"
          }`}
        >
          {status}
        </span>
      );
    },
  },
  {
    id: "actions",
    header: "",
    cell: () => (
      <Button variant="ghost" size="sm">
        <Eye className="size-4 mr-1" />
        View
      </Button>
    ),
  },
];

// Chat tab with actual ChatBox component
function ChatTab({ agentName }: { agentName: string }) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  const handleSendMessage = (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    setIsLoading(true);
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `This is a simulated response from ${agentName}. Replace this with actual API integration.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="h-[calc(100vh-16rem)] rounded-lg border border-border bg-card">
      <ChatBox
        messages={messages}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
        placeholder={`Message ${agentName}...`}
        emptyState={
          <div className="text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Bot className="size-6 text-primary" />
            </div>
            <h3 className="font-medium text-foreground">{agentName}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Start a conversation with {agentName}
            </p>
          </div>
        }
      />
    </div>
  );
}

function HistoryContent() {
  return (
    <DataTable
      columns={historyColumns}
      data={sampleHistory}
      searchPlaceholder="Search conversations..."
      selectable={true}
      onDeleteSelected={() => {}}
      pagination={true}
      pageSize={10}
      emptyState={
        <div className="text-center py-8">
          <History className="mx-auto size-8 text-muted-foreground mb-2" />
          <p className="text-muted-foreground">No conversation history yet</p>
        </div>
      }
    />
  );
}

function MCPContent({ agentName }: { agentName: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-lg font-medium text-foreground">MCP</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Configure Model Context Protocol settings for {agentName}.
      </p>
    </div>
  );
}

function ConfigurationContent({ agentName }: { agentName: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-lg font-medium text-foreground">Configuration</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Configure {agentName} behavior, model selection, and other settings.
      </p>
    </div>
  );
}

interface AgentPageProps {
  agentId: string;
  agentName: string;
}

export function AgentPage({ agentId, agentName }: AgentPageProps) {
  const config: TabConfig = {
    id: agentId,
    tabName: agentName,
    items: [
      {
        id: "configuration",
        name: "Configuration",
        icon: <Settings2 className="size-4" />,
        component: <ConfigurationContent agentName={agentName} />,
      },
      {
        id: "chat",
        name: "Chat",
        icon: <MessageSquare className="size-4" />,
        component: <ChatTab agentName={agentName} />,
      },
      {
        id: "history",
        name: "History",
        icon: <History className="size-4" />,
        component: <HistoryContent />,
      },
      {
        id: "mcp",
        name: "MCP",
        icon: <Puzzle className="size-4" />,
        component: <MCPContent agentName={agentName} />,
      },
    ],
  };

  return <TabLayout config={config} />;
}
