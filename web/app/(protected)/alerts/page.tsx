"use client";

import * as React from "react";
import {
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Info,
  CircleCheck,
  TriangleAlert,
  CircleX,
} from "lucide-react";
import { toast } from "sonner";

import { AppLayout } from "@/components/layout/app-layout";
import { PageLayout } from "@/components/ui/page-layout";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  connectNotifications,
  type AppNotification,
  type NotificationLevel,
} from "@/lib/api/notifications";

const PAGE_SIZE = 20;

const LEVEL_ICON: Record<NotificationLevel, React.ComponentType<{ className?: string }>> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleX,
};
const LEVEL_COLOR: Record<NotificationLevel, string> = {
  info: "text-muted-foreground",
  success: "text-primary",
  warning: "text-primary",
  error: "text-destructive",
};

function formatTime(ts: string | null): string {
  if (!ts) return "";
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NotificationsPage() {
  const [items, setItems] = React.useState<AppNotification[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback((p: number) => {
    setLoading(true);
    setError(null);
    listNotifications(PAGE_SIZE, p * PAGE_SIZE)
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Notifications could not be loaded.");
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load(page);
  }, [page, load]);

  // Live: refresh the first page when a new notification arrives.
  React.useEffect(() => {
    const disconnect = connectNotifications({
      onNotification: () => {
        setPage((p) => {
          if (p === 0) load(0);
          return p;
        });
      },
    });
    return disconnect;
  }, [load]);

  const onRead = async (n: AppNotification) => {
    if (n.read) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    try {
      await markNotificationRead(n.id);
    } catch {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: false } : x)));
      toast.error("Notification could not be marked as read.");
    }
  };

  const onReadAll = async () => {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    try {
      await markAllNotificationsRead();
    } catch {
      load(page);
      toast.error("Notifications could not be updated.");
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const end = Math.min(total, (page + 1) * PAGE_SIZE);

  return (
    <AppLayout>
      <PageLayout
        title="Notifications"
        subtitle="Review notifications from agents, workflows, and workspace activity."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={onReadAll}
            disabled={loading || !items.some((item) => !item.read)}
          >
            <CheckCheck data-icon="inline-start" /> Mark all read
          </Button>
        }
      >
        <div className="mx-auto max-w-3xl">
          {loading ? (
            <div className="flex flex-col gap-2.5">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <CircleX />
              <AlertTitle>Notifications unavailable</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-3">
                <span>{error}</span>
                <Button size="sm" variant="outline" onClick={() => load(page)}>Try again</Button>
              </AlertDescription>
            </Alert>
          ) : items.length === 0 ? (
            <Empty className="border bg-card">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Bell /></EmptyMedia>
                <EmptyTitle>No notifications</EmptyTitle>
                <EmptyDescription>
                  When an agent or workflow notifies you, it shows up here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="divide-y overflow-hidden rounded-xl border bg-card">
              {items.map((n) => {
                const Icon = LEVEL_ICON[n.level] ?? Info;
                return (
                  <button
                    key={n.id}
                    onClick={() => onRead(n)}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50",
                      !n.read && "bg-primary/[0.04]"
                    )}
                  >
                    <Icon className={cn("mt-0.5 size-4 shrink-0", LEVEL_COLOR[n.level] ?? "")} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{n.title}</p>
                        {!n.read && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                      </div>
                      {n.body && <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>}
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        {n.source && <span>{n.source}</span>}
                        {n.source && <span>·</span>}
                        <span>{formatTime(n.created_at)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {total > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {start}–{end} of {total}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                  <ChevronLeft className="size-4" /> Prev
                </Button>
                <span className="text-sm text-muted-foreground">
                  {page + 1} / {pageCount}
                </span>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}>
                  Next <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </PageLayout>
    </AppLayout>
  );
}
