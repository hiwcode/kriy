"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { AppNavbar } from "./app-navbar";
import { BannerBar } from "./banner-bar";

interface AppLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function AppLayout({ children, className }: AppLayoutProps) {
  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <SidebarInset className="flex max-h-svh flex-col overflow-hidden">
        <AppNavbar />
        {/* Banners live at the top of the content area, flush under the navbar. */}
        <BannerBar />
        <main
          className={cn(
            "relative flex-1 overflow-y-auto",
            className
          )}
        >
          <div className="relative z-10 h-full">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
