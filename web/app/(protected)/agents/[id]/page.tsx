"use client";

import * as React from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AppLayout,
} from "@/components/layout/app-layout";
import { PageLayout } from "@/components/ui/page-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TabLayout, TabConfig } from "@/components/ui/tab-layout";
import { ChatBox, Message, type ChatCard, type MessageAttachment } from "@/components/ui/chat-box";
import { upsertCards } from "@/components/chat/chat-cards";
import { DataTable, ColumnFilter } from "@/components/ui/data-table";
import { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  Settings2,
  MessageSquare,
  History,
  ArrowLeft,
  Bot,
  X,
} from "lucide-react";
import {
  getAgent,
  createAgent,
  updateAgent,
  listAgents,
  getBuiltinTools,
  runAgentStream,
  confirmToolStream,
  listAgentSessions,
  getSessionHistory,
  deleteAgentSession,
  createSessionSilent,
  getRunStatus,
  reattachRunStream,
  AgentItem,
  AgentPayload,
  AgentSessionItem,
} from "@/lib/api/agents";
import { toast } from "sonner";
import { uploadDocuments, listSessionDocuments } from "@/lib/api/documents";
import { listPrompts, type PromptLibraryItem } from "@/lib/api/prompt-library";
import {
  listMcpConnections,
  listMcpConnectionTools,
  McpToolInfo,
} from "@/lib/api/mcp-connections";
import { listDatabaseConnections } from "@/lib/api/database-connections";
import { listSkills, SkillItem } from "@/lib/api/skills";
import { listModels, type ModelPricing } from "@/lib/api/models";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChevronDown, ChevronRight, Loader2, Plug, Wrench, Puzzle, Plus, Trash2, Clock, Database, Globe, Link2, Copy, Check, ExternalLink, Play, RefreshCw, Send, AlertTriangle, Sparkles, Save, Cpu } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SheetTitle } from "@/components/ui/sheet";
import { ResizableDrawer } from "@/components/ui/resizable-drawer";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  chatSync,
  reloadA2A,
  getIntegrationAgent,
  type IntegrationAgent,
} from "@/lib/api/integration";
import { siteConfig } from "@/config/site";
import { ensureExtraFields, cn } from "@/lib/utils";

interface HistoryItem {
  id: string;
  title: string;
  preview: string;
  messages: number;
  date: string;
}

/* ------------------------------------------------------------------ */
/*  Selectable UI primitives (Configuration tab)                       */
/* ------------------------------------------------------------------ */

function SelectTile({
  selected,
  onToggle,
  title,
  subtitle,
  icon: Icon,
}: {
  selected: boolean;
  onToggle: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "group flex items-start gap-2.5 rounded-lg border p-3 text-left transition-all",
        selected
          ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
          : "hover:border-foreground/20 hover:bg-muted/50"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-input"
        )}
      >
        {selected && <Check className="size-3" />}
      </span>
      {Icon && (
        <Icon className={cn("mt-0.5 size-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{subtitle}</span>}
      </span>
    </button>
  );
}

function SelectChip({
  selected,
  onToggle,
  label,
  title,
}: {
  selected: boolean;
  onToggle: () => void;
  label: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all",
        selected
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {selected ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
      {label}
    </button>
  );
}

/** A collapsible section inside a single cohesive panel (divided by hairlines). */
function PanelSection({
  icon: Icon,
  title,
  description,
  action,
  children,
  bodyClassName,
  defaultOpen = false,
  flat = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  bodyClassName?: string;
  defaultOpen?: boolean;
  flat?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  // Flat: static (non-collapsible) header, always shows children. Used when an
  // outer nav controls which section is visible (no accordion needed).
  if (flat) {
    return (
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-1 items-start gap-3 text-left">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-[18px]" />
            </span>
            <div className="min-w-0">
              <h3 className="font-semibold tracking-tight">{title}</h3>
              {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        {children && <div className={cn("mt-5", bodyClassName)}>{children}</div>}
      </div>
    );
  }
  return (
    <div className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="group flex flex-1 items-start gap-3 text-left"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 font-semibold tracking-tight">
              {title}
              <ChevronDown
                className={cn(
                  "size-4 text-muted-foreground transition-transform duration-200 group-hover:text-foreground",
                  !open && "-rotate-90"
                )}
              />
            </h3>
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
        </button>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {open && children && <div className={cn("mt-5", bodyClassName)}>{children}</div>}
    </div>
  );
}

function ConfigurationContent({
  agentId,
  agent,
  formState,
  setFormState,
  onSubmit,
  saving,
  builtinTools,
  mcpConnections,
  databaseConnections,
  prompts,
  allAgents,
  allSkills,
}: {
  agentId: string;
  agent: AgentItem | null;
  formState: AgentFormState;
  setFormState: React.Dispatch<React.SetStateAction<AgentFormState>>;
  onSubmit: () => void;
  saving: boolean;
  builtinTools: string[];
  mcpConnections: { id: number; name: string }[];
  prompts: PromptLibraryItem[];
  allAgents: AgentItem[];
  allSkills: SkillItem[];
  databaseConnections: { id: number; name: string }[];
}) {
  const [activeSection, setActiveSection] = React.useState<string>("agent");
  const [mcpToolsCache, setMcpToolsCache] = React.useState<
    Record<
      number,
      { loading: boolean; tools: McpToolInfo[]; error?: string } | undefined
    >
  >({});
  const [mcpExpanded, setMcpExpanded] = React.useState<number | null>(null);
  const [mcpPendingSelection, setMcpPendingSelection] = React.useState<
    Record<number, Set<string>>
  >({});
  const [a2aNewUrl, setA2aNewUrl] = React.useState("");
  const [a2aNewName, setA2aNewName] = React.useState("");
  const [a2aNewHeaders, setA2aNewHeaders] = React.useState("");
  const [a2aNewMetadata, setA2aNewMetadata] = React.useState("");

  const [models, setModels] = React.useState<ModelPricing[]>([]);
  React.useEffect(() => {
    listModels().then(setModels).catch(() => {});
  }, []);
  // Keep the agent's current model selectable even if it isn't in the catalog.
  const modelOptions = React.useMemo(() => {
    const names = models.map((m) => m.name);
    return formState.model && !names.includes(formState.model)
      ? [formState.model, ...names]
      : names;
  }, [models, formState.model]);

  const toolsArray = Array.isArray(formState.tools) ? formState.tools : [];

  // Auto-fetch MCP tools when we have an entry (from loaded agent) but no cache (e.g. after refresh)
  const mcpConnIdsInTools = React.useMemo(
    () =>
      toolsArray
        .filter((t) => t.type === "mcp" && t.mcp_connection_id != null)
        .map((t) => Number(t.mcp_connection_id)),
    [toolsArray]
  );
  React.useEffect(() => {
    for (const connId of mcpConnIdsInTools) {
      if (!connId || mcpToolsCache[connId]?.tools || mcpToolsCache[connId]?.loading) continue;
      const entry = toolsArray.find((t) => t.type === "mcp" && Number(t.mcp_connection_id) === connId);
      setMcpToolsCache((prev) => ({ ...prev, [connId]: { loading: true, tools: [] } }));
      setMcpExpanded(connId);
      listMcpConnectionTools(connId)
        .then((tools) => {
          setMcpToolsCache((prev) => ({ ...prev, [connId]: { loading: false, tools } }));
          if (entry?.tool_names && entry.tool_names.length > 0) {
            setMcpPendingSelection((prev) => ({ ...prev, [connId]: new Set(entry.tool_names) }));
          } else {
            setMcpPendingSelection((prev) => ({ ...prev, [connId]: new Set(tools.map((t) => t.name)) }));
          }
        })
        .catch((err) =>
          setMcpToolsCache((prev) => ({
            ...prev,
            [connId]: { loading: false, tools: [], error: err instanceof Error ? err.message : "Failed to fetch" },
          }))
        );
    }
  }, [mcpConnIdsInTools.join(",")]);

  const handleToolToggle = (type: "builtin" | "mcp" | "database", id: string | number) => {
    const tools = [...toolsArray];
    const existing = tools.find(
      (t) =>
        (t.type === "builtin" && t.name === id) ||
        (t.type === "mcp" && Number(t.mcp_connection_id) === Number(id)) ||
        (t.type === "database" && Number((t as { database_connection_id?: number }).database_connection_id) === Number(id))
    );
    if (existing) {
      setFormState((prev) => ({
        ...prev,
        tools: (Array.isArray(prev.tools) ? prev.tools : []).filter(
          (t) =>
            !(
              (t.type === "builtin" && t.name === id) ||
              (t.type === "mcp" && Number(t.mcp_connection_id) === Number(id)) ||
              (t.type === "database" && Number((t as { database_connection_id?: number }).database_connection_id) === Number(id))
            )
        ),
      }));
    } else {
      if (type === "builtin") {
        tools.push({ type: "builtin", name: id as string });
      } else if (type === "database") {
        tools.push({ type: "database", database_connection_id: id as number });
      } else {
        tools.push({ type: "mcp", mcp_connection_id: id as number });
      }
      setFormState((prev) => ({ ...prev, tools }));
    }
  };

  const isToolSelected = (type: "builtin" | "mcp" | "database", id: string | number) =>
    toolsArray.some(
      (t) =>
        (t.type === "builtin" && t.name === id) ||
        (t.type === "mcp" && Number(t.mcp_connection_id) === Number(id)) ||
        (t.type === "database" && Number((t as { database_connection_id?: number }).database_connection_id) === Number(id))
    );

  const fetchMcpTools = (connId: number) => {
    setMcpToolsCache((prev) => ({
      ...prev,
      [connId]: { loading: true, tools: [] },
    }));
    setMcpExpanded(connId);
    listMcpConnectionTools(connId)
      .then((tools) => {
        setMcpToolsCache((prev) => ({
          ...prev,
          [connId]: { loading: false, tools },
        }));
        setMcpPendingSelection((prev) => ({
          ...prev,
          [connId]: new Set(tools.map((t) => t.name)),
        }));
      })
      .catch((err) =>
        setMcpToolsCache((prev) => ({
          ...prev,
          [connId]: {
            loading: false,
            tools: [],
            error: err instanceof Error ? err.message : "Failed to fetch",
          },
        }))
      );
  };

  const isToolChecked = (connId: number, toolName: string) => {
    const entry = getMcpToolEntry(connId);
    if (entry) {
      if (!entry.tool_names || entry.tool_names.length === 0) return true;
      return entry.tool_names.includes(toolName);
    }
    const pending = mcpPendingSelection[connId];
    return pending ? pending.has(toolName) : true;
  };

  const toggleMcpTool = (connId: number, toolName: string) => {
    const entry = getMcpToolEntry(connId);
    const cachedTools = mcpToolsCache[connId]?.tools ?? [];
    const allToolNames = cachedTools.map((t: McpToolInfo) => t.name);
    if (entry) {
      const current = entry.tool_names ?? allToolNames;
      const next = current.includes(toolName)
        ? current.filter((n: string) => n !== toolName)
        : [...current, toolName];
      updateMcpToolSelection(connId, next);
    } else {
      const pending = mcpPendingSelection[connId] ?? new Set(allToolNames);
      const next = new Set(pending);
      if (next.has(toolName)) {
        next.delete(toolName);
      } else {
        next.add(toolName);
      }
      setMcpPendingSelection((prev) => ({ ...prev, [connId]: next }));
    }
  };

  const addMcpWithTools = (connId: number, toolNames: string[] | undefined) => {
    const tools = toolsArray.filter(
      (t) => !(t.type === "mcp" && Number(t.mcp_connection_id) === connId)
    );
    tools.push({
      type: "mcp",
      mcp_connection_id: connId,
      tool_names: toolNames && toolNames.length > 0 ? toolNames : undefined,
    });
    setFormState((prev) => ({ ...prev, tools }));
  };

  const updateMcpToolSelection = (connId: number, toolNames: string[]) => {
    setFormState((prev) => ({
      ...prev,
      tools: (Array.isArray(prev.tools) ? prev.tools : []).map((t) =>
        t.type === "mcp" && Number(t.mcp_connection_id) === connId
          ? { ...t, tool_names: toolNames.length > 0 ? toolNames : undefined }
          : t
      ),
    }));
  };

  const getMcpToolEntry = (connId: number) =>
    toolsArray.find(
      (t) =>
        t.type === "mcp" &&
        Number(t.mcp_connection_id) === connId
    );

  const isLocal = formState.agent_type === "local";
  const navSections = [
    { id: "agent", title: "Agent Configuration", icon: Cpu, visible: true },
    { id: "skills", title: "Skills", icon: Sparkles, visible: isLocal && allSkills.length > 0 },
    { id: "tools", title: "Builtin Tools", icon: Wrench, visible: isLocal },
    { id: "database", title: "Database Connections", icon: Database, visible: isLocal },
    { id: "mcp", title: "MCP Connections", icon: Puzzle, visible: isLocal },
  ].filter((s) => s.visible);
  const currentSection = navSections.some((s) => s.id === activeSection) ? activeSection : "agent";

  return (
    <div className="mx-auto grid w-full max-w-full gap-6 lg:grid-cols-[224px_minmax(0,1fr)]">
      {/* Section nav — click a title to show it on the right */}
      <nav className="flex flex-row gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {navSections.map((s) => {
          const SIcon = s.icon;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveSection(s.id)}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                currentSection === s.id
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <SIcon className="size-4 shrink-0" />
              <span className="whitespace-nowrap">{s.title}</span>
            </button>
          );
        })}
      </nav>

      {/* Section content */}
      <div className="min-w-0">
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className={cn(currentSection !== "agent" && "hidden")}>
            <PanelSection
              flat
              icon={Cpu}
              title="Agent Configuration"
              description="Basic settings, system prompt, and instructions"
              bodyClassName="space-y-4"
            >
              <div className="space-y-2">
                <Label>Agent type</Label>
                <Select
                  value={formState.agent_type}
                  onValueChange={(v) =>
                    setFormState((prev) => ({
                      ...prev,
                      agent_type: v as AgentType,
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">Local (build with instructions & tools)</SelectItem>
                    <SelectItem value="a2a">A2A (connect external agent by URL)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  A2A agents connect to external Agent-to-Agent protocol endpoints for testing.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name (identifier)</Label>
                  <Input
                    value={formState.name}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder={formState.agent_type === "a2a" ? "e.g. external_weather" : "e.g. general_agent"}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Label (display name)</Label>
                  <Input
                    value={formState.label}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, label: e.target.value }))
                    }
                    placeholder="e.g. General Agent"
                  />
                </div>
              </div>
              {formState.agent_type === "a2a" ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>A2A base URL</Label>
                    <Input
                      value={formState.a2a_url}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, a2a_url: e.target.value }))
                      }
                      placeholder="https://agent.example.com"
                    />
                    <p className="text-xs text-muted-foreground">
                      Base URL of the agent. Agent card will be fetched from /.well-known/agent.json
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Headers (optional JSON)</Label>
                    <Textarea
                      value={formState.a2a_headers}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, a2a_headers: e.target.value }))
                      }
                      placeholder='{"Authorization": "Bearer token"}'
                      rows={3}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      HTTP headers for auth (e.g. Bearer token). JSON object.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Metadata (optional JSON)</Label>
                    <Textarea
                      value={formState.a2a_metadata}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, a2a_metadata: e.target.value }))
                      }
                      placeholder='{"key": "value"}'
                      rows={3}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Arbitrary key/values sent as JSON-RPC <code>params.metadata</code> on every
                      request — whatever fields the remote agent expects. Auth goes in Headers,
                      not here.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
              <div className="space-y-2">
                <Label>Model</Label>
                <Select
                  value={formState.model || undefined}
                  onValueChange={(v) => setFormState((prev) => ({ ...prev, model: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {modelOptions.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Manage models &amp; pricing in{" "}
                  <Link href="/config" className="text-primary underline underline-offset-2">Config</Link>.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={formState.description}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Agent description"
                />
              </div>
              <div className="space-y-2">
                <Label>System prompt (or pick from library)</Label>
                <p className="text-xs text-muted-foreground">
                  Foundational role/behavior (e.g. &quot;You are a helpful assistant&quot;)
                </p>
                <Select
                  value={formState.system_prompt_id?.toString() ?? "none"}
                  onValueChange={(v) =>
                    setFormState((prev) => ({
                      ...prev,
                      system_prompt_id:
                        v === "none" ? null : parseInt(v, 10),
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select system prompt" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Custom system prompt below</SelectItem>
                    {prompts
                      .filter((p) => (p.prompt_type ?? "instructions") === "system")
                      .map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.title}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {formState.system_prompt_id ? (
                  <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      System prompt from library (read-only)
                    </p>
                    <pre className="whitespace-pre-wrap text-sm font-mono text-foreground overflow-x-auto max-h-48 overflow-y-auto">
                      {prompts.find((p) => p.id === formState.system_prompt_id)?.prompt ?? (formState.system_prompt || "Prompt not found")}
                    </pre>
                  </div>
                ) : (
                  <Textarea
                    value={formState.system_prompt}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, system_prompt: e.target.value }))
                    }
                    placeholder="You are a helpful AI assistant..."
                    rows={3}
                    className="mt-2"
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label>Instructions (or pick from library)</Label>
                <p className="text-xs text-muted-foreground">
                  Task-specific guidance (e.g. how to use tools, formatting rules)
                </p>
                <Select
                  value={formState.instruction_prompt_id?.toString() ?? "none"}
                  onValueChange={(v) =>
                    setFormState((prev) => ({
                      ...prev,
                      instruction_prompt_id:
                        v === "none" ? null : parseInt(v, 10),
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select instructions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Custom instructions below</SelectItem>
                    {prompts
                      .filter((p) => (p.prompt_type ?? "instructions") === "instructions")
                      .map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.title}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {formState.instruction_prompt_id ? (
                  <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Instructions from library (read-only)
                    </p>
                    <pre className="whitespace-pre-wrap text-sm font-mono text-foreground overflow-x-auto max-h-48 overflow-y-auto">
                      {prompts.find((p) => p.id === formState.instruction_prompt_id)?.prompt ?? (formState.instruction || "Prompt not found")}
                    </pre>
                  </div>
                ) : (
                  <Textarea
                    value={formState.instruction}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, instruction: e.target.value }))
                    }
                    placeholder="When the user asks about X, do Y. Use tools when needed..."
                    rows={5}
                    className="mt-2"
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label>Orchestrator</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formState.is_orchestrator}
                    onCheckedChange={(v) =>
                      setFormState((prev) => ({ ...prev, is_orchestrator: v }))
                    }
                  />
                  <span className="text-sm text-muted-foreground">
                    Use as orchestrator with sub-agents
                  </span>
                </div>
              </div>
              {formState.is_orchestrator && (
                <>
                  <div className="space-y-2">
                    <Label>Sub-Agents (local)</Label>
                    <p className="text-xs text-muted-foreground">
                      Agents you create in this system
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {allAgents
                        .filter(
                          (a) =>
                            !a.is_orchestrator &&
                            (agentId === "new" || a.id !== parseInt(agentId, 10))
                        )
                        .map((a) => {
                          const isSub = formState.sub_agent_ids.includes(a.id);
                          return (
                            <SelectChip
                              key={a.id}
                              label={a.label}
                              selected={isSub}
                              onToggle={() => {
                                const next = isSub
                                  ? formState.sub_agent_ids.filter((id) => id !== a.id)
                                  : [...formState.sub_agent_ids, a.id];
                                setFormState((prev) => ({
                                  ...prev,
                                  sub_agent_ids: next,
                                }));
                              }}
                            />
                          );
                        })}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>External A2A agents</Label>
                    <p className="text-xs text-muted-foreground">
                      Connect agents by URL (Agent-to-Agent protocol). Base URL of the agent endpoint.
                    </p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="https://agent.example.com"
                        value={a2aNewUrl}
                        onChange={(e) => setA2aNewUrl(e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        placeholder="Display name"
                        value={a2aNewName}
                        onChange={(e) => setA2aNewName(e.target.value)}
                        className="w-32"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const url = a2aNewUrl.trim();
                          if (!url) return;
                          let headers: Record<string, string> | undefined;
                          const raw = a2aNewHeaders.trim();
                          if (raw) {
                            try {
                              const parsed = JSON.parse(raw);
                              if (parsed && typeof parsed === "object") {
                                headers = Object.fromEntries(
                                  Object.entries(parsed).map(([k, v]) => [k, String(v)])
                                );
                              }
                            } catch {
                              toast.error("Auth headers must be valid JSON, e.g. {\"Authorization\":\"Bearer …\"}");
                              return;
                            }
                          }
                          let metadata: Record<string, unknown> | undefined;
                          const rawMeta = a2aNewMetadata.trim();
                          if (rawMeta) {
                            try {
                              const parsed = JSON.parse(rawMeta);
                              if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                                metadata = parsed as Record<string, unknown>;
                              } else {
                                throw new Error("not an object");
                              }
                            } catch {
                              toast.error("Metadata must be a valid JSON object, e.g. {\"userId\":\"…\"}");
                              return;
                            }
                          }
                          setFormState((prev) => ({
                            ...prev,
                            a2a_connections: [
                              ...prev.a2a_connections,
                              { url, name: a2aNewName.trim() || "external_agent", headers, metadata },
                            ],
                          }));
                          setA2aNewUrl("");
                          setA2aNewName("");
                          setA2aNewHeaders("");
                          setA2aNewMetadata("");
                        }}
                      >
                        <Plus className="size-4 mr-1" />
                        Add
                      </Button>
                    </div>
                    <Input
                      placeholder='Optional auth headers as JSON, e.g. {"Authorization":"Bearer …"}'
                      value={a2aNewHeaders}
                      onChange={(e) => setA2aNewHeaders(e.target.value)}
                      className="font-mono text-xs"
                    />
                    <Input
                      placeholder='Optional params.metadata as JSON, e.g. {"key":"value"}'
                      value={a2aNewMetadata}
                      onChange={(e) => setA2aNewMetadata(e.target.value)}
                      className="font-mono text-xs"
                    />
                    {formState.a2a_connections.length > 0 && (
                      <ul className="space-y-2 rounded-lg border border-border bg-muted/20 p-2">
                        {formState.a2a_connections.map((c, i) => (
                          <li
                            key={`${c.url}-${i}`}
                            className="flex items-center justify-between rounded-md bg-background px-3 py-2 text-sm"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Globe className="size-4 shrink-0 text-muted-foreground" />
                              <span className="font-medium truncate">{c.name}</span>
                              <span className="text-muted-foreground truncate text-xs">{c.url}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setFormState((prev) => ({
                                  ...prev,
                                  a2a_connections: prev.a2a_connections.filter((_, j) => j !== i),
                                }))
                              }
                              className="shrink-0 p-1 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              title="Remove"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
                </div>
              )}
            </PanelSection>
          </div>

          <div className={cn(currentSection !== "skills" && "hidden")}>
            <PanelSection flat icon={Sparkles} title="Skills" description="Attach reusable skills to this agent">
                <div className="flex flex-wrap gap-2">
                  {allSkills.map((skill) => {
                    const isSelected = formState.skill_ids.includes(skill.id);
                    return (
                      <SelectChip
                        key={skill.id}
                        label={skill.name}
                        title={skill.description ?? ""}
                        selected={isSelected}
                        onToggle={() => {
                          const next = isSelected
                            ? formState.skill_ids.filter((id) => id !== skill.id)
                            : [...formState.skill_ids, skill.id];
                          setFormState((prev) => ({ ...prev, skill_ids: next }));
                        }}
                      />
                    );
                  })}
                </div>
            </PanelSection>
          </div>

          <div className={cn(currentSection !== "tools" && "hidden")}>
            <PanelSection flat icon={Wrench} title="Builtin Tools" description="Select the capabilities this agent can use">
              {builtinTools.length === 0 ? (
                <p className="text-sm text-muted-foreground">No builtin tools available.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {builtinTools.map((name) => (
                    <SelectChip
                      key={name}
                      label={name}
                      selected={isToolSelected("builtin", name)}
                      onToggle={() => handleToolToggle("builtin", name)}
                    />
                  ))}
                </div>
              )}
            </PanelSection>
          </div>

          <div className={cn(currentSection !== "database" && "hidden")}>
            <PanelSection flat icon={Database} title="Database Connections" description="Let the agent query PostgreSQL databases via SQL">
              {databaseConnections.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  No database connections yet.{" "}
                  <Link href="/database-connections" className="font-medium text-primary hover:underline">
                    Add one
                  </Link>
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {databaseConnections.map((conn: { id: number; name: string }) => (
                    <SelectTile
                      key={conn.id}
                      icon={Database}
                      title={conn.name}
                      selected={isToolSelected("database", conn.id)}
                      onToggle={() => handleToolToggle("database", conn.id)}
                    />
                  ))}
                </div>
              )}
            </PanelSection>
          </div>

          <div className={cn(currentSection !== "mcp" && "hidden")}>
            <PanelSection flat icon={Puzzle} title="MCP Connections" description="Connect MCP servers and select which tools to give this agent">
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {mcpConnections.map((conn) => {
                  const entry = getMcpToolEntry(conn.id);
                  const cached = mcpToolsCache[conn.id];
                  const isExpanded = mcpExpanded === conn.id;
                  return (
                    <Collapsible
                      key={conn.id}
                      open={isExpanded}
                      onOpenChange={(open) =>
                        setMcpExpanded(open ? conn.id : null)
                      }
                    >
                      <div className="rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8">
                                {isExpanded ? (
                                  <ChevronDown className="size-4" />
                                ) : (
                                  <ChevronRight className="size-4" />
                                )}
                              </Button>
                            </CollapsibleTrigger>
                            <span className="font-medium text-sm">{conn.name}</span>
                            {entry && (
                              <span className="text-xs text-muted-foreground">
                                ({entry.tool_names?.length ?? "all"} tools)
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {!cached && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => fetchMcpTools(conn.id)}
                              >
                                <Plug className="size-4 mr-1" />
                                Connect
                              </Button>
                            )}
                            {cached?.loading && (
                              <Loader2 className="size-4 animate-spin text-muted-foreground" />
                            )}
                            {entry && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setFormState((prev) => ({
                                    ...prev,
                                    tools: (Array.isArray(prev.tools) ? prev.tools : []).filter(
                                      (t) =>
                                        !(
                                          t.type === "mcp" &&
                                          Number(t.mcp_connection_id) === conn.id
                                        )
                                    ),
                                  }));
                                }}
                              >
                                Remove
                              </Button>
                            )}
                          </div>
                        </div>
                        <CollapsibleContent>
                          <div className="mt-3 pl-10 space-y-2">
                            {cached?.error && (
                              <p className="text-sm text-destructive">
                                {cached.error}
                              </p>
                            )}
                            {cached?.tools && cached.tools.length > 0 && (
                              <>
                                <div className="max-h-40 overflow-y-auto space-y-2">
                                  {cached.tools.map((tool) => (
                                    <div
                                      key={tool.name}
                                      className="flex items-start gap-2"
                                    >
                                      <Checkbox
                                        id={`mcp-tool-${conn.id}-${tool.name}`}
                                        checked={isToolChecked(conn.id, tool.name)}
                                        onCheckedChange={() =>
                                          toggleMcpTool(conn.id, tool.name)
                                        }
                                      />
                                      <label
                                        htmlFor={`mcp-tool-${conn.id}-${tool.name}`}
                                        className="text-sm cursor-pointer flex-1"
                                      >
                                        <span className="font-medium">
                                          {tool.name}
                                        </span>
                                        {tool.description && (
                                          <span className="text-muted-foreground block text-xs">
                                            {tool.description}
                                          </span>
                                        )}
                                      </label>
                                    </div>
                                  ))}
                                </div>
                                {!entry && (
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        addMcpWithTools(conn.id, undefined)
                                      }
                                    >
                                      Add all tools
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        const selected = mcpPendingSelection[
                                          conn.id
                                        ];
                                        const arr = selected
                                          ? Array.from(selected)
                                          : cached.tools.map((t) => t.name);
                                        addMcpWithTools(conn.id, arr);
                                      }}
                                    >
                                      Add selected
                                    </Button>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })}
              </div>
            </PanelSection>
          </div>
        </div>
        <div className="sticky bottom-0 mt-4 flex items-center justify-between gap-3 border-t bg-background/85 px-4 py-3 backdrop-blur-md">
        <p className="hidden text-xs text-muted-foreground sm:block">
          {agentId === "new"
            ? "Create the agent to enable chat and integrations."
            : "Changes apply to new conversations."}
        </p>
        <Button onClick={onSubmit} disabled={saving} size="lg">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {saving ? "Saving…" : agentId === "new" ? "Create agent" : "Save changes"}
        </Button>
        </div>
      </div>
    </div>
  );
}

interface A2aConnection {
  url: string;
  name: string;
  /** Optional auth headers sent when calling this external agent (stored encrypted). */
  headers?: Record<string, string>;
  /** Optional arbitrary JSON-RPC params.metadata sent to the remote agent. */
  metadata?: Record<string, unknown>;
}

type AgentType = "local" | "a2a";

interface AgentFormState {
  agent_type: AgentType;
  name: string;
  label: string;
  model: string;
  description: string;
  system_prompt: string;
  system_prompt_id: number | null;
  instruction: string;
  instruction_prompt_id: number | null;
  tools: Array<{
    type: string;
    name?: string;
    mcp_connection_id?: number;
    tool_names?: string[];
    database_connection_id?: number;
  }>;
  is_orchestrator: boolean;
  sub_agent_ids: number[];
  skill_ids: number[];
  a2a_connections: A2aConnection[];
  a2a_url: string;
  a2a_headers: string;
  a2a_metadata: string;
}

const emptyForm: AgentFormState = {
  agent_type: "local",
  name: "",
  label: "",
  model: "gemini-3.1-flash-lite",
  description: "",
  system_prompt: "",
  system_prompt_id: null,
  instruction: "",
  instruction_prompt_id: null,
  tools: [],
  is_orchestrator: false,
  sub_agent_ids: [],
  skill_ids: [],
  a2a_connections: [],
  a2a_url: "",
  a2a_headers: "",
  a2a_metadata: "",
};

function ChatTab({
  agentName,
  agentId,
  sessionToLoad,
  onSessionLoaded,
  onClose,
}: {
  agentName: string;
  agentId: number | null;
  sessionToLoad?: string | null;
  onSessionLoaded?: () => void;
  /** Close the surrounding slide-over (renders a close button when provided). */
  onClose?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sessionFromUrl = searchParams.get("session");
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [sessions, setSessions] = React.useState<AgentSessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = React.useState(false);
  /** Toggles the in-panel conversation history overlay. */
  const [showHistory, setShowHistory] = React.useState(false);
  /** When true, the user explicitly started a new chat — suppress auto-select. */
  const isNewChatRef = React.useRef(false);
  /** Guards auto-loading a session from the URL to ONCE per mount, so the
   *  `?session=` we set while sending doesn't re-trigger a load that wipes the
   *  in-flight conversation. */
  const didInitRef = React.useRef(false);

  const Logo = siteConfig.logo;

  // Track sessions where THIS browser left a run going, so the "finished while
  // away" toast only fires when you actually left one behind (not on every open).
  const pendingKey = (aid: number, sid: string) => `atelier:pendingRun:${aid}:${sid}`;
  const markPending = (aid: number, sid: string) => {
    try { sessionStorage.setItem(pendingKey(aid, sid), "1"); } catch {}
  };
  const clearPending = (aid: number, sid: string) => {
    try { sessionStorage.removeItem(pendingKey(aid, sid)); } catch {}
  };
  const hasPending = (aid: number, sid: string) => {
    try { return sessionStorage.getItem(pendingKey(aid, sid)) === "1"; } catch { return false; }
  };

  const fetchSessions = React.useCallback(() => {
    if (!agentId) return;
    setSessionsLoading(true);
    listAgentSessions(Number(agentId), { limit: 200, offset: 0 })
      .then(({ items }) => setSessions(items))
      .catch(() => {})
      .finally(() => setSessionsLoading(false));
  }, [agentId]);

  React.useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  /** Attach to a background run for `sid`, streaming its output into a live bubble. */
  const streamReattach = React.useCallback(async (aid: number, sid: string) => {
    const liveId = `live-${Date.now()}`;
    setMessages((prev) => [...prev, { id: liveId, role: "assistant", content: "" }]);
    setIsLoading(true);
    try {
      let fullText = "";
      for await (const chunk of reattachRunStream(aid, sid)) {
        if (chunk.type === "text" && chunk.text) {
          fullText += chunk.text;
          setMessages((prev) => prev.map((m) => (m.id === liveId ? { ...m, content: fullText } : m)));
        } else if (chunk.type === "card" && chunk.card) {
          const card = chunk.card as ChatCard;
          setMessages((prev) => prev.map((m) => (m.id === liveId ? { ...m, cards: upsertCards(m.cards, card) } : m)));
        } else if (chunk.type === "error" && chunk.error) {
          setMessages((prev) => prev.map((m) => (m.id === liveId ? { ...m, content: `Error: ${chunk.error}` } : m)));
        } else if (chunk.type === "tool_confirmation" && chunk.function_call_id) {
          setMessages((prev) => [...prev, {
            id: `conf-${chunk.function_call_id}`, role: "assistant" as const, content: "",
            toolConfirmation: { function_call_id: chunk.function_call_id!, hint: chunk.hint || "Approve this action?", tool_name: chunk.tool_name || "", args: chunk.args || {} },
          }]);
        }
      }
    } catch {
      // stream ended / not attachable — history already rendered
    } finally {
      setIsLoading(false);
      fetchSessions();
    }
  }, [fetchSessions]);

  /**
   * Load a session's history, and — if a run is still going in the background —
   * re-attach to it live. If one finished while we were away, note it.
   */
  const loadSession = React.useCallback(async (sid: string) => {
    if (!agentId) return;
    setMessages([]);
    let runState = { active: false, finished_recently: false };
    try {
      runState = await getRunStatus(agentId, sid);
    } catch {
      // status unavailable — fall back to plain history
    }
    try {
      const data = await getSessionHistory(agentId, sid);
      const msgs: Message[] = [];
      data.history.forEach((ex, i) => {
        const isLast = i === data.history.length - 1;
        msgs.push({
          id: `user-${i}`,
          role: "user",
          content: ex.user_message,
          timestamp: new Date(ex.timestamp * 1000),
        });
        // For an active run, the in-flight (last) turn is owned by the live
        // reattach stream — skip its persisted assistant half to avoid a dupe.
        if (!(runState.active && isLast)) {
          // History persists every card emission (e.g. each plan/todo progress
          // update). Collapse them the same way the live view does — same
          // type+title merges to its final state — so we show one card, not N.
          const mergedCards = (ex.agent_cards as ChatCard[] | undefined)?.reduce(
            (acc, c) => upsertCards(acc, c),
            [] as ChatCard[]
          );
          msgs.push({
            id: `assistant-${i}`,
            role: "assistant",
            content: ex.agent_response,
            cards: mergedCards,
            timestamp: new Date(ex.timestamp * 1000),
          });
        }
      });
      setMessages(msgs);
      // History doesn't persist attachments — re-hydrate them from the session's
      // documents, attaching each to the nearest user turn by upload time.
      try {
        const docs = await listSessionDocuments(agentId, sid);
        if (docs.length) {
          setMessages((prev) => {
            const userMsgs = prev.filter((m) => m.role === "user");
            if (!userMsgs.length) return prev;
            const byMsg: Record<string, MessageAttachment[]> = {};
            for (const d of docs) {
              const dt = new Date(d.created_at).getTime();
              let best = userMsgs[0];
              let bestDelta = Infinity;
              for (const m of userMsgs) {
                const delta = Math.abs((m.timestamp?.getTime() ?? 0) - dt);
                if (delta < bestDelta) { bestDelta = delta; best = m; }
              }
              (byMsg[best.id] ??= []).push({
                id: d.id, name: d.name, mime_type: d.mime_type, url: d.download_url ?? d.url,
              });
            }
            return prev.map((m) => {
              const add = byMsg[m.id];
              if (!add) return m;
              // Dedupe by id — loadSession can run more than once for a session,
              // so appending blindly would duplicate the same attachment.
              const existing = m.attachments ?? [];
              const seen = new Set(existing.map((a) => a.id));
              const merged = [...existing, ...add.filter((a) => !seen.has(a.id))];
              return { ...m, attachments: merged };
            });
          });
        }
      } catch { /* attachments are best-effort */ }
    } catch {
      // no history yet
    }
    if (runState.active) {
      await streamReattach(agentId, sid);
      clearPending(agentId, sid); // we watched it finish (or the stream ended)
    } else if (runState.finished_recently && hasPending(agentId, sid)) {
      clearPending(agentId, sid);
      toast.success("Agent finished while you were away");
    }
  }, [agentId, streamReattach]);

  React.useEffect(() => {
    if (
      !sessionsLoading &&
      sessions.length > 0 &&
      sessionId === null &&
      !sessionToLoad &&
      !sessionFromUrl &&
      !isNewChatRef.current
    ) {
      handleSelectSession(sessions[0].session_id);
    }
  }, [sessionsLoading, sessions, sessionId, sessionToLoad, sessionFromUrl]);

  React.useEffect(() => {
    if (sessionToLoad && agentId) {
      didInitRef.current = true;
      setSessionId(sessionToLoad);
      loadSession(sessionToLoad).finally(() => onSessionLoaded?.());
    }
  }, [sessionToLoad, agentId, onSessionLoaded, loadSession]);

  // Returning to the page with ?session=<id> (e.g. after navigating away while a
  // run was going) re-opens that session and re-attaches to any live run.
  // Runs ONCE per mount — later URL changes we make while sending must not
  // re-trigger this (it would wipe the in-flight conversation).
  React.useEffect(() => {
    if (didInitRef.current) return;
    if (
      sessionFromUrl &&
      agentId &&
      sessionId === null &&
      !sessionToLoad &&
      !isNewChatRef.current
    ) {
      didInitRef.current = true;
      setSessionId(sessionFromUrl);
      loadSession(sessionFromUrl);
    }
  }, [sessionFromUrl, agentId, sessionId, sessionToLoad, loadSession]);

  const handleNewSession = () => {
    isNewChatRef.current = true;
    setSessionId(null);
    setMessages([]);
    router.replace(pathname);
  };

  const handleSelectSession = (sid: string) => {
    isNewChatRef.current = false;
    didInitRef.current = true; // explicit pick — don't let the URL effect reload
    setSessionId(sid);
    router.replace(`${pathname}?session=${sid}`);
    if (agentId && sid) {
      loadSession(sid);
    }
  };

  const handleDeleteSession = async (sid: string) => {
    if (!agentId) return;
    try {
      await deleteAgentSession(agentId, sid);
      if (sessionId === sid) {
        setSessionId(null);
        setMessages([]);
      }
      fetchSessions();
    } catch {
      // ignore
    }
  };

  const pendingDocIds = React.useRef<number[] | undefined>(undefined);

  const handleFileUpload = async (files: File[], text: string) => {
    if (!agentId) return;
    // We're interacting — mark init done BEFORE creating a session / changing the
    // URL, so the ?session= effect doesn't fire loadSession() mid-upload (which
    // clears messages → flicker, and could double-attach to the run we start).
    didInitRef.current = true;
    isNewChatRef.current = false;
    // Ensure a session exists before uploading so docs are scoped correctly
    let sid = sessionId;
    if (!sid) {
      try {
        sid = await createSessionSilent(agentId);
      } catch { /* fall through */ }
      if (sid) {
        setSessionId(sid);
        router.replace(`${pathname}?session=${sid}`);
      }
    }
    const docs = await uploadDocuments(files, agentId, sid || undefined);
    const imageIds = docs.filter((d) => d.mime_type.startsWith("image/")).map((d) => d.id);
    const attachments: MessageAttachment[] = docs.map((d) => ({
      id: d.id,
      name: d.name,
      mime_type: d.mime_type,
      url: d.download_url ?? d.url,
    }));
    const display = text.trim();
    // One turn: the user's message carries the attachments AND the run. We send
    // the user's plain text (no injected hint — it would be persisted and shown
    // back on reload). Images are attached inline for vision; non-image docs are
    // discoverable via the analyze_document tool. Empty text gets a sensible ask.
    handleSendMessage(display, {
      forcedSessionId: sid || undefined,
      attachments,
      runContent: display || "Please review the attached file(s).",
      docIds: imageIds.length > 0 ? docs.map((d) => d.id) : undefined,
    });
  };

  const handleSendMessage = async (
    content: string,
    opts?: {
      forcedSessionId?: string;
      attachments?: MessageAttachment[];
      runContent?: string;
      docIds?: number[];
    },
  ) => {
    didInitRef.current = true; // we're interacting — URL changes must not reload/wipe
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date(),
      attachments: opts?.attachments,
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, assistantMessage]);

    if (agentId) {
      // Ensure a session exists up front so the run is keyed and re-attachable,
      // and point the URL at it — navigating away and back resumes this run.
      let sid = opts?.forcedSessionId ?? sessionId ?? sessionToLoad ?? sessionFromUrl ?? null;
      if (!sid) {
        try {
          sid = await createSessionSilent(agentId);
        } catch {
          sid = null;
        }
        if (sid) {
          isNewChatRef.current = false;
          setSessionId(sid);
          router.replace(`${pathname}?session=${sid}`);
        }
      }
      // Mark this run pending so that if we leave and it finishes while away,
      // returning shows the "finished while away" toast exactly once.
      if (sid) markPending(agentId, sid);
      try {
        let fullText = "";
        const docIds = opts?.docIds ?? pendingDocIds.current;
        pendingDocIds.current = undefined;
        for await (const chunk of runAgentStream(agentId, {
          message: opts?.runContent ?? content,
          session_id: sid ?? undefined,
          document_ids: docIds,
        })) {
          if (chunk.type === "session" && chunk.session_id) {
            isNewChatRef.current = false;
            setSessionId(chunk.session_id);
            fetchSessions();
          }
          if (chunk.type === "text" && chunk.text) {
            fullText += chunk.text;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: fullText }
                  : m
              )
            );
          }
          if (chunk.type === "error" && chunk.error) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: `Error: ${chunk.error}` }
                  : m
              )
            );
          }
          if (chunk.type === "card" && chunk.card) {
            const card = chunk.card as ChatCard;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, cards: upsertCards(m.cards, card) }
                  : m
              )
            );
          }
          if (chunk.type === "tool_confirmation" && chunk.function_call_id) {
            const confMsgId = `conf-${chunk.function_call_id}`;
            setMessages((prev) => [
              ...prev,
              {
                id: confMsgId,
                role: "assistant" as const,
                content: "",
                toolConfirmation: {
                  function_call_id: chunk.function_call_id!,
                  hint: chunk.hint || "Approve this action?",
                  tool_name: chunk.tool_name || "",
                  args: chunk.args || {},
                },
              },
            ]);
          }
        }
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: `Error: ${err instanceof Error ? err.message : "Failed to run agent"}` }
              : m
          )
        );
      } finally {
        // Completed (or errored) while attached — no "finished while away" toast.
        if (sid) clearPending(agentId, sid);
      }
    } else {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? { ...m, content: "Save the agent first to enable chat." }
            : m
        )
      );
    }
    setIsLoading(false);
  };

  const formatRelativeTime = (ts: number) => {
    const diff = Date.now() / 1000 - ts;
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(ts * 1000).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Panel header */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Bot className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{agentName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {showHistory ? "Conversation history" : "Chat"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant={showHistory ? "secondary" : "ghost"}
            size="icon"
            className="size-8"
            onClick={() => setShowHistory((h) => !h)}
            disabled={!agentId}
            title="Conversation history"
            aria-pressed={showHistory}
          >
            <History className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => {
              handleNewSession();
              setShowHistory(false);
            }}
            disabled={!agentId}
            title="New conversation"
          >
            <Plus className="size-4" />
          </Button>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={onClose}
              title="Close"
              aria-label="Close chat"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Body: live chat with a history overlay */}
      <div className="relative min-h-0 flex-1">
        <div className="flex h-full flex-col">
          <ChatBox
          messages={messages}
          onSendMessage={handleSendMessage}
          onFileUpload={handleFileUpload}
          onToolConfirmation={async (fcId, userConfirmed) => {
            console.log("[CONFIRM]", { agentId, sessionId, fcId, userConfirmed });
            if (!agentId || !sessionId) {
              console.error("[CONFIRM] Missing agentId or sessionId", { agentId, sessionId });
              return;
            }
            setIsLoading(true);
            const resumeMsgId = `resume-${Date.now()}`;
            setMessages((prev) => [...prev, { id: resumeMsgId, role: "assistant", content: "" }]);
            try {
              let fullText = "";
              for await (const chunk of confirmToolStream(agentId, {
                session_id: sessionId,
                function_call_id: fcId,
                confirmed: userConfirmed,
              })) {
                if (chunk.type === "text" && chunk.text) {
                  fullText += chunk.text;
                  setMessages((prev) => prev.map((m) => m.id === resumeMsgId ? { ...m, content: fullText } : m));
                }
                if (chunk.type === "error" && chunk.error) {
                  setMessages((prev) => prev.map((m) => m.id === resumeMsgId ? { ...m, content: `Error: ${chunk.error}` } : m));
                }
                if (chunk.type === "card" && chunk.card) {
                  const card = chunk.card as ChatCard;
                  setMessages((prev) => prev.map((m) => m.id === resumeMsgId ? { ...m, cards: upsertCards(m.cards, card) } : m));
                }
                if (chunk.type === "tool_confirmation" && chunk.function_call_id) {
                  setMessages((prev) => [...prev, {
                    id: `conf-${chunk.function_call_id}`, role: "assistant" as const, content: "",
                    toolConfirmation: { function_call_id: chunk.function_call_id!, hint: chunk.hint || "Approve?", tool_name: chunk.tool_name || "", args: chunk.args || {} },
                  }]);
                }
              }
            } catch (err) {
              console.error("[CONFIRM] Error:", err);
              setMessages((prev) => prev.map((m) => m.id === resumeMsgId ? { ...m, content: `Error: ${err instanceof Error ? err.message : "Failed"}` } : m));
            }
            setIsLoading(false);
          }}
          isLoading={isLoading}
          placeholder={`Message ${agentName}...`}
          emptyState={
            <div className="text-center">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
                <Bot className="size-6 text-primary" />
              </div>
              <h3 className="font-medium text-foreground">{agentName}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {sessionId
                  ? "Continue the conversation"
                  : "Ask me anything to start a new conversation"}
              </p>
            </div>
          }
          />
        </div>

        {/* History overlay */}
        {showHistory && (
          <div className="absolute inset-0 z-10 flex flex-col bg-background">
            <div className="flex-1 overflow-y-auto p-2">
              {sessionsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <div className="rounded-full bg-muted p-3 mb-3">
                    <MessageSquare className="size-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No conversations yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Start chatting to create one
                  </p>
                </div>
              ) : (
                <ul className="space-y-1">
                  {sessions.map((s) => {
                    const isActive = sessionId === s.session_id;
                    return (
                      <li key={s.session_id} className="group">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            handleSelectSession(s.session_id);
                            setShowHistory(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleSelectSession(s.session_id);
                              setShowHistory(false);
                            }
                          }}
                          className={`flex items-start gap-2 rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
                            isActive
                              ? "bg-primary/5 ring-1 ring-primary/20"
                              : "hover:bg-muted/60"
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-sm font-medium truncate ${
                                isActive ? "text-foreground" : "text-foreground/90"
                              }`}
                            >
                              {s.title || "New conversation"}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                              <span className="flex items-center gap-0.5">
                                <MessageSquare className="size-3" />
                                {s.message_count}
                              </span>
                              <span className="flex items-center gap-0.5">
                                <Clock className="size-3" />
                                {formatRelativeTime(s.last_updated)}
                              </span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 shrink-0 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSession(s.session_id);
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const historyColumns: ColumnDef<HistoryItem>[] = [
  { accessorKey: "title", header: "Title" },
  { accessorKey: "messages", header: "Messages" },
  { accessorKey: "date", header: "Date" },
];

function toApiFilters(filters: ColumnFilter[]) {
  const fieldMap: Record<string, string> = {
    messages: "message_count",
    date: "last_update_time",
  };
  return filters.map((filter) => ({
    filterField: fieldMap[filter.id] ?? filter.id,
    filterOp: filter.type,
    filterValue: filter.type === "empty" || filter.type === "notEmpty" ? null : filter.value,
  }));
}

function toApiSort(sorting: SortingState): { sortField?: string; sortOrder?: "asc" | "desc" } {
  if (!sorting.length) return {};
  const primary = sorting[0];
  const sortFieldMap: Record<string, string> = {
    messages: "message_count",
    date: "last_update_time",
  };
  return {
    sortField: sortFieldMap[primary.id] ?? primary.id,
    sortOrder: primary.desc ? "desc" : "asc",
  };
}

function IntegrationCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6 shrink-0"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </Button>
  );
}

function IntegrationEndpointRow({
  method,
  url,
  description,
  body,
}: {
  method: string;
  url: string;
  description: string;
  body?: string;
}) {
  const methodColor =
    method === "GET"
      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
      : method === "POST"
        ? "bg-green-500/10 text-green-600 dark:text-green-400"
        : method === "DELETE"
          ? "bg-red-500/10 text-red-600 dark:text-red-400"
          : "bg-muted text-muted-foreground";

  // The row shows — and its copy button copies — a ready-to-run curl, not the bare URL.
  const curl = [
    `curl -X ${method} "${url}"`,
    `  -H "X-API-Key: YOUR_API_KEY"`,
    ...(body ? [`  -H "Content-Type: application/json"`, `  -d '${body}'`] : []),
  ].join(" \\\n");

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 font-mono text-[10px] font-bold",
            methodColor
          )}
        >
          {method}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          {url}
        </span>
        <IntegrationCopyButton text={curl} />
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-[11px] leading-relaxed">
        {curl}
      </pre>
    </div>
  );
}

function CodeBlock({ code, id }: { code: string; id: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="relative">
      <pre className="rounded-lg bg-muted p-4 font-mono text-sm overflow-x-auto pr-12 whitespace-pre-wrap leading-relaxed">
        {code}
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-7 w-7 opacity-50 hover:opacity-100 "
        onClick={() => {
          navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

function IntegrateContent({
  agentId,
  agentName,
}: {
  agentId: number;
  agentName: string;
}) {
  const [a2aReloading, setA2aReloading] = React.useState(false);
  const [agentMeta, setAgentMeta] = React.useState<IntegrationAgent | null>(null);
  const [activeSection, setActiveSection] = React.useState("endpoint");

  const [message, setMessage] = React.useState("");
  const [chatSessionId, setChatSessionId] = React.useState<string | null>(null);
  const [chatResponse, setChatResponse] = React.useState("");
  const [chatLoading, setChatLoading] = React.useState(false);

  const baseUrl = typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_BASE_URL ?? window.location.origin.replace(":3000", ":8000"))
    : process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
  const base = baseUrl.replace(/\/$/, "");
  const runUrl = `${base}/api/v1/agents/${agentId}/run`;

  React.useEffect(() => {
    let cancelled = false;
    getIntegrationAgent(agentId)
      .then((data) => { if (!cancelled) setAgentMeta(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [agentId]);

  const handleReloadA2A = async () => {
    setA2aReloading(true);
    try { await reloadA2A(agentId); } catch {} finally { setA2aReloading(false); }
  };

  const handleChat = async () => {
    if (!message.trim() || chatLoading) return;
    setChatLoading(true);
    setChatResponse("");
    try {
      const res = await chatSync(agentId, message.trim(), chatSessionId);
      setChatSessionId(res.session_id);
      setChatResponse(res.response);
    } catch (e: unknown) {
      setChatResponse(`Error: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setChatLoading(false);
    }
  };

  const a2aUrl = agentMeta?.a2a_url || `${base}/a2a/${agentId}/`;
  const agentCardUrl = `${a2aUrl}.well-known/agent.json`;
  const chatEndpoint = `${base}/api/v1/integration/agents/${agentId}/chat`;
  const chatSyncEndpoint = `${base}/api/v1/integration/agents/${agentId}/chat/sync`;
  const sessionsEndpoint = `${base}/api/v1/integration/agents/${agentId}/sessions`;

  const curlExample = `curl -X POST "${runUrl}" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Hello"}'`;

  const nodeExample = `const response = await fetch("${runUrl}", {
  method: "POST",
  headers: {
    "X-API-Key": "YOUR_API_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ message: "Hello" }),
});
const reader = response.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const data = decoder.decode(value);
  for (const line of data.split("\\n\\n")) {
    if (line.startsWith("data: ")) {
      const json = JSON.parse(line.slice(6));
      if (json.text) process.stdout.write(json.text);
    }
  }
}`;

  const pythonExample = `import requests

url = "${runUrl}"
headers = {
    "X-API-Key": "YOUR_API_KEY",
    "Content-Type": "application/json",
}
data = {"message": "Hello"}

response = requests.post(url, headers=headers, json=data, stream=True)
for line in response.iter_lines():
    if line and line.startswith(b"data: "):
        import json
        d = json.loads(line[6:].decode())
        if d.get("text"):
            print(d["text"], end="")`;

  const navSections = [
    { id: "endpoint", title: "API Endpoint", icon: Link2 },
    { id: "examples", title: "Code Examples", icon: Wrench },
    { id: "a2a", title: "A2A Protocol", icon: Globe },
    { id: "tester", title: "Quick Tester", icon: Play },
    { id: "reference", title: "API Reference", icon: Link2 },
  ];
  const currentSection = navSections.some((s) => s.id === activeSection) ? activeSection : "endpoint";

  return (
    <div className="mx-auto grid w-full max-w-full gap-6 lg:grid-cols-[224px_minmax(0,1fr)]">
      {/* Section nav — click a title to show it on the right */}
      <nav className="flex flex-row gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {navSections.map((s) => {
          const SIcon = s.icon;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveSection(s.id)}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                currentSection === s.id
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <SIcon className="size-4 shrink-0" />
              <span className="whitespace-nowrap">{s.title}</span>
            </button>
          );
        })}
      </nav>

      {/* Section content */}
      <div className="min-w-0">
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className={cn(currentSection !== "endpoint" && "hidden")}>
            <PanelSection
              flat
              icon={Link2}
              title="API Endpoint"
              description="Use your API key from Config to call this agent externally."
              bodyClassName="flex flex-col gap-4"
            >
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
            <span className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold bg-success/15 text-success">
              POST
            </span>
            <code className="min-w-0 flex-1 truncate font-mono text-sm text-muted-foreground">
              {runUrl}
            </code>
            <IntegrationCopyButton text={curlExample} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Headers</span>
              <div className="rounded-lg bg-muted px-3 py-2 font-mono text-xs leading-relaxed">
                <div>X-API-Key: YOUR_API_KEY</div>
                <div>Content-Type: application/json</div>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Request Body</span>
              <div className="rounded-lg bg-muted px-3 py-2 font-mono text-xs leading-relaxed">
                <div>{`{ "message": "Hello",`}</div>
                <div>{`  "session_id": null }`}</div>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Response: SSE stream — each event: <code className="rounded bg-muted px-1 text-[10px]">{"data: {\"type\":\"text\",\"text\":\"...\"}"}</code>
          </p>
            </PanelSection>
          </div>

          <div className={cn(currentSection !== "examples" && "hidden")}>
            <PanelSection flat icon={Wrench} title="Code Examples" description="Drop-in snippets to stream from this agent.">
          <Tabs defaultValue="curl">
            <TabsList variant="line">
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="nodejs">Node.js</TabsTrigger>
              <TabsTrigger value="python">Python</TabsTrigger>
            </TabsList>
            <TabsContent value="curl" className="mt-3">
              <CodeBlock code={curlExample} id="curl" />
            </TabsContent>
            <TabsContent value="nodejs" className="mt-3">
              <CodeBlock code={nodeExample} id="node" />
            </TabsContent>
            <TabsContent value="python" className="mt-3">
              <CodeBlock code={pythonExample} id="python" />
            </TabsContent>
          </Tabs>
            </PanelSection>
          </div>

          <div className={cn(currentSection !== "a2a" && "hidden")}>
            <PanelSection
              flat
              icon={Globe}
              title="A2A Protocol"
          description="Access this agent via the Agent-to-Agent (A2A) protocol."
          action={agentMeta?.model ? <Badge variant="secondary">{agentMeta.model}</Badge> : undefined}
          bodyClassName="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">A2A Endpoint</span>
            <div className="flex items-center gap-1 rounded-lg border bg-muted/40 px-3 py-1.5 font-mono text-xs">
              <span className="min-w-0 flex-1 truncate">{a2aUrl}</span>
              <IntegrationCopyButton text={a2aUrl} />
              <a href={agentCardUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
              </a>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={a2aReloading}
            onClick={handleReloadA2A}
          >
            <RefreshCw className={cn("mr-1.5 h-3 w-3", a2aReloading && "animate-spin")} />
            {a2aReloading ? "Reloading…" : "Reload A2A"}
          </Button>
            </PanelSection>
          </div>

          <div className={cn(currentSection !== "tester" && "hidden")}>
            <PanelSection
              flat
              icon={Play}
              title="Quick Tester"
          description="Send a message and see the response via the sync chat endpoint."
          action={
            chatSessionId ? (
              <Badge variant="secondary" className="font-mono text-[10px]">
                {chatSessionId.slice(0, 8)}…
              </Badge>
            ) : undefined
          }
          bodyClassName="flex flex-col gap-3"
        >
          <div className="flex gap-2">
            <Input
              placeholder="Type a message…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleChat()}
              disabled={chatLoading}
              className="flex-1"
            />
            <Button size="sm" disabled={chatLoading || !message.trim()} onClick={handleChat}>
              {chatLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            </Button>
          </div>
          {chatResponse && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
              {chatResponse}
            </div>
          )}
            </PanelSection>
          </div>

          <div className={cn(currentSection !== "reference" && "hidden")}>
            <PanelSection flat icon={Link2} title="API Reference" description="All endpoints for this agent." bodyClassName="flex flex-col gap-3">
          <IntegrationEndpointRow
            method="POST"
            url={chatEndpoint}
            description="Stream chat (SSE)"
            body='{ "message": "Hello", "session_id": null }'
          />
          <Separator />
          <IntegrationEndpointRow
            method="POST"
            url={chatSyncEndpoint}
            description="Sync chat (returns full response)"
            body='{ "message": "Hello", "session_id": null }'
          />
          <Separator />
          <IntegrationEndpointRow
            method="GET"
            url={sessionsEndpoint}
            description="List sessions"
          />
          <Separator />
          <IntegrationEndpointRow
            method="GET"
            url={`${sessionsEndpoint}/{session_id}`}
            description="Get session messages / history"
          />
          <Separator />
          <IntegrationEndpointRow
            method="DELETE"
            url={`${sessionsEndpoint}/{session_id}`}
            description="Delete a session"
          />
          <Separator />
          <IntegrationEndpointRow
            method="GET"
            url={agentCardUrl}
            description="A2A Agent Card"
          />
            </PanelSection>
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryContent({
  agentId,
  onSelectSession,
}: {
  agentId: number | null;
  onSelectSession: (sessionId: string) => void;
}) {
  const [sessions, setSessions] = React.useState<AgentSessionItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [query, setQuery] = React.useState({
    search: "",
    filters: [] as ColumnFilter[],
    pageIndex: 0,
    pageSize: 10,
    sorting: [] as SortingState,
  });

  const fetchData = React.useCallback(
    async (nextQuery = query, signal?: AbortSignal) => {
      if (!agentId) {
        setSessions([]);
        setTotal(0);
        return;
      }
      setLoading(true);
      try {
        const { items, pagination } = await listAgentSessions(
          agentId,
          {
            limit: nextQuery.pageSize,
            offset: nextQuery.pageIndex * nextQuery.pageSize,
            search: nextQuery.search || undefined,
            filters: nextQuery.filters.length ? toApiFilters(nextQuery.filters) : undefined,
            ...toApiSort(nextQuery.sorting),
          },
          signal
        );
        setSessions(items);
        setTotal(pagination.total ?? items.length);
      } catch {
        setSessions([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [agentId, query]
  );

  React.useEffect(() => {
    const controller = new AbortController();
    fetchData(query, controller.signal);
    return () => controller.abort();
  }, [fetchData, query]);

  const handleQueryChange = React.useCallback(
    (next: {
      search: string;
      filters: ColumnFilter[];
      pageIndex: number;
      pageSize: number;
      sorting: SortingState;
    }) => {
      setQuery(next);
    },
    []
  );

  const data: HistoryItem[] = React.useMemo(
    () =>
      sessions.map((s) => ({
        id: s.session_id,
        title: s.title || "New conversation",
        preview: s.title || "New conversation",
        messages: s.message_count,
        date: new Date((s.last_updated || 0) * 1000).toLocaleDateString(),
      })),
    [sessions]
  );

  return (
    <DataTable
      columns={historyColumns}
      data={data}
      searchPlaceholder="Search sessions..."
      pagination={true}
      pageSize={10}
      serverSide={true}
      rowCount={total}
      loading={loading}
      onQueryChange={handleQueryChange}
      emptyState={
        <div className="text-center py-8">
          <History className="mx-auto size-8 text-muted-foreground mb-2" />
          <p className="text-muted-foreground">
            {loading ? "Loading..." : agentId ? "No conversation history yet" : "Save the agent first"}
          </p>
        </div>
      }
      onRowClick={agentId ? (row) => onSelectSession(row.original.id) : undefined}
    />
  );
}

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const agentId = params.id as string;

  const [agent, setAgent] = React.useState<AgentItem | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [formState, setFormState] = React.useState<AgentFormState>(emptyForm);
  const [saving, setSaving] = React.useState(false);
  const [builtinTools, setBuiltinTools] = React.useState<string[]>([]);
  const [mcpConnections, setMcpConnections] = React.useState<
    { id: number; name: string }[]
  >([]);
  const [databaseConnections, setDatabaseConnections] = React.useState<
    { id: number; name: string }[]
  >([]);
  const [prompts, setPrompts] = React.useState<PromptLibraryItem[]>([]);
  const [allAgents, setAllAgents] = React.useState<AgentItem[]>([]);
  const [allSkills, setAllSkills] = React.useState<SkillItem[]>([]);
  const [activeTabId, setActiveTabId] = React.useState<string | number>("configuration");
  const [sessionToLoad, setSessionToLoad] = React.useState<string | null>(null);
  const [chatOpen, setChatOpen] = React.useState(false);

  const handleSessionLoaded = React.useCallback(() => {
    setSessionToLoad(null);
  }, []);

  // Load session from URL ?session=xxx (e.g. from a shared session link)
  React.useEffect(() => {
    const session = searchParams.get("session");
    if (session && agentId !== "new") {
      setSessionToLoad(session);
      setChatOpen(true);
    }
  }, [searchParams, agentId]);

  const normalizeToolsFromApi = (raw: unknown): AgentFormState["tools"] => {
    if (Array.isArray(raw)) return raw as AgentFormState["tools"];
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? (parsed as AgentFormState["tools"]) : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const normalizeToolEntry = (t: Record<string, unknown>): AgentFormState["tools"][number] => {
    if (t.type === "mcp" && t.mcp_connection_id != null) {
      return { ...t, mcp_connection_id: Number(t.mcp_connection_id) } as AgentFormState["tools"][number];
    }
    if (t.type === "database" && t.database_connection_id != null) {
      return { ...t, database_connection_id: Number(t.database_connection_id) } as AgentFormState["tools"][number];
    }
    return t as AgentFormState["tools"][number];
  };

  React.useEffect(() => {
    if (agentId !== "new") {
      getAgent(parseInt(agentId, 10))
        .then((a) => {
          setAgent(a);
          const tools = normalizeToolsFromApi(a.tools).map(normalizeToolEntry);
          const extra = ensureExtraFields(a.extra_fields);
          const a2aRaw = extra.a2a_connections;
          const a2a_connections: A2aConnection[] = Array.isArray(a2aRaw)
            ? a2aRaw
                .filter((c): c is { url?: string; name?: string; headers?: unknown; metadata?: unknown } => c != null && typeof c === "object")
                .map((c) => ({
                  url: String(c.url ?? "").trim(),
                  name: String(c.name ?? "external_agent").trim() || "external_agent",
                  headers:
                    c.headers && typeof c.headers === "object" && !("__enc__" in (c.headers as object))
                      ? (c.headers as Record<string, string>)
                      : undefined,
                  metadata:
                    c.metadata && typeof c.metadata === "object" && !Array.isArray(c.metadata)
                      ? (c.metadata as Record<string, unknown>)
                      : undefined,
                }))
                .filter((c) => c.url)
            : [];
          const agentType = (extra.type === "a2a" || extra.agent_type === "a2a" || extra.a2a_url)
            ? "a2a" as const
            : "local" as const;
          const a2aHeadersVal = extra.a2a_headers;
          const a2a_headers_str =
            typeof a2aHeadersVal === "string"
              ? a2aHeadersVal
              : a2aHeadersVal != null
                ? JSON.stringify(a2aHeadersVal, null, 2)
                : "";
          const a2aMetadataVal = extra.a2a_metadata;
          const a2a_metadata_str =
            typeof a2aMetadataVal === "string"
              ? a2aMetadataVal
              : a2aMetadataVal != null
                ? JSON.stringify(a2aMetadataVal, null, 2)
                : "";
          setFormState({
            agent_type: agentType,
            name: a.name,
            label: a.label,
            model: a.model,
            description: a.description ?? "",
            system_prompt: a.system_prompt ?? "",
            system_prompt_id: a.system_prompt_id ?? null,
            instruction: a.instruction ?? "",
            instruction_prompt_id: a.instruction_prompt_id,
            tools,
            is_orchestrator: a.is_orchestrator,
            sub_agent_ids: a.sub_agent_ids ?? [],
            skill_ids: a.skill_ids ?? [],
            a2a_connections,
            a2a_url: String(extra.a2a_url ?? ""),
            a2a_headers: a2a_headers_str,
            a2a_metadata: a2a_metadata_str,
          });
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [agentId]);

  React.useEffect(() => {
    getBuiltinTools().then(setBuiltinTools).catch(() => { });
  }, []);

  React.useEffect(() => {
    listMcpConnections({ limit: 100, offset: 0 })
      .then((r) =>
        setMcpConnections(r.items.map((c) => ({ id: c.id, name: c.name })))
      )
      .catch(() => { });
  }, []);

  React.useEffect(() => {
    listDatabaseConnections({ limit: 100, offset: 0 })
      .then(({ items }) =>
        setDatabaseConnections(items.map((c) => ({ id: c.id, name: c.name })))
      )
      .catch(() => { });
  }, []);

  React.useEffect(() => {
    listPrompts({ limit: 100, offset: 0 })
      .then((r) => setPrompts(r.items))
      .catch(() => { });
  }, []);

  React.useEffect(() => {
    listAgents({ limit: 200, offset: 0 })
      .then((r) => setAllAgents(r.items))
      .catch(() => { });
  }, []);

  React.useEffect(() => {
    listSkills({ limit: 200, offset: 0 })
      .then((r) => setAllSkills(r.items))
      .catch(() => { });
  }, []);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const baseExtra = ensureExtraFields(agent?.extra_fields);
      const extraFields: Record<string, unknown> = {
        ...baseExtra,
        a2a_connections: formState.a2a_connections
          .filter((c) => c.url.trim())
          .map((c) => ({
            url: c.url.trim(),
            name: c.name || "external_agent",
            ...(c.headers && Object.keys(c.headers).length ? { headers: c.headers } : {}),
            ...(c.metadata && Object.keys(c.metadata).length ? { metadata: c.metadata } : {}),
          })),
      };
      if (formState.agent_type === "a2a") {
        extraFields.type = "a2a";
        extraFields.a2a_url = formState.a2a_url.trim() || null;
        let headersObj: Record<string, string> = {};
        if (formState.a2a_headers.trim()) {
          try {
            const parsed = JSON.parse(formState.a2a_headers);
            if (parsed && typeof parsed === "object") {
              headersObj = { ...headersObj, ...parsed };
            }
          } catch {
            // ignore invalid JSON
          }
        }
        extraFields.a2a_headers = headersObj;
        let metadataObj: Record<string, unknown> = {};
        if (formState.a2a_metadata.trim()) {
          try {
            const parsed = JSON.parse(formState.a2a_metadata);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              metadataObj = parsed as Record<string, unknown>;
            }
          } catch {
            // ignore invalid JSON
          }
        }
        extraFields.a2a_metadata = metadataObj;
      } else {
        delete extraFields.type;
        delete extraFields.a2a_url;
        delete extraFields.a2a_headers;
        delete extraFields.a2a_metadata;
      }
      const payload: AgentPayload = {
        name: formState.name,
        label: formState.label,
        model: formState.model,
        description: formState.description || null,
        system_prompt: formState.agent_type === "local" ? formState.system_prompt || null : null,
        system_prompt_id: formState.agent_type === "local" ? formState.system_prompt_id : null,
        instruction: formState.agent_type === "local" ? formState.instruction || null : null,
        instruction_prompt_id: formState.agent_type === "local" ? formState.instruction_prompt_id : null,
        tools: formState.agent_type === "local" && Array.isArray(formState.tools) ? formState.tools : [],
        is_orchestrator: formState.agent_type === "local" ? formState.is_orchestrator : false,
        sub_agent_ids: formState.agent_type === "local" ? formState.sub_agent_ids : [],
        skill_ids: formState.agent_type === "local" ? formState.skill_ids : [],
        extra_fields: extraFields,
      };
      if (agentId === "new") {
        const created = await createAgent(payload);
        router.push(`/agents/${created.id}`);
      } else {
        await updateAgent(parseInt(agentId, 10), payload);
        const updated = await getAgent(parseInt(agentId, 10));
        setAgent(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const agentName = (agent?.label ?? formState.label) || "New Agent";

  const config: TabConfig = {
    id: agentId,
    tabName: agentName,
    description:
      agentId === "new"
        ? "Configure your new agent, then save to enable chat and integrations."
        : formState.agent_type === "a2a"
          ? "External A2A agent"
          : `Local agent · ${formState.model || "model not set"}`,
    items: [
      {
        id: "configuration",
        name: "Configuration",
        icon: <Settings2 className="size-4" />,
        component: (
          <ConfigurationContent
            agentId={agentId}
            agent={agent}
            formState={formState}
            setFormState={setFormState}
            onSubmit={handleSubmit}
            saving={saving}
            builtinTools={builtinTools}
            mcpConnections={mcpConnections}
            databaseConnections={databaseConnections}
            prompts={prompts}
            allAgents={allAgents}
            allSkills={allSkills}
          />
        ),
      },
      ...(agentId !== "new"
        ? [
            {
              id: "integrate",
              name: "Integrate",
              icon: <Link2 className="size-4" />,
              component: (
                <IntegrateContent
                  agentId={parseInt(agentId, 10)}
                  agentName={agentName}
                />
              ),
            } as const,
          ]
        : []),
    ],
    headerActions: (
      <Button onClick={() => setChatOpen(true)} className="gap-2">
        <MessageSquare className="size-4" />
        Chat
      </Button>
    ),
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex flex-col">
          <div className="border-b border-border px-6 pb-4 pt-6">
            <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
            <div className="mt-2 h-4 w-64 animate-pulse rounded-md bg-muted/70" />
            <div className="mt-4 flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-8 w-28 animate-pulse rounded-lg bg-muted/70" />
              ))}
            </div>
          </div>
          <div className="grid gap-6 p-6 lg:grid-cols-3">
            <div className="h-96 animate-pulse rounded-xl border bg-card lg:col-span-2" />
            <div className="h-96 animate-pulse rounded-xl border bg-card" />
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {error && (
        <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}
      <TabLayout
        config={config}
        activeTabId={activeTabId}
        onTabChange={setActiveTabId}
      />

      {/* Chat slide-over — lockClose so an in-progress run isn't lost by an accidental dismiss */}
      <ResizableDrawer open={chatOpen} onOpenChange={setChatOpen} defaultWidth={520} lockClose>
        <SheetTitle className="sr-only">Chat with {agentName}</SheetTitle>
        <ChatTab
          agentName={agentName}
          agentId={agentId === "new" ? null : parseInt(agentId, 10)}
          sessionToLoad={sessionToLoad}
          onSessionLoaded={handleSessionLoaded}
          onClose={() => setChatOpen(false)}
        />
      </ResizableDrawer>
    </AppLayout>
  );
}
