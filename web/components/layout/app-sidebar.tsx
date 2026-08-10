"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navigationConfig, siteConfig } from "@/config/site";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "../ui/badge";
import Logo from "@/components/logo";
import { BookOpen } from "lucide-react";

export function AppSidebar() {
  const { state } = useSidebar();
  const pathname = usePathname();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/60 bg-sidebar">
      {/* Header */}
      <SidebarHeader className="border-b border-sidebar-border/60 p-3">
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center gap-3 rounded-xl px-1.5 py-1.5 outline-none transition-colors hover:bg-sidebar-accent/60 focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            isCollapsed && "justify-center px-0"
          )}
        >
          {/* Logo mark */}
          <div className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary shadow-sm shadow-primary/20">
            <Logo width={32} height={32} />
            <span className="absolute -inset-px rounded-xl ring-1 ring-inset ring-primary-foreground/15" />
          </div>

          {/* Brand Name */}
          <div
            className={cn(
              "relative flex min-w-0 flex-col transition-all duration-200",
              isCollapsed && "w-0 overflow-hidden opacity-0"
            )}
          >
            <span className="flex items-center gap-2 truncate text-[15px] font-semibold leading-tight tracking-tight text-sidebar-foreground">
              {siteConfig.name}
              <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-medium">Beta</Badge>
            </span>
            <span className="truncate text-[9px] font-medium uppercase tracking-[0.16em] text-sidebar-foreground/45">
              {siteConfig.description}
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2.5 py-2">
        {navigationConfig.map((group) => (
          <SidebarGroup key={group.id} className="py-1.5">
            <SidebarGroupLabel className="px-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/40">
              {group.name}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname === item.url || pathname.startsWith(`${item.url}/`);

                  return (
                    <SidebarMenuItem key={`${group.id}-${item.id}`}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.name}
                        className={cn(
                          "group/nav relative h-9 rounded-lg font-medium transition-colors",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                        )}
                      >
                        <Link href={item.url}>
                          {isActive && (
                            <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" />
                          )}
                          <Icon aria-hidden />
                          <span className="flex-1 truncate">{item.name}</span>
                          {item.isBeta && (
                            <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-medium">
                              Beta
                            </Badge>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/60 p-2.5">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Documentation" className="h-9 rounded-lg text-sidebar-foreground/70">
              <Link href="/docs">
                <BookOpen aria-hidden />
                <span>Documentation</span>
                <span className="ml-auto text-[10px] text-sidebar-foreground/40">v{siteConfig.version}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
