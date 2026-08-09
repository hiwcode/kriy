"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { ArrowLeft, ChevronRight } from "lucide-react";

const DOC_NAMES: Record<string, string> = {
  "": "Overview",
  "getting-started": "Getting Started",
  "using-workspaces": "Workspaces",
  "workspace-transfer": "Workspace Transfer",
  "using-agents": "Agents",
  "using-skills": "Skills",
  "using-orchestrator": "Orchestrator",
  "using-tools": "Tools & Prompts",
  "using-schedules": "Schedules",
  "using-memory": "Memory",
  "using-profile": "Configuration",
};

export function DocsNavbar({ className }: { className?: string }) {
  const pathname = usePathname();
  const slug = pathname?.replace("/docs", "").replace(/^\//, "") ?? "";
  const title = DOC_NAMES[slug] ?? "Docs";

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        className
      )}
    >
      <div className="flex items-center gap-4">
        <SidebarTrigger className="size-8 text-muted-foreground hover:text-foreground" />

        <div className="hidden h-5 w-px bg-border md:block" />

        <nav className="flex items-center gap-2">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            <span className="hidden sm:inline">Back to app</span>
          </Link>
          <ChevronRight className="size-3.5 text-muted-foreground/50" />
          <span className="rounded-md bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary">
            Docs
          </span>
          {slug && (
            <>
              <ChevronRight className="size-3.5 text-muted-foreground/50" />
              <span className="text-sm font-medium tracking-tight text-foreground">
                {title}
              </span>
            </>
          )}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <ThemeToggle isHeader={true}/>
      </div>
    </header>
  );
}
