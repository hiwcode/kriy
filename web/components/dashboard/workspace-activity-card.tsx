"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, ArrowRight, Activity as ActivityIcon, type LucideIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { listWorkspaceActivity, type ActivityItem } from "@/lib/api/activity";
import { useAuth } from "@/components/auth/auth-provider";

const ACTION_STYLE: Record<string, { icon: LucideIcon; className: string; verb: string }> = {
  create: { icon: Plus, className: "bg-primary/10 text-primary", verb: "created" },
  update: { icon: Pencil, className: "bg-muted text-muted-foreground", verb: "updated" },
  delete: { icon: Trash2, className: "bg-destructive/10 text-destructive", verb: "deleted" },
};

/** Singular, human-readable label for a resource_type (URL segment). */
const RESOURCE_LABEL: Record<string, string> = {
  agents: "agent",
  "mcp-connections": "MCP connection",
  "database-connections": "database connection",
  skills: "skill",
  "prompt-library": "prompt",
  schedules: "schedule",
  workflows: "workflow",
  workspaces: "workspace",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function describe(item: ActivityItem, currentEmail?: string): string {
  const style = ACTION_STYLE[item.action];
  const verb = style?.verb ?? item.action;
  const resource = RESOURCE_LABEL[item.resource_type] ?? item.resource_type;
  const target = item.resource_name
    ? `“${item.resource_name}”`
    : item.resource_id
      ? `#${item.resource_id}`
      : "";
  const actor =
    item.actor_email && item.actor_email === currentEmail
      ? "You"
      : item.actor_email ?? "Someone";
  return `${actor} ${verb} ${resource ? `${resource} ${target}` : resource}`.trim();
}

export function WorkspaceActivityCard({
  limit = 5,
  showViewAll = true,
  paginate = false,
  pageSize = 20,
  divider = false,
}: {
  limit?: number;
  showViewAll?: boolean;
  /** Enable Prev/Next paging (used on the full /activity page). */
  paginate?: boolean;
  /** Rows per page when paginating. */
  pageSize?: number;
  divider?: boolean;
}) {
  const auth = useAuth();
  const perPage = paginate ? pageSize : limit;
  const [items, setItems] = React.useState<ActivityItem[] | null>(null);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(0); // zero-based

  React.useEffect(() => {
    let cancelled = false;
    setItems(null);
    listWorkspaceActivity(perPage, page * perPage)
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [perPage, page]);

  const from = total === 0 ? 0 : page * perPage + 1;
  const to = Math.min(total, page * perPage + (items?.length ?? 0));
  const hasPrev = page > 0;
  const hasNext = (page + 1) * perPage < total;

  return (
    <Card className="h-full min-w-0 gap-4 py-4 sm:gap-6 sm:py-6">
      <CardHeader className="px-4 sm:px-6">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <CardTitle>Recent activity</CardTitle>
          {showViewAll && (
            <Button variant="ghost" size="sm" className="shrink-0" asChild>
              <Link href="/activity">
                View all
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          )}
        </div>
        <CardDescription>Latest changes in your workspace</CardDescription>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
          {items === null ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="size-8 shrink-0 rounded-full" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <Empty className="min-h-[220px] py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ActivityIcon />
                </EmptyMedia>
                <EmptyTitle>No workspace activity</EmptyTitle>
                <EmptyDescription>Changes made by you and your team will appear here.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            items.map((item, index) => {
              const style = ACTION_STYLE[item.action];
              const Icon = style?.icon ?? ActivityIcon;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex min-w-0 items-start gap-3",
                    divider && index !== items.length - 1 && "border-b pb-4"
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                      style?.className ?? "bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm leading-snug">
                      {describe(item, auth?.user?.email)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {timeAgo(item.created_at)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </CardContent>

      {paginate && total > 0 && (
        <CardFooter className="flex-col items-stretch gap-3 border-t px-4 pt-4 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between sm:px-6 sm:pt-6">
            <p className="text-xs text-muted-foreground">
              {from}–{to} of {total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!hasPrev || items === null}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasNext || items === null}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
        </CardFooter>
      )}
    </Card>
  );
}
