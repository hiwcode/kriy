"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Wand2,
  Ban,
  Check,
  Play,
  ShieldCheck,
  ArrowRight,
  Eye,
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
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Tiny client-side decision engine (mirrors the real policy rules)   */
/* ------------------------------------------------------------------ */

type Rule = { field: string; op: string; value?: unknown };
type Policy = { name: string; rules: Rule[] };
type Mode = "observe" | "suggest" | "enforce";

type Result = {
  decision: "allow" | "modify" | "deny";
  payload: Record<string, unknown>;
  fired: string[];
  reasons: string[];
};

function maskValue(v: string): string {
  if (v.includes("@")) {
    const [n, d] = v.split("@");
    return d ? `${n.slice(0, 1)}***@${d}` : v;
  }
  const digits = (v.match(/\d/g) || []).length;
  if (digits >= 7) return "***" + v.slice(-4);
  if (v.length <= 2) return "*".repeat(v.length);
  return v[0] + "*".repeat(v.length - 2) + v[v.length - 1];
}

function evaluate(payload: Record<string, unknown>, policies: Policy[]): Result {
  const final: Record<string, unknown> = JSON.parse(JSON.stringify(payload));
  const fired: string[] = [];
  const reasons: string[] = [];

  for (const pol of policies) {
    let didFire = false;
    for (const { field, op, value } of pol.rules) {
      const present = field in final;
      const cur = final[field];
      if (op === "deny_if_present" && present) {
        return { decision: "deny", payload, fired: [...fired, pol.name], reasons: [`${pol.name}: '${field}' is not allowed`] };
      }
      if (!present) continue;
      if (op === "max" && typeof cur === "number" && typeof value === "number" && cur > value) {
        final[field] = value;
        reasons.push(`${pol.name}: clamped ${field} to ${value}`);
        didFire = true;
      } else if (op === "deny_above" && typeof cur === "number" && typeof value === "number" && cur > value) {
        return { decision: "deny", payload, fired: [...fired, pol.name], reasons: [`${pol.name}: ${field} ${cur} exceeds limit ${value}`] };
      } else if (op === "mask" && typeof cur === "string") {
        const m = maskValue(cur);
        if (m !== cur) { final[field] = m; reasons.push(`${pol.name}: masked ${field}`); didFire = true; }
      } else if (op === "redact") {
        delete final[field];
        reasons.push(`${pol.name}: removed ${field}`);
        didFire = true;
      } else if (op === "allow_values" && Array.isArray(value) && !value.includes(cur)) {
        return { decision: "deny", payload, fired: [...fired, pol.name], reasons: [`${pol.name}: ${field}=${JSON.stringify(cur)} is not allowed`] };
      }
    }
    if (didFire) fired.push(pol.name);
  }

  const changed = JSON.stringify(final) !== JSON.stringify(payload);
  return { decision: changed ? "modify" : "allow", payload: final, fired, reasons: reasons.length ? reasons : ["within policy"] };
}

/* ------------------------------------------------------------------ */
/*  Scenarios                                                          */
/* ------------------------------------------------------------------ */

type Scenario = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  action: string;
  payload: Record<string, unknown>;
  policies: Policy[];
};

const SCENARIOS: Scenario[] = [
  {
    id: "pii",
    label: "Mask PII",
    icon: Send,
    action: "http.post",
    payload: { toId: 42, email: "jordan.smith@acme.com", message: "Your order shipped" },
    policies: [{ name: "PII Guard", rules: [{ field: "email", op: "mask" }] }],
  },
  {
    id: "discount",
    label: "Clamp discount",
    icon: Database,
    action: "db.update.orders",
    payload: { id: 1001, status: "confirmed", discount: 80 },
    policies: [{ name: "Discount cap", rules: [{ field: "discount", op: "max", value: 50 }] }],
  },
  {
    id: "refund",
    label: "Block big refund",
    icon: Ban,
    action: "fn.refund",
    payload: { orderId: 1001, amount: 5000 },
    policies: [{ name: "Refund limit", rules: [{ field: "amount", op: "deny_above", value: 1000 }] }],
  },
  {
    id: "safe",
    label: "Allow safe write",
    icon: Check,
    action: "db.update.orders",
    payload: { id: 1001, status: "paid" },
    policies: [{ name: "Status whitelist", rules: [{ field: "status", op: "allow_values", value: ["pending", "paid", "shipped"] }] }],
  },
];

const MODES: { id: Mode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "observe", label: "Observe", icon: Eye },
  { id: "suggest", label: "Suggest", icon: Wand2 },
  { id: "enforce", label: "Enforce", icon: ShieldCheck },
];

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
    id: "todo",
    label: "Todos done",
    icon: Check,
    event: "todo.completed",
    payload: { boardId: 7, remaining: 0 },
    workflow: "Auto-cleanup",
    agent: "Cleanup Agent",
    steps: [
      { icon: Check, label: "Confirm every todo is complete" },
      { icon: RefreshCw, label: "Archive the finished list" },
      { icon: Sparkles, label: "Seed tomorrow's list" },
    ],
    outcome: "Board reset for tomorrow",
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

function diffLines(before: Record<string, unknown>, after: Record<string, unknown>) {
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const out: string[] = [];
  for (const k of keys) {
    if (!(k in after)) out.push(`${k}: removed`);
    else if (JSON.stringify(before[k]) !== JSON.stringify(after[k]))
      out.push(`${k}: ${JSON.stringify(before[k])} → ${JSON.stringify(after[k])}`);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Playground() {
  const [kind, setKind] = React.useState<"decide" | "emit">("emit");
  const [scenarioId, setScenarioId] = React.useState(SCENARIOS[0].id);
  const [mode, setMode] = React.useState<Mode>("enforce");
  const [text, setText] = React.useState(JSON.stringify(SCENARIOS[0].payload, null, 2));
  const [result, setResult] = React.useState<Result | null>(null);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState(false);

  const scenario = SCENARIOS.find((s) => s.id === scenarioId)!;

  /* ---- Emit (event workflow) state ---- */
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

  // fire on entering emit mode + when the event scenario changes
  React.useEffect(() => {
    if (kind !== "emit") return;
    const sc = EMIT_SCENARIOS.find((s) => s.id === emitId)!;
    setEmitText(JSON.stringify(sc.payload, null, 2));
    emit(sc);
    return clearEmitTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emitId, kind]);

  const run = React.useCallback(
    (raw: string, sc: Scenario) => {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(raw);
      } catch {
        setParseError("Payload is not valid JSON");
        return;
      }
      setParseError(null);
      setRunning(true);
      // tiny delay for a "thinking" feel
      window.setTimeout(() => {
        setResult(evaluate(payload, sc.policies));
        setRunning(false);
      }, 280);
    },
    []
  );

  // run on mount + when scenario changes
  React.useEffect(() => {
    const sc = SCENARIOS.find((s) => s.id === scenarioId)!;
    const raw = JSON.stringify(sc.payload, null, 2);
    setText(raw);
    run(raw, sc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId]);

  const decisionMeta =
    result?.decision === "deny"
      ? { label: "Denied", cls: "bg-destructive/10 text-destructive", icon: Ban }
      : result?.decision === "modify"
        ? { label: "Modified", cls: "bg-primary/10 text-primary", icon: Wand2 }
        : { label: "Allowed", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", icon: Check };
  const DIcon = decisionMeta.icon;

  return (
    <section id="playground" className="scroll-mt-20 py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Playground</p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            {kind === "decide" ? "See it decide — live" : "See it react — live"}
          </h2>
          <p className="mt-4 text-muted-foreground">
            {kind === "decide"
              ? "Guard blocks before an action: pick one, tweak the payload, and watch an agent allow, modify, or deny it against your policies."
              : "Emit fires an event and the agent reacts after: watch it get queued, routed to a workflow, and handled — no glue code."}{" "}
            Runs entirely in your browser — no signup.
          </p>
        </div>

        {/* Decide vs Emit — the two halves of the platform (tabs) */}
        <div className="mt-8 flex justify-center">
          <div className="inline-flex items-end gap-1 border-b border-border">
            {([
              { id: "emit", label: "Emit · react", icon: Radio, sub: "react after" },
              { id: "decide", label: "Guard · decide", icon: ShieldCheck, sub: "block before" },
            ] as const).map((k) => {
              const KIcon = k.icon;
              const active = kind === k.id;
              return (
                <button
                  key={k.id}
                  onClick={() => setKind(k.id)}
                  className={cn(
                    "-mb-px flex items-center gap-2.5 border-b-2 px-4 py-3 transition-colors sm:px-5",
                    active
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <KIcon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                  <span className="flex flex-col items-start text-left leading-tight">
                    <span className="text-sm font-semibold">{k.label}</span>
                    <span className="text-[10px] font-normal text-muted-foreground">{k.sub}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {kind === "decide" && (
        <div className="mx-auto mt-8 overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-primary/[0.06]">
          {/* Scenario tabs */}
          <div className="flex flex-wrap gap-2 border-b border-border/70 bg-muted/30 p-3">
            {SCENARIOS.map((s) => {
              const Icon = s.icon;
              const active = s.id === scenarioId;
              return (
                <button
                  key={s.id}
                  onClick={() => setScenarioId(s.id)}
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
            {/* Left — input */}
            <div className="space-y-4 border-b border-border/70 p-5 lg:border-b-0 lg:border-r">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">action</span>
                  <code className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground">{scenario.action}</code>
                </div>
                {/* Mode segmented control */}
                <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
                  {MODES.map((m) => {
                    const MIcon = m.icon;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setMode(m.id)}
                        title={m.label}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                          mode === m.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <MIcon className="size-3.5" />
                        <span className="hidden sm:inline">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Payload</p>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  spellCheck={false}
                  rows={9}
                  className="w-full resize-y rounded-lg border bg-background p-3 font-mono text-[13px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                />
              </div>

              {/* active policies */}
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Policies applied</p>
                <div className="flex flex-wrap gap-1.5">
                  {scenario.policies.flatMap((p) =>
                    p.rules.map((r, i) => (
                      <span key={`${p.name}-${i}`} className="rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-foreground/80">
                        {r.op === "mask" ? `mask ${r.field}` :
                         r.op === "max" ? `${r.field} ≤ ${r.value}` :
                         r.op === "deny_above" ? `deny ${r.field} > ${r.value}` :
                         r.op === "allow_values" ? `${r.field} ∈ {${(r.value as string[]).join(", ")}}` :
                         `${r.field} ${r.op}`}
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => run(text, scenario)} disabled={running}>
                  <Play className="size-4" />
                  Run through agent
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setText(JSON.stringify(scenario.payload, null, 2));
                    run(JSON.stringify(scenario.payload, null, 2), scenario);
                  }}
                >
                  <RotateCcw className="size-3.5" />
                  Reset
                </Button>
              </div>
              {parseError && <p className="text-xs text-destructive">{parseError}</p>}
            </div>

            {/* Right — verdict */}
            <div className="bg-muted/20 p-5">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Agent verdict</p>
              {running ? (
                <div className="flex h-full min-h-[220px] items-center justify-center text-sm text-muted-foreground">
                  <span className="size-2 animate-ping rounded-full bg-primary" />
                  <span className="ml-3">deciding…</span>
                </div>
              ) : result ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-semibold", decisionMeta.cls)}>
                      <DIcon className="size-3.5" />
                      {decisionMeta.label}
                    </span>
                    {result.fired.map((f) => (
                      <span key={f} className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs font-medium text-primary">
                        <ShieldCheck className="size-3" />
                        {f}
                      </span>
                    ))}
                  </div>

                  <p className="text-sm text-muted-foreground">{result.reasons.join("; ")}</p>

                  {result.decision === "deny" ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                      Request blocked before it reached your {scenario.action.split(".")[0]} layer.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        {result.decision === "modify" ? "Payload the agent would use" : "Payload (unchanged)"}
                      </p>
                      <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-3 font-mono text-[12px] leading-relaxed text-zinc-100">
                        {JSON.stringify(result.payload, null, 2)}
                      </pre>
                      {result.decision === "modify" && (
                        <ul className="space-y-1">
                          {diffLines(scenario.payload, result.payload).map((d) => (
                            <li key={d} className="flex items-center gap-1.5 font-mono text-[11px] text-foreground/80">
                              <ArrowRight className="size-3 text-primary" />
                              {d}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* mode footnote */}
                  <div className="rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground">
                    {mode === "enforce" && (
                      <>In <span className="font-medium text-foreground">enforce</span> mode this verdict is <span className="font-medium text-foreground">applied</span> to your call{result.decision === "deny" ? " (it throws)." : "."}</>
                    )}
                    {mode === "suggest" && (
                      <>In <span className="font-medium text-foreground">suggest</span> mode your call runs unchanged; the verdict is surfaced for review.</>
                    )}
                    {mode === "observe" && (
                      <>In <span className="font-medium text-foreground">observe</span> mode nothing changes — it&apos;s logged to traces only (shadow mode).</>
                    )}
                  </div>

                  <code className="block truncate rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
                    atelier.guard(&quot;{scenario.action}&quot;, payload, {`{ mode: "${mode}" }`})
                  </code>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        )}

        {kind === "emit" && (
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

              <code className="block truncate rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
                atelier.emit(&quot;{emitScenario.event}&quot;, payload)
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
                    <p className="text-[11px] font-medium">emit() returned · 202 queued</p>
                    <p className="text-[9px] text-muted-foreground">your code moves on immediately — fire &amp; forget</p>
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
        )}

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {kind === "decide"
            ? "This sandbox runs the same rule engine the SDK uses — locally, on sample data."
            : "A simulation of the async event pipeline — emit returns instantly; the workflow runs in the background."}
        </p>
      </div>
    </section>
  );
}
