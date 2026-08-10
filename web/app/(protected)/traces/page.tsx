"use client";

import * as React from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { TabLayout, TabConfig } from "@/components/ui/tab-layout";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { PageLayout } from "@/components/ui/page-layout";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listAgents,
  listAgentTraces,
  getTraceDetail,
  AgentItem,
  AgentTraceItem,
  TraceStep,
} from "@/lib/api/agents";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Wrench,
  MessageSquare,
  ArrowRight,
  User,
  Coins,
  DollarSign,
  Search,
  Clock,
  Loader2,
  AlertTriangle,
  X,
  PanelRightOpen,
} from "lucide-react";
import { siteConfig } from "@/config/site";
import { MdRenderer } from "@/components/ui/md-renderer";
import { Input } from "@/components/ui/input";
import {
  SheetClose,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ResizableDrawer } from "@/components/ui/resizable-drawer";
import { cn } from "@/lib/utils";
import { loadProviderStatus } from "@/lib/config-check";
import { listModels } from "@/lib/api/models";


// Pricing per 1M tokens (USD) - input / output. No built-in prices: this map is
// populated from the user's configured catalog (listModels) at load. The backend
// already returns a snapshot-aware `estimated_cost`; this is only a fallback for
// per-message estimates, and an unpriced model resolves to zero.
const MODEL_PRICING: Record<string, { input: number; output: number }> = {};

function getModelPricing(model: string | undefined): { input: number; output: number } {
  if (!model) return { input: 0, output: 0 };
  const key = Object.keys(MODEL_PRICING).find((k) =>
    model.toLowerCase().includes(k)
  );
  return key ? MODEL_PRICING[key] : { input: 0, output: 0 };
}

function computeCost(
  inputTokens: number,
  outputTokens: number,
  model: string | undefined
): number {
  const { input, output } = getModelPricing(model);
  return (inputTokens * input + outputTokens * output) / 1_000_000;
}

const TOKEN_LABELS: Record<string, string> = {
  total_token_count: "Total",
  prompt_token_count: "Prompt",
  candidates_token_count: "Output",
  cached_content_token_count: "Cached",
  thought_tokens: "Thoughts",
  thoughts_token_count: "Thoughts",
};

function TokenUsageCard({
  usage,
  model,
}: {
  usage: Record<string, unknown>;
  model?: string;
}) {
  if (!usage || Object.keys(usage).length === 0) return null;

  const inputTokens = Number(usage.prompt_token_count ?? usage.input_tokens ?? 0);
  const outputTokens = Number(
    usage.candidates_token_count ?? usage.output_tokens ?? 0
  );
  const cost = computeCost(inputTokens, outputTokens, model);

  const primary = [
    "total_token_count",
    "prompt_token_count",
    "candidates_token_count",
    "cached_content_token_count",
    "thoughts_token_count",
  ] as const;
  const primaryItems = primary
    .filter((k) => usage[k] != null && usage[k] !== "")
    .map((k) => ({ key: k, label: TOKEN_LABELS[k] || k.replace(/_/g, " "), value: usage[k] }));

  const rest = Object.entries(usage).filter(
    ([k, v]) =>
      !primary.includes(k as (typeof primary)[number]) &&
      v != null &&
      v !== "" &&
      !(Array.isArray(v) && v.length === 0)
  );

  return (
    <div className="rounded-lg border border-border/60 bg-muted/40 p-3 mt-3">
      <div className="flex items-center gap-2 mb-2">
        <Coins className="size-4 text-primary" />
        <span className="text-xs font-medium text-muted-foreground">Token usage</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {primaryItems.map(({ key, label, value }) => (
          <div key={key} className="flex items-baseline gap-1.5">
            <span className="text-xs text-muted-foreground">{label}:</span>
            <span className="text-sm font-mono font-medium text-foreground">
              {typeof value === "number" ? value.toLocaleString() : String(value)}
            </span>
          </div>
        ))}
        {cost > 0 && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs text-muted-foreground">Est. cost:</span>
            <span className="font-mono text-sm font-medium text-foreground">
              ${cost.toFixed(6)}
            </span>
          </div>
        )}
      </div>
      {rest.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            More details
          </summary>
          <dl className="mt-2 flex flex-col gap-1.5 text-xs">
            {rest.map(([k, v]) => (
              <div key={k} className="flex gap-2 flex-wrap">
                <dt className="text-muted-foreground font-mono shrink-0 min-w-[140px]">
                  {k.replace(/_/g, " ")}:
                </dt>
                <dd className="text-foreground font-mono flex-1 min-w-0">
                  {typeof v === "object" && v !== null ? (
                    <pre className="text-[11px] bg-muted/30 p-2 rounded overflow-x-auto">
                      {JSON.stringify(v, null, 2)}
                    </pre>
                  ) : (
                    String(v)
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}

function TraceStepRow({
  step,
  isLast,
  model,
}: {
  step: TraceStep;
  isLast: boolean;
  model?: string;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const isUser = step.author === "user";
  const Logo = siteConfig.logo;

  if (step.type === "text") {
    return (
      <div className="flex gap-4 group">
        <div className="flex flex-col items-center shrink-0">
          <div
            className={`size-9 rounded-full flex items-center justify-center shrink-0 ${
              isUser ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
            }`}
          >
            {isUser ? <User className="size-4" /> : <Logo  size={16}/>}
          </div>
          {!isLast && <div className="w-px flex-1 min-h-[12px] bg-border mt-2" />}
        </div>
        <div className="flex-1 min-w-0 pb-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-foreground">
              {isUser ? "User" : step.author}
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(step.timestamp * 1000).toLocaleTimeString()}
            </span>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            <MdRenderer content={step.text || ""} variant="docs"/>
            {step.usage && Object.keys(step.usage).length > 0 && (
              <TokenUsageCard
                usage={step.usage as Record<string, unknown>}
                model={step.model ?? model}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  if (step.type === "tool_call") {
    const argsStr = JSON.stringify(step.tool_args || {}, null, 2);
    return (
      <div className="flex gap-4 group">
        <div className="flex flex-col items-center shrink-0">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Wrench className="size-4" />
          </div>
          {!isLast && <div className="w-px flex-1 min-h-[12px] bg-border mt-2" />}
        </div>
        <div className="flex-1 min-w-0 pb-6">
          <button
            type="button"
            className="w-full text-left"
            onClick={() => setExpanded(!expanded)}
          >
            <div className="flex items-center gap-2 mb-1">
              {expanded ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" />
              )}
              <span className="text-sm font-medium text-foreground">
                Tool call: {step.tool_name}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(step.timestamp * 1000).toLocaleTimeString()}
              </span>
            </div>
          </button>
          <div className="rounded-lg border border-border bg-card p-4">
            {expanded && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Arguments</p>
                <pre className="text-xs bg-muted/50 p-3 rounded overflow-x-auto font-mono">
                  {argsStr}
                </pre>
              </div>
            )}
            {step.usage && Object.keys(step.usage).length > 0 && (
              <TokenUsageCard
                usage={step.usage as Record<string, unknown>}
                model={step.model ?? model}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  if (step.type === "tool_response") {
    const respStr =
      typeof step.tool_response === "string"
        ? step.tool_response
        : JSON.stringify(step.tool_response || {}, null, 2);
    return (
      <div className="flex gap-4 group">
        <div className="flex flex-col items-center shrink-0">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ArrowRight className="size-4" />
          </div>
          {!isLast && <div className="w-px flex-1 min-h-[12px] bg-border mt-2" />}
        </div>
        <div className="flex-1 min-w-0 pb-6">
          <button
            type="button"
            className="w-full text-left"
            onClick={() => setExpanded(!expanded)}
          >
            <div className="flex items-center gap-2 mb-1">
              {expanded ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" />
              )}
              <span className="text-sm font-medium text-foreground">
                Tool response: {step.tool_name}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(step.timestamp * 1000).toLocaleTimeString()}
              </span>
            </div>
          </button>
          <div className="rounded-lg border border-border bg-card p-4">
            {expanded && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Response</p>
                <pre className="text-xs bg-muted/50 p-3 rounded overflow-x-auto max-h-48 overflow-y-auto font-mono">
                  {respStr.length > 2000 ? respStr.slice(0, 2000) + "\n…" : respStr}
                </pre>
              </div>
            )}
            {step.usage && Object.keys(step.usage).length > 0 && (
              <TokenUsageCard
                usage={step.usage as Record<string, unknown>}
                model={step.model ?? model}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function TraceDetailContent({
  agent,
  trace,
}: {
  agent: AgentItem;
  trace: AgentTraceItem;
}) {
  const [detail, setDetail] = React.useState<Awaited<ReturnType<typeof getTraceDetail>> | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    getTraceDetail(agent.id, trace.session_id)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [agent.id, trace.session_id]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        Loading trace…
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <AlertTriangle className="size-4 shrink-0" />
        Failed to load trace
      </div>
    );
  }

  // Prefer the backend cost (priced per-event by each event's recorded model, so
  // it never shifts when the agent's current model changes).
  const totalCost = detail.estimated_cost ?? computeCost(
    detail.total_input_tokens,
    detail.total_output_tokens,
    agent.model
  );

  return (
    <div className="flex flex-col">
      <div className="mb-6 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-semibold tracking-tight text-foreground">{trace.title || "Session"}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {detail.steps.length} steps · {trace.tool_call_count} tool calls
              {agent.model && <span className="text-muted-foreground/80"> · {agent.model}</span>}
            </p>
          </div>
          {totalCost > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              <DollarSign className="size-3.5" />
              ${totalCost.toFixed(4)}
            </div>
          )}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-lg border bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">Prompt tokens</p>
            <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{detail.total_input_tokens.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">Output tokens</p>
            <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{detail.total_output_tokens.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">Total tokens</p>
            <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{detail.total_tokens.toLocaleString()}</p>
          </div>
        </div>
      </div>
      <div className="relative pl-1">
        {detail.steps.map((step, i) => (
          <TraceStepRow
            key={step.event_id || i}
            step={step}
            isLast={i === detail.steps.length - 1}
            model={agent.model ?? undefined}
          />
        ))}
      </div>
    </div>
  );
}

const TRACES_PAGE_SIZE = 20;

function Metric({
  icon: Icon,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap", className)}>
      <Icon className="size-3.5" />
      {children}
    </span>
  );
}

function AgentTracesContent({ agent }: { agent: AgentItem }) {
  const [traces, setTraces] = React.useState<AgentTraceItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [detailTrace, setDetailTrace] = React.useState<AgentTraceItem | null>(null);
  const [page, setPage] = React.useState(0);
  const [total, setTotal] = React.useState(0);
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [opikEnabled, setOpikEnabled] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    loadProviderStatus().then((s) => setOpikEnabled(s.hasOpik));
  }, []);

  const fetchTraces = React.useCallback(() => {
    setLoading(true);
    listAgentTraces(agent.id, {
      limit: TRACES_PAGE_SIZE,
      offset: page * TRACES_PAGE_SIZE,
      search: search || undefined,
    })
      .then(({ items, pagination }) => {
        setTraces(items);
        setTotal(pagination.total ?? 0);
      })
      .catch(() => {
        setTraces([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [agent.id, page, search]);

  React.useEffect(() => {
    fetchTraces();
  }, [fetchTraces]);

  // Debounced search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setPage(0);
      setSearch(searchInput);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const totalPages = Math.max(1, Math.ceil(total / TRACES_PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      {/* Opik deep tracing hint — hidden when Opik is already enabled */}
      {opikEnabled === false && (
      <div className="flex items-start gap-3 rounded-xl border bg-muted/40 px-4 py-3">
        <svg width="24" height="24" viewBox="40 40 230 230" fill="none" xmlns="http://www.w3.org/2000/svg" className="mt-0.5 shrink-0">
          <path fillRule="evenodd" clipRule="evenodd" d="M211.526 86.214C163.671 65.177 106.858 87.6512 84.9987 137.376C63.1395 187.101 84.9915 244.157 132.846 265.194C152.148 273.679 172.796 275.093 192.066 270.531C200.361 268.567 208.678 273.7 210.641 281.995C212.605 290.29 207.473 298.607 199.177 300.571C173.657 306.612 146.128 304.754 120.423 293.454C56.3654 265.294 28.2831 189.683 56.7387 124.953C85.1944 60.2225 159.892 29.7942 223.949 57.954C263.032 75.1349 288.768 110.083 296.374 149.317C297.997 157.686 292.528 165.785 284.159 167.408C275.791 169.03 267.691 163.561 266.069 155.192C260.271 125.29 240.78 99.074 211.526 86.214ZM263.453 256.783C266.44 269.313 258.703 281.891 246.173 284.878C233.643 287.864 221.064 280.128 218.078 267.598C215.091 255.068 222.828 242.489 235.358 239.503C247.888 236.516 260.467 244.253 263.453 256.783ZM282.895 238.991C299.635 235.001 309.971 218.196 305.981 201.457C301.991 184.717 285.186 174.381 268.447 178.371C251.707 182.361 241.371 199.165 245.361 215.905C249.351 232.645 266.156 242.981 282.895 238.991Z" fill="url(#opik_gradient)" />
          <defs>
            <linearGradient id="opik_gradient" x1="258.131" y1="269.783" x2="88.6452" y2="75.4571" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FB9341" />
              <stop offset="1" stopColor="#E30D3E" />
            </linearGradient>
          </defs>
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-foreground">
            For deep-level traces (sub-agent calls, tool I/O, LLM token usage per step), enable the{" "}
            <Link href="/config" className="font-medium text-primary underline underline-offset-2">
              Opik integration
            </Link>{" "}
            in your config.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Opik gives you hierarchical spans for every agent, tool call, and LLM invocation —{" "}
            <a
              href="https://www.comet.com/opik"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              comet.com/opik
            </a>
          </p>
        </div>
      </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={`Search ${agent.label || agent.name} traces…`}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[68px] rounded-xl" />
          ))}
        </div>
      ) : traces.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Activity className="size-7" />
          </div>
          <p className="mb-1 font-medium">
            {search ? "No traces match your search" : "No traces yet"}
          </p>
          {!search && (
            <>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                Chat with {agent.label || agent.name} to generate execution traces.
              </p>
              <Button size="sm" className="mt-5" asChild>
                <Link href={`/agents/${agent.id}`}>Open agent</Link>
              </Button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2.5">
            {traces.map((t, index) => {
              const isActive = detailTrace?.session_id === t.session_id;
              // Backend prices per-event by the model that ran (stable across model changes).
              const cost = t.estimated_cost ?? computeCost(t.input_tokens, t.output_tokens, t.model ?? agent.model ?? undefined);
              return (
                <div
                  key={index}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors",
                    isActive ? "border-primary/40 ring-1 ring-primary/20" : "hover:border-primary/30"
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => setDetailTrace(t)}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                        isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                      )}
                    >
                      <PanelRightOpen className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {t.title || "Session"}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <Metric icon={MessageSquare}>{t.event_count} events</Metric>
                        <Metric icon={Wrench}>{t.tool_call_count} tools</Metric>
                        <Metric icon={Coins}>{(t.input_tokens + t.output_tokens).toLocaleString()} tokens</Metric>
                        {cost > 0 && (
                          <Metric icon={DollarSign} className="text-foreground">
                            ~${cost.toFixed(4)}
                          </Metric>
                        )}
                        <Metric icon={Clock}>{new Date(t.last_updated * 1000).toLocaleDateString()}</Metric>
                      </div>
                    </div>
                  </button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/agents/${agent.id}?session=${t.session_id}`}>Open</Link>
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t pt-4">
              <p className="text-xs text-muted-foreground">
                {total} trace{total !== 1 ? "s" : ""} · Page {page + 1} of {totalPages}
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="size-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Resizable detail drawer */}
      <ResizableDrawer
        open={!!detailTrace}
        onOpenChange={(o) => !o && setDetailTrace(null)}
        defaultWidth={680}
      >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Activity className="size-[18px]" />
                </span>
                <div className="min-w-0">
                  <SheetTitle className="truncate text-base">
                    {detailTrace?.title || "Session trace"}
                  </SheetTitle>
                  <SheetDescription className="text-xs">
                    {agent.label || agent.name}
                  </SheetDescription>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {detailTrace && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/agents/${agent.id}?session=${detailTrace.session_id}`}>Open</Link>
                  </Button>
                )}
                <SheetClose asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Close">
                    <X className="size-4" />
                  </Button>
                </SheetClose>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 p-6">
              {detailTrace && <TraceDetailContent agent={agent} trace={detailTrace} />}
            </div>
          </div>
      </ResizableDrawer>
    </div>
  );
}

export default function TracesPage() {
  const [agents, setAgents] = React.useState<AgentItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [, setPricingReady] = React.useState(0);

  React.useEffect(() => {
    listAgents({ limit: 100, offset: 0 })
      .then((r) => setAgents(r.items))
      .catch((reason) => {
        setLoadError(reason instanceof Error ? reason.message : "Runs and traces could not be loaded.");
      })
      .finally(() => setLoading(false));
    // Merge the model catalog (built-ins + custom/overridden pricing) into the
    // pricing map so cost reflects actual per-model rates, then re-render.
    listModels()
      .then((ms) => {
        for (const m of ms) MODEL_PRICING[m.name] = { input: m.input_per_million, output: m.output_per_million };
        setPricingReady((n) => n + 1);
      })
      .catch(() => {});
  }, []);

  const config: TabConfig = {
    id: "traces",
    tabName: "Runs & traces",
    description: "Inspect agent execution, model usage, timing, and tool activity.",
    items: agents.map((agent) => ({
      id: agent.id,
      name: agent.label || agent.name,
      icon: <Activity className="size-4" />,
      component: <AgentTracesContent agent={agent} />,
    })),
  };

  if (loading) {
    return (
      <AppLayout>
        <PageLayout title="Runs & traces" subtitle="Inspect agent execution, model usage, timing, and tool activity.">
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        </PageLayout>
      </AppLayout>
    );
  }

  if (loadError) {
    return (
      <AppLayout>
        <PageLayout title="Runs & traces" subtitle="Inspect agent execution, model usage, timing, and tool activity.">
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Runs and traces unavailable</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        </PageLayout>
      </AppLayout>
    );
  }

  if (agents.length === 0) {
    return (
      <AppLayout>
        <PageLayout title="Runs & traces" subtitle="Inspect agent execution, model usage, timing, and tool activity.">
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Activity /></EmptyMedia>
              <EmptyTitle>No agents yet</EmptyTitle>
              <EmptyDescription>Create an agent and test it to generate execution traces.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent><Button asChild><Link href="/agents">Create an agent</Link></Button></EmptyContent>
          </Empty>
        </PageLayout>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <TabLayout config={config} />
    </AppLayout>
  );
}
