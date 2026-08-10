"use client";

import * as React from "react";
import {
  Plus,
  Copy,
  Pencil,
  Trash2,
  FileText,
  Settings2,
  Search,
  Clock,
  Coins,
  X,
  Loader2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Eye,
  PenLine,
} from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { PageLayout } from "@/components/ui/page-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SheetClose,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ResizableDrawer } from "@/components/ui/resizable-drawer";
import { MdRenderer } from "@/components/ui/md-renderer";
import { cn } from "@/lib/utils";
import {
  createPrompt,
  deletePrompt,
  duplicatePrompt,
  listPrompts,
  updatePrompt,
  PromptLibraryItem,
  PromptLibraryFilter,
  PromptType,
} from "@/lib/api/prompt-library";

const PAGE_SIZE = 12;

interface PromptFormState {
  title: string;
  prompt: string;
  prompt_type: PromptType;
  extradata: string;
}

const emptyForm: PromptFormState = {
  title: "",
  prompt: "",
  prompt_type: "instructions",
  extradata: "",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function TypeBadge({ type }: { type?: PromptType }) {
  const isSystem = type === "system";
  return (
    <Badge
      className={cn(
        "shrink-0 border-0 font-medium",
        isSystem ? "bg-primary/10 text-primary" : "bg-info/10 text-info"
      )}
    >
      {isSystem ? "System" : "Instructions"}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/*  Markdown editor (Write / Preview)                                  */
/* ------------------------------------------------------------------ */

function MarkdownEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [tab, setTab] = React.useState<"write" | "preview">("write");
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between border-b bg-muted/40 px-2 py-1.5">
        <div className="inline-flex rounded-lg border bg-card p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setTab("write")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors",
              tab === "write" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <PenLine className="size-3.5" />
            Write
          </button>
          <button
            type="button"
            onClick={() => setTab("preview")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors",
              tab === "preview" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Eye className="size-3.5" />
            Preview
          </button>
        </div>
        <span className="pr-1 text-[11px] text-muted-foreground">Markdown supported</span>
      </div>
      {tab === "write" ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-h-[320px] resize-y rounded-none border-0 font-mono text-sm focus-visible:ring-0"
        />
      ) : (
        <div className="min-h-[320px] overflow-y-auto bg-background p-4">
          {value.trim() ? (
            <MdRenderer content={value} variant="docs" />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Editor drawer                                                      */
/* ------------------------------------------------------------------ */

function PromptEditorDrawer({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: PromptLibraryItem | null;
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState<PromptFormState>(emptyForm);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setError(null);
      if (editing) {
        setForm({
          title: editing.title,
          prompt: editing.prompt,
          prompt_type: editing.prompt_type ?? "instructions",
          extradata: editing.extradata ? JSON.stringify(editing.extradata, null, 2) : "",
        });
        setShowAdvanced(!!editing.extradata);
      } else {
        setForm(emptyForm);
        setShowAdvanced(false);
      }
    }
  }, [open, editing]);

  const handleSubmit = async () => {
    setError(null);
    let extradata: Record<string, unknown> | null = null;
    if (form.extradata.trim()) {
      try {
        extradata = JSON.parse(form.extradata);
      } catch {
        setError("Extra data must be valid JSON");
        return;
      }
    }
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updatePrompt(editing.id, {
          title: form.title,
          prompt: form.prompt,
          prompt_type: form.prompt_type,
          extradata,
        });
      } else {
        await createPrompt({
          title: form.title,
          prompt: form.prompt,
          prompt_type: form.prompt_type,
          extradata,
        });
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save prompt");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResizableDrawer open={open} onOpenChange={onOpenChange} defaultWidth={720} minWidth={480}>
        <div className="flex h-full flex-col">
          {/* header */}
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FileText className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <SheetTitle className="truncate text-base">
                  {editing ? "Edit prompt" : "New prompt"}
                </SheetTitle>
                <SheetDescription className="text-xs">
                  Reusable template — write instructions in Markdown.
                </SheetDescription>
              </div>
            </div>
            <SheetClose asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close">
                <X className="size-4" />
              </Button>
            </SheetClose>
          </div>

          {/* body */}
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
              <div className="space-y-2">
                <Label htmlFor="prompt-title">Title</Label>
                <Input
                  id="prompt-title"
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Helpful support assistant"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prompt-type">Type</Label>
                <Select
                  value={form.prompt_type}
                  onValueChange={(v) => setForm((p) => ({ ...p, prompt_type: v as PromptType }))}
                >
                  <SelectTrigger id="prompt-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">System prompt</SelectItem>
                    <SelectItem value="instructions">Instructions</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Prompt</Label>
              <MarkdownEditor
                value={form.prompt}
                onChange={(v) => setForm((p) => ({ ...p, prompt: v }))}
                placeholder={"You are a helpful assistant.\n\n## Guidelines\n- Be concise\n- Use **markdown** where helpful"}
              />
              <p className="text-xs text-muted-foreground">
                {form.prompt_type === "system"
                  ? "Foundational role & behavior for the agent."
                  : "Task-specific guidance — how to use tools, formatting rules, etc."}
              </p>
            </div>

            {/* Advanced */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowAdvanced((s) => !s)}
                className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className={cn("size-4 transition-transform", showAdvanced && "rotate-90")} />
                Extra data (JSON)
              </button>
              {showAdvanced && (
                <Textarea
                  value={form.extradata}
                  onChange={(e) => setForm((p) => ({ ...p, extradata: e.target.value }))}
                  placeholder='{"source":"internal"}'
                  className="min-h-[100px] font-mono text-sm"
                />
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="size-4 shrink-0" />
                {error}
              </div>
            )}
          </div>

          {/* footer */}
          <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
            <SheetClose asChild>
              <Button variant="outline">Cancel</Button>
            </SheetClose>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              {saving ? "Saving…" : editing ? "Save changes" : "Create prompt"}
            </Button>
          </div>
        </div>
    </ResizableDrawer>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function PromptLibraryPage() {
  const [prompts, setPrompts] = React.useState<PromptLibraryItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<PromptType | "all">("all");
  const [page, setPage] = React.useState(0);

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PromptLibraryItem | null>(null);

  const fetchData = React.useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const filters: PromptLibraryFilter[] | undefined =
          typeFilter !== "all"
            ? [{ filterField: "prompt_type", filterOp: "equals", filterValue: typeFilter }]
            : undefined;
        const { items, pagination } = await listPrompts(
          {
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE,
            search: search || undefined,
            filters,
            sortField: "updatedat",
            sortOrder: "desc",
          },
          signal
        );
        setPrompts(items);
        setTotal(pagination.total ?? items.length);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load prompts");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [page, search, typeFilter]
  );

  React.useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  // Debounced search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setPage(0);
      setSearch(searchInput);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (p: PromptLibraryItem) => {
    setEditing(p);
    setEditorOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await deletePrompt(id);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete prompt");
    }
  };

  const handleDuplicate = async (id: number) => {
    try {
      await duplicatePrompt(id);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to duplicate prompt");
    }
  };

  return (
    <AppLayout>
      <PageLayout
        title="Prompts"
        subtitle="Manage reusable instructions and system prompts for your agents."
        actions={
          <div className="flex items-center gap-2">
            <Select value={typeFilter} onValueChange={(v) => { setPage(0); setTypeFilter(v as PromptType | "all"); }}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="instructions">Instructions</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              New prompt
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="size-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search prompts…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-xl" />
              ))}
            </div>
          ) : prompts.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-card p-12 text-center shadow-sm">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <FileText className="size-7" />
              </div>
              <h2 className="mb-1.5 text-lg font-semibold tracking-tight">
                {search || typeFilter !== "all" ? "No prompts match" : "No prompts yet"}
              </h2>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                Create reusable system & instruction prompts to attach to your agents.
              </p>
              <Button className="mt-5" onClick={openCreate}>
                <Plus className="size-4" />
                New prompt
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {prompts.map((p) => {
                  const isSystem = p.prompt_type === "system";
                  return (
                    <div
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openEdit(p)}
                      onKeyDown={(e) => (e.key === "Enter" ? openEdit(p) : undefined)}
                      className="group flex cursor-pointer flex-col rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            {isSystem ? <Settings2 className="size-[18px]" /> : <FileText className="size-[18px]" />}
                          </span>
                          <h3 className="truncate font-medium text-foreground">{p.title}</h3>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem onClick={() => openEdit(p)}>
                              <Pencil className="size-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDuplicate(p.id)}>
                              <Copy className="size-4" />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onClick={() => handleDelete(p.id)}>
                              <Trash2 className="size-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <p className="mt-3 line-clamp-3 flex-1 whitespace-pre-wrap text-sm text-muted-foreground">
                        {p.prompt || "No content"}
                      </p>

                      <div className="mt-4 flex items-center justify-between gap-2">
                        <TypeBadge type={p.prompt_type} />
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {p.tokens != null && (
                            <span className="inline-flex items-center gap-1">
                              <Coins className="size-3.5" />
                              {p.tokens.toLocaleString()}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3.5" />
                            {formatDate(p.updatedat)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t pt-4">
                  <p className="text-xs text-muted-foreground">
                    {total} prompt{total !== 1 ? "s" : ""} · Page {page + 1} of {totalPages}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                      <ChevronLeft className="size-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </PageLayout>

      <PromptEditorDrawer
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editing}
        onSaved={fetchData}
      />
    </AppLayout>
  );
}
