"use client";

import * as React from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { TabLayout, TabConfig } from "@/components/ui/tab-layout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SheetClose,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ResizableDrawer } from "@/components/ui/resizable-drawer";
import {
  listMcpConnections,
  listMcpConnectionTools,
  callMcpTool,
  McpConnectionItem,
  McpToolInfo,
} from "@/lib/api/mcp-connections";
import { Puzzle, Play, Loader2, AlertCircle, AlertTriangle, Wrench, CheckCircle2, Search, X, Copy, Check } from "lucide-react";
import { MdRenderer } from "@/components/ui/md-renderer";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import Link from "next/link";

/** Build default args JSON from inputSchema (JSON Schema) */
function buildDefaultArgs(schema: Record<string, unknown> | undefined): string {
  if (!schema || typeof schema !== "object") return "{}";
  const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!props || typeof props !== "object") return "{}";
  const defaults: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(props)) {
    if (!prop || typeof prop !== "object") continue;
    const t = (prop.type as string) || "string";
    if (t === "string") defaults[key] = prop.default ?? "";
    else if (t === "number" || t === "integer") defaults[key] = prop.default ?? 0;
    else if (t === "boolean") defaults[key] = prop.default ?? false;
    else if (t === "array") defaults[key] = prop.default ?? [];
    else if (t === "object") defaults[key] = prop.default ?? {};
    else defaults[key] = prop.default ?? "";
  }
  return JSON.stringify(defaults, null, 2);
}

type SchemaProp = Record<string, unknown>;

function getSchemaProps(schema: unknown): {
  props: [string, SchemaProp][];
  required: string[];
} {
  if (!schema || typeof schema !== "object") return { props: [], required: [] };
  const s = schema as { properties?: Record<string, SchemaProp>; required?: string[] };
  const props =
    s.properties && typeof s.properties === "object" ? Object.entries(s.properties) : [];
  const required = Array.isArray(s.required) ? s.required : [];
  return { props, required };
}

/** Initial form value for a property (arrays/objects are held as JSON text). */
function defaultForProp(prop: SchemaProp): unknown {
  const t = (prop.type as string) || "string";
  if (t === "boolean") return prop.default ?? false;
  if (t === "number" || t === "integer") return prop.default ?? "";
  if (t === "array") return JSON.stringify(prop.default ?? [], null, 2);
  if (t === "object") return JSON.stringify(prop.default ?? {}, null, 2);
  return prop.default ?? "";
}

function buildDefaultValues(schema: unknown): Record<string, unknown> {
  const { props } = getSchemaProps(schema);
  const out: Record<string, unknown> = {};
  for (const [name, prop] of props) out[name] = defaultForProp(prop);
  return out;
}

function buildArgsFromValues(
  schema: unknown,
  values: Record<string, unknown>
): Record<string, unknown> {
  const { props, required } = getSchemaProps(schema);
  const args: Record<string, unknown> = {};
  for (const [name, prop] of props) {
    const t = (prop.type as string) || "string";
    const v = values[name];
    if (t === "boolean") {
      args[name] = !!v;
    } else if (t === "number" || t === "integer") {
      if (v === "" || v == null) {
        if (required.includes(name)) args[name] = 0;
        continue;
      }
      const n = Number(v);
      args[name] = Number.isNaN(n) ? v : n;
    } else if (t === "array" || t === "object") {
      const s = typeof v === "string" ? v.trim() : "";
      if (!s) {
        if (required.includes(name)) args[name] = t === "array" ? [] : {};
        continue;
      }
      try {
        args[name] = JSON.parse(s);
      } catch {
        args[name] = s;
      }
    } else {
      if ((v === "" || v == null) && !required.includes(name)) continue;
      args[name] = v ?? "";
    }
  }
  return args;
}

function SchemaField({
  name,
  prop,
  required,
  value,
  onChange,
}: {
  name: string;
  prop: SchemaProp;
  required: boolean;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const type = (prop.type as string) || "string";
  const enumVals = Array.isArray(prop.enum) ? (prop.enum as unknown[]) : null;
  const description = typeof prop.description === "string" ? prop.description : null;

  let control: React.ReactNode;
  if (enumVals) {
    control = (
      <Select value={String(value ?? "")} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {enumVals.map((e) => (
            <SelectItem key={String(e)} value={String(e)}>
              {String(e)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  } else if (type === "boolean") {
    control = (
      <div className="flex items-center gap-2">
        <Switch checked={!!value} onCheckedChange={onChange} />
        <span className="text-sm text-muted-foreground">{value ? "true" : "false"}</span>
      </div>
    );
  } else if (type === "number" || type === "integer") {
    control = (
      <Input
        type="number"
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
      />
    );
  } else if (type === "array" || type === "object") {
    control = (
      <Textarea
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        placeholder={type === "array" ? "[]" : "{}"}
        className="min-h-[90px] font-mono text-xs"
      />
    );
  } else {
    control = (
      <Input
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        placeholder={description ? "" : name}
      />
    );
  }

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1 font-mono text-xs">
        {name}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {control}
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

export default function McpTesterPage() {
  const [connections, setConnections] = React.useState<McpConnectionItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    listMcpConnections({ limit: 100, offset: 0 })
      .then(({ items }) => {
        if (mounted) setConnections(items);
      })
      .catch((err) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load MCP connections");
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex flex-col">
          <div className="border-b border-border px-6 pb-4 pt-6">
            <div className="h-7 w-40 animate-pulse rounded-md bg-muted" />
            <div className="mt-4 flex gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-8 w-28 animate-pulse rounded-lg bg-muted/70" />
              ))}
            </div>
          </div>
          <div className="grid gap-3 p-6 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl border bg-card" />
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="m-6 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      </AppLayout>
    );
  }

  if (connections.length === 0) {
    return (
      <AppLayout>
        <div className="mx-auto mt-10 max-w-md rounded-2xl border border-dashed bg-card p-12 text-center shadow-sm">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Puzzle className="size-7" />
          </div>
          <h2 className="mb-1.5 text-lg font-semibold tracking-tight">No MCP connections</h2>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            Connect an MCP server to test its tools here.
          </p>
          <Button className="mt-5" asChild>
            <Link href="/mcp-connections">Add a connection</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  const config: TabConfig = {
    id: "mcp-tester",
    tabName: "MCP Tester",
    description: "Test MCP tools by calling them with custom arguments",
    items: connections.map((conn) => ({
      id: conn.id,
      name: conn.name,
      icon: <Wrench className="size-4" />,
      component: <McpToolsPanel connection={conn} />,
    })),
  };

  return (
    <AppLayout>
      <TabLayout config={config} />
    </AppLayout>
  );
}

function McpToolsPanel({ connection }: { connection: McpConnectionItem }) {
  const [tools, setTools] = React.useState<McpToolInfo[]>([]);
  const [toolsLoading, setToolsLoading] = React.useState(true);
  const [toolsError, setToolsError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [activeTool, setActiveTool] = React.useState<McpToolInfo | null>(null);

  React.useEffect(() => {
    let mounted = true;
    setToolsLoading(true);
    setToolsError(null);
    listMcpConnectionTools(connection.id)
      .then((list) => {
        if (mounted) setTools(list);
      })
      .catch((err) => {
        if (mounted) {
          setToolsError(err instanceof Error ? err.message : "Failed to load tools");
        }
      })
      .finally(() => {
        if (mounted) setToolsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [connection.id]);

  if (toolsLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border bg-card" />
        ))}
      </div>
    );
  }

  if (toolsError) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <AlertTriangle className="size-4 shrink-0" />
        {toolsError}
      </div>
    );
  }

  if (tools.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-card p-10 text-center shadow-sm">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Wrench className="size-6" />
        </div>
        <p className="text-sm text-muted-foreground">No tools exposed by this MCP server.</p>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? tools.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q)
      )
    : tools;

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={`Search ${connection.name} tools…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{filtered.length}</span> tool{filtered.length === 1 ? "" : "s"}
        {q && tools.length !== filtered.length ? ` of ${tools.length}` : ""} available
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">No tools match “{query}”.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((tool) => (
            <ToolCard key={tool.name} tool={tool} onTest={() => setActiveTool(tool)} />
          ))}
        </div>
      )}

      <ToolCallDrawer
        connection={connection}
        tool={activeTool}
        open={!!activeTool}
        onOpenChange={(o) => !o && setActiveTool(null)}
      />
    </div>
  );
}

function ToolCard({ tool, onTest }: { tool: McpToolInfo; onTest: () => void }) {
  const requiredProps = React.useMemo(() => {
    const schema = tool.inputSchema;
    if (!schema || typeof schema !== "object") return [] as string[];
    const required = (schema as { required?: string[] }).required;
    return Array.isArray(required) ? required : [];
  }, [tool.inputSchema]);

  return (
    <button
      type="button"
      onClick={onTest}
      className="group flex h-full flex-col rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Wrench className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-mono text-sm font-semibold text-foreground">{tool.name}</h3>
          {tool.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{tool.description}</p>
          )}
        </div>
        <span className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors group-hover:text-primary">
          <Play className="size-3.5" />
          <span className="hidden sm:inline">Test</span>
        </span>
      </div>
      {requiredProps.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Required:</span>
          {requiredProps.map((p) => (
            <Badge key={p} variant="secondary" className="border-0 font-mono text-[10px]">
              {p}
            </Badge>
          ))}
        </div>
      )}
    </button>
  );
}

function ToolCallDrawer({
  connection,
  tool,
  open,
  onOpenChange,
}: {
  connection: McpConnectionItem;
  tool: McpToolInfo | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [mode, setMode] = React.useState<"form" | "json">("form");
  const [values, setValues] = React.useState<Record<string, unknown>>({});
  const [argsJson, setArgsJson] = React.useState("{}");
  const [calling, setCalling] = React.useState(false);
  const [result, setResult] = React.useState<{
    content: Array<{ type?: string; text?: string }>;
    isError: boolean;
    structuredContent?: Record<string, unknown>;
  } | null>(null);

  const { props: schemaProps, required: requiredProps } = React.useMemo(
    () => getSchemaProps(tool?.inputSchema),
    [tool]
  );
  const hasFields = schemaProps.length > 0;

  React.useEffect(() => {
    if (tool) {
      setValues(buildDefaultValues(tool.inputSchema));
      setArgsJson(buildDefaultArgs(tool.inputSchema as Record<string, unknown>));
      setMode(getSchemaProps(tool.inputSchema).props.length > 0 ? "form" : "json");
      setResult(null);
    }
  }, [tool]);

  const setValue = (name: string, v: unknown) =>
    setValues((prev) => ({ ...prev, [name]: v }));

  const switchMode = (next: "form" | "json") => {
    if (next === mode) return;
    if (next === "json") {
      setArgsJson(JSON.stringify(buildArgsFromValues(tool?.inputSchema, values), null, 2));
    } else {
      try {
        const parsed = argsJson.trim() ? JSON.parse(argsJson) : {};
        if (parsed && typeof parsed === "object") {
          const nextValues: Record<string, unknown> = { ...buildDefaultValues(tool?.inputSchema) };
          for (const [name, prop] of schemaProps) {
            if (!(name in parsed)) continue;
            const t = (prop.type as string) || "string";
            const pv = (parsed as Record<string, unknown>)[name];
            nextValues[name] = t === "array" || t === "object" ? JSON.stringify(pv, null, 2) : pv;
          }
          setValues(nextValues);
        }
      } catch {
        // keep current form values if JSON is invalid
      }
    }
    setMode(next);
  };

  const handleCall = async () => {
    if (!tool) return;
    let args: Record<string, unknown> = {};
    if (mode === "form") {
      args = buildArgsFromValues(tool.inputSchema, values);
    } else {
      try {
        args = argsJson.trim() ? JSON.parse(argsJson) : {};
      } catch {
        setResult({ content: [{ text: "Invalid JSON in arguments" }], isError: true });
        return;
      }
    }
    setCalling(true);
    setResult(null);
    try {
      const res = await callMcpTool(connection.id, tool.name, args);
      setResult(res);
    } catch (err) {
      setResult({
        content: [{ text: err instanceof Error ? err.message : "Tool call failed" }],
        isError: true,
      });
    } finally {
      setCalling(false);
    }
  };

  return (
    <ResizableDrawer open={open} onOpenChange={onOpenChange} defaultWidth={640}>
        <div className="flex h-full flex-col">
          {/* header */}
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Wrench className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <SheetTitle className="truncate font-mono text-base">{tool?.name ?? "Tool"}</SheetTitle>
                <SheetDescription className="truncate text-xs">{connection.name}</SheetDescription>
              </div>
            </div>
            <SheetClose asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close">
                <X className="size-4" />
              </Button>
            </SheetClose>
          </div>

          {/* body */}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {tool?.description && (
              <p className="text-sm text-muted-foreground">{tool.description}</p>
            )}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Arguments</Label>
                {hasFields && (
                  <div className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => switchMode("form")}
                      className={cn(
                        "rounded-md px-2.5 py-1 transition-colors",
                        mode === "form"
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Form
                    </button>
                    <button
                      type="button"
                      onClick={() => switchMode("json")}
                      className={cn(
                        "rounded-md px-2.5 py-1 transition-colors",
                        mode === "json"
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      JSON
                    </button>
                  </div>
                )}
              </div>

              {mode === "form" && hasFields ? (
                <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
                  {schemaProps.map(([name, prop]) => (
                    <SchemaField
                      key={name}
                      name={name}
                      prop={prop}
                      required={requiredProps.includes(name)}
                      value={values[name]}
                      onChange={(v) => setValue(name, v)}
                    />
                  ))}
                </div>
              ) : (
                <Textarea
                  value={argsJson}
                  onChange={(e) => setArgsJson(e.target.value)}
                  placeholder='{"key": "value"}'
                  className="min-h-[160px] font-mono text-sm"
                />
              )}

              {tool?.inputSchema && typeof tool.inputSchema === "object" && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Raw schema
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded bg-muted/50 p-2 text-[11px]">
                    {JSON.stringify(tool.inputSchema, null, 2)}
                  </pre>
                </details>
              )}
            </div>

            {result && <ToolResult result={result} />}
          </div>

          {/* footer */}
          <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
            <SheetClose asChild>
              <Button variant="outline">Close</Button>
            </SheetClose>
            <Button onClick={handleCall} disabled={calling || !tool}>
              {calling ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Calling…
                </>
              ) : (
                <>
                  <Play className="size-4" />
                  Call tool
                </>
              )}
            </Button>
          </div>
        </div>
    </ResizableDrawer>
  );
}

/* ------------------------------------------------------------------ */
/*  Tool result display                                                */
/* ------------------------------------------------------------------ */

function tryParseJson(text: string): { parsed: unknown; isJson: boolean } {
  try {
    const parsed = JSON.parse(text);
    return { parsed, isJson: true };
  } catch {
    return { parsed: null, isJson: false };
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      disabled={!text}
      className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      aria-label="Copy output"
    >
      {copied ? <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function ToolResult({
  result,
}: {
  result: {
    content: Array<{ type?: string; text?: string }>;
    isError: boolean;
    structuredContent?: Record<string, unknown>;
  };
}) {
  const [viewMode, setViewMode] = React.useState<"formatted" | "raw">("formatted");

  // Collect all text content
  const allText = (result.content ?? []).map((b) => b.text ?? "").join("");
  const { parsed, isJson } = tryParseJson(allText);

  // Resolve the JSON payload (inline text JSON or structuredContent) and derive
  // both a pretty (indented) and a raw (minified, single-line) rendering.
  const jsonValue: unknown = isJson ? parsed : result.structuredContent ?? null;
  const hasJson = isJson || result.structuredContent != null;
  const formattedText = hasJson ? JSON.stringify(jsonValue, null, 2) : "";
  const rawText = hasJson ? JSON.stringify(jsonValue) : "";

  // What the Copy button copies: the currently-shown view for JSON, else the text.
  const copyText = hasJson
    ? viewMode === "raw"
      ? rawText
      : formattedText
    : allText || JSON.stringify(result.content, null, 2);

  return (
    <div
      className={cn(
        "rounded-xl border",
        result.isError
          ? "border-destructive/30 bg-destructive/5"
          : "border-emerald-500/30 bg-emerald-500/5"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-inherit px-4 py-2.5">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {result.isError ? (
            <>
              <AlertCircle className="size-4 text-destructive" />
              <span className="text-destructive">Error</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-emerald-700 dark:text-emerald-400">Result</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasJson && (
            <div className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setViewMode("formatted")}
                className={cn(
                  "rounded-md px-2.5 py-1 transition-colors",
                  viewMode === "formatted"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Formatted
              </button>
              <button
                type="button"
                onClick={() => setViewMode("raw")}
                className={cn(
                  "rounded-md px-2.5 py-1 transition-colors",
                  viewMode === "raw"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Raw
              </button>
            </div>
          )}
          <CopyButton text={copyText} />
        </div>
      </div>

      {/* Body */}
      <div className="max-h-[60vh] overflow-auto p-4">
        {hasJson ? (
          <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-foreground/90">
            {viewMode === "raw" ? rawText : formattedText}
          </pre>
        ) : result.content?.length ? (
          <div className="space-y-2 text-sm">
            {result.content.map((block, i) => (
              <div key={i}>
                {block.text ? (
                  <MdRenderer content={block.text} variant="docs" />
                ) : (
                  <pre className="whitespace-pre-wrap break-all font-mono text-xs">
                    {JSON.stringify(block, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">(empty response)</p>
        )}
      </div>
    </div>
  );
}
