"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface PageLayoutProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function PageLayout({
  title,
  subtitle,
  actions,
  children,
  className,
}: PageLayoutProps) {
  return (
    <div className={cn("mx-auto flex min-h-full w-full max-w-[1600px] flex-col", className)}>
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 border-b border-border/70 px-4 py-6 sm:flex-row sm:px-6 lg:px-8">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-0.025em] text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
          )}
        </div>

        {/* Actions (optional) */}
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {/* Content */}
      <div className="flex-1 p-4 sm:p-6 lg:p-8">{children}</div>
    </div>
  );
}
