"use client";

import * as React from "react";
import { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  MoreHorizontal,
  Plus,
  Edit,
  Trash2,
  Puzzle,
} from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { PageLayout } from "@/components/ui/page-layout";
import { DataTable, ColumnFilter } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listMcpConnections,
  createMcpConnection,
  updateMcpConnection,
  deleteMcpConnection,
  McpConnectionItem,
  McpConnectionFilter,
} from "@/lib/api/mcp-connections";

interface McpFormState {
  name: string;
  url: string;
  transport_type: string;
  headers: string;
  command: string;
  args: string;
  env: string;
  timeout_seconds: string;
}

const emptyForm: McpFormState = {
  name: "",
  url: "",
  transport_type: "streamable_http",
  headers: "{}",
  command: "",
  args: "[]",
  env: "{}",
  timeout_seconds: "60",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function toApiFilters(filters: ColumnFilter[]): McpConnectionFilter[] {
  return filters.map((filter) => {
    const isEmptyFilter = filter.type === "empty" || filter.type === "notEmpty";
    let filterValue: string | number | null = isEmptyFilter
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

export default function McpConnectionsPage() {
  const [connections, setConnections] = React.useState<McpConnectionItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingConnection, setEditingConnection] =
    React.useState<McpConnectionItem | null>(null);
  const [formState, setFormState] = React.useState<McpFormState>(emptyForm);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
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
        const { items, pagination } = await listMcpConnections(
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
        setConnections(items);
        setTotal(pagination.total ?? items.length);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Failed to load MCP connections"
        );
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

  const handleOpenCreate = () => {
    setEditingConnection(null);
    setFormState(emptyForm);
    setFormError(null);
    setDialogOpen(true);
  };

  const normalizeHeadersForEdit = (raw: unknown): string => {
    if (raw == null) return "{}";
    if (typeof raw === "object" && !Array.isArray(raw)) {
      return JSON.stringify(raw, null, 2);
    }
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return "{}";
      }
    }
    return "{}";
  };

  const handleOpenEdit = (conn: McpConnectionItem) => {
    setEditingConnection(conn);
    setFormState({
      name: conn.name,
      url: conn.url || "",
      transport_type: conn.transport_type || "streamable_http",
      headers: normalizeHeadersForEdit(conn.headers),
      command: conn.command || "",
      args: conn.args ? JSON.stringify(conn.args, null, 2) : "[]",
      env: conn.env ? JSON.stringify(conn.env, null, 2) : "{}",
      timeout_seconds: String(conn.timeout_seconds ?? 60),
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    setFormError(null);
    const timeoutValue = Number(formState.timeout_seconds);
    if (!Number.isFinite(timeoutValue) || timeoutValue <= 0) {
      setFormError("Timeout must be a positive number");
      return;
    }

    const isStdio = formState.transport_type === "stdio";

    if (isStdio && !formState.command.trim()) {
      setFormError("Command is required for stdio transport");
      return;
    }

    if (!isStdio && !formState.url.trim()) {
      setFormError("URL is required for this transport type");
      return;
    }

    let headers: Record<string, string> = {};
    if (formState.headers.trim()) {
      try {
        const parsed = JSON.parse(formState.headers);
        if (parsed && typeof parsed === "object") {
          headers = Object.fromEntries(
            Object.entries(parsed).map(([k, v]) => [String(k), String(v)])
          );
        }
      } catch {
        setFormError("Headers must be valid JSON");
        return;
      }
    }

    let parsedArgs: string[] = [];
    if (isStdio && formState.args.trim()) {
      try {
        const parsed = JSON.parse(formState.args);
        if (!Array.isArray(parsed)) {
          setFormError("Args must be a JSON array of strings");
          return;
        }
        parsedArgs = parsed.map(String);
      } catch {
        setFormError("Args must be valid JSON array");
        return;
      }
    }

    let parsedEnv: Record<string, string> | null = null;
    if (isStdio && formState.env.trim() && formState.env.trim() !== "{}") {
      try {
        const parsed = JSON.parse(formState.env);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          parsedEnv = Object.fromEntries(
            Object.entries(parsed).map(([k, v]) => [String(k), String(v)])
          );
        } else {
          setFormError("Env must be a JSON object");
          return;
        }
      } catch {
        setFormError("Env must be valid JSON object");
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        name: formState.name,
        url: isStdio ? "" : formState.url,
        transport_type: formState.transport_type,
        headers,
        timeout_seconds: timeoutValue,
        command: isStdio ? formState.command : null,
        args: isStdio ? parsedArgs : [],
        env: isStdio ? parsedEnv : null,
      };

      if (editingConnection) {
        await updateMcpConnection(editingConnection.id, payload);
      } else {
        await createMcpConnection(payload);
      }
      setDialogOpen(false);
      setFormState(emptyForm);
      await fetchData();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to save MCP connection"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMcpConnection(id);
      await fetchData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete MCP connection"
      );
    }
  };

  const columns: ColumnDef<McpConnectionItem>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.name}</p>
          <p className="text-xs text-muted-foreground truncate max-w-[280px]">
            {row.original.transport_type === "stdio"
              ? `${row.original.command || ""} ${(row.original.args || []).join(" ")}`.trim()
              : row.original.url}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "transport_type",
      header: "Transport",
      cell: ({ row }) => (
        <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
          {row.original.transport_type === "sse"
            ? "SSE"
            : row.original.transport_type === "stdio"
              ? "Stdio"
              : "HTTP"}
        </span>
      ),
    },
    {
      accessorKey: "timeout_seconds",
      header: "Timeout",
      cell: ({ row }) => (
        <span>{row.original.timeout_seconds ?? 60}s</span>
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
            <DropdownMenuItem onClick={() => handleOpenEdit(row.original)}>
              <Edit className="size-4 mr-2" />
              Edit
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
        title="MCP Connections"
        subtitle="Connect MCP servers to your agents"
        actions={
          <Button onClick={handleOpenCreate}>
            <Plus className="size-4 mr-2" />
            New Connection
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
          data={connections}
          searchPlaceholder="Search connections..."
          pagination={true}
          pageSize={10}
          serverSide={true}
          rowCount={total}
          loading={loading}
          onQueryChange={handleQueryChange}
          emptyState={
            <div className="text-center py-8">
              <Puzzle className="mx-auto size-8 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No MCP connections found</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={handleOpenCreate}
              >
                <Plus className="size-4 mr-2" />
                Create your first connection
              </Button>
            </div>
          }
        />
      </PageLayout>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingConnection ? "Edit MCP Connection" : "New MCP Connection"}
            </DialogTitle>
            <DialogDescription>
              {editingConnection
                ? "Update your MCP server connection."
                : "Add a new MCP server to connect to your agents."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={formState.name}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g. MongoDB MCP"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Transport Type</label>
              <Select
                value={formState.transport_type}
                onValueChange={(value) =>
                  setFormState((prev) => ({ ...prev, transport_type: value }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select transport type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="streamable_http">
                    Streamable HTTP
                  </SelectItem>
                  <SelectItem value="sse">
                    SSE (Server-Sent Events)
                  </SelectItem>
                  <SelectItem value="stdio">
                    Stdio (Local Process)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {formState.transport_type === "stdio"
                  ? <>Use <strong>Stdio</strong> to run a local MCP server as a subprocess (e.g. <code>npx</code>, <code>uvx</code>, <code>python</code>).</>
                  : formState.transport_type === "sse"
                    ? <>Use <strong>SSE</strong> for servers with <code>/sse</code> endpoints.</>
                    : <>Use <strong>Streamable HTTP</strong> for newer MCP servers.</>}
              </p>
            </div>
            {formState.transport_type === "stdio" ? (
              <>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Command</label>
                  <Input
                    value={formState.command}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, command: e.target.value }))
                    }
                    placeholder="e.g. npx, uvx, python3"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Arguments (JSON array)</label>
                  <Textarea
                    value={formState.args}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        args: e.target.value,
                      }))
                    }
                    placeholder='["-y", "@modelcontextprotocol/server-filesystem", "/path"]'
                    rows={3}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Environment Variables (JSON, optional)</label>
                  <Textarea
                    className="overflow-hidden resize-none"
                    value={formState.env}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        env: e.target.value,
                      }))
                    }
                    placeholder='{"API_KEY": "your-key"}'
                    rows={2}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <label className="text-sm font-medium">URL</label>
                  <Input
                    value={formState.url}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, url: e.target.value }))
                    }
                    placeholder={
                      formState.transport_type === "sse"
                        ? "http://127.0.0.1:8080/sse"
                        : "https://example.com/mcp/message"
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Headers (JSON)</label>
                  <Textarea
                    className="whitespace-pre-wrap break-all"
                    value={formState.headers}

                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        headers: e.target.value,
                      }))
                    }
                    placeholder='{"Authorization": "Bearer token"}'
                    rows={5}
                  />
                </div>
              </>
            )}
            <div className="space-y-1">
              <label className="text-sm font-medium">Timeout (seconds)</label>
              <Input
                type="number"
                min={1}
                value={formState.timeout_seconds}
                onChange={(e) =>
                  setFormState((prev) => ({
                    ...prev,
                    timeout_seconds: e.target.value,
                  }))
                }
                placeholder="60"
              />
            </div>
            {formError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving
                ? "Saving..."
                : editingConnection
                  ? "Save Changes"
                  : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
