"use client";

import { useAuth } from "@/components/auth/auth-provider";
import { AppLayout } from "@/components/layout/app-layout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Bot,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock,
  Database,
  DollarSign,
  FileText,
  MessageSquare,
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
  { title: "New Conversation", description: "Start chatting with an agent", icon: MessageSquare, href: "/agents", color: "text-blue-500" },
  { title: "Create Prompt", description: "Add a new prompt template", icon: FileText, href: "/prompt-library", color: "text-purple-500" },
  { title: "Orchestrator", description: "Design multi-agent flows", icon: Brain, href: "/orchestrator", color: "text-green-500" },
  { title: "Facts Memory", description: "Manage what agents remember", icon: Database, href: "/facts-memory", color: "text-orange-500" },
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
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive">
            {error}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!data) return null;

  const stats = [
    { title: "Active Agents", value: String(data.stats.active_agents), icon: Bot, color: "text-blue-500", bgColor: "bg-blue-500/10" },
    { title: "Total Prompts", value: String(data.stats.total_prompts), icon: FileText, color: "text-purple-500", bgColor: "bg-purple-500/10" },
    { title: "Tokens Used", value: formatTokens(data.stats.tokens_used), icon: Zap, color: "text-orange-500", bgColor: "bg-orange-500/10" },
    { title: "Money Spent", value: `$${(data.stats.estimated_cost ?? 0).toFixed(4)}`, icon: DollarSign, color: "text-emerald-500", bgColor: "bg-emerald-500/10" },
  ];

  const usageData = data.usage_data.length > 0 ? data.usage_data : [{ name: "No data", tokens: 0, conversations: 0 }];
  const agentPerformance = data.agent_performance.length > 0 ? data.agent_performance : data.agents.length > 0 ? data.agents.map((a) => ({ name: a.name, tasks: 0 })) : [{ name: "No agents", tasks: 0 }];
  const tokensPerAgent = data.tokens_per_agent ?? [];
  const tokensChartData = tokensPerAgent.length > 0 ? tokensPerAgent.map((a) => ({ name: a.name, tokens: a.tokens })) : data.agents.length > 0 ? data.agents.map((a) => ({ name: a.name, tokens: 0 })) : [{ name: "No data", tokens: 0 }];
  const costChartData = tokensPerAgent.length > 0 ? tokensPerAgent.map((a) => ({ name: a.name, cost: a.estimated_cost })) : data.agents.length > 0 ? data.agents.map((a) => ({ name: a.name, cost: 0 })) : [{ name: "No data", cost: 0 }];

  return (
    <AppLayout>
      <div className="animate-fade-in-up space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back! Here&apos;s an overview of your AI workspace.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card
              key={stat.title}
              className="group relative overflow-hidden py-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <CardContent className="flex items-center gap-4">
                <div className={cn("flex size-12 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105", stat.bgColor)}>
                  <stat.icon className={cn("size-6", stat.color)} />
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
              <CardTitle>Token Usage</CardTitle>
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
              <CardTitle>Agent Performance</CardTitle>
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
              <CardTitle>Tokens per Agent</CardTitle>
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
              <CardTitle>Money Spent per Agent</CardTitle>
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
                        <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", agent.session_count > 0 ? "bg-green-500/10 text-green-500" : "bg-yellow-500/10 text-yellow-500")}>
                          {agent.session_count > 0 ? <CheckCircle2 className="size-3" /> : <Clock className="size-3" />}
                          {agent.session_count > 0 ? "active" : "idle"}
                        </span>
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
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks to get started</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {quickActions.map((action) => (
                <Link key={action.title} href={action.href} className="group flex flex-col items-center gap-3 rounded-lg border border-border p-4 text-center transition-all hover:border-primary/50 hover:bg-muted/50">
                  <div className={cn("flex size-12 items-center justify-center rounded-full bg-muted transition-colors group-hover:bg-primary/10", action.color)}>
                    <action.icon className="size-6" />
                  </div>
                  <div>
                    <p className="font-medium">{action.title}</p>
                    <p className="text-xs text-muted-foreground">{action.description}</p>
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
