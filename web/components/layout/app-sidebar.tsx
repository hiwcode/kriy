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

export function AppSidebar() {
  const { state } = useSidebar();
  const pathname = usePathname();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/60 bg-sidebar">
      {/* Header */}
      <SidebarHeader className="p-3">
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center gap-3 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-sidebar-accent/60",
            isCollapsed && "justify-center px-0"
          )}
        >
          {/* Logo mark */}
          {!isCollapsed && <div className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary shadow-sm shadow-primary/25">
            <Logo width={28} height={28} />
            <span className="absolute -inset-px rounded-xl ring-1 ring-inset ring-white/10" />
          </div>}

          {/* Brand Name */}
          <div
            className={cn(
              "flex min-w-0 flex-col transition-all duration-200",
              isCollapsed && "w-0 overflow-hidden opacity-0"
            )}
          >
            <span className="truncate text-[15px] font-semibold leading-tight tracking-tight text-sidebar-foreground">
              {siteConfig.name}
            </span>
            <span className="truncate text-[10px] font-medium uppercase tracking-[0.18em] text-sidebar-foreground/45">
              {siteConfig.description}
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2.5 py-1">
        {navigationConfig.map((group) => (
          <SidebarGroup key={group.id} className="py-1">
            {/* Hide label for "main" group */}
            {group.name !== "main" && (
              <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/40">
                {group.name}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.url;

                  return (
                    <SidebarMenuItem key={`${group.id}-${item.id}`}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.name}
                        className={cn(
                          "group/nav relative h-9 rounded-lg font-medium transition-colors duration-150",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                        )}
                      >
                        <Link href={item.url}>
                          <Icon
                            className={cn(
                              "size-4 shrink-0 transition-colors",
                              isActive
                                ? "text-primary"
                                : "text-sidebar-foreground/55 group-hover/nav:text-sidebar-foreground"
                            )}
                          />
                          <span className="flex-1 truncate">{item.name}</span>
                          {item.isBeta && (
                            <Badge
                              variant="secondary"
                              className="h-4 rounded-full border-0 bg-primary/10 px-1.5 text-[9px] font-semibold uppercase tracking-wider text-primary"
                            >
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

      <SidebarFooter className="p-3">
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-medium text-sidebar-foreground/40",
            isCollapsed && "justify-center px-0"
          )}
        >
          <span className="size-1.5 shrink-0 rounded-full bg-success" />
          <span className={cn("tracking-wide", isCollapsed && "sr-only")}>
            All systems operational · v{siteConfig.version}
          </span>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
