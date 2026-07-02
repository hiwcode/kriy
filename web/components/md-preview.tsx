"use client"

import { useEffect, useMemo, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import remarkBreaks from "remark-breaks"
import rehypeKatex from "rehype-katex"

import { cn } from "@/lib/utils"

type MarkdownPreviewProps = {
  content: string
  className?: string
}

type MermaidState = {
  svg: string
  error?: string
}

function MermaidBlock({ code }: { code: string }) {
  const [state, setState] = useState<MermaidState>({ svg: "" })

  useEffect(() => {
    let isActive = true

    const render = async () => {
      try {
        const { default: mermaid } = await import("mermaid")
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
        })

        const id = `mermaid-${Math.random().toString(36).slice(2)}`
        const { svg } = await mermaid.render(id, code)

        if (isActive) {
          setState({ svg })
        }
      } catch (error: any) {
        if (isActive) {
          setState({
            svg: "",
            error: error?.message || "Unable to render mermaid diagram.",
          })
        }
      }
    }

    render()
    return () => {
      isActive = false
    }
  }, [code])

  if (state.error) {
    return (
      <pre className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        {state.error}
      </pre>
    )
  }

  if (!state.svg) {
    return (
      <pre className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
        Rendering diagram...
      </pre>
    )
  }

  return (
    <div
      className="mermaid overflow-x-auto rounded-md border bg-background p-3"
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  )
}

export function MarkdownPreview({ content, className }: MarkdownPreviewProps) {
  const components = useMemo(
    () => ({
      code({
        inline,
        className: codeClassName,
        children,
      }: {
        inline?: boolean
        className?: string
        children?: React.ReactNode
      }) {
        const rawCode = String(children ?? "").trim()
        const match = /language-([a-z0-9_-]+)/i.exec(codeClassName || "")
        const language = match?.[1]?.toLowerCase()

        if (!inline && language === "mermaid") {
          return <MermaidBlock code={rawCode} />
        }

        if (inline) {
          return (
            <code className={cn("rounded bg-muted/40 px-1 py-0.5 text-sm", codeClassName)}>
              {children}
            </code>
          )
        }

        return (
          <code className={cn("font-mono text-sm", codeClassName)}>
            {children}
          </code>
        )
      },
      ul({ children }: { children?: React.ReactNode }) {
        return <ul className="list-disc space-y-2 pl-6">{children}</ul>
      },
      ol({ children }: { children?: React.ReactNode }) {
        return <ol className="list-decimal space-y-2 pl-6">{children}</ol>
      },
      li({ children }: { children?: React.ReactNode }) {
        return <li className="leading-relaxed">{children}</li>
      },
      p({ children }: { children?: React.ReactNode }) {
        return <p className="leading-7 text-sm text-foreground">{children}</p>
      },
      h1({ children }: { children?: React.ReactNode }) {
        return <h1 className="text-2xl font-semibold tracking-tight">{children}</h1>
      },
      h2({ children }: { children?: React.ReactNode }) {
        return <h2 className="text-xl font-semibold tracking-tight">{children}</h2>
      },
      h3({ children }: { children?: React.ReactNode }) {
        return <h3 className="text-lg font-semibold tracking-tight">{children}</h3>
      },
      blockquote({ children }: { children?: React.ReactNode }) {
        return (
          <blockquote className="border-l-4 border-primary/40 pl-4 italic text-muted-foreground">
            {children}
          </blockquote>
        )
      },
      hr() {
        return <hr className="my-6 border-border" />
      },
      a({ children, href }: { children?: React.ReactNode; href?: string }) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-4"
          >
            {children}
          </a>
        )
      },
      pre({ children }: { children?: React.ReactNode }) {
        return (
          <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-sm">
            {children}
          </pre>
        )
      },
      table({ children }: { children?: React.ReactNode }) {
        return (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">{children}</table>
          </div>
        )
      },
      img({ src, alt }: { src?: string; alt?: string }) {
        if (!src) return null
        return (
          <img
            src={src}
            alt={alt || "Image"}
            className="rounded-lg border"
          />
        )
      },
    }),
    []
  )

  return (
    <div
      className={cn(
        "space-y-4 text-sm text-foreground",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
        rehypePlugins={[rehypeKatex]}
        components={components as any}
      >
        {content || "Nothing to preview"}
      </ReactMarkdown>
    </div>
  )
}
