/**
 * Accent-color + contrast theming.
 *
 * Colored accents are driven by a single OKLCH hue — the `--brand-hue` CSS
 * variable in `app/globals.css`. Changing that one number re-themes the whole
 * app (primary, ring, accent, sidebar, brand, charts) while keeping perceived
 * lightness/contrast constant.
 *
 * The "Mono" (black/neutral) accent can't be expressed as a hue, so it's applied
 * via `data-accent="mono"` on <html>, which swaps the accent family for neutral
 * greys (near-black in light mode, near-white in dark). High-contrast mode is
 * likewise a `data-contrast="high"` attribute that strengthens text/borders.
 *
 * Both choices are stored in localStorage (per-browser, like the light/dark
 * preference) and applied before paint via `themeInitScript`.
 */

export interface AccentPreset {
  /** Stable id, stored in localStorage. */
  id: string;
  /** Display label. */
  label: string;
  /** OKLCH hue (0–360) for colored accents. Omit for the mono accent. */
  hue?: number;
  /** Neutral (black/white) accent — applied via `data-accent="mono"`. */
  mono?: boolean;
}

/** Default accent — the original green. Its hue matches `--brand-hue` in globals.css. */
export const DEFAULT_ACCENT_ID = "emerald";

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "emerald", label: "Emerald", hue: 163 },
  { id: "teal", label: "Teal", hue: 195 },
  { id: "blue", label: "Blue", hue: 250 },
  { id: "indigo", label: "Indigo", hue: 275 },
  { id: "violet", label: "Violet", hue: 300 },
  { id: "fuchsia", label: "Fuchsia", hue: 330 },
  { id: "rose", label: "Rose", hue: 15 },
  { id: "orange", label: "Orange", hue: 55 },
  { id: "mono", label: "Mono", mono: true },
];

export type ContrastMode = "default" | "high";

export const ACCENT_STORAGE_KEY = "atelier-accent";
export const CONTRAST_STORAGE_KEY = "atelier-contrast";

export function getAccentById(id: string | null | undefined): AccentPreset {
  return (
    ACCENT_PRESETS.find((p) => p.id === id) ??
    ACCENT_PRESETS.find((p) => p.id === DEFAULT_ACCENT_ID) ??
    ACCENT_PRESETS[0]
  );
}

/** A swatch color previewing a preset in the UI (mirrors the light-mode recipe). */
export function accentSwatch(preset: AccentPreset): string {
  if (preset.mono) return "oklch(0.24 0 0)";
  return `oklch(0.62 0.16 ${preset.hue})`;
}

/**
 * Tiny synchronous script, injected at the top of <body>, that applies the saved
 * accent + contrast before the app paints — so there's no flash of the wrong
 * theme on load. Safe to import in a Server Component.
 */
export function themeInitScript(): string {
  const hueMap = JSON.stringify(
    Object.fromEntries(
      ACCENT_PRESETS.filter((p) => p.hue != null).map((p) => [p.id, p.hue])
    )
  );
  const monoIds = JSON.stringify(
    ACCENT_PRESETS.filter((p) => p.mono).map((p) => p.id)
  );
  return `(function(){try{
    var el=document.documentElement;
    var hueMap=${hueMap},monoIds=${monoIds};
    var a=localStorage.getItem(${JSON.stringify(ACCENT_STORAGE_KEY)});
    if(a){if(monoIds.indexOf(a)>=0){el.setAttribute('data-accent','mono');}else if(hueMap[a]!=null){el.style.setProperty('--brand-hue',String(hueMap[a]));}}
    if(localStorage.getItem(${JSON.stringify(CONTRAST_STORAGE_KEY)})==='high'){el.setAttribute('data-contrast','high');}
  }catch(e){}})();`;
}
