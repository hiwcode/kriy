"use client";

import * as React from "react";
import { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  MoreHorizontal,
  Plus,
  Edit,
  Trash2,
  Database,
} from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { PageLayout } from "@/components/ui/page-layout";
import { DataTable, ColumnFilter } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  listDatabaseConnections,
  getDatabaseConnection,
  createDatabaseConnection,
  updateDatabaseConnection,
  deleteDatabaseConnection,
  type DatabaseConnection,
  type DatabaseConnectionCreate,
} from "@/lib/api/database-connections";

function toApiFilters(filters: ColumnFilter[]) {
  return filters.map((filter) => {
    const isEmptyFilter = filter.type === "empty" || filter.type === "notEmpty";
    return {
      filterField: filter.id,
      filterOp: filter.type,
      filterValue: isEmptyFilter ? null : filter.value,
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

interface FormState extends DatabaseConnectionCreate {
  max_rows: number;
}

const emptyForm: FormState = {
  name: "",
  connection_url: "",
  read_only: true,
  max_rows: 100,
};

export default function DatabaseConnectionsPage() {
  const [connections, setConnections] = React.useState<DatabaseConnection[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingConnection, setEditingConnection] =
    React.useState<DatabaseConnection | null>(null);
  const [formState, setFormState] = React.useState<FormState>(emptyForm);
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
        const { items, pagination } = await listDatabaseConnections(
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
          err instanceof Error ? err.message : "Failed to load database connections"
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

  const handleOpenEdit = async (conn: DatabaseConnection) => {
    try {
      const full = await getDatabaseConnection(conn.id);
      setEditingConnection(full);
      setFormState({
        name: full.name,
        connection_url: full.connection_url ?? "",
        read_only: full.read_only,
        max_rows: full.max_rows ?? 100,
      });
      setFormError(null);
      setDialogOpen(true);
    } catch {
      setFormError("Failed to load connection details");
    }
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!formState.name.trim()) {
      setFormError("Name is required");
      return;
    }
    if (!formState.connection_url.trim()) {
      setFormError("Connection URL is required");
      return;
    }
    if (!formState.connection_url.includes("postgresql://")) {
      setFormError("Connection URL must be a PostgreSQL URL (postgresql://...)");
      return;
    }
    const maxRows = Number(formState.max_rows);
    if (!Number.isFinite(maxRows) || maxRows < 1 || maxRows > 1000) {
      setFormError("Max rows must be between 1 and 1000");
      return;
    }

    setSaving(true);
    try {
      if (editingConnection) {
        await updateDatabaseConnection(editingConnection.id, {
          name: formState.name,
          connection_url: formState.connection_url,
          read_only: formState.read_only,
          max_rows: maxRows,
        });
      } else {
        await createDatabaseConnection({
          name: formState.name,
          connection_url: formState.connection_url,
          read_only: formState.read_only,
          max_rows: maxRows,
        });
      }
      setDialogOpen(false);
      setFormState(emptyForm);
      await fetchData();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to save database connection"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteDatabaseConnection(id);
      await fetchData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete database connection"
      );
    }
  };

  const maskUrl = (url: string | undefined) => {
    if (!url) return "-";
    try {
      const u = new URL(url.replace("postgresql://", "https://"));
      return `${u.hostname}:${u.port || "5432"}/${u.pathname.slice(1) || "db"}`;
    } catch {
      return "***";
    }
  };

  const formatDate = (value: string | undefined) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString();
  };

  const columns: ColumnDef<DatabaseConnection>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.name}</p>
          <p className="text-xs text-muted-foreground truncate max-w-[280px]">
            {row.original.connection_url
              ? maskUrl(row.original.connection_url)
              : "PostgreSQL"}
          </p>
        </div>
      ),
    },
    {
      id: "read_only",
      accessorFn: (row) => (row.read_only ? "Read-only" : "Read/write"),
      header: "Read/Write Mode",
      cell: ({ row }) => (
        <span
          className={
            row.original.read_only
              ? "text-amber-600"
              : "text-emerald-600"
          }
        >
          {row.original.read_only ? "Read-only" : "Read/write"}
        </span>
      ),
    },
    {
      accessorKey: "max_rows",
      header: "Max rows",
      cell: ({ row }) => (
        <span>{row.original.max_rows ?? 100}</span>
      ),
    },
    {
      accessorKey: "created_at",
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
            <DropdownMenuItem onClick={() => void handleOpenEdit(row.original)}>
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
        title="Database Connections"
        subtitle="Add PostgreSQL connections for agents to query. Agents can execute SELECT queries."
        actions={
          <Button onClick={handleOpenCreate}>
            <Plus className="size-4 mr-2" />
            New Connection
          </Button>
        }
      >
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive mb-4">
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
              <Database className="mx-auto size-8 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No database connections found</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={handleOpenCreate}
              >
                <Plus className="size-4 mr-2" />
                Add your first connection
              </Button>
            </div>
          }
        />
      </PageLayout>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingConnection ? "Edit Database Connection" : "New Database Connection"}
            </DialogTitle>
            <DialogDescription>
              {editingConnection
                ? "Update your database connection."
                : "Add a PostgreSQL connection. Agents will be able to run SELECT queries."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={formState.name}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g. Production DB"
              />
            </div>
            <div className="space-y-2">
              <Label>Connection URL</Label>
              <Input
                type="password"
                value={formState.connection_url}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, connection_url: e.target.value }))
                }
                placeholder="postgresql://user:pass@host:5432/dbname"
              />
              <p className="text-xs text-muted-foreground">
                PostgreSQL connection string. Use postgresql://...
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Read-only</Label>
                <p className="text-xs text-muted-foreground">
                  Only allow SELECT queries
                </p>
              </div>
              <Switch
                checked={formState.read_only}
                onCheckedChange={(v) =>
                  setFormState((prev) => ({ ...prev, read_only: v }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Max rows per query</Label>
              <Input
                type="number"
                min={1}
                max={1000}
                value={formState.max_rows}
                onChange={(e) =>
                  setFormState((prev) => ({
                    ...prev,
                    max_rows: parseInt(e.target.value, 10) || 100,
                  }))
                }
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
