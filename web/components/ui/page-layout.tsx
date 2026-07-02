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
    <div className={cn("flex flex-col", className)}>
      {/* Header */}
      <div className="flex items-start justify-between border-b border-border px-6 py-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>

        {/* Actions (optional) */}
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {/* Content */}
      <div className="flex-1 p-6">{children}</div>
    </div>
  );
}
