"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Bot,
  CircleAlert,
  DollarSign,
  Plug,
  RefreshCcw,
  Workflow,
  Zap,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { useAuth } from "@/components/auth/auth-provider";
import { WorkspaceActivityCard } from "@/components/dashboard/workspace-activity-card";
import { AppLayout } from "@/components/layout/app-layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { PageLayout } from "@/components/ui/page-layout";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DashboardData } from "@/lib/api/dashboard";
import { getDashboard } from "@/lib/api/dashboard";

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString();
}

function formatCost(value: number): string {
  if (value === 0) return "$0.00";
  if (value < 0.0001) return "<$0.0001";
  if (value < 1) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

const usageChartConfig = {
  tokens: {
    label: "Tokens",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const quickActions = [
  { label: "Create an agent", icon: Bot, href: "/agents" },
  { label: "Build a workflow", icon: Workflow, href: "/workflows" },
  { label: "Connect tools", icon: Plug, href: "/mcp-connections" },
  { label: "Inspect traces", icon: Activity, href: "/traces" },
];

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="gap-3 py-4 sm:gap-4 sm:py-5">
            <CardHeader className="px-4 sm:px-6">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent className="flex flex-col gap-2 px-4 sm:px-6">
              <Skeleton className="h-8 w-28" />
              <Skeleton className="hidden h-3 w-24 sm:block sm:w-36" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="flex flex-col gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full" />
        </CardContent>
      </Card>
      <div className="grid gap-6 xl:grid-cols-5">
        <Skeleton className="h-[360px] xl:col-span-3 border shadow-md" />
        <Skeleton className="h-[360px] xl:col-span-2 border shadow-md" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const auth = useAuth();
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadDashboard = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getDashboard());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dashboard data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (auth?.isLoading) return;
    if (!auth?.isSignedIn) {
      setLoading(false);
      return;
    }
    void loadDashboard();
  }, [auth?.isLoading, auth?.isSignedIn, loadDashboard]);

  const pageAction = (
    <Button asChild>
      <Link href="/agents">
        <Bot data-icon="inline-start" />
        Manage agents
      </Link>
    </Button>
  );

  if (loading) {
    return (
      <AppLayout>
        <PageLayout
          title="Overview"
          subtitle="Monitor agent activity, usage, and workspace operations."
        >
          <DashboardSkeleton />
        </PageLayout>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <PageLayout
          title="Overview"
          subtitle="Monitor agent activity, usage, and workspace operations."
        >
          <div className="flex max-w-2xl flex-col gap-4">
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>Dashboard unavailable</AlertTitle>
              <AlertDescription>
                {error} Check the API connection, then try again.
              </AlertDescription>
            </Alert>
            <div>
              <Button variant="outline" onClick={() => void loadDashboard()}>
                <RefreshCcw data-icon="inline-start" />
                Try again
              </Button>
            </div>
          </div>
        </PageLayout>
      </AppLayout>
    );
  }

  if (!data) return null;

  const usageData = data.usage_data;
  const hasUsage = usageData.some((day) => day.tokens > 0 || day.conversations > 0);
  const sevenDayTokens = usageData.reduce((total, day) => total + day.tokens, 0);
  const sevenDayConversations = usageData.reduce(
    (total, day) => total + day.conversations,
    0
  );
  const agentUsage = [...(data.tokens_per_agent ?? [])]
    .sort((left, right) => right.tokens - left.tokens)
    .slice(0, 5);

  const stats = [
    {
      title: "Total agents",
      value: data.stats.active_agents.toLocaleString(),
      description: "Configured in this workspace",
      icon: Bot,
    },
    {
      title: "Conversations",
      value: data.stats.conversations.toLocaleString(),
      description: "All recorded sessions",
      icon: Activity,
    },
    {
      title: "Recorded tokens",
      value: formatTokens(data.stats.tokens_used),
      description: "Latest 500 sessions",
      icon: Zap,
    },
    {
      title: "Estimated cost",
      value: formatCost(data.stats.estimated_cost ?? 0),
      description: "Up to 200 sessions per agent",
      icon: DollarSign,
    },
  ];

  return (
    <AppLayout>
      <PageLayout
        title="Overview"
        subtitle="Monitor agent activity, usage, and workspace operations."
        actions={pageAction}
      >
        <div className="flex animate-fade-in-up flex-col gap-4 sm:gap-6">
          {data.stats.active_agents === 0 && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent>
                <Empty className="py-8">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Bot />
                    </EmptyMedia>
                    <EmptyTitle>Bring your first agent online</EmptyTitle>
                    <EmptyDescription>
                      Create an agent, connect its tools, and run a conversation to populate this overview.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button asChild>
                      <Link href="/agents">
                        <Bot data-icon="inline-start" />
                        Create an agent
                      </Link>
                    </Button>
                  </EmptyContent>
                </Empty>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {stats.map((stat) => (
              <Card key={stat.title} className="min-w-0 gap-3 py-4 sm:gap-4 sm:py-5">
                <CardHeader className="px-4 sm:px-6">
                  <CardTitle className="truncate text-xs font-medium text-muted-foreground sm:text-sm">
                    {stat.title}
                  </CardTitle>
                  <CardAction className="hidden size-9 items-center justify-center rounded-lg bg-primary/10 text-primary sm:flex">
                    <stat.icon className="size-4" aria-hidden="true" />
                  </CardAction>
                </CardHeader>
                <CardContent className="flex min-w-0 flex-col gap-1 px-4 sm:px-6">
                  <p className="truncate text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
                    {stat.value}
                  </p>
                  <p className="hidden text-xs text-muted-foreground sm:block">{stat.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="gap-4 py-4 sm:gap-6 sm:py-6">
            <CardHeader className="px-4 sm:px-6">
              <CardTitle>Workspace usage</CardTitle>
              <CardDescription>
                {hasUsage
                  ? `${formatTokens(sevenDayTokens)} tokens across ${sevenDayConversations.toLocaleString()} conversations.`
                  : "Token activity from the last seven days will appear here."}
              </CardDescription>
              <CardAction className="hidden sm:block">
                <Badge variant="secondary">Last 7 days</Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="px-2 sm:px-6">
              {hasUsage ? (
                <ChartContainer config={usageChartConfig} className="h-[220px] w-full sm:h-[280px]">
                  <AreaChart data={usageData} accessibilityLayer margin={{ left: -6, right: 8 }}>
                    <defs>
                      <linearGradient id="dashboard-token-gradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-tokens)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--color-tokens)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      interval="preserveStartEnd"
                      fontSize={10}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      width={38}
                      fontSize={10}
                      tickFormatter={(value) => formatTokens(Number(value))}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent indicator="line" />}
                    />
                    <Area
                      type="monotone"
                      dataKey="tokens"
                      stroke="var(--color-tokens)"
                      strokeWidth={2}
                      fill="url(#dashboard-token-gradient)"
                    />
                  </AreaChart>
                </ChartContainer>
              ) : (
                <Empty className="min-h-[280px]">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Activity />
                    </EmptyMedia>
                    <EmptyTitle>No usage recorded</EmptyTitle>
                    <EmptyDescription>
                      Run an agent conversation to start tracking token usage and cost.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button variant="outline" asChild>
                      <Link href="/agents">
                        Choose an agent
                        <ArrowRight data-icon="inline-end" />
                      </Link>
                    </Button>
                  </EmptyContent>
                </Empty>
              )}
            </CardContent>
          </Card>

          <div className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-5">
            <Card className="min-w-0 gap-4 py-4 sm:gap-6 sm:py-6 xl:col-span-3">
              <CardHeader className="px-4 sm:px-6">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <CardTitle>Agent usage</CardTitle>
                  <Button variant="ghost" size="sm" className="shrink-0" asChild>
                    <Link href="/agents">View all<ArrowRight data-icon="inline-end" /></Link>
                  </Button>
                </div>
                <CardDescription>Highest recorded usage, based on up to 200 recent sessions per agent.</CardDescription>
              </CardHeader>
              <CardContent className="min-w-0 overflow-hidden px-4 sm:px-6">
                {agentUsage.length === 0 ? (
                  <Empty className="min-h-[250px]">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Bot />
                      </EmptyMedia>
                      <EmptyTitle>No agent usage yet</EmptyTitle>
                      <EmptyDescription>
                        Agents appear here after they process their first conversation.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <div className="min-w-0">
                    <Table className="min-w-[560px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Agent</TableHead>
                          <TableHead className="text-right">Tokens</TableHead>
                          <TableHead className="text-right">Input</TableHead>
                          <TableHead className="text-right">Output</TableHead>
                          <TableHead className="text-right">Est. cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {agentUsage.map((agent) => (
                          <TableRow key={agent.id}>
                            <TableCell>
                              <Link
                                href={`/agents/${agent.id}`}
                                className="flex min-w-0 items-center gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                  <Bot className="size-4" aria-hidden="true" />
                                </span>
                                <span className="min-w-0">
                                  <span className="block max-w-40 truncate font-medium">{agent.name}</span>
                                  {agent.model && (
                                    <span className="block max-w-40 truncate text-xs text-muted-foreground">{agent.model}</span>
                                  )}
                                </span>
                              </Link>
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">{formatTokens(agent.tokens)}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">{formatTokens(agent.input_tokens)}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">{formatTokens(agent.output_tokens)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCost(agent.estimated_cost)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="xl:col-span-2">
              <WorkspaceActivityCard divider />
            </div>
          </div>

          <Card className="gap-4 py-4 sm:gap-6 sm:py-6">
            <CardHeader className="px-4 sm:px-6">
              <CardTitle>Keep building</CardTitle>
              <CardDescription>
                {data.stats.total_prompts.toLocaleString()} prompt {data.stats.total_prompts === 1 ? "template" : "templates"} in this workspace.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-2 px-4 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap sm:px-6">
              {quickActions.map((action) => (
                <Button key={action.label} variant="outline" asChild>
                  <Link href={action.href}>
                    <action.icon data-icon="inline-start" />
                    {action.label}
                  </Link>
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    </AppLayout>
  );
}
