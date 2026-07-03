"use client";

import * as React from "react";
import { Switch } from "@/components/ui/switch";
import { useContrast } from "@/components/accent-provider";
import { cn } from "@/lib/utils";

/** A labelled switch for the high-contrast accessibility mode. */
export function ContrastToggle({ className }: { className?: string }) {
  const { mode, setContrast, mounted } = useContrast();
  const checked = mounted && mode === "high";

  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <div className="min-w-0">
        <p className="text-sm font-medium">High contrast</p>
        <p className="text-xs text-muted-foreground">
          Stronger text and borders for better readability.
        </p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={(v) => setContrast(v ? "high" : "default")}
        aria-label="High contrast"
      />
    </div>
  );
}
