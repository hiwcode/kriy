"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { useBackendReady } from "@/components/backend-health-provider";
import { siteConfig } from "@/config/site";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Playground } from "@/components/landing/playground";
import { FeatureShowcase } from "@/components/landing/feature-showcase";
import {
  ArrowRight,
  Bell,
  BookOpen,
  Bot,
  BrainCircuit,
  Database,
  Github,
  MemoryStick,
  Puzzle,
  Star,
  LayoutDashboard,
  FileText,
  Activity,
  Zap,
  DollarSign,
  Workflow,
  Webhook,
  Heart,
  ShieldCheck,
  Lock,
  KeyRound,
  Server,
} from "lucide-react";

import Logo from "@/components/logo";
/* ------------------------------------------------------------------ */
/*  Static data                                                        */
/* ------------------------------------------------------------------ */

const FEATURES = [
  {
    icon: Bot,
    title: "Agents with real tools",
    description:
      "Build agents on the models you choose and give them controlled access to MCP tools, databases, and reusable skills.",
  },
  {
    icon: Workflow,
    title: "Event-driven workflows",
    description:
      "When something happens in your product, route the work to the right agent with priorities, retries, and run history.",
  },
  {
    icon: ShieldCheck,
    title: "Decision gates",
    description:
      "Check a proposed action against workspace rules before your application allows it to continue.",
  },
  {
    icon: BrainCircuit,
    title: "Orchestration",
    description:
      "Design multi-agent flows visually, coordinate specialized agents, and inspect each execution step.",
  },
  {
    icon: MemoryStick,
    title: "Memory that carries forward",
    description:
      "Preserve session history and extract durable facts so agents can carry context across conversations.",
  },
  {
    icon: Webhook,
    title: "Reliable result delivery",
    description:
      "Receive results through HMAC-signed callbacks with retries, delivery logs, and manual replay.",
  },
];

const STEPS = [
  {
    number: "01",
    title: "Build the agent",
    description:
      "Choose a model, write its instructions, and connect only the tools it needs.",
  },
  {
    number: "02",
    title: "Connect it to real work",
    description:
      "Use product events to start workflows and decision gates to control sensitive actions.",
  },
  {
    number: "03",
    title: "Receive and inspect the result",
    description:
      "Return signed results to your product and inspect every run, decision, and delivery.",
  },
];

const SECURITY = [
  {
    icon: Lock,
    title: "Secrets encrypted at rest",
    description:
      "API keys, provider tokens, MCP credentials, and email passwords are encrypted with AES (Fernet) before they ever touch the database.",
  },
  {
    icon: KeyRound,
    title: "Keys & tokens hashed",
    description:
      "Your API keys, login sessions, and invite links are stored only as one-way hashes — never in plaintext.",
  },
  {
    icon: ShieldCheck,
    title: "Scoped, authenticated access",
    description:
      "Workspace role-based access control, per-user API keys, and API-key-gated agent endpoints keep access locked down.",
  },
  {
    icon: Server,
    title: "Self-hostable — your data stays yours",
    description:
      "Run KRIY on your own infrastructure with your own keys. Nothing leaves your servers unless you send it.",
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

/* ------------------------------------------------------------------ */
/*  Hero Visual — static product mockup                                */
/* ------------------------------------------------------------------ */

type HeroNavItem = { label: string; icon: React.ComponentType<{ className?: string }>; active?: boolean };
const HERO_NAV_GROUPS: { name: string; items: HeroNavItem[] }[] = [
  {
    name: "Workspace",
    items: [
      { label: "Overview", icon: LayoutDashboard, active: true },
      { label: "Notifications", icon: Bell },
    ],
  },
  {
    name: "Build",
    items: [
      { label: "Agents", icon: Bot },
      { label: "Orchestration", icon: BrainCircuit },
      { label: "Prompts", icon: FileText },
      { label: "Memory", icon: MemoryStick },
    ],
  },
  {
    name: "Connect",
    items: [
      { label: "MCP servers", icon: Puzzle },
      { label: "Databases", icon: Database },
    ],
  },
  {
    name: "Automate",
    items: [
      { label: "Workflows", icon: Workflow },
      { label: "Decision gates", icon: ShieldCheck },
    ],
  },
  {
    name: "Observe",
    items: [{ label: "Runs & traces", icon: Activity }],
  },
];

const HERO_STATS = [
  { label: "Total agents", value: "12", icon: Bot },
  { label: "Conversations", value: "248", icon: Activity },
  { label: "Recorded tokens", value: "84.2k", icon: Zap },
  { label: "Estimated cost", value: "$4.21", icon: DollarSign },
] as const;

function HeroVisual() {
  return (
    <div className="relative mx-auto mt-16 max-w-5xl md:mt-20">
      {/* soft brand glow behind the frame */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-8 -top-8 bottom-0 -z-10 rounded-[2rem] opacity-70 blur-2xl"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, color-mix(in oklch, var(--primary) 16%, transparent), transparent 70%)",
        }}
      />
      <div
        className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-primary/[0.07]"
        style={{
          maskImage: "linear-gradient(to bottom, black 68%, transparent 99%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 68%, transparent 99%)",
        }}
      >
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <div className="size-2.5 rounded-full bg-foreground/[0.12]" />
            <div className="size-2.5 rounded-full bg-foreground/[0.08]" />
            <div className="size-2.5 rounded-full bg-foreground/[0.08]" />
          </div>
          <div className="ml-4 flex-1 rounded-md bg-background/60 px-3 py-1 text-center">
            <span className="text-[10px] font-medium text-muted-foreground/50">
              KRIY / overview
            </span>
          </div>
        </div>

        {/* App body */}
        <div className="flex h-[320px] text-left sm:h-[440px]">
          {/* Sidebar — mirrors the real AppSidebar */}
          <aside className="hidden w-52 shrink-0 flex-col border-r border-sidebar-border/60 bg-sidebar p-3 sm:flex">
            {/* Brand */}
            <div className="mb-4 flex items-center gap-3 px-1.5 py-1">
              <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary ring-1 ring-inset ring-primary-foreground/15">
                <Logo width={32} height={32} />
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-[15px] font-semibold leading-tight tracking-tight text-sidebar-foreground">
                  KRIY
                </span>
                <span className="truncate text-[9px] font-medium uppercase tracking-[0.18em] text-sidebar-foreground/45">
                  Agent Control Plane
                </span>
              </div>
            </div>

            {/* Nav groups */}
            <div className="flex flex-1 flex-col gap-2 overflow-hidden">
              {HERO_NAV_GROUPS.map((group) => (
                <div key={group.name} className="flex flex-col gap-0.5">
                  <span className="px-2 pb-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/40">
                    {group.name}
                  </span>
                  {group.items.map((item) => (
                    <div
                      key={item.label}
                      className={cn(
                        "relative flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-xs font-medium",
                        item.active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70"
                      )}
                    >
                      <item.icon
                        className={cn(
                          "size-3.5 shrink-0",
                          item.active ? "text-primary" : "text-sidebar-foreground/55"
                        )}
                      />
                      {item.label}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="mt-2 flex items-center gap-2 px-2 py-1.5 text-[9px] font-medium text-sidebar-foreground/40">
              <span className="size-1.5 shrink-0 rounded-full bg-success" />
              All systems operational
            </div>
          </aside>

          {/* Main */}
          <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden p-4 sm:p-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold tracking-tight">Overview</p>
                <p className="text-[10px] text-muted-foreground">Monitor agent activity, usage, and workspace operations.</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[9px] font-medium text-primary-foreground sm:flex">
                  <Bot className="size-3" />
                  Manage agents
                </div>
                <div className="size-7 rounded-full bg-gradient-to-br from-primary to-fuchsia-500" />
              </div>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {HERO_STATS.map((s) => (
                <div key={s.label} className="rounded-lg border border-border/60 bg-background/60 p-2.5">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="truncate text-[9px] text-muted-foreground">{s.label}</p>
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <s.icon className="size-3.5" />
                    </div>
                  </div>
                  <p className="text-sm font-semibold tracking-tight">{s.value}</p>
                </div>
              ))}
            </div>

            {/* Workspace usage */}
            <div className="min-h-0 flex-1">
              <div className="flex h-full flex-col rounded-lg border border-border/60 bg-background/60 p-3">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium">Workspace usage</p>
                    <p className="text-[9px] text-muted-foreground">84.2k tokens across 248 conversations.</p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] text-muted-foreground">Last 7 days</span>
                </div>
                <div className="relative min-h-0 flex-1">
                  <svg viewBox="0 0 320 120" preserveAspectRatio="none" className="size-full">
                    <defs>
                      <linearGradient id="heroArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0,95 C30,80 55,86 85,62 C115,40 135,52 165,42 C195,32 215,40 245,24 C275,12 295,18 320,8 L320,120 L0,120 Z"
                      fill="url(#heroArea)"
                    />
                    <path
                      d="M0,95 C30,80 55,86 85,62 C115,40 135,52 165,42 C195,32 215,40 245,24 C275,12 295,18 320,8"
                      fill="none"
                      stroke="var(--primary)"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function LandingPage() {
  const router = useRouter();
  const auth = useAuth();
  const backendReady = useBackendReady();
  // Sign-in needs the backend — only offer it when the backend is reachable.
  const showSignIn = backendReady === true;

  React.useEffect(() => {
    if (auth?.isSignedIn) {
      router.replace("/dashboard");
    }
  }, [auth?.isSignedIn, router]);

  if (auth?.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3">
          <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (auth?.isSignedIn) return null;


  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* -- Navbar ------------------------------------------------- */}
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          {/* Left: logo + links */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
              <div className="flex size-8 items-center justify-center overflow-hidden rounded-lg bg-primary ring-1 ring-inset ring-primary-foreground/15">
                <Logo width={30} height={30} priority />
              </div>
              <span className="text-lg font-semibold tracking-tight">
                {siteConfig.name}
              </span>
            </Link>

            <div className="hidden items-center gap-1 md:flex">
              <button
                onClick={() => scrollTo("features")}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Features
              </button>
              <button
                onClick={() => scrollTo("playground")}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Demo
              </button>
              <button
                onClick={() => scrollTo("how-it-works")}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                How it works
              </button>
              <Link
                href="/docs"
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Docs
              </Link>
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2">
            <ThemeToggle isHeader={true}/>
            <Button variant="ghost" size="icon" asChild>
              <a href={siteConfig.github} target="_blank" rel="noopener noreferrer" aria-label="GitHub">
                <Github className="size-4" />
              </a>
            </Button>
            {showSignIn && <div className="hidden sm:block">{auth?.signInButton}</div>}
          </div>
        </div>
      </nav>

      {/* -- Hero --------------------------------------------------- */}
      <section className="relative overflow-hidden pt-16">
        {/* Dot-grid background */}
        <div
          className="pointer-events-none absolute inset-0 opacity-100 dark:opacity-100"
          style={{
            backgroundImage:
              "radial-gradient(circle, oklch(0.5 0 0 / 0.07) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        {/* Logo-inspired ambient glow */}
        <div
          className="pointer-events-none absolute left-1/2 top-[-8%] h-[620px] w-[900px] -translate-x-1/2 rounded-full opacity-70 blur-3xl"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(255, 132, 25, 0.14) 0%, transparent 70%)",
          }}
        />
        <div
          className="pointer-events-none absolute right-[8%] top-[20%] hidden size-72 rounded-full opacity-50 blur-3xl lg:block"
          style={{
            background:
              "radial-gradient(circle, rgba(255, 72, 42, 0.09) 0%, transparent 70%)",
          }}
        />

        <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-36 md:pt-48">
          <div className="mx-auto max-w-3xl text-center">
            {/* Badge */}
            <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-foreground/70 shadow-sm">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/40" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              Agent control plane · Source-available · Self-hostable
            </div>

            {/* Headline */}
            <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
              Put{" "}
              <span className="relative inline-block">
                <span className="relative z-10 text-gradient-brand">AI agents</span>
                <span className="absolute bottom-1 left-0 right-0 z-0 h-3 rounded-sm bg-gradient-to-r from-primary/20 to-orange-500/15 sm:bottom-1.5 sm:h-4" />
              </span>{" "}
              <br className="hidden sm:block" />
              <span className="text-muted-foreground">behind your product</span>
            </h1>

            {/* Subtitle */}
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              KRIY turns application events into governed agent work. Connect models and
              tools, control sensitive actions, and receive signed results without replacing your stack.
            </p>

            {/* CTAs */}
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              {showSignIn ? (
                auth?.signInButton ?? (
                  <p className="text-sm text-muted-foreground">
                    Google sign-in is not configured.
                  </p>
                )
              ) : backendReady === false ? (
                <p className="text-sm text-red-400">
                  Sign-in is temporarily unavailable <br/>(Please try again in a few minutes.)
                </p>
              ) : null}
              <Button variant="outline" size="lg" asChild>
                <Link href="/docs">
                  <BookOpen className="size-4" />
                  Read the API docs
                </Link>
              </Button>
            </div>

            {/* Trust row */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-muted-foreground">
              {["Event-driven", "Governed actions", "Signed delivery"].map((item) => (
                <span key={item} className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-primary/70" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* Animated hero visual */}
          <HeroVisual />
        </div>

        {/* Section divider */}
        <div className="mx-auto max-w-6xl px-6">
          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        </div>
      </section>

      {/* -- Features ----------------------------------------------- */}
      <section id="features" className="scroll-mt-20 py-24 md:py-32 ">
        <div className="mx-auto max-w-6xl px-6">
          {/* Section header */}
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Features
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Build the agents. Govern the work.
            </h2>
            <p className="mt-4 text-muted-foreground">
              KRIY connects agents to the product you already have, then gives you control over what they can do and visibility into what happened.
            </p>
          </div>

          {/* Grid */}
          <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/[0.06]"
                >
                  {/* Corner glow on hover */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -right-12 -top-12 size-32 rounded-full bg-primary/10 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
                  />
                  {/* Top hairline on hover */}
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                  <div className="relative">
                    <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/10 transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-md group-hover:shadow-primary/25">
                      <Icon className="size-5" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-semibold tracking-tight">{feature.title}</h3>
                      <ArrowRight className="size-4 -translate-x-1 text-primary opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="mx-auto max-w-6xl px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      {/* -- A closer look (feature mockups) ------------------------ */}
      <FeatureShowcase />

      {/* -- Interactive playground --------------------------------- */}
      <Playground />

      {/* Divider */}
      <div className="mx-auto max-w-6xl px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      {/* -- How it works ------------------------------------------- */}
      <section id="how-it-works" className="scroll-mt-20 py-24 md:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              How it works
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              From product signal to finished work
            </h2>
          </div>

          <div className="relative mt-20 grid gap-12 md:grid-cols-3 md:gap-8">
            {/* Connecting line (desktop) */}
            <div className="pointer-events-none absolute left-[16.67%] right-[16.67%] top-8 hidden h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-border to-transparent md:block" />

            {STEPS.map((step, i) => (
              <div key={step.number} className="relative text-center">
                {/* Number circle */}
                <div className="relative z-10 mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border-2 border-primary/30 bg-card font-mono text-lg font-bold text-primary shadow-sm transition-all duration-300 hover:scale-105 hover:border-primary/50">
                  {step.number}
                </div>
                <h3 className="text-lg font-semibold tracking-tight">
                  {step.title}
                </h3>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
                {/* Arrow (mobile) */}
                {i < STEPS.length - 1 && (
                  <div className="mt-8 flex justify-center text-border md:hidden">
                    <ArrowRight className="size-5 rotate-90" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="mx-auto max-w-6xl px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      {/* -- Security / Trust --------------------------------------- */}
      <section id="security" className="scroll-mt-20 border-t border-border py-24 md:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/10">
              <ShieldCheck className="size-6" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Security
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Your keys and data stay protected
            </h2>
            <p className="mt-4 text-muted-foreground">
              KRIY is built to hold sensitive credentials safely — encrypted at rest,
              hashed where it counts, and scoped to you.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {SECURITY.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="flex gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
                >
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/10">
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold tracking-tight">{item.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* -- Final CTA ---------------------------------------------- */}
      <section className="py-24 md:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-orange-500/5 px-8 py-16 text-center md:px-16 md:py-20">
            {/* Glow */}
            <div
              className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[640px] -translate-x-1/2 rounded-full opacity-70 blur-3xl"
              style={{
                background:
                  "radial-gradient(ellipse, color-mix(in oklch, var(--primary) 25%, transparent) 0%, transparent 70%)",
              }}
            />
            {/* Dot pattern */}
            <div
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{
                backgroundImage:
                  "radial-gradient(circle, oklch(0.5 0 0 / 0.04) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            />

            <div className="relative">
              <div className="mx-auto mb-6 flex size-14 items-center justify-center overflow-hidden rounded-2xl bg-primary shadow-lg shadow-primary/20 ring-1 ring-inset ring-primary-foreground/15">
                <Logo width={54} height={54} />
              </div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Your product already knows when work needs to happen
              </h2>
              <p className="mx-auto mt-4 max-w-md text-muted-foreground">
                Give it agents that can do the work—with tools, memory, controls,
                and a clear record of every result.
              </p>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                {showSignIn && auth?.signInButton}
                <Button variant="outline" size="lg" asChild>
                  <a
                    href={siteConfig.github}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Star className="size-4" />
                    Star on GitHub
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -- Support & contact -------------------------------------- */}
      <section id="support" className="scroll-mt-20 border-t border-border py-24 md:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/10">
              <Heart className="size-6" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Support
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Support the project
            </h2>
            <p className="mt-4 text-muted-foreground">
              KRIY is free and source-available, built and maintained in the open.
              If it helps you, consider supporting it — donations, feature sponsorships,
              and commercial-licensing enquiries are all welcome.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button size="lg" asChild>
                <a href="mailto:contract@gethowitworks.com?subject=KRIY%20%E2%80%94%20Support%20%2F%20Donate">
                  <Heart className="size-4" />
                  Donate / Get in touch
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* -- Footer ------------------------------------------------- */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <div className="flex size-6 items-center justify-center overflow-hidden rounded-md bg-primary ring-1 ring-inset ring-primary-foreground/15">
              <Logo width={24} height={24} />
            </div>
            <span className="font-medium text-foreground">{siteConfig.name}</span>
            <span className="text-border">/</span>
            <span>FSL-1.1-MIT</span>
          </div>
          <div className="flex items-center gap-6 text-sm flex-col md:flex-row">
            <a
              href="mailto:contract@gethowitworks.com"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Contact
            </a>
            <Link
              href="/docs"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Docs
            </Link>
            <Link
              href="/privacy"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Terms
            </Link>
            <a
              href={siteConfig.github}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
