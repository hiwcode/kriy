"use client";

import {
  BANNERS,
  type BannerDef
} from "@/config/banners";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  X
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { evaluateCondition, isExpired, loadProviderStatus, persistDismissed, ProviderStatus, readDismissed, TYPE_STYLES } from "@/lib/config-check";


/* ------------------------------------------------------------------ */
/*  Single banner row                                                  */
/* ------------------------------------------------------------------ */

function BannerRow({
  banner,
  onDismiss,
}: {
  banner: BannerDef;
  onDismiss: (id: string) => void;
}) {
  const style = TYPE_STYLES[banner.type];
  const Icon = style.icon;
  const dismissible = banner.dismissible ?? true;
  const isExternal = banner.link ? /^https?:\/\//.test(banner.link.href) : false;

  const cta = banner.link && (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-current/25 px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-current/10",
        style.accent
      )}
    >
      {banner.link.label}
      <ArrowRight className="size-3" />
    </span>
  );

  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-3 border-b px-4 py-2 sm:px-6",
        style.container
      )}
    >
      {/* Icon chip */}
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-lg",
          style.chip
        )}
      >
        <Icon className="size-4" />
      </span>

      {/* Message */}
      <div className="flex min-w-0 flex-1 flex-col gap-x-2 gap-y-0.5 sm:flex-row sm:flex-wrap sm:items-baseline">
        <span className="text-sm font-semibold text-foreground">{banner.title}</span>
        {banner.description && (
          <span className="text-[13px] leading-snug text-muted-foreground">
            {banner.description}
          </span>
        )}
      </div>

      {/* CTA */}
      {banner.link &&
        (isExternal ? (
          <a
            href={banner.link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden shrink-0 sm:inline-flex"
          >
            {cta}
          </a>
        ) : (
          <Link href={banner.link.href} className="hidden shrink-0 sm:inline-flex">
            {cta}
          </Link>
        ))}

      {/* Dismiss */}
      {dismissible && (
        <button
          type="button"
          onClick={() => onDismiss(banner.id)}
          aria-label="Dismiss"
          className="shrink-0 rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Banner bar                                                         */
/* ------------------------------------------------------------------ */

/**
 * Stack of currently-visible app banners, rendered at the top of the content
 * area — flush under the navbar, above `<main>` (see `app-layout.tsx`). Reads
 * banner definitions from `config/banners.ts`.
 */
export function BannerBar() {
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());
  const [status, setStatus] = React.useState<ProviderStatus | null>(null);

  React.useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const needsStatus = BANNERS.some((b) => b.condition !== undefined);
    if (!needsStatus) {
      setStatus({ hasAnyProvider: true, hasGoogle: false, hasOpik: false });
      return;
    }
    loadProviderStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDismiss = React.useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      persistDismissed(next);
      return next;
    });
  }, []);

  const now = new Date();
  const visible =
    status === null
      ? []
      : BANNERS.filter(
          (b) =>
            !dismissed.has(b.id) &&
            !isExpired(b, now) &&
            evaluateCondition(b.condition, status)
        ).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  if (visible.length === 0) return null;

  return (
    <div className="shrink-0">
      {visible.map((banner) => (
        <BannerRow key={banner.id} banner={banner} onDismiss={handleDismiss} />
      ))}
    </div>
  );
}
