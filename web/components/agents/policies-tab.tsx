"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SheetClose,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ResizableDrawer } from "@/components/ui/resizable-drawer";
import {
  getAgentPolicies,
  setAgentPolicies,
  proposePolicies,
  policyChat,
  type AgentPolicy,
  type PolicyRule,
} from "@/lib/api/integration";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ShieldCheck,
  Plus,
  Trash2,
  Pencil,
  AlertTriangle,
  Loader2,
  X,
  Wand2,
  Ban,
  Sparkles,
  Code2,
  Check,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Rule op metadata                                                   */
/* ------------------------------------------------------------------ */

const OPS: { value: string; label: string; kind: "number" | "list" | "none" | "text" }[] = [
  { value: "max", label: "Clamp to max (≤)", kind: "number" },
  { value: "min", label: "Clamp to min (≥)", kind: "number" },
  { value: "deny_above", label: "Deny if greater than", kind: "number" },
  { value: "deny_below", label: "Deny if less than", kind: "number" },
  { value: "allow_values", label: "Allow only these values", kind: "list" },
  { value: "deny_if_contains", label: "Deny if contains", kind: "text" },
  { value: "deny_if_equals", label: "Deny if equals", kind: "text" },
  { value: "deny_if_matches", label: "Deny if matches (regex)", kind: "text" },
  { value: "mask", label: "Mask (PII)", kind: "none" },
  { value: "redact", label: "Redact (remove)", kind: "none" },
  { value: "deny_if_present", label: "Deny if present", kind: "none" },
  { value: "required", label: "Require (deny if missing)", kind: "none" },
];

// Condition ops (the "WHEN" side — predicates, not deny-actions).
const COND_OPS: { value: string; label: string; kind: "number" | "list" | "text" }[] = [
  { value: "equals", label: "equals", kind: "text" },
  { value: "not_equals", label: "not equals", kind: "text" },
  { value: "contains", label: "contains", kind: "text" },
  { value: "matches", label: "matches (regex)", kind: "text" },
  { value: "in", label: "in list", kind: "list" },
  { value: "gt", label: "greater than", kind: "number" },
  { value: "lt", label: "less than", kind: "number" },
];
const condKind = (op: string) => COND_OPS.find((o) => o.value === op)?.kind ?? "text";

const opKind = (op: string) => OPS.find((o) => o.value === op)?.kind ?? "none";
const isDenyOp = (op: string) =>
  op === "deny_above" || op === "deny_below" || op === "deny_if_present" ||
  op === "required" || op === "allow_values" || op === "deny_if_contains" ||
  op === "deny_if_equals" || op === "deny_if_matches";

function parseValueForKind(kind: string, raw: string): unknown {
  if (kind === "number") {
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  }
  if (kind === "list") return raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (kind === "text") return raw;
  return undefined;
}

function valueToStringForKind(kind: string, v: unknown): string {
  if (kind === "list") return Array.isArray(v) ? v.join(", ") : String(v ?? "");
  return v == null ? "" : String(v);
}

const parseValue = (op: string, raw: string) => parseValueForKind(opKind(op), raw);
const valueToString = (op: string, v: unknown) => valueToStringForKind(opKind(op), v);

function ruleSummary(r: PolicyRule): string {
  const f = r.field || "field";
  switch (r.op) {
    case "max": return `${f} ≤ ${r.value}`;
    case "min": return `${f} ≥ ${r.value}`;
    case "deny_above": return `deny ${f} > ${r.value}`;
    case "deny_below": return `deny ${f} < ${r.value}`;
    case "mask": return `mask ${f}`;
    case "redact": return `redact ${f}`;
    case "deny_if_present": return `deny if ${f}`;
    case "required": return `${f} required`;
    case "allow_values": return `${f} ∈ {${Array.isArray(r.value) ? r.value.join(", ") : r.value}}`;
    case "deny_if_contains": return `deny if ${f} contains "${r.value}"`;
    case "deny_if_equals": return `deny if ${f} = "${r.value}"`;
    case "deny_if_matches": return `deny if ${f} ~ /${r.value}/`;
    default: return `${f} ${r.op}`;
  }
}

const emptyPolicy = (): AgentPolicy => ({ name: "", action: "*", enabled: true, guidance: "", rules: [], conditions: [], match: "all" });

/* ------------------------------------------------------------------ */
/*  Tab                                                                */
/* ------------------------------------------------------------------ */

export function PoliciesContent({ agentId }: { agentId: number }) {
  const [policies, setPolicies] = React.useState<AgentPolicy[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editIndex, setEditIndex] = React.useState<number | null>(null);
  const [suggestions, setSuggestions] = React.useState<AgentPolicy[]>([]);
  const [proposing, setProposing] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    getAgentPolicies(agentId)
      .then((p) => mounted && setPolicies(p))
      .catch((e) => mounted && setError(e instanceof Error ? e.message : "Failed to load policies"))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [agentId]);

  const persist = async (next: AgentPolicy[]) => {
    const prev = policies;
    setPolicies(next); // optimistic
    setSaving(true);
    try {
      const saved = await setAgentPolicies(agentId, next);
      setPolicies(saved);
      toast.success("Policies saved");
    } catch (e) {
      setPolicies(prev); // rollback
      toast.error(e instanceof Error ? e.message : "Failed to save policies");
    } finally {
      setSaving(false);
    }
  };

  const openNew = () => {
    setEditIndex(null);
    setEditorOpen(true);
  };
  const openEdit = (i: number) => {
    setEditIndex(i);
    setEditorOpen(true);
  };

  const handleSaveEditor = async (policy: AgentPolicy) => {
    const next = [...policies];
    if (editIndex == null) next.push(policy);
    else next[editIndex] = policy;
    await persist(next);
    setEditorOpen(false);
  };

  const toggleEnabled = (i: number) => {
    const next = policies.map((p, idx) => (idx === i ? { ...p, enabled: !p.enabled } : p));
    persist(next);
  };

  const remove = (i: number) => {
    if (!confirm(`Delete policy "${policies[i].name}"?`)) return;
    persist(policies.filter((_, idx) => idx !== i));
  };

  const suggest = async () => {
    setProposing(true);
    try {
      const proposed = await proposePolicies(agentId);
      setSuggestions(proposed);
      if (proposed.length === 0) toast.info("No new policies to suggest yet — run more decisions first.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to propose policies");
    } finally {
      setProposing(false);
    }
  };

  const acceptSuggestion = (i: number) => {
    const s = suggestions[i];
    setSuggestions((prev) => prev.filter((_, idx) => idx !== i));
    persist([...policies, s]);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border bg-card" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          Rules this agent enforces when intercepting actions. Natural-language guidance is sent to the
          agent; structured rules are enforced deterministically on every decision.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={suggest} disabled={proposing}>
            {proposing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Suggest
          </Button>
          <Button size="sm" onClick={openNew} disabled={saving}>
            <Plus className="size-4" />
            New policy
          </Button>
        </div>
      </div>

      {/* Where policies come from */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Policies come from:</span>
        <span className="inline-flex items-center gap-1.5"><Code2 className="size-3.5" /> code (per call site)</span>
        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-primary" /> here (cross-cutting)</span>
        <span className="inline-flex items-center gap-1.5"><Sparkles className="size-3.5 text-primary" /> AI-proposed (from decisions)</span>
      </div>

      {/* AI suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/[0.04] p-3">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
              <Sparkles className="size-4" />
              Suggested from recent decisions
            </p>
            <Button variant="ghost" size="icon-sm" onClick={() => setSuggestions([])} aria-label="Dismiss all">
              <X className="size-4" />
            </Button>
          </div>
          {suggestions.map((s, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg border bg-card p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{s.name || "Untitled"}</p>
                  <Badge variant="secondary" className="border-0 font-mono text-[10px]">{s.action}</Badge>
                </div>
                {s.guidance && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{s.guidance}</p>}
                {s.rules.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.rules.map((r, ri) => (
                      <span key={ri} className="rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-foreground/80">
                        {ruleSummary(r)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="sm" onClick={() => acceptSuggestion(i)} disabled={saving}>
                  <Check className="size-3.5" />
                  Add
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setSuggestions((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label="Dismiss"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {policies.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="size-7" />
          </div>
          <h3 className="mb-1 font-semibold tracking-tight">No policies yet</h3>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            Add a policy to bound what this agent may do — e.g. “discounts ≤ 50%”, “mask emails”,
            “deny refunds over $1,000”. Just describe it in plain English.
          </p>
          <Button size="sm" className="mt-5" onClick={openNew}>
            <Plus className="size-4" />
            New policy
          </Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {policies.map((p, i) => (
            <div
              key={i}
              className={cn(
                "rounded-xl border bg-card p-4 shadow-sm transition-opacity",
                !p.enabled && "opacity-60"
              )}
            >
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ShieldCheck className="size-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{p.name || "Untitled policy"}</p>
                    <Badge variant="secondary" className="border-0 font-mono text-[10px]">{p.action}</Badge>
                    {p.rules.some((r) => isDenyOp(r.op)) && (
                      <Badge className="gap-1 border-0 bg-destructive/10 text-destructive">
                        <Ban className="size-3" /> can deny
                      </Badge>
                    )}
                    {p.rules.some((r) => !isDenyOp(r.op)) && (
                      <Badge className="gap-1 border-0 bg-primary/10 text-primary">
                        <Wand2 className="size-3" /> can modify
                      </Badge>
                    )}
                  </div>
                  {p.guidance && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.guidance}</p>
                  )}
                  {p.rules.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {p.rules.map((r, ri) => (
                        <span key={ri} className="rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-foreground/80">
                          {ruleSummary(r)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Switch checked={p.enabled} onCheckedChange={() => toggleEnabled(i)} aria-label="Enabled" />
                  <Button variant="ghost" size="icon-sm" onClick={() => openEdit(i)} title="Edit">
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => remove(i)}
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
      )}

      <PolicyEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        initial={editIndex == null ? null : policies[editIndex]}
        agentId={agentId}
        saving={saving}
        onSave={handleSaveEditor}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Editor drawer                                                      */
/* ------------------------------------------------------------------ */

function PolicyEditor({
  open,
  onOpenChange,
  initial,
  agentId,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: AgentPolicy | null;
  agentId: number;
  saving: boolean;
  onSave: (p: AgentPolicy) => void;
}) {
  const [draft, setDraft] = React.useState<AgentPolicy>(emptyPolicy());
  const [err, setErr] = React.useState<string | null>(null);
  const [nl, setNl] = React.useState("");
  const [generating, setGenerating] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setErr(null);
      setNl("");
      setDraft(initial ? JSON.parse(JSON.stringify(initial)) : emptyPolicy());
    }
  }, [open, initial]);

  // Compile a plain-English description into rules and fill the form.
  const generate = async () => {
    const text = nl.trim();
    if (!text) return;
    setGenerating(true);
    setErr(null);
    try {
      const { policies } = await policyChat(agentId, [{ role: "user", content: text }]);
      const p = policies[0];
      if (!p) {
        setErr("Couldn't turn that into a rule — try being more specific (e.g. \"discounts can't exceed 50%\").");
        return;
      }
      setDraft((d) => ({
        ...d,
        name: d.name.trim() || p.name,
        action: p.action || d.action,
        guidance: p.guidance ?? d.guidance,
        rules: p.rules ?? [],
      }));
      toast.success(`Generated ${p.rules.length} rule${p.rules.length === 1 ? "" : "s"}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setGenerating(false);
    }
  };

  const setRule = (i: number, patch: Partial<PolicyRule>) =>
    setDraft((d) => ({ ...d, rules: d.rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));

  const addRule = () =>
    setDraft((d) => ({ ...d, rules: [...d.rules, { field: "", op: "max", value: 0 }] }));

  const removeRule = (i: number) =>
    setDraft((d) => ({ ...d, rules: d.rules.filter((_, idx) => idx !== i) }));

  const conditions = draft.conditions ?? [];
  const setCond = (i: number, patch: Partial<PolicyRule>) =>
    setDraft((d) => ({ ...d, conditions: (d.conditions ?? []).map((c, idx) => (idx === i ? { ...c, ...patch } : c)) }));
  const addCond = () =>
    setDraft((d) => ({ ...d, conditions: [...(d.conditions ?? []), { field: "", op: "equals", value: "" }] }));
  const removeCond = (i: number) =>
    setDraft((d) => ({ ...d, conditions: (d.conditions ?? []).filter((_, idx) => idx !== i) }));

  const submit = () => {
    if (!draft.name.trim()) {
      setErr("Name is required");
      return;
    }
    const cleaned: AgentPolicy = {
      ...draft,
      name: draft.name.trim(),
      action: draft.action.trim() || "*",
      guidance: draft.guidance?.trim() || null,
      match: draft.match === "any" ? "any" : "all",
      conditions: (draft.conditions ?? []).filter((c) => c.field.trim()).map((c) => ({
        field: c.field.trim(),
        op: c.op,
        value: c.value,
      })),
      rules: draft.rules.filter((r) => r.field.trim()).map((r) => ({
        field: r.field.trim(),
        op: r.op,
        ...(opKind(r.op) === "none" ? {} : { value: r.value }),
      })),
    };
    onSave(cleaned);
  };

  return (
    <ResizableDrawer open={open} onOpenChange={onOpenChange} defaultWidth={560}>
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ShieldCheck className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <SheetTitle className="text-base">{initial ? "Edit policy" : "New policy"}</SheetTitle>
                <SheetDescription className="text-xs">Bound what the agent may do.</SheetDescription>
              </div>
            </div>
            <SheetClose asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close">
                <X className="size-4" />
              </Button>
            </SheetClose>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
            {/* Plain-English compiler */}
            <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/[0.04] p-3">
              <Label htmlFor="pol-nl" className="flex items-center gap-1.5 text-primary">
                <Wand2 className="size-4" />
                Describe it in plain English
              </Label>
              <Textarea
                id="pol-nl"
                placeholder="e.g. Discounts can never exceed 50%, and always mask customer emails."
                value={nl}
                onChange={(e) => setNl(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate();
                }}
                className="min-h-[64px] bg-background"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Fills in the fields below — review before saving.</p>
                <Button size="sm" onClick={generate} disabled={generating || !nl.trim()}>
                  {generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  Generate
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
              <div className="space-y-2">
                <Label htmlFor="pol-name">Name</Label>
                <Input id="pol-name" placeholder="Discount cap" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pol-action">Action</Label>
                <Input id="pol-action" placeholder="db.update.*" value={draft.action} onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))} className="font-mono" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pol-guidance">Guidance (sent to the agent)</Label>
              <Textarea
                id="pol-guidance"
                placeholder="Discounts may never exceed 50%. Treat any email or phone as PII."
                value={draft.guidance ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, guidance: e.target.value }))}
                className="min-h-[80px]"
              />
            </div>

            {/* Conditions (WHEN this policy applies) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Conditions (when this applies)</Label>
                <div className="flex items-center gap-2">
                  {conditions.length > 1 && (
                    <div className="flex overflow-hidden rounded-md border text-[11px]">
                      {(["all", "any"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setDraft((d) => ({ ...d, match: m }))}
                          className={cn(
                            "px-2 py-1",
                            (draft.match ?? "all") === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                          )}
                        >
                          Match {m.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  )}
                  <Button variant="outline" size="xs" onClick={addCond}>
                    <Plus className="size-3.5" />
                    Add condition
                  </Button>
                </div>
              </div>
              {conditions.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">
                  No conditions — applies to every matching action. Add one to scope it (e.g. only for a specific user).
                </p>
              ) : (
                <div className="space-y-2">
                  {conditions.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        placeholder="field (e.g. user)"
                        value={c.field}
                        onChange={(e) => setCond(i, { field: e.target.value })}
                        className="w-28 shrink-0 font-mono text-sm"
                      />
                      <Select value={c.op} onValueChange={(op) => setCond(i, { op, value: condKind(op) === "list" ? [] : condKind(op) === "number" ? 0 : "" })}>
                        <SelectTrigger className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COND_OPS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder={condKind(c.op) === "list" ? "a, b, c" : "value"}
                        value={valueToStringForKind(condKind(c.op), c.value)}
                        onChange={(e) => setCond(i, { value: parseValueForKind(condKind(c.op), e.target.value) })}
                        className="w-24 shrink-0 text-sm"
                      />
                      <Button variant="ghost" size="icon-sm" onClick={() => removeCond(i)} className="shrink-0 text-muted-foreground hover:text-destructive">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Rules (enforced deterministically)</Label>
                <Button variant="outline" size="xs" onClick={addRule}>
                  <Plus className="size-3.5" />
                  Add rule
                </Button>
              </div>
              {draft.rules.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                  No structured rules — this policy only sends guidance to the agent.
                </p>
              ) : (
                <div className="space-y-2">
                  {draft.rules.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        placeholder="field"
                        value={r.field}
                        onChange={(e) => setRule(i, { field: e.target.value })}
                        className="w-28 shrink-0 font-mono text-sm"
                      />
                      <Select
                        value={r.op}
                        onValueChange={(op) =>
                          setRule(i, {
                            op,
                            value:
                              opKind(op) === "none" ? undefined
                              : opKind(op) === "list" ? []
                              : opKind(op) === "text" ? ""
                              : 0,
                          })
                        }
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OPS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {opKind(r.op) !== "none" && (
                        <Input
                          placeholder={opKind(r.op) === "list" ? "a, b, c" : "value"}
                          value={valueToString(r.op, r.value)}
                          onChange={(e) => setRule(i, { value: parseValue(r.op, e.target.value) })}
                          className="w-24 shrink-0 text-sm"
                        />
                      )}
                      <Button variant="ghost" size="icon-sm" onClick={() => removeRule(i)} className="shrink-0 text-muted-foreground hover:text-destructive">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {err && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="size-4 shrink-0" />
                {err}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
            <SheetClose asChild>
              <Button variant="outline">Cancel</Button>
            </SheetClose>
            <Button onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              {initial ? "Save policy" : "Add policy"}
            </Button>
          </div>
        </div>
    </ResizableDrawer>
  );
}
