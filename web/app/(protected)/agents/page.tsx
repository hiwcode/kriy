"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  MoreHorizontal,
  Plus,
  Edit,
  Trash2,
  Bot,
} from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { PageLayout } from "@/components/ui/page-layout";
import { DataTable, ColumnFilter } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  listAgents,
  createAgent,
  deleteAgent,
  bulkDeleteAgents,
  AgentItem,
  AgentFilter,
} from "@/lib/api/agents";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function toApiFilters(filters: ColumnFilter[]): AgentFilter[] {
  return filters.map((filter) => {
    const isEmptyFilter = filter.type === "empty" || filter.type === "notEmpty";
    const filterValue: string | number | null = isEmptyFilter
      ? null
      : filter.value;
    return {
      filterField: filter.id,
      filterOp: filter.type,
      filterValue,
    };
  });
}

function toApiSort(
  sorting: SortingState
): { sortField?: string; sortOrder?: "asc" | "desc" } {
  if (!sorting.length) return {};
  const primary = sorting[0];
  return {
    sortField: primary.id,
    sortOrder: primary.desc ? "desc" : "asc",
  };
}

export default function AgentsPage() {
  const router = useRouter();
  const [agents, setAgents] = React.useState<AgentItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [createForm, setCreateForm] = React.useState({
    name: "",
    label: "",
    model: "gemini-3.1-flash-lite",
  });
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [query, setQuery] = React.useState({
    search: "",
    filters: [] as ColumnFilter[],
    pageIndex: 0,
    pageSize: 10,
    sorting: [] as SortingState,
  });

  const fetchData = React.useCallback(
    async (nextQuery = query, signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const { items, pagination } = await listAgents(
          {
            limit: nextQuery.pageSize,
            offset: nextQuery.pageIndex * nextQuery.pageSize,
            search: nextQuery.search || undefined,
            filters: nextQuery.filters.length
              ? toApiFilters(nextQuery.filters)
              : undefined,
            ...toApiSort(nextQuery.sorting),
          },
          signal
        );
        setAgents(items);
        setTotal(pagination.total ?? items.length);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load agents");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [query]
  );

  React.useEffect(() => {
    const controller = new AbortController();
    fetchData(query, controller.signal);
    return () => controller.abort();
  }, [fetchData, query]);

  const handleQueryChange = React.useCallback(
    (next: {
      search: string;
      filters: ColumnFilter[];
      pageIndex: number;
      pageSize: number;
      sorting: SortingState;
    }) => {
      setQuery(next);
    },
    []
  );

  const handleDelete = async (id: number) => {
    try {
      await deleteAgent(id);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete agent");
    }
  };

  const handleBulkDelete = async (rows: AgentItem[]) => {
    if (!rows.length) return;
    try {
      await bulkDeleteAgents(rows.map((row) => row.id));
      await fetchData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete agents"
      );
    }
  };

  const handleOpenCreate = () => {
    setCreateForm({ name: "", label: "", model: "gemini-3.1-flash-lite" });
    setCreateError(null);
    setCreateDialogOpen(true);
  };

  const handleCreateSubmit = async (redirectToEdit: boolean) => {
    setCreateError(null);
    const { name, label, model } = createForm;
    if (!name.trim()) {
      setCreateError("Name is required");
      return;
    }
    if (!label.trim()) {
      setCreateError("Label is required");
      return;
    }
    setCreating(true);
    try {
      const created = await createAgent({
        name: name.trim(),
        label: label.trim(),
        model: model.trim() || "gemini-3.1-flash-lite",
      });
      setCreateDialogOpen(false);
      await fetchData();
      if (redirectToEdit) {
        router.push(`/agents/${created.id}`);
      }
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create agent"
      );
    } finally {
      setCreating(false);
    }
  };

  const columns: ColumnDef<AgentItem>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.name}</p>
          <p className="text-xs text-muted-foreground">
            {row.original.label}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "model",
      header: "Model",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.model}</span>
      ),
    },
    {
      accessorKey: "is_orchestrator",
      header: "Type",
      cell: ({ row }) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
            row.original.is_orchestrator
              ? "bg-purple-500/10 text-purple-500"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {row.original.is_orchestrator ? "Orchestrator" : "Agent"}
        </span>
      ),
    },
    {
      accessorKey: "createdat",
      header: "Created",
      cell: ({ row }) => (
        <span>{formatDate(row.original.created_at)}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                router.push(`/agents/${row.original.id}`);
              }}
            >
              <Edit className="size-4 mr-2" />
              Edit & Chat
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => handleDelete(row.original.id)}
            >
              <Trash2 className="size-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <AppLayout>
      <PageLayout
        title="Agents"
        subtitle="Configure and manage your AI agents"
        actions={
          <Button onClick={handleOpenCreate}>
            <Plus className="size-4 mr-2" />
            New Agent
          </Button>
        }
      >
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <DataTable
          columns={columns}
          data={agents}
          searchPlaceholder="Search agents..."
          pagination={true}
          pageSize={10}
          selectable={true}
          onDeleteSelected={handleBulkDelete}
          onRowClick={(row) => router.push(`/agents/${row.original.id}`)}
          serverSide={true}
          rowCount={total}
          loading={loading}
          onQueryChange={handleQueryChange}
          emptyState={
            <div className="text-center py-8">
              <Bot className="mx-auto size-8 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No agents found</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={handleOpenCreate}
              >
                <Plus className="size-4 mr-2" />
                Create your first agent
              </Button>
            </div>
          }
        />

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Agent</DialogTitle>
            <DialogDescription>
              Add a new agent. You can configure tools and instructions after
              creation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">Name (identifier)</Label>
              <Input
                id="create-name"
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g. general_agent"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-label">Label (display name)</Label>
              <Input
                id="create-label"
                value={createForm.label}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, label: e.target.value }))
                }
                placeholder="e.g. General Agent"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-model">Model</Label>
              <Input
                id="create-model"
                value={createForm.model}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, model: e.target.value }))
                }
                placeholder="gemini-3.1-flash-lite"
              />
            </div>
            {createError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {createError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => handleCreateSubmit(false)}
              disabled={creating}
            >
              {creating ? "Creating..." : "Create"}
            </Button>
            <Button
              onClick={() => handleCreateSubmit(true)}
              disabled={creating}
            >
              {creating ? "Creating..." : "Create & Edit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </PageLayout>
    </AppLayout>
  );
}
