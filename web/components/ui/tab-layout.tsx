"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  /** Optional parent destination shown above the page title. */
  backHref?: string;
  backLabel?: string;
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
  const activeValue = String(activeTab?.id ?? config.items[0]?.id ?? "");

  const handleValueChange = (value: string) => {
    const item = config.items.find((candidate) => String(candidate.id) === value);
    if (item) setActiveTabId(item.id);
  };

  return (
    <Tabs
      value={activeValue}
      onValueChange={handleValueChange}
      className={cn("mx-auto min-h-full w-full max-w-[1600px] gap-0", className)}
    >
      {/* Header with title and tabs */}
      <div className="border-b border-border">
        {/* Title */}
        <div className="flex flex-col items-start justify-between gap-4 px-4 pb-4 pt-6 sm:flex-row sm:px-6 lg:px-8">
          <div className="min-w-0">
            {config.backHref && (
              <Breadcrumb className="mb-2">
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href={config.backHref}>{config.backLabel ?? "Back"}</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{config.tabName}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            )}
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
        <div className="overflow-x-auto overflow-y-hidden px-3 sm:px-5 lg:px-7">
          <TabsList variant="line" className="h-auto">
            {config.items.map((item) => (
              <TabsTrigger
                key={item.id}
                value={String(item.id)}
                className="h-10 shrink-0 px-3.5"
              >
                {item.icon}
                {item.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </div>

      {/* Content */}
      {config.items.map((item) => (
        <TabsContent
          key={item.id}
          value={String(item.id)}
          className="p-4 sm:p-6 lg:p-8"
        >
          {item.component}
        </TabsContent>
      ))}
    </Tabs>
  );
}
