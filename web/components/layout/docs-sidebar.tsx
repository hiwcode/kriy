"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/config/site";
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
import {
  BookOpen,
  Bot,
  BrainCircuit,
  CalendarClock,
  Bell,
  Workflow,
  Building2,
  HelpCircle,
  MemoryStick,
  ArrowRightLeft,
  Settings,
  GraduationCap,
  ShieldCheck,
  Webhook,
  Wrench,
  Rocket,
  Sparkles,
  FileCode2,
} from "lucide-react";

import Logo from "@/components/logo";

type DocItem = { slug: string; name: string; href: string; icon: React.ComponentType<{ className?: string }> };
type DocSection = { label: string; items: DocItem[] };

const DOC_SECTIONS: DocSection[] = [
  {
    label: "Getting Started",
    items: [
      { slug: "", name: "Overview", href: "/docs", icon: BookOpen },
      { slug: "getting-started", name: "Setup Guide", href: "/docs/getting-started", icon: HelpCircle },
    ],
  },
  {
    label: "Integrate",
    items: [
      { slug: "integration-quickstart", name: "Quickstart", href: "/docs/integration-quickstart", icon: Rocket },
      { slug: "ai-integration-skill", name: "AI Integration", href: "/docs/ai-integration-skill", icon: Sparkles },
      { slug: "integration-api-reference", name: "API Reference", href: "/docs/integration-api-reference", icon: FileCode2 },
    ],
  },
  {
    label: "Core Features",
    items: [
      { slug: "using-agents", name: "Agents", href: "/docs/using-agents", icon: Bot },
      { slug: "using-skills", name: "Skills", href: "/docs/using-skills", icon: GraduationCap },
      { slug: "using-tools", name: "Tools & Prompts", href: "/docs/using-tools", icon: Wrench },
      { slug: "using-memory", name: "Memory", href: "/docs/using-memory", icon: MemoryStick },
    ],
  },
  {
    label: "Advanced",
    items: [
      { slug: "using-orchestrator", name: "Orchestration", href: "/docs/using-orchestrator", icon: BrainCircuit },
      { slug: "using-schedules", name: "Schedules", href: "/docs/using-schedules", icon: CalendarClock },
      { slug: "using-event-workflows", name: "Triggers", href: "/docs/using-event-workflows", icon: Workflow },
      { slug: "using-gates", name: "Gates", href: "/docs/using-gates", icon: ShieldCheck },
      { slug: "using-webhooks", name: "Webhooks", href: "/docs/using-webhooks", icon: Webhook },
      { slug: "using-notifications", name: "Notifications", href: "/docs/using-notifications", icon: Bell },
      { slug: "using-workspaces", name: "Workspaces", href: "/docs/using-workspaces", icon: Building2 },
      { slug: "workspace-transfer", name: "Workspace Transfer", href: "/docs/workspace-transfer", icon: ArrowRightLeft },
    ],
  },
  {
    label: "Settings",
    items: [
      { slug: "using-profile", name: "Configuration", href: "/docs/using-profile", icon: Settings },
    ],
  },
];

/** Flat, ordered list of all docs — used for prev/next navigation. */
export const DOC_NAV_ITEMS: DocItem[] = DOC_SECTIONS.flatMap((s) => s.items);

export function DocsSidebar() {
  const { state } = useSidebar();
  const pathname = usePathname();
  const slug = pathname?.replace("/docs", "").replace(/^\//, "") ?? "";
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4">
        <Link
          href="/docs"
          className="flex items-center gap-3 transition-opacity hover:opacity-80"
        >
          <div className="flex size-9 items-center justify-center overflow-hidden rounded-xl bg-primary ring-1 ring-inset ring-primary-foreground/15">
            <Logo width={32} height={32} />
          </div>
          <div
            className={cn(
              "flex flex-col transition-all duration-200",
              isCollapsed && "w-0 opacity-0"
            )}
          >
            <span className="text-lg font-bold tracking-tight text-sidebar-foreground">
              {siteConfig.name}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-widest text-sidebar-foreground/50">
              Documentation
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        {DOC_SECTIONS.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
              {section.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    (slug === "" && item.slug === "") ||
                    (slug !== "" && item.slug === slug);

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.name}
                        className={cn(
                          "group relative transition-all duration-200",
                          isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
                        )}
                      >
                        <Link href={item.href}>
                          {isActive && (
                            <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
                          )}
                          <Icon
                            className={cn(
                              "size-4 transition-colors",
                              isActive
                                ? "text-primary"
                                : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground"
                            )}
                          />
                          <span className="flex-1">{item.name}</span>
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

      <SidebarFooter className="p-4">
        <span
          className={cn(
            "text-[10px] text-sidebar-foreground/40",
            isCollapsed && "sr-only"
          )}
        >
          v{siteConfig.version}
        </span>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
