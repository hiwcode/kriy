"use client";

import * as React from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

function MermaidBlock({ code }: { code: string }) {
  const [state, setState] = React.useState<{ svg: string; error?: string }>({ svg: "" });

  React.useEffect(() => {
    let isActive = true;
    const render = async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          // Agent and MCP output is untrusted. Strict mode disables HTML labels,
          // scripts, and interactive links before the generated SVG is mounted.
          securityLevel: "strict",
        });
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const { svg } = await mermaid.render(id, code);
        if (isActive) setState({ svg });
      } catch (err) {
        if (isActive) setState({ svg: "", error: err instanceof Error ? err.message : "Unable to render diagram" });
      }
    };
    render();
    return () => { isActive = false; };
  }, [code]);

  if (state.error) {
    return (
      <pre className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {state.error}
      </pre>
    );
  }
  if (!state.svg) {
    return (
      <div className="my-6 flex items-center justify-center rounded-lg border border-border bg-muted/30 py-12 text-sm text-muted-foreground">
        Rendering diagram...
      </div>
    );
  }
  return (
    <div
      className="mermaid-block-wrapper my-6 overflow-x-auto rounded-lg border border-border bg-muted/30 p-4 [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  );
}

interface MdRendererProps {
  content: string;
  className?: string;
  /** Use docs variant for documentation pages (better spacing, typography) */
  variant?: "default" | "docs";
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function MdRenderer({ content, className, variant = "default" }: MdRendererProps) {
  const isDocs = variant === "docs";
  // Local (not a ref): a fresh map per render keeps heading IDs deterministic
  // without reading/writing a ref during render.
  const seenIds = new Map<string, number>();

  const getUniqueId = (text: string) => {
    const base = slugify(text);
    const count = seenIds.get(base) ?? 0;
    seenIds.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  };

  return (
    <div
      className={cn(
        "max-w-none text-foreground overflow-scroll",
        isDocs && "docs-prose text-base",
        !isDocs && "prose prose-sm dark:prose-invert",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children, ...props }) => {
            const text = React.Children.toArray(children).join("");
            const id = getUniqueId(text);
            return (
              <h1
                id={id}
                className={cn(
                  "scroll-mt-24 font-bold tracking-tight text-foreground",
                  isDocs ? "mb-8 text-3xl" : "text-2xl"
                )}
                {...props}
              >
                {children}
              </h1>
            );
          },
          h2: ({ children, ...props }) => {
            const text = React.Children.toArray(children).join("");
            const id = getUniqueId(text);
            return (
              <h2
                id={id}
                className={cn(
                  "scroll-mt-24 font-semibold tracking-tight text-foreground",
                  isDocs
                    ? "mb-4 mt-12 border-b border-border pb-2 text-2xl"
                    : "text-xl"
                )}
                {...props}
              >
                {children}
              </h2>
            );
          },
          h3: ({ children, ...props }) => {
            const text = React.Children.toArray(children).join("");
            const id = getUniqueId(text);
            return (
              <h3
                id={id}
                className={cn(
                  "scroll-mt-24 font-semibold tracking-tight text-foreground",
                  isDocs ? "mb-3 mt-8 text-xl" : "text-lg"
                )}
                {...props}
              >
                {children}
              </h3>
            );
          },
          p: ({ children, ...props }) => (
            <p
              className={cn(
                "text-foreground",
                isDocs ? "mb-4 leading-7" : "leading-relaxed"
              )}
              {...props}
            >
              {children}
            </p>
          ),
          ul: ({ children, ...props }) => (
            <ul
              className={cn(
                "list-disc pl-6",
                isDocs ? "mb-6 mt-2 space-y-2" : "my-2"
              )}
              {...props}
            >
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol
              className={cn(
                "list-decimal pl-6",
                isDocs ? "mb-6 mt-2 space-y-2" : "my-2"
              )}
              {...props}
            >
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li className={isDocs ? "leading-7" : ""} {...props}>
              {children}
            </li>
          ),
          hr: () => (
            <hr className={cn("my-10 border-border", isDocs && "border-t-2")} />
          ),
          blockquote: ({ children, ...props }) => (
            <blockquote
              className={cn(
                "border-l-4 border-primary/30 pl-4 italic text-muted-foreground",
                isDocs ? "my-6" : "my-4"
              )}
              {...props}
            >
              {children}
            </blockquote>
          ),
          pre: ({ children, ...props }) => {
            const child = React.Children.toArray(children)[0];
            const isMermaid = React.isValidElement(child) && child.type === MermaidBlock;
            if (isMermaid) return <>{children}</>;
            return (
              <pre
                className={cn(
                  "overflow-x-auto rounded-lg border border-border font-mono text-sm",
                  isDocs ? "my-6 bg-muted/50 p-5" : "bg-muted p-4"
                )}
                {...props}
              >
                {children}
              </pre>
            );
          },
          code: ({ className: codeClassName, children, ...props }) => {
            const isInline = !codeClassName;
            const rawCode = String(children ?? "").trim();
            const match = /language-([a-z0-9_-]+)/i.exec(codeClassName || "");
            const language = match?.[1]?.toLowerCase();

            if (!isInline && language === "mermaid") {
              return <MermaidBlock code={rawCode} />;
            }

            if (isInline) {
              return (
                <code
                  className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em] before:content-none after:content-none"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                className={cn("font-mono text-[0.9em]", codeClassName)}
                {...props}
              >
                {children}
              </code>
            );
          },
          a: ({ href, children, ...props }) => {
            const isInternal = href?.startsWith("/") && !href.startsWith("//");
            const linkClass =
              "text-primary underline underline-offset-4 hover:text-primary/80";
            if (isInternal && href) {
              return (
                <Link href={href} className={linkClass} {...props}>
                  {children}
                </Link>
              );
            }
            return (
              <a
                className={linkClass}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                {...props}
              >
                {children}
              </a>
            );
          },
          table: ({ children, ...props }) => (
            <div className="my-6 overflow-x-auto">
              <table
                className="w-full border-collapse border border-border text-sm"
                {...props}
              >
                {children}
              </table>
            </div>
          ),
          th: ({ children, ...props }) => (
            <th
              className="border border-border bg-muted/50 px-4 py-3 text-left font-semibold"
              {...props}
            >
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td className="border border-border px-4 py-3" {...props}>
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
