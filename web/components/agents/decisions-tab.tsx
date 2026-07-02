"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  SheetClose,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ResizableDrawer } from "@/components/ui/resizable-drawer";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  getAgentDecisions,
  getDecisionActions,
  type DecisionRecord,
} from "@/lib/api/integration";
import { cn } from "@/lib/utils";
import {
  Activity,
  Wand2,
  Ban,
  Check,
  Clock,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  X,
  RefreshCw,
  Search,
} from "lucide-react";

const PAGE_SIZE = 20;
const FILTERS = ["all", "modify", "deny", "allow"] as const;

function decisionMeta(d: string) {
  if (d === "deny") return { label: "Deny", cls: "bg-destructive/10 text-destructive", icon: Ban };
  if (d === "modify") return { label: "Modify", cls: "bg-primary/10 text-primary", icon: Wand2 };
  return { label: "Allow", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", icon: Check };
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(t).toLocaleDateString();
}

function changedFields(o: unknown, f: unknown): string[] {
  if (!o || !f || typeof o !== "object" || typeof f !== "object") return [];
  const a = o as Record<string, unknown>;
  const b = f as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

export function DecisionsContent({ agentId }: { agentId: number }) {
  const [items, setItems] = React.useState<DecisionRecord[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(0);
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]>("all");
  const [action, setAction] = React.useState("all");
  const [actions, setActions] = React.useState<string[]>([]);
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [detail, setDetail] = React.useState<DecisionRecord | null>(null);

  // Debounce the search box.
  React.useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Load the distinct event/action list once for the dropdown.
  React.useEffect(() => {
    getDecisionActions(agentId)
      .then(setActions)
      .catch(() => setActions([]));
  }, [agentId]);

  const load = React.useCallback(() => {
    setLoading(true);
    getAgentDecisions(agentId, {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      decision: filter,
      action,
      search,
    })
      .then(({ items, total }) => {
        setItems(items);
        setTotal(total);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load decisions"))
      .finally(() => setLoading(false));
  }, [agentId, page, filter, action, search]);

  React.useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => {
                setPage(0);
                setFilter(f);
              }}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                filter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <div className="relative min-w-[180px] flex-1 sm:max-w-[240px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search action or reason…"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <NativeSelect
            size="sm"
            value={action}
            onChange={(e) => {
              setPage(0);
              setAction(e.target.value);
            }}
            className="text-xs"
            aria-label="Filter by event"
          >
            <NativeSelectOption value="all">All events</NativeSelectOption>
            {actions.map((a) => (
              <NativeSelectOption key={a} value={a}>
                {a}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border bg-card" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Activity className="size-7" />
          </div>
          {search || action !== "all" || filter !== "all" ? (
            <>
              <p className="mb-1 font-medium">No matching decisions</p>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                Try clearing the search or changing the event / decision filters.
              </p>
            </>
          ) : (
            <>
              <p className="mb-1 font-medium">No decisions yet</p>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                When your code calls this agent via the SDK&apos;s <code className="rounded bg-muted px-1">guard()</code>, every
                allow / modify / deny shows up here — start in <span className="font-medium">observe</span> mode for zero-risk shadow logging.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {items.map((d) => {
              const m = decisionMeta(d.decision);
              const MIcon = m.icon;
              return (
                <button
                  key={d.id}
                  onClick={() => setDetail(d)}
                  className="group flex w-full items-center gap-3 rounded-xl border bg-card p-3.5 text-left shadow-sm transition-colors hover:border-primary/30"
                >
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", m.cls)}>
                    <MIcon className="size-3" />
                    {m.label}
                  </span>
                  <code className="shrink-0 truncate font-mono text-xs text-foreground">{d.action}</code>
                  <span className="truncate text-xs text-muted-foreground">{d.reason}</span>
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    {d.applied_policies.slice(0, 1).map((p) => (
                      <Badge key={p} variant="secondary" className="hidden border-0 text-[10px] sm:inline-flex">{p}</Badge>
                    ))}
                    <Badge variant="outline" className="hidden text-[10px] capitalize text-muted-foreground md:inline-flex">{d.mode}</Badge>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="size-3" />
                      {relativeTime(d.created_at)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t pt-4">
              <p className="text-xs text-muted-foreground">
                {total} decision{total !== 1 ? "s" : ""} · Page {page + 1} of {totalPages}
              </p>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="size-4" />
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail drawer */}
      <ResizableDrawer open={!!detail} onOpenChange={(o) => !o && setDetail(null)} defaultWidth={520}>
          {detail && (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  {(() => {
                    const m = decisionMeta(detail.decision);
                    const MIcon = m.icon;
                    return (
                      <span className={cn("flex size-9 items-center justify-center rounded-xl", m.cls)}>
                        <MIcon className="size-[18px]" />
                      </span>
                    );
                  })()}
                  <div className="min-w-0">
                    <SheetTitle className="font-mono text-base">{detail.action}</SheetTitle>
                    <SheetDescription className="text-xs capitalize">
                      {detail.decision} · {detail.mode} · {relativeTime(detail.created_at)}
                    </SheetDescription>
                  </div>
                </div>
                <SheetClose asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Close">
                    <X className="size-4" />
                  </Button>
                </SheetClose>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Reason</p>
                  <p className="mt-1 text-sm">{detail.reason || "—"}</p>
                </div>
                {detail.applied_policies.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {detail.applied_policies.map((p) => (
                      <Badge key={p} className="border-0 bg-primary/10 text-primary">{p}</Badge>
                    ))}
                  </div>
                )}
                {detail.decision === "modify" && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Changed</p>
                    <ul className="mt-1 space-y-1">
                      {changedFields(detail.original_payload, detail.final_payload).map((k) => (
                        <li key={k} className="font-mono text-[11px] text-foreground/80">
                          {k}: {JSON.stringify((detail.original_payload as Record<string, unknown>)?.[k])} →{" "}
                          {JSON.stringify((detail.final_payload as Record<string, unknown>)?.[k])}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Original payload</p>
                    <pre className="overflow-x-auto rounded-lg bg-muted/40 p-3 font-mono text-[11px]">
                      {JSON.stringify(detail.original_payload, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Final payload</p>
                    <pre className="overflow-x-auto rounded-lg bg-muted/40 p-3 font-mono text-[11px]">
                      {JSON.stringify(detail.final_payload, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}
      </ResizableDrawer>
    </div>
  );
}
