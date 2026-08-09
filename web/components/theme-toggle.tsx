"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun, Monitor, Contrast } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { AccentPicker } from "@/components/accent-picker";
import { useContrast } from "@/components/accent-provider";

export function ThemeToggle({ className, isHeader=false }: { className?: string, isHeader?: boolean }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { mode: contrast, setContrast } = useContrast();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn("size-9 text-muted-foreground", className)}
        aria-label="Toggle theme"
      >
        <Sun className="size-4" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "size-9 text-muted-foreground hover:text-foreground",
            className
          )}
          aria-label="Toggle theme"
        >
          {resolvedTheme === "dark" ? (
            <Moon className="size-4" />
          ) : (
            <Sun className="size-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")} className="flex items-center gap-2">
          <Sun className="size-4" />
          <span className="flex-1">Light</span>
          {theme === "light" && <span className="text-primary text-xs">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")} className="flex items-center gap-2">
          <Moon className="size-4" />
          <span className="flex-1">Dark</span>
          {theme === "dark" && <span className="text-primary text-xs">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")} className="flex items-center gap-2">
          <Monitor className="size-4" />
          <span className="flex-1">System</span>
          {theme === "system" && <span className="text-primary text-xs">✓</span>}
        </DropdownMenuItem>
        {!isHeader ? (
          <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Accent
          </DropdownMenuLabel>
          <div className="px-2 pb-1.5 pt-0.5">
            <AccentPicker />
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setContrast(contrast === "high" ? "default" : "high");
            }}
            className="flex items-center gap-2"
          >
            <Contrast className="size-4" />
            <span className="flex-1">High contrast</span>
            {contrast === "high" && <span className="text-primary text-xs">✓</span>}
          </DropdownMenuItem>
        </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
