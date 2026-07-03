"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENT_PRESETS, accentSwatch } from "@/config/theme";
import { useAccent } from "@/components/accent-provider";

/**
 * A row of accent-color swatches. Selecting one re-themes the whole app live and
 * remembers the choice (localStorage). Used on the Config page and in the theme
 * menu.
 */
export function AccentPicker({ className }: { className?: string }) {
  const { accentId, setAccent, mounted } = useAccent();

  return (
    <div className={cn("flex flex-wrap gap-2.5", className)}>
      {ACCENT_PRESETS.map((preset) => {
        const isActive = mounted && accentId === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => setAccent(preset.id)}
            title={preset.label}
            aria-label={preset.label}
            aria-pressed={isActive}
            className={cn(
              "relative flex size-8 items-center justify-center rounded-full border border-black/10 ring-offset-2 ring-offset-background transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/15",
              isActive && "ring-2 ring-ring"
            )}
            style={{ backgroundColor: accentSwatch(preset) }}
          >
            {isActive && <Check className="size-4 text-white drop-shadow" />}
          </button>
        );
      })}
    </div>
  );
}
