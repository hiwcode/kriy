import Link from "next/link";
import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye, Wand2, ShieldCheck, Github, Terminal } from "lucide-react";

export const metadata: Metadata = {
  title: "SDK — Atelier",
  description: "Put an AI agent in the decision path of your Python or Node codebase.",
};

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-white/10 bg-zinc-950 p-4 font-mono text-[13px] leading-relaxed text-zinc-100">
      {children}
    </pre>
  );
}

function Section({ id, eyebrow, title, children }: { id?: string; eyebrow?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>}
      <h2 className="mt-1 text-2xl font-bold tracking-tight">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

const MODES = [
  { icon: Eye, name: "observe", desc: "Shadow mode — logs what the agent would do, changes nothing." },
  { icon: Wand2, name: "suggest", desc: "Returns the original payload; the verdict is surfaced for review." },
  { icon: ShieldCheck, name: "enforce", desc: "Applies the verdict — deny throws, modify rewrites the payload." },
];

export default function SdkPage() {
  const Logo = siteConfig.logo;
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
              <Logo className="size-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">{siteConfig.name}</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/#playground">Playground</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={siteConfig.github} target="_blank" rel="noopener noreferrer">
                <Github className="size-4" />
                GitHub
              </a>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-14">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" />
          Back home
        </Link>

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">SDK</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">Agentify your codebase</h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            Drop the SDK into your Python or Node app and put an agent in the decision path of any API call,
            DB write, or function — one call site at a time. It can <strong>observe</strong>, <strong>modify</strong>,
            or <strong>deny</strong> the payload, bounded by your policies.
          </p>
        </div>

        <div className="mt-12 space-y-14">
          <Section eyebrow="Install" title="Add the SDK">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"><Terminal className="size-3.5" /> Python</p>
                <Code>pip install atelier-agentic</Code>
              </div>
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"><Terminal className="size-3.5" /> Node</p>
                <Code>npm install @atelier/agentic</Code>
              </div>
            </div>
          </Section>

          <Section eyebrow="Quickstart" title="Guard an action">
            <p className="text-muted-foreground">
              Get an API key from <span className="font-mono text-sm">Config → API Access</span>, then wrap any
              payload before you use it. <code className="rounded bg-muted px-1 text-sm">guard()</code> returns the
              payload to actually use (or throws on deny in enforce mode).
            </p>
            <p className="mb-1.5 text-sm font-medium">Python</p>
            <Code>{`from atelier_agentic import AtelierClient

atelier = AtelierClient(agent_id=12, api_key="sk_...", mode="observe")

order = atelier.guard(
    "db.update", order,
    mutable_fields=["discount"],   # the agent may only touch these
    context={"table": "orders"},
)
db.update(order)`}</Code>
            <p className="mb-1.5 mt-4 text-sm font-medium">Node / TypeScript</p>
            <Code>{`import { AtelierClient } from "@atelier/agentic";

const atelier = new AtelierClient({ agentId: 12, apiKey: "sk_...", mode: "observe" });

const order = await atelier.guard("db.update", order, {
  mutableFields: ["discount"],     // the agent may only touch these
  context: { table: "orders" },
});
await db.orders.update(order);`}</Code>
          </Section>

          <Section eyebrow="Rollout" title="Three modes — ship safely">
            <div className="overflow-hidden rounded-xl border">
              {MODES.map((m, i) => {
                const Icon = m.icon;
                return (
                  <div key={m.name} className={`flex items-start gap-3 p-4 ${i > 0 ? "border-t" : ""}`}>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="size-[18px]" />
                    </span>
                    <div>
                      <code className="font-mono text-sm font-semibold">{m.name}</code>
                      <p className="mt-0.5 text-sm text-muted-foreground">{m.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-sm text-muted-foreground">
              Start in <strong>observe</strong>, watch the verdicts in the agent&apos;s <strong>Decisions</strong> tab,
              then graduate specific call sites to <strong>enforce</strong>.
            </p>
          </Section>

          <Section eyebrow="Auto-instrument" title="Or guard every outbound call">
            <p className="mb-1.5 text-sm font-medium">Python — patch <code className="font-mono">requests</code></p>
            <Code>{`from atelier_agentic import install_requests
install_requests(atelier, methods=["POST", "PUT"])  # JSON bodies now guarded`}</Code>
            <p className="mb-1.5 mt-4 text-sm font-medium">Node — patch global <code className="font-mono">fetch</code></p>
            <Code>{`import { installFetch } from "@atelier/agentic";
const uninstall = installFetch(atelier, { methods: ["POST", "PUT"] });`}</Code>
          </Section>

          <Section eyebrow="Full surface" title="Beyond guard">
            <p className="text-muted-foreground">
              <code className="rounded bg-muted px-1 text-sm">guard()</code> is the common case, but the SDK
              exposes the whole decision surface.
            </p>

            <p className="mb-1.5 text-sm font-medium">
              <code className="font-mono">decide</code> — get the verdict without applying it
            </p>
            <Code>{`# Python
v = atelier.decide("http.post", body, schema=ORDER_SCHEMA)
print(v.decision, v.reason, v.confidence, v.changed)`}</Code>
            <Code>{`// Node
const v = await atelier.decide("http.post", body, { schema: ORDER_SCHEMA });
console.log(v.decision, v.reason, v.confidence, v.changed);`}</Code>

            <p className="mb-1.5 mt-4 text-sm font-medium">
              <code className="font-mono">wrap</code> / <code className="font-mono">@intercept</code> — guard a function
            </p>
            <Code>{`# Python
@atelier.intercept("fn.charge", mutable_fields=["amount"])
def charge(payload):
    return gateway.charge(payload)`}</Code>
            <Code>{`// Node
const charge = wrap(atelier, "fn.charge", (p) => gateway.charge(p), {
  mutableFields: ["amount"],
});`}</Code>

            <p className="mb-1.5 mt-4 text-sm font-medium">
              <code className="font-mono">emit</code> — fire-and-forget an event
            </p>
            <p className="text-sm text-muted-foreground">
              Report that something happened and let server-side{" "}
              <Link href="/docs/using-event-workflows" className="underline underline-offset-2">workflows</Link>{" "}
              react (each picks its own agent). No <code className="font-mono">agent_id</code> needed.
            </p>
            <Code>{`# Python
atelier = AtelierClient(api_key="ate-...")   # no agent_id for emit
atelier.emit("todo.completed", {"todos": todos})`}</Code>
            <Code>{`// Node
await atelier.emit("todo.completed", { todos });`}</Code>

            <p className="mb-1.5 mt-4 text-sm font-medium">
              <code className="font-mono">trigger</code> — run a full agent turn
            </p>
            <Code>{`# Python
summary = atelier.trigger("todo.completed", context={"todos": todos})`}</Code>
            <Code>{`// Node
const summary = await atelier.trigger("todo.completed", { context: { todos } });`}</Code>
          </Section>

          <Section eyebrow="Policies" title="Bound what the agent may do">
            <p className="text-muted-foreground">
              Per-call-site detail lives in code (the <code className="rounded bg-muted px-1 text-sm">action</code>,{" "}
              <code className="rounded bg-muted px-1 text-sm">mutable_fields</code>,{" "}
              <code className="rounded bg-muted px-1 text-sm">schema</code>). Cross-cutting guardrails — “discounts ≤ 50%”,
              “mask emails”, “deny refunds &gt; $1,000” — are defined once in the agent&apos;s <strong>Policies</strong> tab and
              enforced deterministically on every decision. The agent can even propose new ones from observed traffic.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/#playground">Try the playground</Link>
              </Button>
              <Button variant="outline" asChild>
                <a href={siteConfig.sdk_github} target="_blank" rel="noopener noreferrer">
                  <Github className="size-4" />
                  Read the source
                </a>
              </Button>
            </div>
          </Section>
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-4xl px-6 py-8 text-sm text-muted-foreground">
          {siteConfig.name} · Put an agent in the decision path of your code.
        </div>
      </footer>
    </div>
  );
}
