"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Copy,
  Loader2,
  ShieldCheck,
  ShieldBan,
  Shield,
  Webhook,
  ArrowUpDown,
  Activity,
  Code2,
  FlaskConical,
  Power,
  Unlock,
  RefreshCcw,
  AlertTriangle,
  Sparkles,
} from "lucide-react";

import { AppLayout } from "@/components/layout/app-layout";
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
import { ConditionBuilder } from "@/components/gates/condition-builder";
import { listEventTypes, type EventType } from "@/lib/api/workflows";
import { EventMultiSelect } from "@/components/event-multiselect";
import {
  listGates,
  createGate,
  updateGate,
  deleteGate,
  evaluateDraft,
  listDecisions,
  gateChat,
  type Gate,
  type GateAction,
  type GateInput,
  type DraftResult,
  type GateDecision,
} from "@/lib/api/gates";

const DESCRIPTION =
  "Rules that allow or deny a proposed action before it runs. An app POSTs the action to /events/decide and honors the verdict. Default is allow — an action is only blocked when a rule explicitly matches and denies it.";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function toInput(g: Gate): GateInput {
  return {
    name: g.name,
    event_types: g.event_types ?? [],
    conditions: g.conditions ?? { match: "all", conditions: [] },
    action: g.action,
    reason: g.reason,
    enabled: g.enabled,
    priority: g.priority,
    allow_override: g.allow_override,
  };
}

const emptyForm: GateInput = {
  name: "",
  event_types: [],
  conditions: { match: "all", conditions: [] },
  action: "deny",
  reason: "",
  enabled: true,
  priority: 0,
  allow_override: false,
};

export default function GatesPage() {
  const [gates, setGates] = React.useState<Gate[]>([]);
  const [eventTypes, setEventTypes] = React.useState<EventType[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [activityOpen, setActivityOpen] = React.useState(false);
  const [codeOpen, setCodeOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [g, ev] = await Promise.all([listGates(), listEventTypes().catch(() => [])]);
      setGates(g);
      setEventTypes(ev);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load gates");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const [initial, setInitial] = React.useState<Gate | null>(null);
  const openNew = () => {
    setEditingId(null);
    setInitial(null);
    setEditorOpen(true);
  };
  const openEdit = (g: Gate) => {
    setEditingId(g.id);
    setInitial(g);
    setEditorOpen(true);
  };

  const save = async (input: GateInput) => {
    if (editingId == null) await createGate(input);
    else await updateGate(editingId, input);
    await load();
  };

  const toggle = async (g: Gate) => {
    setGates((prev) => prev.map((x) => (x.id === g.id ? { ...x, enabled: !x.enabled } : x)));
    try {
      await updateGate(g.id, { ...toInput(g), enabled: !g.enabled });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
      load();
    }
  };

  const remove = async (g: Gate) => {
    if (!confirm(`Delete gate "${g.name}"?`)) return;
    try {
      await deleteGate(g.id);
      setGates((prev) => prev.filter((x) => x.id !== g.id));
      toast.success("Gate deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const headerButtons = (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => setActivityOpen(true)}>
        <Activity className="size-4" />
        Activity
      </Button>
      <Button variant="outline" size="sm" onClick={() => setCodeOpen(true)}>
        <Code2 className="size-4" />
        Integrate
      </Button>
    </div>
  );

  return (
    <AppLayout>
      <div className="flex flex-col">
        {/* Header (matches Triggers) */}
        <div className="border-b border-border">
          <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Gates</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{DESCRIPTION}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">{headerButtons}</div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-6">
          <div className="mx-auto max-w-4xl space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Rules are evaluated in priority order; the first match decides the verdict.
              </p>
              <Button size="sm" onClick={openNew}>
                <Plus className="size-4" /> New gate
              </Button>
            </div>
            <GatesList
              gates={gates}
              loading={loading}
              onNew={openNew}
              onEdit={openEdit}
              onToggle={toggle}
              onRemove={remove}
            />
          </div>
        </div>
      </div>

      <GateEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        initial={initial}
        eventTypes={eventTypes}
        onSave={save}
      />
      <ActivityDrawer open={activityOpen} onOpenChange={setActivityOpen} />
      <CodeDrawer open={codeOpen} onOpenChange={setCodeOpen} />
    </AppLayout>
  );
}

// --------------------------------------------------------------------------- //
// List
// --------------------------------------------------------------------------- //

function GatesList({
  gates,
  loading,
  onNew,
  onEdit,
  onToggle,
  onRemove,
}: {
  gates: Gate[];
  loading: boolean;
  onNew: () => void;
  onEdit: (g: Gate) => void;
  onToggle: (g: Gate) => void;
  onRemove: (g: Gate) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border bg-card" />
        ))}
      </div>
    );
  }
  if (gates.length === 0) {
    return (
      <div className="mx-auto mt-6 max-w-md rounded-2xl border border-dashed bg-card p-12 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Shield className="size-7" />
        </div>
        <h2 className="mb-1.5 text-lg font-semibold tracking-tight">No gates yet</h2>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          Add a gate to allow or deny a high-stakes event (refunds, deletes, external sends)
          before it runs.
        </p>
        <Button size="sm" className="mt-5" onClick={onNew}>
          <Plus className="size-4" /> New gate
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      {gates.map((g) => (
        <div
          key={g.id}
          className={cn("rounded-xl border bg-card p-4 shadow-sm transition-opacity", !g.enabled && "opacity-60")}
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl",
                g.action === "deny" ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-500",
              )}
            >
              {g.action === "deny" ? <ShieldBan className="size-[18px]" /> : <ShieldCheck className="size-[18px]" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{g.name || "Untitled"}</p>
                <Badge variant={g.action === "deny" ? "destructive" : "secondary"} className="border-0 text-[10px]">
                  {g.action}
                </Badge>
                {g.event_types.map((ev) => (
                  <Badge key={ev} variant="secondary" className="gap-1 border-0 font-mono text-[10px]">
                    <Webhook className="size-3" /> {ev}
                  </Badge>
                ))}
                <Badge variant="secondary" className="gap-1 border-0 text-[10px]">
                  <ArrowUpDown className="size-3" /> p{g.priority}
                </Badge>
                {g.allow_override && g.action === "deny" && (
                  <Badge variant="secondary" className="gap-1 border-0 text-[10px]">
                    <Unlock className="size-3" /> overridable
                  </Badge>
                )}
              </div>
              {g.reason && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{g.reason}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Switch checked={g.enabled} onCheckedChange={() => onToggle(g)} aria-label="Enabled" />
              <Button variant="ghost" size="icon-sm" onClick={() => onEdit(g)} title="Edit">
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onRemove(g)}
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

// --------------------------------------------------------------------------- //
// Editor drawer (matches WorkflowEditor)
// --------------------------------------------------------------------------- //

function GateEditor({
  open,
  onOpenChange,
  initial,
  eventTypes,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: Gate | null;
  eventTypes: EventType[];
  onSave: (input: GateInput) => Promise<void>;
}) {
  const [draft, setDraft] = React.useState<GateInput>(emptyForm);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // Plain-English compiler
  const [nl, setNl] = React.useState("");
  const [generating, setGenerating] = React.useState(false);
  const [genReply, setGenReply] = React.useState<string | null>(null);

  const [sample, setSample] = React.useState('{\n  "user": { "role": "member" },\n  "amount": 750\n}');
  const [testing, setTesting] = React.useState(false);
  const [result, setResult] = React.useState<DraftResult | null>(null);
  const [testErr, setTestErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setDraft(initial ? toInput(initial) : emptyForm);
      setErr(null);
      setResult(null);
      setTestErr(null);
      setNl("");
      setGenReply(null);
    }
  }, [open, initial]);

  const set = (patch: Partial<GateInput>) => setDraft((d) => ({ ...d, ...patch }));

  const generate = async () => {
    if (!nl.trim()) return;
    setGenerating(true);
    setGenReply(null);
    try {
      const { reply, gate } = await gateChat([{ role: "user", content: nl }]);
      setGenReply(reply);
      if (gate) {
        setDraft((d) => ({
          ...d,
          name: gate.name || d.name,
          event_types: gate.event_types?.length ? gate.event_types : d.event_types,
          action: gate.action,
          reason: gate.reason,
          allow_override: gate.allow_override,
          conditions: gate.conditions ?? d.conditions,
        }));
      }
    } catch (e) {
      setGenReply(e instanceof Error ? e.message : "Could not compile that");
    } finally {
      setGenerating(false);
    }
  };

  const submit = async () => {
    if (!draft.name.trim()) {
      setErr("Give the gate a name");
      return;
    }
    if (draft.event_types.length === 0) {
      setErr("Pick at least one event");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await onSave(draft);
      onOpenChange(false);
      toast.success(initial ? "Gate saved" : "Gate created");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save gate");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTestErr(null);
    setResult(null);
    let payload: unknown;
    try {
      payload = sample.trim() ? JSON.parse(sample) : null;
    } catch {
      setTestErr("Sample payload is not valid JSON");
      return;
    }
    setTesting(true);
    try {
      setResult(
        await evaluateDraft({
          type: draft.event_types[0] || "test.event",
          payload,
          conditions: draft.conditions,
          action: draft.action,
          reason: draft.reason,
        }),
      );
    } catch (e) {
      setTestErr(e instanceof Error ? e.message : "Evaluation failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <ResizableDrawer open={open} onOpenChange={onOpenChange} defaultWidth={640} minWidth={480}>
      <SheetTitle className="sr-only">{initial ? "Edit gate" : "New gate"}</SheetTitle>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Shield className="size-[18px]" />
            </span>
            <p className="font-semibold">{initial ? "Edit gate" : "New gate"}</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {/* Plain-English compiler */}
          <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/[0.04] p-3">
            <Label htmlFor="gate-nl" className="flex items-center gap-1.5 text-primary">
              <Sparkles className="size-4" /> Describe the rule in plain English
            </Label>
            <Textarea
              id="gate-nl"
              placeholder="e.g. Block refunds over $500 unless the user is an admin."
              value={nl}
              onChange={(e) => setNl(e.target.value)}
              className="min-h-[60px] bg-background"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Fills in the fields + conditions below.</p>
              <Button size="sm" onClick={generate} disabled={generating || !nl.trim()}>
                {generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Generate
              </Button>
            </div>
            {genReply && <p className="text-xs text-muted-foreground">{genReply}</p>}
          </div>

          <Field label="Name">
            <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="High-value refund needs approval" />
          </Field>


          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Events">
              <EventMultiSelect
                options={eventTypes.map((t) => t.name)}
                selected={new Set(draft.event_types)}
                onToggle={(ev) =>
                  set({
                    event_types: draft.event_types.includes(ev)
                      ? draft.event_types.filter((x) => x !== ev)
                      : [...draft.event_types, ev],
                  })
                }
              />
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
            <Field label="When matched">
              <Select value={draft.action} onValueChange={(v) => set({ action: v as GateAction })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deny">Deny (block the action)</SelectItem>
                  <SelectItem value="allow">Allow (explicitly permit)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Reason (returned on match)">
              <Input
                value={draft.reason}
                onChange={(e) => set({ reason: e.target.value })}
                placeholder="Needs manager approval"
              />
            </Field>
          </div>

          <div>
            <Label className="mb-1.5 block">Conditions</Label>
            <ConditionBuilder value={draft.conditions} onChange={(c) => set({ conditions: c })} />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Fields are dot paths into the payload, e.g.{" "}
              <code className="font-mono">payload.user.role</code>. Values auto-parse
              (<code>500</code> → number, <code>true</code> → boolean).
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm">
              <Power className="size-4 text-muted-foreground" /> Enabled
            </div>
            <Switch checked={draft.enabled} onCheckedChange={(v) => set({ enabled: v })} />
          </div>

          {draft.action === "deny" && (
            <div className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5">
              <div className="flex items-start gap-2 text-sm">
                <Unlock className="mt-0.5 size-4 text-muted-foreground" />
                <div>
                  <p>Allow override (soft deny)</p>
                  <p className="text-xs text-muted-foreground">
                    Verdict stays <code>deny</code> but is marked <code>overridable</code>, so the
                    caller may proceed instead of being hard-blocked.
                  </p>
                </div>
              </div>
              <Switch checked={draft.allow_override} onCheckedChange={(v) => set({ allow_override: v })} />
            </div>
          )}

          {/* Test panel */}
          <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/[0.04] p-3">
            <div className="flex items-center gap-2">
              <Label className="flex items-center gap-1.5 text-primary">
                <FlaskConical className="size-4" /> Test with a sample payload
              </Label>
              <Button type="button" size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={runTest} disabled={testing}>
                {testing ? <Loader2 className="size-3.5 animate-spin" /> : <FlaskConical className="size-3.5" />}
                Run test
              </Button>
            </div>
            <Textarea value={sample} onChange={(e) => setSample(e.target.value)} rows={5} className="bg-background font-mono text-xs" />
            {testErr && <p className="text-xs text-destructive">{testErr}</p>}
            {result && (
              <div className="flex items-center gap-2 text-sm">
                {result.matched ? (
                  <>
                    <Badge variant={result.action === "deny" ? "destructive" : "secondary"}>
                      {result.action.toUpperCase()}
                    </Badge>
                    <span className="text-muted-foreground">
                      This rule fires{result.reason ? ` — ${result.reason}` : ""}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    This rule does not fire — the verdict falls to other gates, or the default (allow).
                  </span>
                )}
              </div>
            )}
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

// --------------------------------------------------------------------------- //
// Activity drawer (matches QueueDrawer)
// --------------------------------------------------------------------------- //

function ActivityDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [rows, setRows] = React.useState<GateDecision[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [filter, setFilter] = React.useState<"all" | "allow" | "deny">("all");

  const refresh = React.useCallback(() => {
    setLoading(true);
    listDecisions(200)
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const counts = React.useMemo(() => {
    const c = { allow: 0, deny: 0 };
    rows.forEach((r) => (r.decision === "deny" ? c.deny++ : c.allow++));
    return c;
  }, [rows]);
  const filtered = filter === "all" ? rows : rows.filter((r) => r.decision === filter);

  return (
    <ResizableDrawer open={open} onOpenChange={onOpenChange} defaultWidth={680}>
      <SheetTitle className="sr-only">Decision activity</SheetTitle>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Activity className="size-[18px]" />
            </span>
            <div>
              <p className="font-semibold">Decision activity</p>
              <p className="text-xs text-muted-foreground">
                {counts.allow} allowed · {counts.deny} denied · {rows.length} total
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={refresh} title="Refresh">
              <RefreshCcw className={cn("size-4", loading && "animate-spin")} />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)} aria-label="Close">
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex gap-1.5 border-b px-4 py-2">
          {(["all", "allow", "deny"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                filter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {s} {s !== "all" && counts[s] ? `(${counts[s]})` : ""}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          {!loading && filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No decisions yet. They appear here once apps call /events/decide.
            </p>
          )}
          {filtered.map((r) => (
            <div key={r.id} className="rounded-lg border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={r.decision === "deny" ? "destructive" : "secondary"} className="text-[10px]">
                  {r.decision}
                </Badge>
                {r.overridable && (
                  <Badge variant="secondary" className="gap-1 border-0 text-[10px]">
                    <Unlock className="size-2.5" /> soft
                  </Badge>
                )}
                <span className="font-mono text-xs text-muted-foreground">{r.event_type}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {r.created_at ? new Date(r.created_at).toLocaleString() : ""}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  rule:{" "}
                  {r.matched_gate_name ? (
                    <span className="text-foreground">{r.matched_gate_name}</span>
                  ) : (
                    "default"
                  )}
                </span>
                {r.reason && <span>· {r.reason}</span>}
                {r.payload ? <pre> {JSON.stringify(r.payload)}</pre>:""}
              </div>
            </div>
          ))}
        </div>
      </div>
    </ResizableDrawer>
  );
}

// --------------------------------------------------------------------------- //
// Integrate drawer (matches Triggers' CodeDrawer)
// --------------------------------------------------------------------------- //

function CopyBlock({ filename, code }: { filename: string; code: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
        <span className="font-mono text-xs text-muted-foreground">{filename}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="h-6 w-6"
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
        </Button>
      </div>
      <pre className="overflow-x-auto bg-muted/40 p-4 font-mono text-[12px] leading-relaxed">{code}</pre>
    </div>
  );
}

/** Drawer with a generic, drop-in sample so users know how to gate an action
 *  before it runs — call /events/decide and honor the verdict. */
function CodeDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const base = (
    typeof window !== "undefined"
      ? process.env.NEXT_PUBLIC_API_BASE_URL ?? window.location.origin.replace(":3000", ":8000")
      : process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"
  ).replace(/\/$/, "");

  const envExample = `ATELIER_URL=${base}
ATELIER_API_KEY=ate-...          # Config → API key (per-user key)
ATELIER_WORKSPACE_ID=1           # optional — omit for your personal workspace`;

  const integrationPy = `import httpx
import os
import dotenv

dotenv.load_dotenv()

ATELIER_URL = os.getenv("ATELIER_URL", "")
ATELIER_API_KEY = os.getenv("ATELIER_API_KEY", "")
ATELIER_WORKSPACE_ID = os.getenv("ATELIER_WORKSPACE_ID", "")

http = httpx.Client(
    timeout=8,
    base_url=ATELIER_URL,
    headers={
        "X-API-Key": ATELIER_API_KEY,
        "X-Workspace-Id": ATELIER_WORKSPACE_ID,
    },
)


class Blocked(Exception):
    """Raised when a gate hard-denies the action."""


def check_gate(event_type: str, payload: dict) -> dict:
    """Vet an action with Atelier BEFORE doing it. Raises Blocked on a hard deny;
    returns the verdict so you can decide what to do with a soft (overridable) deny."""
    verdict = http.post(
        "/api/v1/events/decide",
        json={"type": event_type, "payload": payload},
    ).json()
    if verdict["decision"] == "deny" and not verdict["overridable"]:
        raise Blocked(verdict.get("reason") or "Blocked by a gate")
    return verdict`;

  const usagePy = `from integration import check_gate, Blocked


@app.post("/api/refunds", status_code=201)
async def create_refund(data: RefundCreate):
    # gate the action first — a matching deny stops it right here
    try:
        check_gate("refund.requested", {
            "user": {"role": data.role},
            "amount": data.amount,
        })
    except Blocked as e:
        raise HTTPException(status_code=403, detail=str(e))

    # allowed (or overridable) — go ahead
    return process_refund(data)`;

  return (
    <ResizableDrawer open={open} onOpenChange={onOpenChange} defaultWidth={660}>
      <SheetTitle className="sr-only">Integration sample</SheetTitle>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2.5 border-b px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Code2 className="size-[18px]" />
            </span>
            <div>
              <p className="font-semibold">Gate an action before it runs</p>
              <p className="text-xs text-muted-foreground">
                Drop this in and call <code className="font-mono">check_gate</code> — a matching deny stops the action.
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">1 · Configure</p>
            <CopyBlock filename=".env" code={envExample} />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">2 · Add the helper</p>
            <CopyBlock filename="integration.py" code={integrationPy} />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">3 · Gate where it happens</p>
            <CopyBlock filename="app.py" code={usagePy} />
          </div>
          <p className="text-xs text-muted-foreground">
            No dependency needed — any HTTP client works. POST{" "}
            <code className="font-mono">/api/v1/events/decide</code> with{" "}
            <code className="font-mono">{"{ type, payload }"}</code>, then honor{" "}
            <code className="font-mono">decision</code> (a soft deny sets{" "}
            <code className="font-mono">overridable: true</code>).
          </p>
        </div>
      </div>
    </ResizableDrawer>
  );
}
