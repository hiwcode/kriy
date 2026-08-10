"use client";

import { useAuth } from "@/components/auth/auth-provider";
import { AppLayout } from "@/components/layout/app-layout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DashboardData } from "@/lib/api/dashboard";
import { getDashboard } from "@/lib/api/dashboard";
import { WorkspaceActivityCard } from "@/components/dashboard/workspace-activity-card";
import {
  ArrowRight,
  Activity,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  DollarSign,
  FileText,
  Plug,
  Workflow,
  Zap,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function formatRelativeTime(ts: number | null): string {
  if (!ts) return "Never";
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  return new Date(ts * 1000).toLocaleDateString();
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const quickActions = [
  { title: "Create an agent", description: "Configure instructions, models, and tools", icon: Bot, href: "/agents" },
  { title: "Build a workflow", description: "Route application events to an agent", icon: Workflow, href: "/workflows" },
  { title: "Connect tools", description: "Add an MCP server or database", icon: Plug, href: "/mcp-connections" },
  { title: "Inspect traces", description: "Review execution and model usage", icon: Activity, href: "/traces" },
];

const chartAxisTickStyle = { fill: "var(--muted-foreground)" };
const chartGridStroke = "var(--border)";
const chartTooltipStyle = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "10px",
  color: "var(--popover-foreground)",
  boxShadow: "var(--shadow-md)",
  fontSize: "12px",
} as const;

export default function DashboardPage() {
  const auth = useAuth();
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!auth?.isSignedIn) return;
    getDashboard()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [auth?.isSignedIn]);

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-6 p-6">
          <div className="space-y-2">
            <div className="h-7 w-40 animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-72 animate-pulse rounded-md bg-muted/70" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[88px] animate-pulse rounded-xl border bg-card" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="h-[330px] animate-pulse rounded-xl border bg-card lg:col-span-2" />
            <div className="h-[330px] animate-pulse rounded-xl border bg-card" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="space-y-6 p-6">
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive">
            {error}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!data) return null;

  const stats = [
    { title: "Active agents", value: String(data.stats.active_agents), icon: Bot },
    { title: "Prompt templates", value: String(data.stats.total_prompts), icon: FileText },
    { title: "Tokens processed", value: formatTokens(data.stats.tokens_used), icon: Zap },
    { title: "Estimated cost", value: `$${(data.stats.estimated_cost ?? 0).toFixed(4)}`, icon: DollarSign },
  ];

  const usageData = data.usage_data.length > 0 ? data.usage_data : [{ name: "No data", tokens: 0, conversations: 0 }];
  const agentPerformance = data.agent_performance.length > 0 ? data.agent_performance : data.agents.length > 0 ? data.agents.map((a) => ({ name: a.name, tasks: 0 })) : [{ name: "No agents", tasks: 0 }];
  const tokensPerAgent = data.tokens_per_agent ?? [];
  const tokensChartData = tokensPerAgent.length > 0 ? tokensPerAgent.map((a) => ({ name: a.name, tokens: a.tokens })) : data.agents.length > 0 ? data.agents.map((a) => ({ name: a.name, tokens: 0 })) : [{ name: "No data", tokens: 0 }];
  const costChartData = tokensPerAgent.length > 0 ? tokensPerAgent.map((a) => ({ name: a.name, cost: a.estimated_cost })) : data.agents.length > 0 ? data.agents.map((a) => ({ name: a.name, cost: 0 })) : [{ name: "No data", cost: 0 }];

  return (
    <AppLayout>
      <div className="mx-auto flex w-full max-w-[1600px] animate-fade-in-up flex-col gap-6 p-4 sm:p-6 lg:p-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.025em]">Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">Monitor agent activity, usage, and workspace operations.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card
              key={stat.title}
              className="relative overflow-hidden py-4"
            >
              <CardContent className="flex items-center gap-4">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <stat.icon className="size-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-semibold tracking-tight tabular-nums">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Token usage</CardTitle>
              <CardDescription>Daily token consumption this week</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px] [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/60">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={usageData}>
                    <defs>
                      <linearGradient id="tokenGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12, ...chartAxisTickStyle }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 12, ...chartAxisTickStyle }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                    <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: "var(--foreground)" }} cursor={{ stroke: "var(--border)" }} />
                    <Area type="monotone" dataKey="tokens" stroke="var(--chart-1)" strokeWidth={2} fill="url(#tokenGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Agent activity</CardTitle>
              <CardDescription>Conversations per agent</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px] [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agentPerformance} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12, ...chartAxisTickStyle }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12, ...chartAxisTickStyle }} tickLine={false} axisLine={false} width={80} />
                    <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: "var(--foreground)" }} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                    <Bar dataKey="tasks" fill="var(--chart-3)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Tokens by agent</CardTitle>
              <CardDescription>Token usage by agent</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px] [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tokensChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12, ...chartAxisTickStyle }} tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12, ...chartAxisTickStyle }} tickLine={false} axisLine={false} width={80} />
                    <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: "var(--foreground)" }} cursor={{ fill: "var(--muted)", opacity: 0.4 }} formatter={(value: number) => [value.toLocaleString(), "Tokens"]} />
                    <Bar dataKey="tokens" fill="var(--chart-4)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Estimated cost by agent</CardTitle>
              <CardDescription>Estimated cost by agent</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px] [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={costChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12, ...chartAxisTickStyle }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v.toFixed(4)}`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12, ...chartAxisTickStyle }} tickLine={false} axisLine={false} width={80} />
                    <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: "var(--foreground)" }} cursor={{ fill: "var(--muted)", opacity: 0.4 }} formatter={(value: number) => [`$${value.toFixed(4)}`, "Est. cost"]} />
                    <Bar dataKey="cost" fill="var(--chart-2)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <div>
                <CardTitle>Agents</CardTitle>
                <CardDescription>Status of your AI agents</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/agents">View all<ArrowRight className="ml-1 size-4" /></Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.agents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No agents yet. Create one to get started.</p>
              ) : (
                data.agents.map((agent) => (
                  <Link key={agent.id} href={agent.url} className="flex items-center gap-4 rounded-lg p-3 transition-colors hover:bg-muted/50">
                    <Avatar>
                      <AvatarFallback className="bg-primary/10 text-primary"><Bot className="size-4" /></AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{agent.name}</p>
                        <Badge variant={agent.session_count > 0 ? "default" : "secondary"}>
                          {agent.session_count > 0 ? <CheckCircle2 className="size-3" /> : <Clock className="size-3" />}
                          {agent.session_count > 0 ? "active" : "idle"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{agent.session_count} conversations • {formatRelativeTime(agent.last_active)}</p>
                    </div>
                    <span className="flex size-8 items-center justify-center text-muted-foreground"><ChevronRight className="size-4" /></span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
          <WorkspaceActivityCard />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
            <CardDescription>Start common workspace tasks.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {quickActions.map((action) => (
                <Link key={action.title} href={action.href} className="group flex items-start gap-3 rounded-lg border border-border p-4 transition-colors hover:border-primary/40 hover:bg-muted/50">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <action.icon className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">{action.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{action.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
