"use client";

import * as React from "react";
import { Send, Bot, User, Loader2, ShieldCheck, ShieldX, Terminal, FileImage, Download, Paperclip, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { MdRenderer } from "./md-renderer";
import { ChatCards, type ChatCard } from "@/components/chat/chat-cards";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const WORKSPACE_DIR = "/Users/hiwcode/Desktop/Playground/Atelier/temp/";
const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"];

function extractWorkspaceFiles(text: string): { images: string[]; files: string[] } {
  const images: string[] = [];
  const files: string[] = [];
  // Match paths like /Users/.../temp/something.png or just filename.png in the temp dir
  const pathRegex = new RegExp(WORKSPACE_DIR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([\\w./-]+)", "g");
  let match;
  while ((match = pathRegex.exec(text)) !== null) {
    const fileName = match[1];
    const ext = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
    if (IMAGE_EXTS.includes(ext)) {
      images.push(fileName);
    } else {
      files.push(fileName);
    }
  }
  // Also match standalone filenames mentioned with common extensions
  const nameRegex = /\b([\w-]+\.(png|jpg|jpeg|gif|webp|svg|pdf|txt|json|csv|html|md))\b/gi;
  while ((match = nameRegex.exec(text)) !== null) {
    const fileName = match[1];
    const ext = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
    if (IMAGE_EXTS.includes(ext) && !images.includes(fileName)) {
      images.push(fileName);
    }
  }
  return { images, files };
}

export interface ToolConfirmation {
  function_call_id: string;
  hint: string;
  tool_name: string;
  args: Record<string, any>;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
  toolConfirmation?: ToolConfirmation;
  /** Structured cards (plan / todo / info) streamed from presentational tools. */
  cards?: ChatCard[];
}

export type { ChatCard };

interface ChatBoxProps {
  messages: Message[];
  onSendMessage: (message: string) => void;
  onToolConfirmation?: (functionCallId: string, confirmed: boolean) => void;
  onFileUpload?: (files: File[]) => Promise<void>;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
  emptyState?: React.ReactNode;
}

export function ChatBox({
  messages,
  onSendMessage,
  onToolConfirmation,
  onFileUpload,
  isLoading = false,
  placeholder = "Type a message...",
  className,
  emptyState,
}: ChatBoxProps) {
  const [input, setInput] = React.useState("");
  const [pendingFiles, setPendingFiles] = React.useState<File[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const Logo = siteConfig.logo;

  // Auto-scroll to bottom on new messages
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || uploading) return;

    if (pendingFiles.length > 0 && onFileUpload) {
      setUploading(true);
      try {
        await onFileUpload(pendingFiles);
      } catch {
        setUploading(false);
        return;
      }
      setUploading(false);
      setPendingFiles([]);
    }

    if (input.trim()) {
      onSendMessage(input.trim());
      setInput("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;
    setPendingFiles((prev) => {
      const combined = [...prev, ...selected];
      if (combined.length > 5) {
        return combined.slice(0, 5);
      }
      return combined;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && emptyState ? (
          <div className="flex h-full items-center justify-center">
            {emptyState}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} Logo={Logo} onToolConfirmation={onToolConfirmation} />
            ))}
            {isLoading && (
              <div className="flex items-start gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Logo size={16} />
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-border p-4">
        {pendingFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {pendingFiles.map((f, i) => (
              <div key={`${f.name}-${i}`} className="flex items-center gap-1.5 rounded-lg border bg-muted/50 px-2.5 py-1.5 text-xs">
                <FileText className="size-3.5 shrink-0 text-primary" />
                <span className="max-w-[140px] truncate">{f.name}</span>
                <span className="shrink-0 text-muted-foreground">{(f.size / 1024).toFixed(0)}K</span>
                <button
                  type="button"
                  onClick={() => removePendingFile(i)}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          {onFileUpload && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.txt,.csv,.json,.xml,.doc,.docx,.png,.jpg,.jpeg,.webp"
                onChange={handleFileSelect}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || uploading || pendingFiles.length >= 5}
                className="size-10 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                title={pendingFiles.length >= 5 ? "Max 5 files" : "Attach documents (max 5, 5 MB each)"}
              >
                <Paperclip className="size-4" />
              </Button>
            </>
          )}
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={pendingFiles.length ? `Message about ${pendingFiles.length} file(s)...` : placeholder}
              disabled={isLoading || uploading}
              rows={1}
              className={cn(
                "w-full resize-none rounded-lg border border-border bg-background px-4 py-3 text-sm h-full",
                "placeholder:text-muted-foreground",
                "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "max-h-[200px]"
              )}
            />
          </div>
          <Button
            type="submit"
            size="icon"
            variant="secondary"
            disabled={(!input.trim() && !pendingFiles.length) || isLoading || uploading}
            className="size-10 shrink-0 rounded-full"
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Press Enter to send, Shift + Enter for new line
        </p>
      </div>
    </div>
  );
}

// Individual message component
function ChatMessage({ message, Logo, onToolConfirmation }: { message: Message; Logo: any; onToolConfirmation?: (functionCallId: string, confirmed: boolean) => void }) {
  const isUser = message.role === "user";
  const [responded, setResponded] = React.useState(false);

  const handleConfirm = (confirmed: boolean) => {
    if (message.toolConfirmation && onToolConfirmation) {
      onToolConfirmation(message.toolConfirmation.function_call_id, confirmed);
      setResponded(true);
    }
  };

  return (
    <div className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}>
      {/* Avatar */}
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-primary" : "bg-primary/10"
        )}
      >
        {isUser ? (
          <User className="size-4 text-primary-foreground" />
        ) : (
          <Logo className="size-4 text-primary" />
        )}
      </div>

      {/* Message Content */}
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-4 py-3",
          isUser ? "bg-primary/30 dark:bg-primary/60" : "bg-muted/80"
        )}
      >
        {message.toolConfirmation ? (
          /* Tool Confirmation UI */
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Terminal className="size-4 text-amber-500" />
              Tool requires approval
            </div>
            <div className="rounded-md border bg-background/50 p-3 space-y-1.5">
              {message.toolConfirmation.tool_name && (
                <p className="text-xs font-mono text-muted-foreground">
                  {message.toolConfirmation.tool_name}
                </p>
              )}
              {message.toolConfirmation.args && Object.keys(message.toolConfirmation.args).length > 0 && (
                <pre className="text-xs font-mono bg-muted/50 rounded p-2 overflow-x-auto">
                  {JSON.stringify(message.toolConfirmation.args, null, 2)}
                </pre>
              )}
              <p className="text-sm">{message.toolConfirmation.hint}</p>
            </div>
            {!responded ? (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => handleConfirm(true)}>
                  <ShieldCheck className="size-3 mr-1" />
                  Approve
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleConfirm(false)}>
                  <ShieldX className="size-3 mr-1" />
                  Reject
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Response sent</p>
            )}
          </div>
        ) : (
          <>
            {message.content && (
              <MdRenderer content={message.content} variant={isUser ? "default" : "docs"}/>
            )}
            {!isUser && message.cards && message.cards.length > 0 && (
              <ChatCards cards={message.cards} />
            )}
            {!isUser && <WorkspaceFiles content={message.content} />}
            {message.timestamp && (
              <p className="mt-1 text-xs">
                {message.timestamp.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function WorkspaceFiles({ content }: { content: string }) {
  const { images, files } = React.useMemo(() => extractWorkspaceFiles(content), [content]);
  const [authHeaders, setAuthHeaders] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    import("@/lib/auth").then(({ getAuthToken }) => {
      const token = getAuthToken();
      if (token) setAuthHeaders({ Authorization: `Bearer ${token}` });
    });
  }, []);

  if (!images.length && !files.length) return null;

  return (
    <div className="mt-3 space-y-2">
      {images.map((img) => (
        <div key={img} className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileImage className="size-3" />
            <span>{img}</span>
            <a
              href={`${API_BASE}/api/v1/agents/workspace-file/${img}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-primary hover:underline"
            >
              <Download className="size-3" />
            </a>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${API_BASE}/api/v1/agents/workspace-file/${img}`}
            alt={img}
            className="rounded-lg border max-w-full max-h-96 object-contain bg-background"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      ))}
      {files.map((f) => (
        <a
          key={f}
          href={`${API_BASE}/api/v1/agents/workspace-file/${f}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <Download className="size-3" />
          {f}
        </a>
      ))}
    </div>
  );
}
