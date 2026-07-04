/**
 * App-wide banner registry.
 *
 * This is the single place to add / edit / remove the messages shown in the bar
 * at the top of the app (promos, warnings, tips, notices…). Edit the `BANNERS`
 * array below and redeploy — no backend or migration needed.
 *
 * Each banner is filtered at render time by:
 *   - `expiresAt`  — hidden on/after this date (omit = never expires)
 *   - `condition`  — an optional dynamic gate (e.g. only when no AI provider set)
 *   - dismissal    — if `dismissible`, a per-browser "X" hides it (localStorage)
 *
 * See {@link BannerCondition} to add new dynamic gates, and
 * `components/layout/banner-bar.tsx` for where they are evaluated.
 */

export type BannerType = "info" | "promo" | "warning" | "success" | "error";

/**
 * Dynamic visibility gates. `undefined` means the banner is always eligible.
 * Add a new key here and handle it in `evaluateCondition` (banner-bar.tsx).
 */
export type BannerCondition =
  /** Shown only when the user has NOT configured any AI provider key. */
  | "no-ai-provider"
  /** Shown only when the user HAS a Google Gemini key configured. */
  | "google-provider-set";

export interface BannerDef {
  /** Stable, unique id. Used as the localStorage dismissal key — don't reuse. */
  id: string;
  /** Visual style / severity. */
  type: BannerType;
  /** Short headline. */
  title: string;
  /** Optional longer description. */
  description?: string;
  /** ISO date (e.g. "2026-12-31"). Banner is hidden on/after this date. */
  expiresAt?: string;
  /** Optional call-to-action link. Internal (starts with "/") or external. */
  link?: { label: string; href: string };
  /** Whether the user can dismiss it. Defaults to true. */
  dismissible?: boolean;
  /** Optional dynamic gate. Omit to always show (until expiry / dismissal). */
  condition?: BannerCondition;
  /** Higher shows first when several are visible. Defaults to 0. */
  priority?: number;
}

export const BANNERS: BannerDef[] = [
  {
    id: "add-ai-provider",
    type: "info",
    title: "Add an AI provider to get started",
    description:
      "We suggest Google Gemini — it has a free tier, so you can try Atelier without a credit card.",
    link: { label: "Add provider", href: "/config" },
    condition: "no-ai-provider",
    dismissible: false,
    priority: 0,
  }
];
