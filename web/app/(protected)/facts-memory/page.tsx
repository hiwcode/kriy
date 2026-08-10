"use client";

import * as React from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { TabLayout, TabConfig } from "@/components/ui/tab-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listAgents,
  listAgentMemories,
  syncAgentMemories,
  createAgentMemory,
  deleteAgentMemory,
  AgentItem,
  AgentMemoryItem,
} from "@/lib/api/agents";
import {
  Plus,
  RefreshCw,
  Trash2,
  MemoryStick,
  Search,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MEMORY_TYPE_LABELS: Record<string, string> = {
  fact: "Fact",
  preference: "Preference",
  goal: "Goal",
  decision: "Decision",
};

const MEMORY_TYPE_STYLES: Record<string, string> = {
  fact: "bg-info/10 text-info",
  preference: "bg-primary/10 text-primary",
  goal: "bg-success/10 text-success",
  decision: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

const MEMORY_TYPES = ["fact", "preference", "goal", "decision"] as const;

const PAGE_SIZE = 30;

function AgentFactsContent({ agent }: { agent: AgentItem }) {
  const [memories, setMemories] = React.useState<AgentMemoryItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [addContent, setAddContent] = React.useState("");
  const [addType, setAddType] = React.useState<string>("fact");
  const [adding, setAdding] = React.useState(false);
  const [page, setPage] = React.useState(0);
  const [total, setTotal] = React.useState(0);
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");

  const fetchMemories = React.useCallback(() => {
    setLoading(true);
    listAgentMemories(agent.id, {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      search: search || undefined,
    })
      .then(({ items, pagination }) => {
        setMemories(items);
        setTotal(pagination.total ?? 0);
      })
      .catch(() => {
        setMemories([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [agent.id, page, search]);

  React.useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  // Debounced search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setPage(0);
      setSearch(searchInput);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleSync = () => {
    setSyncing(true);
    syncAgentMemories(agent.id, true)
      .then(() => fetchMemories())
      .finally(() => setSyncing(false));
  };

  const handleAdd = () => {
    if (!addContent.trim()) return;
    setAdding(true);
    createAgentMemory(agent.id, { content: addContent.trim(), memory_type: addType })
      .then(() => {
        fetchMemories();
        setAddOpen(false);
        setAddContent("");
        setAddType("fact");
      })
      .finally(() => setAdding(false));
  };

  const handleDelete = (memoryId: number) => {
    deleteAgentMemory(agent.id, memoryId).then(() => fetchMemories());
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={`Search ${agent.label || agent.name} facts…`}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            Add fact
          </Button>
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
            {syncing ? "Extracting…" : "Sync from sessions"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border bg-card" />
          ))}
        </div>
      ) : memories.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <MemoryStick className="size-7" />
          </div>
          <p className="mb-1 font-medium">
            {search ? "No facts match your search" : "No facts yet"}
          </p>
          {!search && (
            <>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                Add facts manually or extract them from sessions. The agent remembers these across all conversations.
              </p>
              <div className="mt-5 flex items-center justify-center gap-2">
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  <Plus className="size-4" />
                  Add fact
                </Button>
                <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
                  <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
                  Sync from sessions
                </Button>
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {memories.map((m) => (
              <div
                key={m.id}
                className="group relative flex flex-col rounded-xl border bg-card p-4 shadow-sm transition-all hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge
                    className={cn(
                      "border-0 font-medium",
                      MEMORY_TYPE_STYLES[m.memory_type] ?? "bg-muted text-muted-foreground"
                    )}
                  >
                    {MEMORY_TYPE_LABELS[m.memory_type] || m.memory_type}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => handleDelete(m.id)}
                    title="Delete fact"
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <p className="mt-2 flex-1 text-sm text-foreground">{m.content}</p>
                <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="size-3" />
                  {new Date(m.updated_at * 1000).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t pt-4">
              <p className="text-xs text-muted-foreground">
                {total} fact{total !== 1 ? "s" : ""} · Page {page + 1} of {totalPages}
              </p>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="size-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add fact dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <MemoryStick className="size-4" />
              </span>
              Add fact
            </DialogTitle>
            <DialogDescription>
              The agent will remember this across all conversations.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="grid gap-2">
              <Label htmlFor="content">Content</Label>
              <Input
                id="content"
                placeholder="e.g. User prefers dark mode"
                value={addContent}
                onChange={(e) => setAddContent(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleAdd()}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="type">Type</Label>
              <Select value={addType} onValueChange={setAddType}>
                <SelectTrigger id="type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEMORY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {MEMORY_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter showCloseButton>
            <Button onClick={handleAdd} disabled={!addContent.trim() || adding}>
              {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {adding ? "Adding…" : "Add fact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function FactsMemoryPage() {
  const [agents, setAgents] = React.useState<AgentItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    listAgents({ limit: 100, offset: 0 })
      .then((r) => setAgents(r.items))
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, []);

  const config: TabConfig = {
    id: "facts-memory",
    tabName: "Memory",
    description:
      "Manage durable facts that agents can recall across conversations.",
    items: agents.map((agent) => ({
      id: agent.id,
      name: agent.label || agent.name,
      icon: <MemoryStick className="size-4" />,
      component: <AgentFactsContent agent={agent} />,
    })),
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex flex-col">
          <div className="border-b border-border px-6 pb-4 pt-6">
            <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
            <div className="mt-4 flex gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-8 w-28 animate-pulse rounded-lg bg-muted/70" />
              ))}
            </div>
          </div>
          <div className="grid gap-3 p-6 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl border bg-card" />
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (agents.length === 0) {
    return (
      <AppLayout>
        <div className="mx-auto mt-10 max-w-md rounded-2xl border border-dashed bg-card p-12 text-center shadow-sm">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <MemoryStick className="size-7" />
          </div>
          <h2 className="mb-1.5 text-lg font-semibold tracking-tight">No agents yet</h2>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            Create an agent and chat with it to extract facts.
          </p>
          <Button className="mt-5" asChild>
            <Link href="/agents">Create an agent</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <TabLayout config={config} />
    </AppLayout>
  );
}
