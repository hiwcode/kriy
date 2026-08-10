"use client";

import * as React from "react";
import { toast } from "sonner";
import { Radio, Pencil, Trash2, Plus, Check } from "lucide-react";

import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { PageLayout } from "@/components/ui/page-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  listEventTypes,
  upsertEventType,
  deleteEventType,
  type EventType,
} from "@/lib/api/workflows";

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
      <PageLayout
        title="Event catalog"
        subtitle="Define and validate the application events used by workflows and decision gates."
      >
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {/* Register / edit */}
            <Card>
              <CardHeader>
                <CardTitle>{editing ? `Edit “${editing}”` : "Register an event"}</CardTitle>
                <CardDescription>Give incoming application events a stable name and optional JSON Schema.</CardDescription>
              </CardHeader>
              <CardContent>
              <FieldGroup className="gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="event-name">Name</FieldLabel>
                  <Input
                    id="event-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="order.created"
                    className="font-mono"
                    disabled={editing !== null}
                    title={editing ? "Name is the key — delete and re-create to rename" : undefined}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="event-description">Description</FieldLabel>
                  <Input id="event-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="An order was created" />
                </Field>
              </div>
                <Field>
                  <FieldLabel htmlFor="event-schema">Payload schema</FieldLabel>
                  <Textarea
                    id="event-schema"
                    value={schema}
                    onChange={(e) => setSchema(e.target.value)}
                    placeholder='{"type":"object","required":["todos"]}'
                    className="min-h-[64px] font-mono text-xs"
                  />
                  <FieldDescription>Optional JSON Schema used to validate incoming payloads.</FieldDescription>
                </Field>
              </FieldGroup>
              <div className="mt-5 flex justify-end gap-2">
                {editing && (
                  <Button size="sm" variant="outline" onClick={resetForm} disabled={saving}>
                    Cancel
                  </Button>
                )}
                <Button size="sm" onClick={save} disabled={saving || !name.trim()}>
                  {saving ? <Spinner data-icon="inline-start" /> : editing ? <Check data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
                  {editing ? "Update event" : "Save event"}
                </Button>
              </div>
              </CardContent>
            </Card>

            {/* List */}
            {loading ? (
              <Skeleton className="h-24 rounded-xl" />
            ) : eventTypes.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><Radio /></EmptyMedia>
                  <EmptyTitle>No events registered</EmptyTitle>
                  <EmptyDescription>
                  Register an event such as “order.created” so workflows and decision gates can react to a validated payload.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex flex-col gap-2">
                {eventTypes.map((t) => (
                  <Card key={t.id} className="gap-3 py-4">
                    <CardHeader>
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Radio className="size-[18px]" />
                        </span>
                        <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="font-mono text-sm">{t.name}</CardTitle>
                        <Badge variant="secondary">
                          {t.subscribers} trigger{t.subscribers === 1 ? "" : "s"}
                        </Badge>
                        <Badge variant="secondary">
                          {t.gates} gate{t.gates === 1 ? "" : "s"}
                        </Badge>
                        {t.payload_schema && <Badge variant="outline">Schema</Badge>}
                      </div>
                      {t.description && <CardDescription className="mt-1">{t.description}</CardDescription>}
                        </div>
                      </div>
                      <CardAction className="flex items-center gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => startEdit(t)} aria-label={`Edit ${t.name}`}>
                          <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => remove(t.name)} aria-label={`Delete ${t.name}`}>
                          <Trash2 />
                        </Button>
                      </CardAction>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            )}
          </div>
      </PageLayout>
    </AppLayout>
  );
}
