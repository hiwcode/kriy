"use client";

import {
    type BannerCondition,
    type BannerDef,
    type BannerType
} from "@/config/banners";
import { getUserConfig } from "@/lib/api/user-config";
import {
    AlertTriangle,
    CheckCircle2,
    Info,
    Megaphone,
    XCircle,
    type LucideIcon
} from "lucide-react";

const DISMISS_STORAGE_KEY = "atelier:dismissed-banners";

/* ------------------------------------------------------------------ */
/*  Per-type styling                                                   */
/* ------------------------------------------------------------------ */

export interface TypeStyle {
  icon: LucideIcon;
  /** Tinted row background + bottom border. */
  container: string;
  /** Icon chip background + icon color. */
  chip: string;
  /** CTA / accent text color. */
  accent: string;
}

export const TYPE_STYLES: Record<BannerType, TypeStyle> = {
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

export interface ProviderStatus {
  hasAnyProvider: boolean;
  hasGoogle: boolean;
  hasOpik: boolean
}

/** Module-level cache so navigating between pages doesn't refetch config. */
let providerStatusPromise: Promise<ProviderStatus> | null = null;

export function loadProviderStatus(): Promise<ProviderStatus> {
  if (!providerStatusPromise) {
    providerStatusPromise = getUserConfig()
      .then((cfg) => {
        const has = (v: boolean | null | undefined) => Boolean(v);
        const hasGoogle = has(cfg.google_api_key_set);
        return {
          hasGoogle,
          hasAnyProvider:
            hasGoogle || has(cfg.openai_api_key_set) || has(cfg.anthropic_api_key_set),
          hasOpik: cfg.opik_enabled ? has(cfg.opik_api_key_set) : false
        };
      })
      .catch(() => {
        // On failure assume providers exist so we don't nag with a wrong banner.
        providerStatusPromise = null; // allow a later retry
        return { hasAnyProvider: true, hasGoogle: false, hasOpik: false };
      });
  }
  return providerStatusPromise;
}

/* ------------------------------------------------------------------ */
/*  Pure helpers                                                       */
/* ------------------------------------------------------------------ */

export function isExpired(banner: BannerDef, now: Date): boolean {
  if (!banner.expiresAt) return false;
  const expiry = new Date(banner.expiresAt);
  if (Number.isNaN(expiry.getTime())) return false; // bad date → treat as no expiry
  return now >= expiry;
}

export function evaluateCondition(
  condition: BannerCondition | undefined,
  status: ProviderStatus
): boolean {
  switch (condition) {
    case undefined:
      return true;
    case "no-ai-provider":
      return !status.hasGoogle;
    default:
      return false;
  }
}

export function readDismissed(): Set<string> {
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

export function persistDismissed(ids: Set<string>): void {
  try {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    /* storage unavailable — dismissal just won't persist */
  }
}
