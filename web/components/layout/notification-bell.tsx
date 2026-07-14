"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  Info,
  CircleCheck,
  TriangleAlert,
  CircleX,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  connectNotifications,
  type AppNotification,
  type NotificationLevel,
} from "@/lib/api/notifications";

const LEVEL_ICON: Record<NotificationLevel, React.ComponentType<{ className?: string }>> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleX,
};
const LEVEL_COLOR: Record<NotificationLevel, string> = {
  info: "text-blue-500",
  success: "text-emerald-500",
  warning: "text-amber-500",
  error: "text-destructive",
};

function timeAgo(ts: string | null): string {
  if (!ts) return "";
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function NotificationBell() {
  const [items, setItems] = React.useState<AppNotification[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    listNotifications(5).then((p) => mounted && setItems(p.items)).catch(() => {});
    getUnreadCount().then((r) => mounted && setUnread(r.unread)).catch(() => {});

    const disconnect = connectNotifications({
      onNotification: (n, u) => {
        setItems((prev) => [n, ...prev.filter((x) => x.id !== n.id)].slice(0, 5));
        setUnread(u);
      },
      onUnread: (u) => setUnread(u),
    });

    return () => {
      mounted = false;
      disconnect();
    };
  }, []);

  const onRead = async (n: AppNotification) => {
    if (n.read) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
    try {
      await markNotificationRead(n.id);
    } catch {
      /* best effort */
    }
  };

  const onReadAll = async () => {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnread(0);
    try {
      await markAllNotificationsRead();
    } catch {
      /* best effort */
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <Button variant="ghost" size="xs" onClick={onReadAll} className="text-xs">
              <CheckCheck className="size-3.5" /> Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96 overflow-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
              <Bell className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const Icon = LEVEL_ICON[n.level] ?? Info;
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => onRead(n)}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                        !n.read && "bg-primary/[0.04]"
                      )}
                    >
                      <Icon className={cn("mt-0.5 size-4 shrink-0", LEVEL_COLOR[n.level] ?? "")} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{n.title}</p>
                          {!n.read && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                        </div>
                        {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                          {n.source && <span>{n.source}</span>}
                          {n.source && <span>·</span>}
                          <span>{timeAgo(n.created_at)}</span>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
        <div className="border-t p-1.5">
          <Button variant="ghost" size="sm" className="w-full" asChild onClick={() => setOpen(false)}>
            <Link href="/alerts">View all notifications</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
