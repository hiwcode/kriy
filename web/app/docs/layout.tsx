"use client";

import * as React from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { DocsSidebar } from "@/components/layout/docs-sidebar";
import { DocsNavbar } from "@/components/layout/docs-navbar";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider defaultOpen={true}>
      <DocsSidebar />
      <SidebarInset>
        <DocsNavbar />
        <main className="relative flex-1">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
