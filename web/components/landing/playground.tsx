"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Check,
  Database,
  Send,
  RotateCcw,
  Zap,
  Radio,
  Bot,
  Bell,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Sparkles,
  UserPlus,
  PackageCheck,
  ArrowRight,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Emit scenarios (async event → workflow → agent)                    */
/* ------------------------------------------------------------------ */

type EmitStep = { icon: React.ComponentType<{ className?: string }>; label: string };
type EmitScenario = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  event: string;
  payload: Record<string, unknown>;
  workflow: string;
  agent: string;
  steps: EmitStep[];
  outcome: string;
};

const EMIT_SCENARIOS: EmitScenario[] = [
  {
    id: "shipped",
    label: "Order shipped",
    icon: PackageCheck,
    event: "order.shipped",
    payload: { orderId: 1001, customer: "jordan@acme.com", carrier: "UPS" },
    workflow: "Fulfilment",
    agent: "Fulfilment Agent",
    steps: [
      { icon: Bell, label: "Email the customer a tracking link" },
      { icon: Database, label: "Mark the order shipped in the CRM" },
      { icon: Send, label: "Post to #shipping" },
    ],
    outcome: "Customer notified · CRM updated",
  },
  {
    id: "invoice",
    label: "Invoice paid",
    icon: Check,
    event: "invoice.paid",
    payload: { invoiceId: "inv_203", amount: 900, currency: "USD" },
    workflow: "Revenue operations",
    agent: "Billing Agent",
    steps: [
      { icon: Check, label: "Verify the payment record" },
      { icon: Database, label: "Mark the invoice as paid" },
      { icon: Bell, label: "Notify the account team" },
    ],
    outcome: "Invoice reconciled · team notified",
  },
  {
    id: "signup",
    label: "User signup",
    icon: UserPlus,
    event: "user.signup",
    payload: { userId: 512, plan: "free" },
    workflow: "Onboarding",
    agent: "Onboarding Agent",
    steps: [
      { icon: Bell, label: "Send the welcome email" },
      { icon: Sparkles, label: "Provision a demo workspace" },
      { icon: RefreshCw, label: "Schedule a day-3 tip" },
    ],
    outcome: "New user onboarded",
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Playground() {
  const DEFAULT_EMIT = EMIT_SCENARIOS.find((s) => s.id === "signup") ?? EMIT_SCENARIOS[0];
  const [emitId, setEmitId] = React.useState(DEFAULT_EMIT.id);
  const [emitText, setEmitText] = React.useState(JSON.stringify(DEFAULT_EMIT.payload, null, 2));
  // -1 = idle; 0..steps.length = queued→routed→steps; > steps.length = done
  const [emitPhase, setEmitPhase] = React.useState(-1);
  const emitTimers = React.useRef<number[]>([]);
  const emitScenario = EMIT_SCENARIOS.find((s) => s.id === emitId)!;

  const clearEmitTimers = React.useCallback(() => {
    emitTimers.current.forEach((t) => window.clearTimeout(t));
    emitTimers.current = [];
  }, []);

  const emit = React.useCallback(
    (sc: EmitScenario) => {
      clearEmitTimers();
      setEmitPhase(0); // emit() returned — queued
      const total = sc.steps.length + 2; // routed + each step + done
      for (let i = 1; i <= total; i++) {
        emitTimers.current.push(
          window.setTimeout(() => setEmitPhase(i), 420 + (i - 1) * 480)
        );
      }
    },
    [clearEmitTimers]
  );

  // fire on mount + when the event scenario changes
  React.useEffect(() => {
    const sc = EMIT_SCENARIOS.find((s) => s.id === emitId)!;
    setEmitText(JSON.stringify(sc.payload, null, 2));
    emit(sc);
    return clearEmitTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emitId]);

  return (
    <section id="playground" className="scroll-mt-20 py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Playground</p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Watch a product event become agent work
          </h2>
          <p className="mt-4 text-muted-foreground">
            Submit an event and watch it get queued, routed to a workflow, and handled by an
            agent. This interactive preview runs entirely in your browser.
          </p>
        </div>

        <div className="mx-auto mt-8 overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-primary/[0.06]">
          {/* Event scenario tabs */}
          <div className="flex flex-wrap gap-2 border-b border-border/70 bg-muted/30 p-3">
            {EMIT_SCENARIOS.map((s) => {
              const Icon = s.icon;
              const active = s.id === emitId;
              return (
                <button
                  key={s.id}
                  onClick={() => setEmitId(s.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-transparent text-muted-foreground hover:bg-background hover:text-foreground"
                  )}
                >
                  <Icon className="size-3.5" />
                  {s.label}
                </button>
              );
            })}
          </div>

          <div className="grid gap-0 lg:grid-cols-2">
            {/* Left — event + payload */}
            <div className="space-y-4 border-b border-border/70 p-5 lg:border-b-0 lg:border-r">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">event</span>
                <code className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground">{emitScenario.event}</code>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Payload</p>
                <textarea
                  value={emitText}
                  onChange={(e) => setEmitText(e.target.value)}
                  spellCheck={false}
                  rows={6}
                  className="w-full resize-y rounded-lg border bg-background p-3 font-mono text-[13px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                />
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Subscribed workflow</p>
                <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 font-mono text-[11px] text-foreground/80">
                  <Radio className="size-3 text-primary" />
                  {emitScenario.event}
                  <ArrowRight className="size-3 text-muted-foreground/60" />
                  {emitScenario.workflow}
                  <ArrowRight className="size-3 text-muted-foreground/60" />
                  {emitScenario.agent}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => emit(emitScenario)}
                  disabled={emitPhase >= 0 && emitPhase < emitScenario.steps.length + 2}
                >
                  <Radio className="size-4" />
                  Emit event
                </Button>
                <Button size="sm" variant="ghost" onClick={() => emit(emitScenario)}>
                  <RotateCcw className="size-3.5" />
                  Replay
                </Button>
              </div>

              <code className="block rounded-md bg-muted px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                POST /api/v1/events · {`{"type":"${emitScenario.event}","payload":{…}}`}
              </code>
            </div>

            {/* Right — async pipeline timeline */}
            <div className="bg-muted/20 p-5">
              <p className="mb-3 text-xs font-medium text-muted-foreground">Event pipeline</p>
              <div className="space-y-2">
                {/* emit returned */}
                <div className={cn("flex items-start gap-2.5 rounded-lg border bg-card p-2.5 transition-opacity", emitPhase >= 0 ? "opacity-100" : "opacity-40")}>
                  {emitPhase >= 1
                    ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                    : <Zap className="mt-0.5 size-4 shrink-0 text-primary" />}
                  <div>
                    <p className="text-[11px] font-medium">POST returned · 202 queued</p>
                    <p className="text-[9px] text-muted-foreground">the event is accepted; agent work continues asynchronously</p>
                  </div>
                </div>

                {/* routed */}
                <div className={cn("flex items-start gap-2.5 rounded-lg border bg-card p-2.5 transition-opacity", emitPhase >= 1 ? "opacity-100" : "opacity-40")}>
                  {emitPhase >= 2
                    ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                    : emitPhase === 1
                      ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
                      : <Radio className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />}
                  <div>
                    <p className="text-[11px] font-medium">Routed to workflow · {emitScenario.workflow}</p>
                    <p className="text-[9px] text-muted-foreground">matched by event type + conditions, priority queue</p>
                  </div>
                </div>

                {/* agent + steps */}
                <div className={cn("rounded-lg border bg-card p-2.5 transition-opacity", emitPhase >= 1 ? "opacity-100" : "opacity-40")}>
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Bot className="size-3.5" />
                    </div>
                    <p className="text-[11px] font-semibold">{emitScenario.agent}</p>
                  </div>
                  <ul className="space-y-1.5 pl-1">
                    {emitScenario.steps.map((st, k) => {
                      const done = emitPhase >= k + 2;
                      const active = emitPhase === k + 1;
                      const StepIcon = st.icon;
                      return (
                        <li key={st.label} className={cn("flex items-center gap-2 text-[10px] transition-opacity", done || active ? "opacity-100" : "opacity-45")}>
                          {done
                            ? <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                            : active
                              ? <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
                              : <StepIcon className="size-3.5 shrink-0 text-muted-foreground/60" />}
                          <span className={cn(done && "text-muted-foreground")}>{st.label}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* outcome */}
                {emitPhase >= emitScenario.steps.length + 2 && (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-4 shrink-0" />
                    {emitScenario.outcome}
                    <span className="ml-auto text-[9px] font-normal text-muted-foreground">workflow complete</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          A simulation of the async event pipeline — emit returns instantly; the workflow runs in the background.
        </p>
      </div>
    </section>
  );
}
