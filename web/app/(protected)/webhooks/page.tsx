"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, X, Send, RefreshCcw, Copy, Check, KeyRound, ListChecks,
} from "lucide-react";

import { AppLayout } from "@/components/layout/app-layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ResizableDrawer } from "@/components/ui/resizable-drawer";
import { SheetTitle } from "@/components/ui/sheet";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { PageLayout } from "@/components/ui/page-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
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

// Platform lifecycle events KRIY currently delivers OUTBOUND. App events
// flow INTO KRIY to fire triggers/gates and are not echoed back out.
const PLATFORM_EVENTS = ["run.completed"];

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
      <PageLayout
        title="Delivery webhooks"
        subtitle="Deliver asynchronous KRIY results with signed requests, automatic retries, and inspectable history."
        actions={<Button size="sm" onClick={openNew}><Plus data-icon="inline-start" /> New webhook</Button>}
      >
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {revealed && (
              <Alert>
                <KeyRound />
                <AlertTitle>Copy the signing secret now</AlertTitle>
                <AlertDescription>
                  <p>This secret will not be shown again.</p>
                <div className="mt-2 flex w-full items-center gap-2">
                  <code className="flex-1 truncate rounded-md bg-background px-3 py-2 font-mono text-xs">{revealed}</code>
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(revealed); toast.success("Copied"); }}>
                    <Copy data-icon="inline-start" /> Copy
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => setRevealed(null)} aria-label="Dismiss"><X /></Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Verify deliveries with <code className="font-mono">X-KRIY-Signature: t=…,v1=HMAC_SHA256(secret, &quot;t.body&quot;)</code>.
                </p>
                </AlertDescription>
              </Alert>
            )}

            {loading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
              </div>
            ) : hooks.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><Send /></EmptyMedia>
                  <EmptyTitle>No webhooks yet</EmptyTitle>
                  <EmptyDescription>
                  Add an endpoint to receive events like <code className="font-mono">run.completed</code> —
                  the way to get an agent&apos;s async result back into your app.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent><Button size="sm" onClick={openNew}><Plus data-icon="inline-start" /> New webhook</Button></EmptyContent>
              </Empty>
            ) : (
              <div className="flex flex-col gap-2.5">
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
      </PageLayout>

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
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-app.com/kriy/webhook" className="font-mono" />
              <p className="text-xs text-muted-foreground">Must be a public https URL in production. KRIY POSTs the signed event here.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Event types</Label>
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
              {saving ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
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
    s === "success" ? "bg-primary/10 text-primary ring-primary/25"
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
