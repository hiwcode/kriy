"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Workflow as WorkflowIcon,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Sparkles,
  Power,
  History,
  Webhook,
  ArrowUpDown,
  Check,
  X,
  AlertTriangle,
  Clock,
  Bot,
} from "lucide-react";

import { AppLayout } from "@/components/layout/app-layout";
import { TabLayout, TabConfig } from "@/components/ui/tab-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ResizableDrawer } from "@/components/ui/resizable-drawer";
import { SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  listWorkflows,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  listWorkflowRuns,
  listQueue,
  workflowChat,
  listEventTypes,
  upsertEventType,
  deleteEventType,
  type Workflow,
  type WorkflowRun,
  type EventType,
  type QueueRun,
} from "@/lib/api/workflows";
import { listIntegrationAgents, type IntegrationAgent } from "@/lib/api/integration";

const emptyWorkflow = (): Workflow => ({
  id: 0,
  user_id: null,
  workspace_id: null,
  name: "",
  event_type: "",
  agent_id: 0,
  instructions: "",
  enabled: true,
  priority: 0,
  execution_mode: "serial",
  max_concurrency: 3,
});

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = React.useState<Workflow[]>([]);
  const [agents, setAgents] = React.useState<IntegrationAgent[]>([]);
  const [eventTypes, setEventTypes] = React.useState<EventType[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Workflow | null>(null);
  const [newAgentId, setNewAgentId] = React.useState<number | null>(null);
  const [runsFor, setRunsFor] = React.useState<Workflow | null>(null);
  const [eventsOpen, setEventsOpen] = React.useState(false);

  const agentName = React.useCallback(
    (id: number) => agents.find((a) => a.id === id)?.label || agents.find((a) => a.id === id)?.name || `agent ${id}`,
    [agents]
  );

  const reloadWorkflows = React.useCallback(async (): Promise<void> => {
    try {
      setWorkflows(await listWorkflows());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load workflows");
    }
  }, []);
  const reloadEventTypes = React.useCallback(async (): Promise<void> => {
    try {
      setEventTypes(await listEventTypes());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load events");
    }
  }, []);

  React.useEffect(() => {
    Promise.all([
      listWorkflows().then(setWorkflows).catch(() => {}),
      listIntegrationAgents().then(setAgents).catch(() => {}),
      listEventTypes().then(setEventTypes).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const openNew = (agentId: number) => {
    setEditing(null);
    setNewAgentId(agentId);
    setEditorOpen(true);
  };
  const openEdit = (w: Workflow) => {
    setEditing(w);
    setNewAgentId(null);
    setEditorOpen(true);
  };

  const save = async (w: Workflow) => {
    setSaving(true);
    try {
      const input = {
        name: w.name.trim(),
        event_type: w.event_type.trim() || "*",
        agent_id: w.agent_id,
        instructions: w.instructions,
        enabled: w.enabled,
        priority: w.priority,
        execution_mode: w.execution_mode,
        max_concurrency: w.max_concurrency,
      };
      if (editing) await updateWorkflow(editing.id, input);
      else await createWorkflow(input);
      toast.success(editing ? "Workflow updated" : "Workflow created");
      setEditorOpen(false);
      await reloadWorkflows();
      await reloadEventTypes(); // subscriber counts may change
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (w: Workflow) => {
    setWorkflows((prev) => prev.map((x) => (x.id === w.id ? { ...x, enabled: !x.enabled } : x)));
    try {
      await updateWorkflow(w.id, { ...w, enabled: !w.enabled });
    } catch (e) {
      setWorkflows((prev) => prev.map((x) => (x.id === w.id ? { ...x, enabled: w.enabled } : x)));
      toast.error(e instanceof Error ? e.message : "Failed to toggle");
    }
  };

  const remove = async (w: Workflow) => {
    if (!confirm(`Delete workflow "${w.name}"?`)) return;
    try {
      await deleteWorkflow(w.id);
      setWorkflows((prev) => prev.filter((x) => x.id !== w.id));
      reloadEventTypes();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const [queueOpen, setQueueOpen] = React.useState(false);

  const headerButtons = (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => setQueueOpen(true)}>
        <Clock className="size-4" />
        Queue
      </Button>
      <Button variant="outline" size="sm" onClick={() => setEventsOpen(true)}>
        <Webhook className="size-4" />
        Events{eventTypes.length ? ` (${eventTypes.length})` : ""}
      </Button>
    </div>
  );

  // One tab per agent (like Traces); each shows that agent's workflows.
  const config: TabConfig = {
    id: "workflows",
    tabName: "Event Workflows",
    description:
      "Connect an external app to your agents: when your app emits an event (e.g. “todo.completed”), the matching agent runs automatically to handle it. Pick an agent below to see its triggers; manage the events your apps send from the Events button.",
    headerActions: headerButtons,
    items: agents.map((a) => ({
      id: a.id,
      name: a.label || a.name,
      icon: <Bot className="size-4" />,
      component: (
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Workflows that run <span className="font-medium text-foreground">{a.label || a.name}</span> when your app emits a matching event.
            </p>
            <Button size="sm" onClick={() => openNew(a.id)}>
              <Plus className="size-4" /> New workflow
            </Button>
          </div>
          <WorkflowsList
            workflows={workflows.filter((w) => w.agent_id === a.id)}
            loading={loading}
            agentName={agentName}
            onNew={() => openNew(a.id)}
            onEdit={openEdit}
            onRuns={setRunsFor}
            onToggle={toggle}
            onRemove={remove}
          />
        </div>
      ),
    })),
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex flex-col">
          <div className="border-b border-border px-6 pb-4 pt-6">
            <div className="h-7 w-40 animate-pulse rounded-md bg-muted" />
            <div className="mt-4 flex gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-8 w-28 animate-pulse rounded-lg bg-muted/70" />
              ))}
            </div>
          </div>
          <div className="space-y-3 p-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl border bg-card" />
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
            <WorkflowIcon className="size-7" />
          </div>
          <h2 className="mb-1.5 text-lg font-semibold tracking-tight">No agents yet</h2>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            An event workflow runs an agent when your app emits an event. Create an agent first.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <TabLayout config={config} />

      <WorkflowEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        initial={editing}
        defaultAgentId={newAgentId}
        agents={agents}
        eventTypes={eventTypes}
        saving={saving}
        onSave={save}
        emptyWorkflow={emptyWorkflow}
      />

      <RunsDrawer workflow={runsFor} onOpenChange={(o) => !o && setRunsFor(null)} />

      <QueueDrawer open={queueOpen} onOpenChange={setQueueOpen} />

      <EventsDrawer
        open={eventsOpen}
        onOpenChange={setEventsOpen}
        eventTypes={eventTypes}
        loading={loading}
        onChange={reloadEventTypes}
      />
    </AppLayout>
  );
}

/* ------------------------------------------------------------------ */
/*  Workflows list                                                     */
/* ------------------------------------------------------------------ */

function WorkflowsList({
  workflows,
  loading,
  agentName,
  onNew,
  onEdit,
  onRuns,
  onToggle,
  onRemove,
}: {
  workflows: Workflow[];
  loading: boolean;
  agentName: (id: number) => string;
  onNew: () => void;
  onEdit: (w: Workflow) => void;
  onRuns: (w: Workflow) => void;
  onToggle: (w: Workflow) => void;
  onRemove: (w: Workflow) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border bg-card" />
        ))}
      </div>
    );
  }
  if (workflows.length === 0) {
    return (
      <EmptyState
        icon={<WorkflowIcon className="size-7" />}
        title="No workflows yet"
        body="Add a workflow so this agent reacts to an event your app sends — e.g. on “todo.completed”, run the agent to reset the list."
        action={
          <Button size="sm" className="mt-5" onClick={onNew}>
            <Plus className="size-4" /> New workflow
          </Button>
        }
      />
    );
  }
  return (
    <div className="space-y-2.5">
      {workflows.map((w) => (
        <div
          key={w.id}
          className={cn(
            "rounded-xl border bg-card p-4 shadow-sm transition-opacity",
            !w.enabled && "opacity-60"
          )}
        >
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <WorkflowIcon className="size-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{w.name || "Untitled"}</p>
                <Badge variant="secondary" className="gap-1 border-0 font-mono text-[10px]">
                  <Webhook className="size-3" /> {w.event_type}
                </Badge>
                <Badge variant="secondary" className="border-0 text-[10px]">
                  {agentName(w.agent_id)}
                </Badge>
                <Badge variant="secondary" className="gap-1 border-0 text-[10px]">
                  <ArrowUpDown className="size-3" /> p{w.priority}
                </Badge>
                <Badge variant={w.execution_mode === "parallel" ? "default" : "secondary"} className="border-0 text-[10px]">
                  {w.execution_mode === "parallel" ? `parallel (${w.max_concurrency})` : "serial"}
                </Badge>
              </div>
              {w.instructions && (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{w.instructions}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Switch checked={w.enabled} onCheckedChange={() => onToggle(w)} aria-label="Enabled" />
              <Button variant="ghost" size="icon-sm" onClick={() => onRuns(w)} title="Runs">
                <History className="size-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => onEdit(w)} title="Edit">
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onRemove(w)}
                title="Delete"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Workflow editor                                                    */
/* ------------------------------------------------------------------ */

function WorkflowEditor({
  open,
  onOpenChange,
  initial,
  defaultAgentId,
  agents,
  eventTypes,
  saving,
  onSave,
  emptyWorkflow,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: Workflow | null;
  defaultAgentId?: number | null;
  agents: IntegrationAgent[];
  eventTypes: EventType[];
  saving: boolean;
  onSave: (w: Workflow) => void;
  emptyWorkflow: () => Workflow;
}) {
  const [draft, setDraft] = React.useState<Workflow>(emptyWorkflow());
  const [nl, setNl] = React.useState("");
  const [generating, setGenerating] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setErr(null);
      setNl("");
      setDraft(
        initial
          ? { ...initial }
          : { ...emptyWorkflow(), agent_id: defaultAgentId ?? 0 }
      );
    }
  }, [open, initial, defaultAgentId, emptyWorkflow]);

  const set = (patch: Partial<Workflow>) => setDraft((d) => ({ ...d, ...patch }));

  const generate = async () => {
    const text = nl.trim();
    if (!text) return;
    if (!draft.agent_id) {
      setErr("Pick an agent first — it compiles your description.");
      return;
    }
    setGenerating(true);
    setErr(null);
    try {
      const { workflow } = await workflowChat(draft.agent_id, [{ role: "user", content: text }]);
      if (!workflow) {
        setErr("Couldn't turn that into a workflow — try naming the event and what should happen.");
        return;
      }
      set({
        name: draft.name.trim() || workflow.name,
        event_type: workflow.event_type || draft.event_type,
        instructions: workflow.instructions ?? draft.instructions,
      });
      toast.success("Workflow drafted — review and save");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setGenerating(false);
    }
  };

  const submit = () => {
    if (!draft.name.trim()) return setErr("Name is required");
    if (!draft.agent_id) return setErr("Pick an agent to run");
    if (!draft.event_type.trim()) return setErr("Event type is required");
    onSave(draft);
  };

  return (
    <ResizableDrawer open={open} onOpenChange={onOpenChange} defaultWidth={560}>
      <SheetTitle className="sr-only">{initial ? "Edit workflow" : "New workflow"}</SheetTitle>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <WorkflowIcon className="size-[18px]" />
            </span>
            <p className="font-semibold">{initial ? "Edit workflow" : "New workflow"}</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {/* Plain-English compiler */}
          <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/[0.04] p-3">
            <Label htmlFor="wf-nl" className="flex items-center gap-1.5 text-primary">
              <Sparkles className="size-4" /> Describe it in plain English
            </Label>
            <Textarea
              id="wf-nl"
              placeholder="e.g. When all my todos are done, clear them and start a fresh todo-1."
              value={nl}
              onChange={(e) => setNl(e.target.value)}
              className="min-h-[60px] bg-background"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Fills in event + instructions below.</p>
              <Button size="sm" onClick={generate} disabled={generating || !nl.trim()}>
                {generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Generate
              </Button>
            </div>
          </div>

          <Field label="Name">
            <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Auto-reset todos" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Event type">
              <Input
                list="wf-event-types"
                value={draft.event_type}
                onChange={(e) => set({ event_type: e.target.value })}
                placeholder="todo.completed"
                className="font-mono"
              />
              <datalist id="wf-event-types">
                {eventTypes.map((t) => (
                  <option key={t.id} value={t.name} />
                ))}
              </datalist>
            </Field>
            <Field label="Priority">
              <Input
                type="number"
                value={draft.priority}
                onChange={(e) => set({ priority: Number(e.target.value) || 0 })}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Execution mode">
              <Select value={draft.execution_mode} onValueChange={(v) => set({ execution_mode: v as "serial" | "parallel" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="serial">Serial (one at a time)</SelectItem>
                  <SelectItem value="parallel">Parallel</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {draft.execution_mode === "parallel" && (
              <Field label="Max concurrency">
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={draft.max_concurrency}
                  onChange={(e) => set({ max_concurrency: Math.max(1, Math.min(20, Number(e.target.value) || 3)) })}
                />
              </Field>
            )}
          </div>

          <Field label="Agent">
            <Select value={draft.agent_id ? String(draft.agent_id) : ""} onValueChange={(v) => set({ agent_id: Number(v) })}>
              <SelectTrigger>
                <SelectValue placeholder="Pick an agent to run" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.label || a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Instructions (what the agent does when the event fires)">
            <Textarea
              value={draft.instructions}
              onChange={(e) => set({ instructions: e.target.value })}
              placeholder="Call reset_if_all_done once with title 'todo-1', then reply reset or pending."
              className="min-h-[90px]"
            />
          </Field>

          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm">
              <Power className="size-4 text-muted-foreground" /> Enabled
            </div>
            <Switch checked={draft.enabled} onCheckedChange={(v) => set({ enabled: v })} />
          </div>

          {err && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="size-4 shrink-0" /> {err}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {initial ? "Save" : "Create"}
          </Button>
        </div>
      </div>
    </ResizableDrawer>
  );
}

/* ------------------------------------------------------------------ */
/*  Runs drawer                                                        */
/* ------------------------------------------------------------------ */

const STATUS_STYLES: Record<string, string> = {
  done: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  error: "bg-destructive/10 text-destructive",
  running: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  pending: "bg-muted text-muted-foreground",
};

function RunsDrawer({
  workflow,
  onOpenChange,
}: {
  workflow: Workflow | null;
  onOpenChange: (o: boolean) => void;
}) {
  const [runs, setRuns] = React.useState<WorkflowRun[]>([]);
  const [loading, setLoading] = React.useState(false);

  const refresh = React.useCallback(() => {
    if (!workflow) return;
    setLoading(true);
    listWorkflowRuns(workflow.id)
      .then(setRuns)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workflow]);

  React.useEffect(() => {
    if (workflow) refresh();
  }, [workflow, refresh]);

  return (
    <ResizableDrawer open={!!workflow} onOpenChange={onOpenChange} defaultWidth={560}>
      <SheetTitle className="sr-only">Runs for {workflow?.name}</SheetTitle>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">Runs · {workflow?.name}</p>
            <p className="truncate text-xs text-muted-foreground font-mono">{workflow?.event_type}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={refresh} title="Refresh">
              <Loader2 className={cn("size-4", loading && "animate-spin")} />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)} aria-label="Close">
              <X className="size-4" />
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          {!loading && runs.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No runs yet. Emit this event to trigger the workflow.
            </p>
          )}
          {runs.map((r) => (
            <div key={r.id} className="rounded-lg border bg-card p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", STATUS_STYLES[r.status] ?? "")}>
                  {r.status}
                </span>
                <span className="text-xs text-muted-foreground">#{r.id}</span>
                {r.attempts > 1 && (
                  <span className="text-xs text-muted-foreground">· attempt {r.attempts}/{r.max_attempts}</span>
                )}
                <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="size-3" />
                  {r.created_at ? new Date(r.created_at).toLocaleString() : ""}
                </span>
              </div>
              {r.response && <p className="mt-1.5 whitespace-pre-wrap text-foreground/90">{r.response}</p>}
              {r.error && <p className="mt-1.5 whitespace-pre-wrap text-destructive">{r.error}</p>}
            </div>
          ))}
        </div>
      </div>
    </ResizableDrawer>
  );
}

/* ------------------------------------------------------------------ */
/*  Queue drawer                                                       */
/* ------------------------------------------------------------------ */

const QUEUE_STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock className="size-3.5" />,
  running: <Loader2 className="size-3.5 animate-spin" />,
  done: <Check className="size-3.5" />,
  error: <AlertTriangle className="size-3.5" />,
};

function QueueDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [runs, setRuns] = React.useState<QueueRun[]>([]);
  const [counts, setCounts] = React.useState<Record<string, number>>({});
  const [loading, setLoading] = React.useState(false);
  const [filter, setFilter] = React.useState<string>("all");

  const refresh = React.useCallback(() => {
    setLoading(true);
    listQueue(200)
      .then((d) => { setRuns(d.runs); setCounts(d.counts); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  // Auto-refresh while open
  React.useEffect(() => {
    if (!open) return;
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [open, refresh]);

  const filtered = filter === "all" ? runs : runs.filter((r) => r.status === filter);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <ResizableDrawer open={open} onOpenChange={onOpenChange} defaultWidth={640}>
      <SheetTitle className="sr-only">Run Queue</SheetTitle>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Clock className="size-[18px]" />
            </span>
            <div>
              <p className="font-semibold">Run Queue</p>
              <p className="text-xs text-muted-foreground">
                {counts.pending || 0} pending · {counts.running || 0} running · {total} total
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={refresh} title="Refresh">
              <Loader2 className={cn("size-4", loading && "animate-spin")} />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)} aria-label="Close">
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex gap-1.5 border-b px-4 py-2">
          {["all", "pending", "running", "done", "error"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                filter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {s} {s !== "all" && counts[s] ? `(${counts[s]})` : ""}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          {!loading && filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {filter === "all" ? "No runs yet. Emit an event to trigger a workflow." : `No ${filter} runs.`}
            </p>
          )}
          {filtered.map((r) => (
            <div key={r.id} className="rounded-lg border bg-card p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className={cn("flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium", STATUS_STYLES[r.status] ?? "")}>
                  {QUEUE_STATUS_ICONS[r.status]} {r.status}
                </span>
                <span className="text-xs text-muted-foreground">#{r.id}</span>
                <span className="font-mono text-xs text-muted-foreground">{r.event_type}</span>
                {r.attempts > 1 && (
                  <span className="text-xs text-muted-foreground">· attempt {r.attempts}/{r.max_attempts}</span>
                )}
                <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="size-3" />
                  {r.created_at ? new Date(r.created_at).toLocaleString() : ""}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="border-0 text-[10px]">{r.workflow_name}</Badge>
                <Badge variant="secondary" className="border-0 text-[10px]">{r.execution_mode}</Badge>
                <Badge variant="secondary" className="gap-1 border-0 text-[10px]">
                  <ArrowUpDown className="size-2.5" /> p{r.priority}
                </Badge>
              </div>
              {r.response && <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-foreground/90">{r.response}</p>}
              {r.error && <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-destructive">{r.error}</p>}
            </div>
          ))}
        </div>
      </div>
    </ResizableDrawer>
  );
}

/* ------------------------------------------------------------------ */
/*  Events drawer (workspace registry)                                 */
/* ------------------------------------------------------------------ */

function EventsDrawer({
  open,
  onOpenChange,
  eventTypes,
  loading,
  onChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  eventTypes: EventType[];
  loading: boolean;
  onChange: () => Promise<void> | void;
}) {
  return (
    <ResizableDrawer open={open} onOpenChange={onOpenChange} defaultWidth={620}>
      <SheetTitle className="sr-only">Events</SheetTitle>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Webhook className="size-[18px]" />
            </span>
            <div>
              <p className="font-semibold">Events</p>
              <p className="text-xs text-muted-foreground">The signals your apps send (e.g. “todo.completed”) that workflows react to. Shared across the workspace.</p>
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <EventsTab eventTypes={eventTypes} loading={loading} onChange={onChange} />
        </div>
      </div>
    </ResizableDrawer>
  );
}

/* ------------------------------------------------------------------ */
/*  Events tab (registry)                                              */
/* ------------------------------------------------------------------ */

function EventsTab({
  eventTypes,
  loading,
  onChange,
}: {
  eventTypes: EventType[];
  loading: boolean;
  onChange: () => Promise<void> | void;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [schema, setSchema] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [editing, setEditing] = React.useState<string | null>(null);

  const resetForm = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setSchema("");
  };

  const startEdit = (t: EventType) => {
    setEditing(t.name);
    setName(t.name);
    setDescription(t.description ?? "");
    setSchema(t.payload_schema ? JSON.stringify(t.payload_schema, null, 2) : "");
  };

  const add = async () => {
    if (!name.trim()) return;
    let payload_schema: Record<string, unknown> | null = null;
    if (schema.trim()) {
      try {
        payload_schema = JSON.parse(schema);
      } catch {
        toast.error("Schema must be valid JSON");
        return;
      }
    }
    setSaving(true);
    try {
      await upsertEventType({ name: name.trim(), description: description.trim(), payload_schema });
      toast.success(editing ? "Event updated" : "Event registered");
      resetForm();
      await onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (n: string) => {
    if (!confirm(`Delete event type "${n}"?`)) return;
    try {
      await deleteEventType(n);
      await onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 text-sm font-medium">{editing ? `Edit “${editing}”` : "Register an event"}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="todo.completed"
              className="font-mono"
              disabled={editing !== null}
              title={editing ? "Name is the key — delete and re-create to rename" : undefined}
            />
          </Field>
          <Field label="Description">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A todo was completed" />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Payload schema (optional JSON Schema)">
            <Textarea
              value={schema}
              onChange={(e) => setSchema(e.target.value)}
              placeholder='{"type":"object","required":["todos"]}'
              className="min-h-[64px] font-mono text-xs"
            />
          </Field>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          {editing && (
            <Button size="sm" variant="outline" onClick={resetForm} disabled={saving}>
              Cancel
            </Button>
          )}
          <Button size="sm" onClick={add} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : editing ? <Check className="size-4" /> : <Plus className="size-4" />}
            {editing ? "Update event" : "Save event"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="h-20 animate-pulse rounded-xl border bg-card" />
      ) : eventTypes.length === 0 ? (
        <EmptyState
          icon={<Webhook className="size-7" />}
          title="No events registered"
          body="Register the events your external app sends (e.g. “todo.completed”) so workflows can react to them and payloads are validated."
        />
      ) : (
        <div className="space-y-2">
          {eventTypes.map((t) => (
            <div key={t.id} className="flex items-start gap-3 rounded-xl border bg-card p-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Webhook className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-sm font-medium">{t.name}</p>
                  <Badge variant="secondary" className="border-0 text-[10px]">
                    {t.subscribers} workflow{t.subscribers === 1 ? "" : "s"}
                  </Badge>
                  {t.payload_schema && (
                    <Badge variant="secondary" className="border-0 text-[10px]">schema</Badge>
                  )}
                </div>
                {t.description && <p className="mt-0.5 text-sm text-muted-foreground">{t.description}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => startEdit(t)} title="Edit">
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remove(t.name)}
                  className="text-muted-foreground hover:text-destructive"
                  title="Delete"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small helpers                                                      */
/* ------------------------------------------------------------------ */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed bg-card p-10 text-center shadow-sm">
      <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="mb-1 font-semibold tracking-tight">{title}</h3>
      <p className="mx-auto max-w-sm text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}
