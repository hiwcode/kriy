"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  ListOrdered,
  ListChecks,
  CheckCircle2,
  Circle,
  Loader2,
  Check,
  RefreshCw,
  Bot,
  ArrowRight,
  Send,
  ShieldCheck,
  ShieldAlert,
  Webhook,
  Lock,
  RotateCcw,
  XCircle,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Shared browser-chrome frame (mirrors the hero mockup)              */
/* ------------------------------------------------------------------ */

function MockFrame({
  url,
  children,
  className,
}: {
  url: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] opacity-60 blur-2xl"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 30%, color-mix(in oklch, var(--primary) 14%, transparent), transparent 70%)",
        }}
      />
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-primary/[0.06]",
          className
        )}
      >
        <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-foreground/[0.12]" />
            <span className="size-2.5 rounded-full bg-foreground/[0.08]" />
            <span className="size-2.5 rounded-full bg-foreground/[0.08]" />
          </div>
          <div className="ml-3 flex-1 rounded-md bg-background/60 px-3 py-0.5 text-center">
            <span className="text-[10px] font-medium text-muted-foreground/50">{url}</span>
          </div>
        </div>
        <div className="p-3 sm:p-4">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mockup 1 — Agentic chat with rich cards                            */
/* ------------------------------------------------------------------ */

function ChatCardsMock() {
  return (
    <MockFrame url="kriy.app / agents / research">
      <div className="flex h-[380px] flex-col gap-3 overflow-hidden text-left">
        {/* user bubble */}
        <div className="flex justify-end">
          <div className="max-w-[80%] rounded-lg bg-primary/25 px-3 py-2 text-[11px] dark:bg-primary/50">
            Plan and start the Q3 launch checklist.
          </div>
        </div>

        {/* assistant bubble with cards */}
        <div className="flex items-start gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Bot className="size-3.5 text-primary" />
          </div>
          <div className="min-w-0 flex-1 space-y-2 rounded-lg bg-muted/70 px-3 py-2.5">
            <p className="text-[11px] leading-relaxed text-foreground/80">
              Here&apos;s the plan — I&apos;ll track it as I go.
            </p>

            {/* Plan card */}
            <div className="rounded-lg border bg-background/70">
              <div className="flex items-center gap-1.5 border-b px-2.5 py-1.5">
                <ListOrdered className="size-3.5 text-primary" />
                <span className="text-[10px] font-semibold">Launch plan</span>
              </div>
              <ol className="space-y-1.5 px-2.5 py-2">
                {["Draft the announcement", "Prep the demo agent", "Schedule the send"].map(
                  (s, i) => (
                    <li key={s} className="flex items-center gap-2 text-[10px]">
                      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
                        {i + 1}
                      </span>
                      {s}
                    </li>
                  )
                )}
              </ol>
            </div>

            {/* Todo card */}
            <div className="rounded-lg border bg-background/70">
              <div className="flex items-center gap-1.5 border-b px-2.5 py-1.5">
                <ListChecks className="size-3.5 text-emerald-500" />
                <span className="text-[10px] font-semibold">Progress</span>
                <span className="ml-auto text-[9px] text-muted-foreground">1 / 3</span>
              </div>
              <ul className="space-y-1.5 px-2.5 py-2 text-[10px]">
                <li className="flex items-center gap-2 text-muted-foreground line-through">
                  <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                  Draft the announcement
                </li>
                <li className="flex items-center gap-2 font-medium">
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
                  Prep the demo agent
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Circle className="size-3.5 shrink-0 opacity-50" />
                  Schedule the send
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* input */}
        <div className="mt-auto flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2">
          <span className="flex-1 text-[10px] text-muted-foreground/50">Message Research Agent…</span>
          <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Send className="size-3" />
          </div>
        </div>
      </div>
    </MockFrame>
  );
}

/* ------------------------------------------------------------------ */
/*  Mockup 3 — Event-driven workflows                                  */
/* ------------------------------------------------------------------ */

function WorkflowMock() {
  return (
    <MockFrame url="kriy.app / workflows">
      <div className="flex h-[380px] flex-col gap-3 overflow-hidden text-left">
        {/* emit */}
        <div className="rounded-xl border bg-background/60 p-3">
          <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Your app
          </p>
          <div className="rounded-lg bg-zinc-950 p-2.5 font-mono text-[10px] leading-relaxed text-zinc-100">
            <span className="text-emerald-400">POST</span> /api/v1/events
            <br />
            {"{ "}<span className="text-sky-300">&quot;type&quot;</span>: {" "}
            <span className="text-amber-300">&quot;order.shipped&quot;</span>, {" "}
            <span className="text-sky-300">&quot;payload&quot;</span>: {"{ order_id } }"}
          </div>
        </div>

        <div className="flex justify-center">
          <ArrowRight className="size-4 rotate-90 text-muted-foreground/50" />
        </div>

        {/* queue */}
        <div className="rounded-xl border bg-background/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Priority queue
            </p>
            <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground">
              <RefreshCw className="size-2.5" /> auto-retry · backoff
            </span>
          </div>
          <div className="space-y-1.5">
            {[
              { name: "order.shipped", state: "running", cls: "text-primary", Icon: Loader2, spin: true },
              { name: "invoice.paid", state: "queued", cls: "text-muted-foreground", Icon: Circle, spin: false },
              { name: "user.signup", state: "done", cls: "text-emerald-500", Icon: CheckCircle2, spin: false },
            ].map((r) => (
              <div key={r.name} className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-2.5 py-1.5 text-[10px]">
                <r.Icon className={cn("size-3.5 shrink-0", r.cls, r.spin && "animate-spin")} />
                <code className="font-mono">{r.name}</code>
                <span className="ml-auto capitalize text-[9px] text-muted-foreground">{r.state}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-center">
          <ArrowRight className="size-4 rotate-90 text-muted-foreground/50" />
        </div>

        {/* agent handles */}
        <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bot className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold">Fulfilment Agent</p>
            <p className="text-[9px] text-muted-foreground">notifies the customer, updates the CRM, and reports the result</p>
          </div>
          <CheckCircle2 className="ml-auto size-4 shrink-0 text-emerald-500" />
        </div>
      </div>
    </MockFrame>
  );
}

/* ------------------------------------------------------------------ */
/*  Mockup 3 — Decision gates                                          */
/* ------------------------------------------------------------------ */

function GateMock() {
  return (
    <MockFrame url="kriy.app / gates">
      <div className="flex h-[380px] flex-col gap-3 overflow-hidden text-left">
        {/* ask */}
        <div className="rounded-xl border bg-background/60 p-3">
          <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Your app — before it commits the action
          </p>
          <div className="rounded-lg bg-zinc-950 p-2.5 font-mono text-[10px] leading-relaxed text-zinc-100">
            <span className="text-emerald-400">POST</span> /events/decide
            <br />
            {"{ "}
            <span className="text-sky-300">&quot;type&quot;</span>:{" "}
            <span className="text-amber-300">&quot;refund.requested&quot;</span>,{" "}
            <span className="text-sky-300">&quot;payload&quot;</span>: {"{ amount: 900 } }"}
          </div>
        </div>

        <div className="flex justify-center">
          <ArrowRight className="size-4 rotate-90 text-muted-foreground/50" />
        </div>

        {/* rules */}
        <div className="rounded-xl border bg-background/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Rules — priority order, first match wins
            </p>
          </div>
          <div className="space-y-1.5">
            {[
              { name: "Auto-approve under $100", cond: "amount lte 100", verdict: "allow", hit: false },
              { name: "Large refund needs a human", cond: "amount gt 500", verdict: "deny", hit: true },
            ].map((r) => (
              <div
                key={r.name}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[10px]",
                  r.hit ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card"
                )}
              >
                {r.verdict === "allow" ? (
                  <ShieldCheck className="size-3.5 shrink-0 text-emerald-500" />
                ) : (
                  <ShieldAlert className="size-3.5 shrink-0 text-amber-500" />
                )}
                <span className="min-w-0 truncate font-medium">{r.name}</span>
                <code className="ml-auto shrink-0 font-mono text-[9px] text-muted-foreground">
                  {r.cond}
                </code>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-center">
          <ArrowRight className="size-4 rotate-90 text-muted-foreground/50" />
        </div>

        {/* verdict */}
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <XCircle className="size-4 shrink-0 text-amber-500" />
            <span className="text-[11px] font-semibold">deny</span>
            <span className="ml-auto rounded-full border border-border/60 px-1.5 py-0.5 text-[9px] text-muted-foreground">
              overridable
            </span>
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            &quot;Refunds over $500 need a supervisor.&quot; — returned inline, logged to the
            decision audit trail.
          </p>
        </div>
      </div>
    </MockFrame>
  );
}

/* ------------------------------------------------------------------ */
/*  Mockup 4 — Outbound webhooks                                       */
/* ------------------------------------------------------------------ */

function WebhookMock() {
  return (
    <MockFrame url="kriy.app / webhooks">
      <div className="flex h-[380px] flex-col gap-3 overflow-hidden text-left">
        {/* subscription */}
        <div className="rounded-xl border bg-background/60 p-3">
          <div className="mb-2 flex items-center gap-2">
            <Webhook className="size-3.5 text-primary" />
            <code className="min-w-0 truncate font-mono text-[10px]">
              https://api.acme.com/kriy
            </code>
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
              enabled
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {["run.completed", "gate.*"].map((e) => (
              <code
                key={e}
                className="rounded-md border border-border/60 bg-card px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground"
              >
                {e}
              </code>
            ))}
            <span className="ml-auto inline-flex items-center gap-1 text-[9px] text-muted-foreground">
              <Lock className="size-2.5" /> whsec_…4f9c
            </span>
          </div>
        </div>

        {/* signed payload */}
        <div className="rounded-lg bg-zinc-950 p-2.5 font-mono text-[10px] leading-relaxed text-zinc-100">
          <span className="text-zinc-500">X-KRIY-Signature:</span>{" "}
          <span className="text-emerald-400">t=</span>1750…,
          <span className="text-emerald-400">v1=</span>9ab3…
          <br />
          {"{ "}
          <span className="text-sky-300">&quot;type&quot;</span>:{" "}
          <span className="text-amber-300">&quot;run.completed&quot;</span>,{" "}
          <span className="text-sky-300">&quot;data&quot;</span>: {"{ result: … } }"}
        </div>

        {/* deliveries */}
        <div className="flex min-h-0 flex-1 flex-col rounded-xl border bg-background/60 p-3">
          <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Deliveries
          </p>
          <div className="space-y-1.5">
            {[
              { type: "run.completed", code: "200", ok: true },
              { type: "run.completed", code: "200", ok: true },
              { type: "gate.decided", code: "503", ok: false },
            ].map((d, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-2.5 py-1.5 text-[10px]"
              >
                {d.ok ? (
                  <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                ) : (
                  <XCircle className="size-3.5 shrink-0 text-red-500" />
                )}
                <code className="min-w-0 truncate font-mono">{d.type}</code>
                <span
                  className={cn(
                    "ml-auto shrink-0 font-mono text-[9px]",
                    d.ok ? "text-muted-foreground" : "text-red-500"
                  )}
                >
                  {d.code}
                </span>
                {!d.ok && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/60 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                    <RotateCcw className="size-2.5" /> replay
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </MockFrame>
  );
}

/* ------------------------------------------------------------------ */
/*  Showcase section                                                   */
/* ------------------------------------------------------------------ */

type Row = {
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  mock: React.ReactNode;
};

const ROWS: Row[] = [
  {
    eyebrow: "Agentic chat",
    title: "Answers you can act on — not just text",
    description:
      "Agents lay out a plan, track a live to-do list, and surface results as rich cards right in the conversation. Runs keep going in the background, so you can leave and come back.",
    points: ["Plan & to-do cards", "Streaming responses", "Runs survive navigating away"],
    mock: <ChatCardsMock />,
  },
  {
    eyebrow: "Triggers",
    title: "Your app emits an event, the right agent handles it",
    description:
      "Fire an event from anywhere in your stack. KRIY routes it to the matching workflow through a priority queue with automatic retries and backoff — no orchestration glue to maintain.",
    points: ["One-line emit()", "Priority queue + retries", "Per-user routing"],
    mock: <WorkflowMock />,
  },
  {
    eyebrow: "Decision gates",
    title: "Ask before you act — get a verdict in the same call",
    description:
      "Post a proposed action to /events/decide and KRIY answers allow or deny inline, from rules you build in the UI. Your policy stops living in scattered if-statements, and every verdict lands in an audit trail.",
    points: [
      "Synchronous allow / deny",
      "Nested AND / OR / NONE rules",
      "Soft denies a human can override",
    ],
    mock: <GateMock />,
  },
  {
    eyebrow: "Outbound webhooks",
    title: "Results come back to you — signed, retried, replayable",
    description:
      "Subscribe an endpoint to run.completed and KRIY posts the agent's result to your app, HMAC-signed and correlated to the request that started it. Every attempt is logged, and a failed one is one click from a replay.",
    points: [
      "HMAC-signed envelopes",
      "Per-event-type subscriptions",
      "Delivery log + manual replay",
    ],
    mock: <WebhookMock />,
  },
];

export function FeatureShowcase() {
  return (
    <section id="closer-look" className="scroll-mt-20 py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            A closer look
          </p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            See what it actually looks like
          </h2>
          <p className="mt-4 text-muted-foreground">
            Real screens from the product — agentic chat, event-driven triggers, decision
            gates, and the webhooks that carry results back.
          </p>
        </div>

        <div className="mt-16 space-y-20 md:space-y-28">
          {ROWS.map((row, i) => {
            const flip = i % 2 === 1;
            return (
              <div
                key={row.title}
                className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-14"
              >
                {/* Copy */}
                <div className={cn(flip && "lg:order-2")}>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                    {row.eyebrow}
                  </p>
                  <h3 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
                    {row.title}
                  </h3>
                  <p className="mt-4 leading-relaxed text-muted-foreground">
                    {row.description}
                  </p>
                  <ul className="mt-6 space-y-2.5">
                    {row.points.map((p) => (
                      <li key={p} className="flex items-center gap-2.5 text-sm text-foreground/85">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Check className="size-3" />
                        </span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Mockup */}
                <div className={cn("min-w-0", flip && "lg:order-1")}>{row.mock}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
