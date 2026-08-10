"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TabItem {
  id: number | string;
  name: string;
  icon?: React.ReactNode;
  component: React.ReactNode;
}

export interface TabConfig {
  id: string;
  tabName: string;
  /** Optional description shown below the title */
  description?: string;
  /** Optional actions rendered at the top-right of the header */
  headerActions?: React.ReactNode;
  items: TabItem[];
}

interface TabLayoutProps {
  config: TabConfig;
  defaultTab?: string | number;
  className?: string;
  /** Controlled mode: when set, parent controls active tab */
  activeTabId?: string | number;
  onTabChange?: (tabId: string | number) => void;
}

export function TabLayout({ config, defaultTab, className, activeTabId: controlledTabId, onTabChange }: TabLayoutProps) {
  const [internalTabId, setInternalTabId] = React.useState<string | number>(
    defaultTab ?? config.items[0]?.id
  );

  const isControlled = controlledTabId !== undefined;
  const activeTabId = isControlled ? controlledTabId : internalTabId;

  const setActiveTabId = React.useCallback(
    (id: string | number) => {
      if (!isControlled) setInternalTabId(id);
      onTabChange?.(id);
    },
    [isControlled, onTabChange]
  );

  const activeTab = config.items.find((item) => item.id === activeTabId);

  return (
    <div className={cn("mx-auto flex min-h-full w-full max-w-[1600px] flex-col", className)}>
      {/* Header with title and tabs */}
      <div className="border-b border-border">
        {/* Title */}
        <div className="flex flex-col items-start justify-between gap-4 px-4 pb-4 pt-6 sm:flex-row sm:px-6 lg:px-8">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-[-0.025em] text-foreground">
              {config.tabName}
            </h1>
            {config.description && (
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {config.description}
              </p>
            )}
          </div>
          {config.headerActions && (
            <div className="flex shrink-0 items-center gap-2">{config.headerActions}</div>
          )}
        </div>

        {/* Tab Navigation */}
        <nav className="-mb-px flex gap-1 overflow-x-auto overflow-y-hidden px-3 sm:px-5 lg:px-7" role="tablist">
          {config.items.map((item) => {
            const isActive = item.id === activeTabId;

            return (
              <button
                key={item.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTabId(item.id)}
                className={cn(
                  "group relative flex shrink-0 flex-row items-center gap-2 whitespace-nowrap rounded-t-lg px-3.5 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <span className={cn("transition-colors", isActive ? "text-primary" : "text-muted-foreground/70 group-hover:text-foreground")}>
                  {item.icon}
                </span>
                {item.name}
                {/* Active indicator */}
                <span
                  className={cn(
                    "absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary transition-all duration-200",
                    isActive ? "opacity-100" : "opacity-0"
                  )}
                />
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 sm:p-6 lg:p-8">{activeTab?.component}</div>
    </div>
  );
}
