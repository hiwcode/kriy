"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { MdRenderer } from "@/components/ui/md-renderer";
import {
  ListChecks,
  ListOrdered,
  CheckCircle2,
  Circle,
  Loader2,
  Info,
  CheckCircle,
  AlertTriangle,
  XCircle,
} from "lucide-react";

/** A structured card streamed from a presentational agent tool (plan/todo/show_card). */
export type ChatCard =
  | { type: "plan"; title: string; steps: string[]; done?: string[]; current?: string }
  | {
      type: "todo";
      title: string;
      todos: string[];
      done?: string[];
      in_progress?: string;
    }
  | {
      type: "card";
      title: string;
      body?: string;
      footer?: string;
      variant?: "info" | "success" | "warning" | "error";
    };

/** Merge a streamed card into the list: a card with the same type+title is an
 *  update (e.g. a todo checklist reporting progress) so it REPLACES the existing
 *  one in place; anything new is appended. Without this, repeated progress
 *  updates stack up as separate snapshot cards instead of one live card. */
export function upsertCards(cards: ChatCard[] | undefined, card: ChatCard): ChatCard[] {
  const list = cards ?? [];
  const key = (c: ChatCard) => `${c.type}:${(c.title ?? "").trim()}`;
  const idx = list.findIndex((c) => key(c) === key(card));
  if (idx === -1) return [...list, card];
  const next = list.slice();
  next[idx] = card;
  return next;
}

export function ChatCards({ cards }: { cards: ChatCard[] }) {
  if (!cards?.length) return null;
  return (
    <div className="mt-2 space-y-2">
      {cards.map((card, i) => (
        <ChatCardView key={i} card={card} />
      ))}
    </div>
  );
}

function ChatCardView({ card }: { card: ChatCard }) {
  if (card.type === "plan") return <PlanCard card={card} />;
  if (card.type === "todo") return <TodoCard card={card} />;
  return <InfoCard card={card} />;
}

function CardShell({
  icon: Icon,
  title,
  children,
  className,
  accent = "text-primary",
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  className?: string;
  accent?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-background/70 shadow-sm", className)}>
      <div className="flex items-center gap-2 border-b px-3.5 py-2">
        <Icon className={cn("size-4 shrink-0", accent)} />
        <p className="text-sm font-semibold leading-none">{title}</p>
      </div>
      <div className="px-3.5 py-3">{children}</div>
    </div>
  );
}

function PlanCard({ card }: { card: Extract<ChatCard, { type: "plan" }> }) {
  const done = new Set((card.done ?? []).map((d) => d.trim()));
  const current = (card.current ?? "").trim();
  const total = card.steps.length;
  const completed = card.steps.filter((s) => done.has(s.trim())).length;
  const hasProgress = done.size > 0 || !!current;

  return (
    <CardShell icon={ListOrdered} title={card.title || "Plan"}>
      <ol className="space-y-2">
        {card.steps.map((step, i) => {
          const isDone = done.has(step.trim());
          const isActive = !isDone && step.trim() === current;
          return (
            <li key={i} className="flex gap-2.5 text-sm">
              {isDone ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : isActive ? (
                <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-primary" />
              ) : (
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                  {i + 1}
                </span>
              )}
              <span
                className={cn(
                  "leading-snug",
                  isDone && "text-muted-foreground line-through",
                  isActive && "font-medium"
                )}
              >
                {step}
              </span>
            </li>
          );
        })}
      </ol>
      {hasProgress && total > 0 && (
        <p className="mt-2.5 border-t pt-2 text-xs text-muted-foreground">
          {completed} of {total} done
        </p>
      )}
    </CardShell>
  );
}

function TodoCard({ card }: { card: Extract<ChatCard, { type: "todo" }> }) {
  const done = new Set((card.done ?? []).map((d) => d.trim()));
  const inProgress = (card.in_progress ?? "").trim();
  const total = card.todos.length;
  const completed = card.todos.filter((t) => done.has(t.trim())).length;

  return (
    <CardShell
      icon={ListChecks}
      title={card.title || "To-dos"}
      accent="text-emerald-600 dark:text-emerald-400"
    >
      <ul className="space-y-1.5">
        {card.todos.map((todo, i) => {
          const isDone = done.has(todo.trim());
          const isActive = !isDone && todo.trim() === inProgress;
          return (
            <li key={i} className="flex items-start gap-2 text-sm">
              {isDone ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : isActive ? (
                <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />
              )}
              <span
                className={cn(
                  "leading-snug",
                  isDone && "text-muted-foreground line-through",
                  isActive && "font-medium"
                )}
              >
                {todo}
              </span>
            </li>
          );
        })}
      </ul>
      {total > 0 && (
        <p className="mt-2.5 border-t pt-2 text-xs text-muted-foreground">
          {completed} of {total} done
        </p>
      )}
    </CardShell>
  );
}

const VARIANTS = {
  info: { icon: Info, cls: "border-primary/30", accent: "text-primary" },
  success: {
    icon: CheckCircle,
    cls: "border-emerald-500/30",
    accent: "text-emerald-600 dark:text-emerald-400",
  },
  warning: {
    icon: AlertTriangle,
    cls: "border-amber-500/40",
    accent: "text-amber-600 dark:text-amber-400",
  },
  error: {
    icon: XCircle,
    cls: "border-destructive/40",
    accent: "text-destructive",
  },
} as const;

function InfoCard({ card }: { card: Extract<ChatCard, { type: "card" }> }) {
  const v = VARIANTS[card.variant ?? "info"] ?? VARIANTS.info;
  return (
    <CardShell icon={v.icon} title={card.title || "Note"} className={v.cls} accent={v.accent}>
      {card.body && <MdRenderer content={card.body} variant="default" />}
      {card.footer && (
        <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">{card.footer}</p>
      )}
    </CardShell>
  );
}
