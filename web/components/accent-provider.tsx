"use client";

import * as React from "react";
import {
  ACCENT_STORAGE_KEY,
  CONTRAST_STORAGE_KEY,
  DEFAULT_ACCENT_ID,
  getAccentById,
  type AccentPreset,
  type ContrastMode,
} from "@/config/theme";

/** Apply an accent preset to <html> — a hue for colored accents, or the mono attribute. */
export function applyAccent(preset: AccentPreset): void {
  const el = document.documentElement;
  if (preset.mono) {
    el.setAttribute("data-accent", "mono");
  } else {
    el.removeAttribute("data-accent");
    if (preset.hue != null) el.style.setProperty("--brand-hue", String(preset.hue));
  }
}

/** Apply the contrast mode to <html>. */
export function applyContrast(mode: ContrastMode): void {
  const el = document.documentElement;
  if (mode === "high") el.setAttribute("data-contrast", "high");
  else el.removeAttribute("data-contrast");
}

/**
 * Read/update the current accent color. Persists to localStorage and applies live.
 * The no-flash initial application happens via `themeInitScript` (root layout);
 * this hook keeps React state in sync.
 */
export function useAccent() {
  const [accentId, setAccentId] = React.useState<string>(DEFAULT_ACCENT_ID);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
      if (stored) setAccentId(getAccentById(stored).id);
    } catch {
      /* ignore */
    }
  }, []);

  const setAccent = React.useCallback((id: string) => {
    const preset = getAccentById(id);
    setAccentId(preset.id);
    applyAccent(preset);
    try {
      localStorage.setItem(ACCENT_STORAGE_KEY, preset.id);
    } catch {
      /* storage unavailable — choice just won't persist */
    }
  }, []);

  return { accentId, setAccent, mounted };
}

/** Read/update the contrast mode. Persists to localStorage and applies live. */
export function useContrast() {
  const [mode, setMode] = React.useState<ContrastMode>("default");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    try {
      if (localStorage.getItem(CONTRAST_STORAGE_KEY) === "high") setMode("high");
    } catch {
      /* ignore */
    }
  }, []);

  const setContrast = React.useCallback((next: ContrastMode) => {
    setMode(next);
    applyContrast(next);
    try {
      localStorage.setItem(CONTRAST_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  return { mode, setContrast, mounted };
}
