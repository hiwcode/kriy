import {
  Activity,
  Bot,
  BrainCircuit,
  Building2,
  CalendarClock,
  Database,
  FileText,
  FlaskConical,
  GraduationCap,
  LayoutDashboard,
  Bell,
  LucideIcon,
  MemoryStick,
  Plug,
  Settings,
  ShieldCheck,
  Workflow,
  Webhook,
  Radio
} from "lucide-react";
import Logo from "@/components/logo";

// Types
export interface NavItem {
  id: string | number;
  name: string;
  url: string;
  icon: LucideIcon;
  isBeta?: boolean;
}

export interface NavGroup {
  id: string;
  name: string;
  items: NavItem[];
}

// Site configuration
export const siteConfig = {
  name: "KRIY",
  description: "Agent control plane",
  version: "0.1.0",
  logo: Logo,
  github: "https://github.com/hiwcode/kriy",
};

// Navigation configuration
export const navigationConfig: NavGroup[] = [
  {
    id: "overview",
    name: "Workspace",
    items: [
      { id: "overview", name: "Overview", url: "/dashboard", icon: LayoutDashboard },
      { id: "notifications", name: "Notifications", url: "/alerts", icon: Bell },
    ],
  },
  {
    id: "build",
    name: "Build",
    items: [
      { id: "agents", name: "Agents", url: "/agents", icon: Bot },
      { id: "orchestration", name: "Orchestration", url: "/orchestrator", icon: BrainCircuit },
      { id: "prompts", name: "Prompts", url: "/prompt-library", icon: FileText },
      { id: "skills", name: "Skills", url: "/skills", icon: GraduationCap, isBeta: true },
      { id: "memory", name: "Memory", url: "/facts-memory", icon: MemoryStick },
    ],
  },
  {
    id: "connect",
    name: "Connect",
    items: [
      { id: "mcp", name: "MCP servers", url: "/mcp-connections", icon: Plug },
      { id: "databases", name: "Databases", url: "/database-connections", icon: Database },
      { id: "mcp-inspector", name: "MCP inspector", url: "/mcp-tester", icon: FlaskConical },
    ],
  },
  {
    id: "automation",
    name: "Automate",
    items: [
      { id: "workflows", name: "Workflows", url: "/workflows", icon: Workflow },
      { id: "events", name: "Event catalog", url: "/events", icon: Radio },
      { id: "gates", name: "Decision gates", url: "/gates", icon: ShieldCheck },
      { id: "schedules", name: "Schedules", url: "/schedules", icon: CalendarClock },
      { id: "webhooks", name: "Delivery webhooks", url: "/webhooks", icon: Webhook },
    ],
  },
  {
    id: "observe",
    name: "Observe",
    items: [
      { id: "traces", name: "Runs & traces", url: "/traces", icon: Activity },
    ],
  },
  {
    id: "manage",
    name: "Manage",
    items: [
      { id: "workspace", name: "Workspace settings", url: "/workspace/settings", icon: Building2 },
      { id: "settings", name: "Settings", url: "/config", icon: Settings },
    ],
  },
];

// Flatten navigation for easy lookup
export const navItemsFlat = navigationConfig.flatMap((group) =>
  group.items.map((item) => ({
    ...item,
    groupId: group.id,
    groupName: group.name,
  }))
);

// Get navigation item by URL
export function getNavItem(url: string) {
  return navItemsFlat.find((item) => item.url === url);
}

// Get breadcrumb for a URL
export function getBreadcrumb(pathname: string): {
  title: string;
  parent?: string;
  icon?: LucideIcon;
} {
  const navItem =
    getNavItem(pathname) ??
    navItemsFlat
      .filter((item) => pathname.startsWith(`${item.url}/`))
      .sort((a, b) => b.url.length - a.url.length)[0];

  if (navItem) {
    const title =
      pathname === navItem.url
        ? navItem.name
        : navItem.url === "/agents"
          ? "Agent"
          : navItem.url === "/skills"
            ? "Skill"
            : navItem.name;

    return {
      title,
      parent: navItem.groupName,
      icon: navItem.icon,
    };
  }

  // Fallback: convert path to title
  const segments = pathname.split("/").filter(Boolean);
  const title =
    segments
      .pop()
      ?.split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ") || "Page";

  return { title };
}
