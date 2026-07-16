"use client";

import * as React from "react";
import { toast } from "sonner";
import { Webhook, Pencil, Trash2, Plus, Check, Loader2 } from "lucide-react";

import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  listEventTypes,
  upsertEventType,
  deleteEventType,
  type EventType,
} from "@/lib/api/workflows";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export default function EventsPage() {
  const [eventTypes, setEventTypes] = React.useState<EventType[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [schema, setSchema] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [editing, setEditing] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setEventTypes(await listEventTypes());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

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

  const save = async () => {
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
      await load();
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
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col">
        <div className="border-b border-border px-6 pb-4 pt-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Events</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The signals your apps send (e.g. “todo.completed”). Registered once and shared
            across the workspace — both <span className="font-medium text-foreground">Triggers</span> and{" "}
            <span className="font-medium text-foreground">Gates</span> react to them, and payloads are validated against the schema.
          </p>
        </div>

        <div className="flex-1 p-6">
          <div className="mx-auto max-w-3xl space-y-5">
            {/* Register / edit */}
            <div className="rounded-xl border bg-card p-4 shadow-sm">
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
                <Button size="sm" onClick={save} disabled={saving || !name.trim()}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : editing ? <Check className="size-4" /> : <Plus className="size-4" />}
                  {editing ? "Update event" : "Save event"}
                </Button>
              </div>
            </div>

            {/* List */}
            {loading ? (
              <div className="h-20 animate-pulse rounded-xl border bg-card" />
            ) : eventTypes.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-card p-12 text-center shadow-sm">
                <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Webhook className="size-7" />
                </div>
                <h2 className="mb-1.5 text-lg font-semibold tracking-tight">No events registered</h2>
                <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                  Register the events your apps send (e.g. “todo.completed”) so Triggers and Gates can react
                  to them and payloads are validated.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {eventTypes.map((t) => (
                  <div key={t.id} className="flex items-start gap-3 rounded-xl border bg-card p-3.5 shadow-sm">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Webhook className="size-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-sm font-medium">{t.name}</p>
                        <Badge variant="secondary" className="border-0 text-[10px]">
                          {t.subscribers} trigger{t.subscribers === 1 ? "" : "s"}
                        </Badge>
                        <Badge variant="secondary" className="border-0 text-[10px]">
                          {t.gates} gate{t.gates === 1 ? "" : "s"}
                        </Badge>
                        {t.payload_schema && <Badge variant="secondary" className="border-0 text-[10px]">schema</Badge>}
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
        </div>
      </div>
    </AppLayout>
  );
}
