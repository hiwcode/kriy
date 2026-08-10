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

export interface AgentConfig {
  id: string;
  name: string;
  icon: LucideIcon;
}

// Site configuration
export const siteConfig = {
  name: "KRIY",
  description: "AI Workspace",
  version: "0.1.0",
  logo: Logo,
  github: "https://github.com/hiwcode/kriy",
};

// Navigation configuration
export const navigationConfig: NavGroup[] = [
  {
    id: "1",
    name: "main",
    items: [
      { id: 1, name: "Dashboard", url: "/", icon: LayoutDashboard },
      { id: 2, name: "Alerts", url: "/alerts", icon: Bell },
    ],
  },
  {
    id: "2",
    name: "Agents",
    items: [
      { id: 1, name: "Agents", url: "/agents", icon: Bot },
      { id: 2, name: "Orchestrator", url: "/orchestrator", icon: BrainCircuit },
    ],
  },
  {
    id: "3",
    name: "Tools & Prompts",
    items: [
      { id: 1, name: "Prompt Library", url: "/prompt-library", icon: FileText },
      { id: 2, name: "Skills", url: "/skills", icon: GraduationCap, isBeta: true },
      { id: 3, name: "MCP Connections", url: "/mcp-connections", icon: Plug },
      { id: 4, name: "MCP Tester", url: "/mcp-tester", icon: FlaskConical },
      { id: 5, name: "Database Connections", url: "/database-connections", icon: Database },
    ],
  },
  {
    id: "4",
    name: "Memory",
    items: [
      { id: 1, name: "Facts Memory", url: "/facts-memory", icon: MemoryStick },
    ],
  },
  {
    id: "5",
    name: "Automation",
    items: [
      { id: 1, name: "Schedules", url: "/schedules", icon: CalendarClock },
      { id: 2, name: "Events", url: "/events", icon: Radio },
      { id: 3, name: "Triggers", url: "/workflows", icon: Workflow },
      { id: 4, name: "Gates", url: "/gates", icon: ShieldCheck },
      { id: 5, name: "Webhooks", url: "/webhooks", icon: Webhook },
    ],
  },
  {
    id: "6",
    name: "Observability",
    items: [
      { id: 1, name: "Traces", url: "/traces", icon: Activity },
    ],
  },
  {
    id: "7",
    name: "Settings",
    items: [
      { id: 1, name: "Config", url: "/config", icon: Settings },
      { id: 2, name: "Workspace", url: "/workspace/settings", icon: Building2 },
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
  const navItem = getNavItem(pathname);

  if (navItem) {
    return {
      title: navItem.name,
      parent: navItem.groupName === "main" ? undefined : navItem.groupName,
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

// Agent configuration (derived from navigation)
export const agentConfig: Record<string, AgentConfig> = navigationConfig
  .find((group) => group.name === "Agents")
  ?.items.reduce(
    (acc, item) => {
      const slug = item.url.replace("/", "");
      acc[slug] = {
        id: String(item.id),
        name: item.name,
        icon: item.icon,
      };
      return acc;
    },
    {} as Record<string, AgentConfig>
  ) ?? {};

// Check if URL is an agent route
export function isAgentRoute(pathname: string): boolean {
  const slug = pathname.replace("/", "");
  return slug in agentConfig;
}

// Get agent config by URL
export function getAgentConfig(pathname: string): AgentConfig | undefined {
  const slug = pathname.replace("/", "");
  return agentConfig[slug];
}

// Get all agents as array
export function getAllAgents(): NavItem[] {
  return navigationConfig.find((group) => group.name === "Agents")?.items ?? [];
}
