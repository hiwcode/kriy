"use client";

import * as React from "react";
import Link from "next/link";
import {
  Info,
  Megaphone,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  X,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getUserConfig } from "@/lib/api/user-config";
import {
  BANNERS,
  type BannerDef,
  type BannerType,
  type BannerCondition,
} from "@/config/banners";

const DISMISS_STORAGE_KEY = "atelier:dismissed-banners";

/* ------------------------------------------------------------------ */
/*  Per-type styling                                                   */
/* ------------------------------------------------------------------ */

interface TypeStyle {
  icon: LucideIcon;
  /** Tinted row background + bottom border. */
  container: string;
  /** Icon chip background + icon color. */
  chip: string;
  /** CTA / accent text color. */
  accent: string;
}

const TYPE_STYLES: Record<BannerType, TypeStyle> = {
  info: {
    icon: Info,
    container: "bg-primary/[0.06] border-primary/15",
    chip: "bg-primary/10 text-primary",
    accent: "text-primary",
  },
  promo: {
    icon: Megaphone,
    container: "bg-violet-500/[0.07] border-violet-500/20 dark:bg-violet-400/[0.08]",
    chip: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
    accent: "text-violet-600 dark:text-violet-400",
  },
  warning: {
    icon: AlertTriangle,
    container: "bg-amber-500/[0.08] border-amber-500/25 dark:bg-amber-400/[0.08]",
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    accent: "text-amber-700 dark:text-amber-400",
  },
  success: {
    icon: CheckCircle2,
    container: "bg-emerald-500/[0.07] border-emerald-500/20 dark:bg-emerald-400/[0.08]",
    chip: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    accent: "text-emerald-700 dark:text-emerald-400",
  },
  error: {
    icon: XCircle,
    container: "bg-destructive/[0.07] border-destructive/25 dark:bg-destructive/[0.10]",
    chip: "bg-destructive/12 text-destructive",
    accent: "text-destructive",
  },
};

/* ------------------------------------------------------------------ */
/*  Provider status (cached across AppLayout remounts / navigations)   */
/* ------------------------------------------------------------------ */

interface ProviderStatus {
  hasAnyProvider: boolean;
  hasGoogle: boolean;
}

/** Module-level cache so navigating between pages doesn't refetch config. */
let providerStatusPromise: Promise<ProviderStatus> | null = null;

function loadProviderStatus(): Promise<ProviderStatus> {
  if (!providerStatusPromise) {
    providerStatusPromise = getUserConfig()
      .then((cfg) => {
        const has = (v: string | null | undefined) => Boolean(v && v.trim());
        const hasGoogle = has(cfg.google_api_key);
        return {
          hasGoogle,
          hasAnyProvider:
            hasGoogle || has(cfg.openai_api_key) || has(cfg.anthropic_api_key),
        };
      })
      .catch(() => {
        // On failure assume providers exist so we don't nag with a wrong banner.
        providerStatusPromise = null; // allow a later retry
        return { hasAnyProvider: true, hasGoogle: false };
      });
  }
  return providerStatusPromise;
}

/* ------------------------------------------------------------------ */
/*  Pure helpers                                                       */
/* ------------------------------------------------------------------ */

function isExpired(banner: BannerDef, now: Date): boolean {
  if (!banner.expiresAt) return false;
  const expiry = new Date(banner.expiresAt);
  if (Number.isNaN(expiry.getTime())) return false; // bad date → treat as no expiry
  return now >= expiry;
}

function evaluateCondition(
  condition: BannerCondition | undefined,
  status: ProviderStatus
): boolean {
  switch (condition) {
    case undefined:
      return true;
    case "no-ai-provider":
      return !status.hasAnyProvider;
    case "google-provider-set":
      return status.hasGoogle;
    default:
      return false;
  }
}

function readDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

function persistDismissed(ids: Set<string>): void {
  try {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    /* storage unavailable — dismissal just won't persist */
  }
}

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
      setStatus({ hasAnyProvider: true, hasGoogle: false });
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
