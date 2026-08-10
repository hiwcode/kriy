"use client";

import * as React from "react";
import { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  Calendar,
  Clock,
  Loader2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { PageLayout } from "@/components/ui/page-layout";
import { DataTable, ColumnFilter } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  triggerSchedule,
  ScheduleItem,
} from "@/lib/api/schedules";
import { listAgents, AgentItem } from "@/lib/api/agents";

const CRON_PRESETS = [
  { label: "Every 5 minutes", value: "*/5 * * * *" },
  { label: "Every 15 minutes", value: "*/15 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Daily at 9 AM", value: "0 9 * * *" },
  { label: "Daily at midnight", value: "0 0 * * *" },
  { label: "Weekdays at 9 AM", value: "0 9 * * 1-5" },
  { label: "Weekly (Sunday)", value: "0 0 * * 0" },
  { label: "Monthly (1st)", value: "0 0 1 * *" },
];

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function SchedulesPage() {
  const [schedules, setSchedules] = React.useState<ScheduleItem[]>([]);
  const [agents, setAgents] = React.useState<AgentItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [resultDialog, setResultDialog] = React.useState<{
    open: boolean;
    result: string;
  }>({ open: false, result: "" });

  const [query, setQuery] = React.useState({
    search: "",
    filters: [] as ColumnFilter[],
    pageIndex: 0,
    pageSize: 10,
    sorting: [] as SortingState,
  });

  // Form state
  const [form, setForm] = React.useState({
    name: "",
    description: "",
    agent_id: 0,
    message: "",
    schedule_type: "one_time" as "one_time" | "recurring",
    cron_expression: "",
    run_at: "",
    max_runs: "",
    max_retries: "0",
    retry_delay_seconds: "60",
  });

  const fetchData = React.useCallback(
    async (nextQuery = query, signal?: AbortSignal) => {
      setLoading(true);
      try {
        const { items, pagination } = await listSchedules({
          limit: nextQuery.pageSize,
          offset: nextQuery.pageIndex * nextQuery.pageSize,
        });
        setSchedules(items);
        setTotal(pagination.total ?? items.length);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setSchedules([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [query]
  );

  React.useEffect(() => {
    const controller = new AbortController();
    fetchData(query, controller.signal);
    return () => controller.abort();
  }, [fetchData, query]);

  React.useEffect(() => {
    listAgents({ limit: 200, offset: 0 })
      .then(({ items }) => setAgents(items))
      .catch(() => {});
  }, []);

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

  const resetForm = () =>
    setForm({
      name: "",
      description: "",
      agent_id: 0,
      message: "",
      schedule_type: "one_time",
      cron_expression: "",
      run_at: "",
      max_runs: "",
      max_retries: "0",
      retry_delay_seconds: "60",
    });

  const handleOpenCreate = () => {
    resetForm();
    setEditingId(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (s: ScheduleItem) => {
    setForm({
      name: s.name,
      description: s.description || "",
      agent_id: s.agent_id,
      message: s.message || "",
      schedule_type: s.schedule_type as "one_time" | "recurring",
      cron_expression: s.cron_expression || "",
      run_at: s.run_at ? new Date(s.run_at).toISOString().slice(0, 16) : "",
      max_runs: s.max_runs ? String(s.max_runs) : "",
      max_retries: String(s.max_retries ?? 0),
      retry_delay_seconds: String(s.retry_delay_seconds ?? 60),
    });
    setEditingId(s.id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.agent_id || !form.message) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description || undefined,
        agent_id: form.agent_id,
        message: form.message,
        schedule_type: form.schedule_type,
        cron_expression:
          form.schedule_type === "recurring"
            ? form.cron_expression || undefined
            : undefined,
        run_at:
          form.schedule_type === "one_time" && form.run_at
            ? new Date(form.run_at).toISOString()
            : undefined,
        max_runs: form.max_runs ? parseInt(form.max_runs) : undefined,
        max_retries: parseInt(form.max_retries) || 0,
        retry_delay_seconds: parseInt(form.retry_delay_seconds) || 60,
      };
      if (editingId) {
        await updateSchedule(editingId, payload);
      } else {
        await createSchedule(payload);
      }
      setDialogOpen(false);
      setEditingId(null);
      resetForm();
      fetchData();
    } catch {
      // toast already shown
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteSchedule(id);
      fetchData();
    } catch {
      // toast already shown
    }
  };

  const handleTogglePause = async (schedule: ScheduleItem) => {
    const newStatus = schedule.status === "active" ? "paused" : "active";
    try {
      await updateSchedule(schedule.id, { status: newStatus });
      fetchData();
    } catch {
      // toast already shown
    }
  };

  const handleTrigger = async (id: number) => {
    try {
      const result = await triggerSchedule(id);
      fetchData();
      if (result.result || result.error) {
        setResultDialog({
          open: true,
          result: result.result || result.error || "",
        });
      }
    } catch {
      // toast already shown
    }
  };

  const columns: ColumnDef<ScheduleItem>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.name}</p>
          <p className="text-xs text-muted-foreground truncate max-w-[280px]">
            {row.original.message}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "agent_name",
      header: "Agent",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.agent_name || `Agent #${row.original.agent_id}`}
        </span>
      ),
    },
    {
      accessorKey: "schedule_type",
      header: "Type",
      cell: ({ row }) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            row.original.schedule_type === "recurring"
              ? "bg-purple-500/10 text-purple-500"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {row.original.schedule_type === "recurring" ? "Recurring" : "One-time"}
        </span>
      ),
    },
    {
      accessorKey: "cron_expression",
      header: "Cron / Run At",
      cell: ({ row }) => {
        if (row.original.cron_expression) {
          return (
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
              {row.original.cron_expression}
            </code>
          );
        }
        if (row.original.run_at) {
          return <span className="text-xs">{formatDate(row.original.run_at)}</span>;
        }
        return <span className="text-muted-foreground">-</span>;
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original.status;
        const color =
          s === "active"
            ? "bg-emerald-500/10 text-emerald-600"
            : s === "paused"
              ? "bg-amber-500/10 text-amber-600"
              : s === "completed"
                ? "bg-blue-500/10 text-blue-600"
                : "bg-red-500/10 text-red-600";
        return (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}
          >
            {s}
          </span>
        );
      },
    },
    {
      accessorKey: "next_run_at",
      header: "Next Run",
      cell: ({ row }) => (
        <span className="text-sm">{formatDate(row.original.next_run_at)}</span>
      ),
    },
    {
      accessorKey: "last_run_status",
      header: "Last Run",
      cell: ({ row }) => {
        const s = row.original.last_run_status;
        const retryCount = row.original.retry_count;
        const maxRetries = row.original.max_retries;
        if (!s) return <span className="text-muted-foreground">-</span>;
        return (
          <div>
            <span
              className={`text-xs font-medium ${
                s === "success" ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {s}
            </span>
            {s === "failed" && maxRetries > 0 && (
              <p className="text-[10px] text-muted-foreground">
                retry {retryCount}/{maxRetries}
              </p>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "run_count",
      header: "Runs",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.run_count}
          {row.original.max_runs ? `/${row.original.max_runs}` : ""}
        </span>
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
              <Pencil className="size-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleTrigger(row.original.id)}>
              <Zap className="size-4 mr-2" />
              Run Now
            </DropdownMenuItem>
            {(row.original.status === "active" ||
              row.original.status === "paused") && (
              <DropdownMenuItem
                onClick={() => handleTogglePause(row.original)}
              >
                {row.original.status === "active" ? (
                  <>
                    <Pause className="size-4 mr-2" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="size-4 mr-2" />
                    Resume
                  </>
                )}
              </DropdownMenuItem>
            )}
            {row.original.last_run_result && (
              <DropdownMenuItem
                onClick={() =>
                  setResultDialog({
                    open: true,
                    result: row.original.last_run_result || "",
                  })
                }
              >
                <Clock className="size-4 mr-2" />
                View Last Result
              </DropdownMenuItem>
            )}
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
        title="Schedules"
        subtitle="Run agents once or on a recurring schedule."
        actions={
          <Button onClick={handleOpenCreate}>
            <Plus className="size-4 mr-2" />
            New Schedule
          </Button>
        }
      >
        <DataTable
          columns={columns}
          data={schedules}
          searchPlaceholder="Search schedules..."
          pagination={true}
          pageSize={10}
          serverSide={true}
          rowCount={total}
          loading={loading}
          onQueryChange={handleQueryChange}
          emptyState={
            <div className="text-center py-8">
              <Calendar className="mx-auto size-8 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No schedules found</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={handleOpenCreate}
              >
                <Plus className="size-4 mr-2" />
                Create your first schedule
              </Button>
            </div>
          }
        />
      </PageLayout>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Schedule" : "New Schedule"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Update this schedule's configuration." : "Schedule an agent to run automatically."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Name</Label>
              <Input
                placeholder="Daily report generation"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-medium">Description (optional)</Label>
              <Input
                placeholder="What this schedule does..."
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-medium">Agent</Label>
              <Select
                value={form.agent_id ? String(form.agent_id) : ""}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, agent_id: parseInt(v) }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-medium">Message</Label>
              <Textarea
                placeholder="The prompt to send to the agent..."
                value={form.message}
                onChange={(e) =>
                  setForm((f) => ({ ...f, message: e.target.value }))
                }
                rows={3}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-medium">Type</Label>
              <Select
                value={form.schedule_type}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    schedule_type: v as "one_time" | "recurring",
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_time">One-time</SelectItem>
                  <SelectItem value="recurring">Recurring</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.schedule_type === "one_time" && (
              <div className="space-y-1">
                <Label className="text-sm font-medium">Run At</Label>
                <Input
                  type="datetime-local"
                  value={form.run_at}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, run_at: e.target.value }))
                  }
                />
              </div>
            )}
            {form.schedule_type === "recurring" && (
              <>
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Cron Expression</Label>
                  <Input
                    placeholder="0 9 * * *"
                    className="font-mono"
                    value={form.cron_expression}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        cron_expression: e.target.value,
                      }))
                    }
                  />
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {CRON_PRESETS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        className="text-[10px] px-2 py-0.5 rounded-full border hover:bg-muted transition-colors"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            cron_expression: p.value,
                          }))
                        }
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Max Runs (optional)</Label>
                  <Input
                    type="number"
                    placeholder="Unlimited"
                    value={form.max_runs}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, max_runs: e.target.value }))
                    }
                  />
                </div>
              </>
            )}
            {/* Retry on failure */}
            <div className="space-y-1">
              <Label className="text-sm font-medium">Retries on failure</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    placeholder="0"
                    value={form.max_retries}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, max_retries: e.target.value }))
                    }
                  />
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Max retries (0 = no retry)</p>
                </div>
                <div>
                  <Input
                    type="number"
                    min={1}
                    placeholder="60"
                    value={form.retry_delay_seconds}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, retry_delay_seconds: e.target.value }))
                    }
                    disabled={!parseInt(form.max_retries)}
                  />
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Delay between retries (seconds)</p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.name || !form.agent_id || !form.message}
            >
              {saving && <Loader2 className="size-4 mr-1.5 animate-spin" />}
              {editingId ? "Save Changes" : "Create Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Result Dialog */}
      <Dialog
        open={resultDialog.open}
        onOpenChange={(open) => setResultDialog((r) => ({ ...r, open }))}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Run Result</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto rounded-md bg-muted p-4">
            <pre className="whitespace-pre-wrap text-sm">
              {resultDialog.result}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
