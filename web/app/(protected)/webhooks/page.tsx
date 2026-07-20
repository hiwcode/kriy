"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, X, Send, RefreshCcw, Copy, Check, KeyRound, ListChecks, Loader2,
} from "lucide-react";

import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ResizableDrawer } from "@/components/ui/resizable-drawer";
import { SheetTitle } from "@/components/ui/sheet";
import { EventMultiSelect } from "@/components/event-multiselect";
import { cn } from "@/lib/utils";
import {
  listWebhooks, createWebhook, updateWebhook, rotateSecret, deleteWebhook,
  listDeliveries, replayDelivery,
  type Webhook, type WebhookDelivery,
} from "@/lib/api/webhooks";

function fmt(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  return isNaN(d.getTime()) ? "" : d.toLocaleString();
}

// Platform lifecycle events Atelier delivers OUTBOUND. App events (application.*,
// document.*) flow INTO Atelier to fire Triggers/Gates — they are never delivered
// back out via webhooks, so only these are subscribable. (run.completed fires today;
// run.failed + gate.decided are wired next.)
const PLATFORM_EVENTS = ["run.completed", "run.failed", "gate.decided"];

export default function WebhooksPage() {
  const [hooks, setHooks] = React.useState<Webhook[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [revealed, setRevealed] = React.useState<string | null>(null);

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Webhook | null>(null);
  const [url, setUrl] = React.useState("");
  const [selEvents, setSelEvents] = React.useState<Set<string>>(new Set(["run.completed"]));
  const [enabled, setEnabled] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const buildEvents = (): string[] => {
    const all = Array.from(selEvents);
    return all.length ? all : ["run.completed"];
  };

  const [deliveriesFor, setDeliveriesFor] = React.useState<Webhook | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setHooks(await listWebhooks());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load webhooks");
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    setUrl("");
    setSelEvents(new Set(["run.completed"]));
    setEnabled(true);
    setOpen(true);
  };
  const openEdit = (w: Webhook) => {
    setEditing(w);
    setUrl(w.url);
    setSelEvents(new Set(w.event_types));
    setEnabled(w.enabled);
    setOpen(true);
  };

  const save = async () => {
    if (!url.trim()) { toast.error("Endpoint URL is required"); return; }
    setSaving(true);
    try {
      const event_types = buildEvents();
      if (editing) {
        await updateWebhook(editing.id, { url: url.trim(), event_types, enabled });
        toast.success("Webhook updated");
      } else {
        const created = await createWebhook({ url: url.trim(), event_types });
        toast.success("Webhook created");
        if (created.secret) setRevealed(created.secret);
      }
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save webhook");
    } finally {
      setSaving(false);
    }
  };

  const rotate = async (w: Webhook) => {
    if (!confirm("Rotate the signing secret? The old secret stops working immediately.")) return;
    try {
      const updated = await rotateSecret(w.id);
      if (updated.secret) setRevealed(updated.secret);
      toast.success("Secret rotated");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to rotate secret");
    }
  };

  const toggle = async (w: Webhook) => {
    setHooks((prev) => prev.map((x) => (x.id === w.id ? { ...x, enabled: !x.enabled } : x)));
    try {
      await updateWebhook(w.id, { url: w.url, event_types: w.event_types, enabled: !w.enabled });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
      load();
    }
  };

  const remove = async (w: Webhook) => {
    if (!confirm(`Delete webhook to ${w.url}?`)) return;
    try {
      await deleteWebhook(w.id);
      setHooks((prev) => prev.filter((x) => x.id !== w.id));
      toast.success("Webhook deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col">
        <div className="border-b border-border">
          <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Webhooks</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Atelier POSTs platform events (e.g. <code className="font-mono">run.completed</code>) to your
                endpoints — signed and retried — so external systems get async results back. The outbound
                counterpart to Events.
              </p>
            </div>
            <Button size="sm" onClick={openNew}><Plus className="size-4" /> New webhook</Button>
          </div>
        </div>

        <div className="flex-1 p-6">
          <div className="mx-auto max-w-3xl space-y-4">
            {revealed && (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-300">
                  <KeyRound className="size-4" /> Signing secret — copy it now, it won&apos;t be shown again
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 truncate rounded-md bg-background px-3 py-2 font-mono text-xs">{revealed}</code>
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(revealed); toast.success("Copied"); }}>
                    <Copy className="size-3.5" /> Copy
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => setRevealed(null)} aria-label="Dismiss"><X className="size-4" /></Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Verify deliveries with <code className="font-mono">X-Atelier-Signature: t=…,v1=HMAC_SHA256(secret, &quot;t.body&quot;)</code>.
                </p>
              </div>
            )}

            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : hooks.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-card p-12 text-center shadow-sm">
                <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Send className="size-7" />
                </div>
                <h2 className="mb-1.5 text-lg font-semibold tracking-tight">No webhooks yet</h2>
                <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                  Add an endpoint to receive events like <code className="font-mono">run.completed</code> —
                  the way to get an agent&apos;s async result back into your app.
                </p>
                <Button size="sm" className="mt-4" onClick={openNew}><Plus className="size-4" /> New webhook</Button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {hooks.map((w) => (
                  <div key={w.id} className={cn("rounded-xl border bg-card p-4 shadow-sm transition-opacity", !w.enabled && "opacity-60")}>
                    <div className="flex items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Send className="size-[18px]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-mono text-sm font-medium">{w.url}</p>
                          {w.event_types.map((e) => (
                            <Badge key={e} variant="secondary" className="border-0 text-[10px]">{e}</Badge>
                          ))}
                          {!w.enabled && <Badge variant="outline" className="text-[10px]">disabled</Badge>}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          secret {w.secret_hint ?? "—"} · added {fmt(w.created_at)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Switch checked={w.enabled} onCheckedChange={() => toggle(w)} aria-label="Enabled" />
                        <Button variant="ghost" size="icon-sm" onClick={() => setDeliveriesFor(w)} title="Deliveries"><ListChecks className="size-4" /></Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => rotate(w)} title="Rotate secret"><KeyRound className="size-4" /></Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(w)} title="Edit"><Pencil className="size-4" /></Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => remove(w)} title="Delete" className="text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Editor */}
      <ResizableDrawer open={open} onOpenChange={setOpen} defaultWidth={560} minWidth={440}>
        <SheetTitle className="sr-only">{editing ? "Edit webhook" : "New webhook"}</SheetTitle>
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Send className="size-[18px]" /></span>
              <p className="font-semibold">{editing ? "Edit webhook" : "New webhook"}</p>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close"><X className="size-4" /></Button>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
            <div className="space-y-1.5">
              <Label>Endpoint URL</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-app.com/atelier/webhook" className="font-mono" />
              <p className="text-xs text-muted-foreground">Must be a public https URL in production. Atelier POSTs the signed event here.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Events</Label>
              <EventMultiSelect
                options={PLATFORM_EVENTS}
                selected={selEvents}
                onToggle={(ev) =>
                  setSelEvents((prev) => {
                    const n = new Set(prev);
                    if (n.has(ev)) n.delete(ev);
                    else n.add(ev);
                    return n;
                  })
                }
              />
              <p className="text-xs text-muted-foreground">Pick the events to receive. At least one required.</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
              <span className="text-sm">Enabled</span>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
            {editing && (
              <p className="text-xs text-muted-foreground">
                The signing secret is hidden. Use <b>Rotate secret</b> on the list to generate a new one.
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {editing ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </ResizableDrawer>

      <DeliveriesDrawer webhook={deliveriesFor} onClose={() => setDeliveriesFor(null)} />
    </AppLayout>
  );
}

function DeliveriesDrawer({ webhook, onClose }: { webhook: Webhook | null; onClose: () => void }) {
  const [rows, setRows] = React.useState<WebhookDelivery[]>([]);
  const [loading, setLoading] = React.useState(false);

  const refresh = React.useCallback(() => {
    if (!webhook) return;
    setLoading(true);
    listDeliveries(webhook.id).then(setRows).catch(() => {}).finally(() => setLoading(false));
  }, [webhook]);
  React.useEffect(() => { if (webhook) refresh(); }, [webhook, refresh]);

  const replay = async (id: number) => {
    try {
      await replayDelivery(id);
      toast.success("Replayed");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Replay failed");
    }
  };

  const tone = (s: string) =>
    s === "success" ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/25"
      : s === "failed" ? "bg-destructive/10 text-destructive ring-destructive/25"
        : "bg-muted text-muted-foreground ring-border";

  return (
    <ResizableDrawer open={webhook !== null} onOpenChange={(o) => !o && onClose()} defaultWidth={640}>
      <SheetTitle className="sr-only">Deliveries</SheetTitle>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><ListChecks className="size-[18px]" /></span>
            <div>
              <p className="font-semibold">Deliveries</p>
              <p className="truncate font-mono text-xs text-muted-foreground">{webhook?.url}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={refresh} title="Refresh"><RefreshCcw className={cn("size-4", loading && "animate-spin")} /></Button>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close"><X className="size-4" /></Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          {!loading && rows.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">No deliveries yet.</p>
          )}
          {rows.map((d) => (
            <div key={d.id} className="rounded-lg border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset", tone(d.status))}>{d.status}</span>
                <span className="font-mono text-xs text-muted-foreground">{d.type}</span>
                {d.response_code != null && <span className="text-xs text-muted-foreground">HTTP {d.response_code}</span>}
                {d.attempts > 1 && <span className="text-xs text-muted-foreground">· {d.attempts} attempts</span>}
                <span className="ml-auto text-xs text-muted-foreground">{fmt(d.created_at)}</span>
                <Button variant="outline" size="xs" onClick={() => replay(d.id)}>Replay</Button>
              </div>
              {d.error && <p className="mt-1 text-xs text-destructive">{d.error}</p>}
            </div>
          ))}
        </div>
      </div>
    </ResizableDrawer>
  );
}
