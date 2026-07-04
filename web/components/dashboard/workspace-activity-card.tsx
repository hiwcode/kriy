"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, ArrowRight, Activity as ActivityIcon, type LucideIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { listWorkspaceActivity, type ActivityItem } from "@/lib/api/activity";
import { useAuth } from "@/components/auth/auth-provider";

const ACTION_STYLE: Record<string, { icon: LucideIcon; className: string; verb: string }> = {
  create: { icon: Plus, className: "bg-emerald-500/10 text-emerald-500", verb: "created" },
  update: { icon: Pencil, className: "bg-blue-500/10 text-blue-500", verb: "updated" },
  delete: { icon: Trash2, className: "bg-red-500/10 text-red-500", verb: "deleted" },
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
  devider=false,
}: {
  limit?: number;
  showViewAll?: boolean;
  /** Enable Prev/Next paging (used on the full /activity page). */
  paginate?: boolean;
  /** Rows per page when paginating. */
  pageSize?: number;
  devider?: boolean;
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
    <Card>
      <CardHeader className={showViewAll ? "flex items-center justify-between" : undefined}>
        <div>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest changes in your workspace</CardDescription>
        </div>
        {showViewAll && (
          <Button variant="ghost" size="sm" asChild>
            <Link href="/activity">
              View all
              <ArrowRight className="ml-1 size-4" />
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {items === null ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
                  <div className="h-3 flex-1 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <ActivityIcon className="size-5 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            </div>
          ) : (
            items.map((item, index) => {
              const style = ACTION_STYLE[item.action];
              const Icon = style?.icon ?? ActivityIcon;
              return (
                <div key={item.id} className={`flex items-start gap-3 ${devider && index!=items.length-1 && "border-b pb-4"}`}>
                  <div
                    className={cn(
                      "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                      style?.className ?? "bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm leading-tight">
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

        {paginate && total > 0 && (
          <div className="mt-4 flex items-center justify-between border-t pt-4">
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
