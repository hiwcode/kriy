"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { MdRenderer } from "@/components/ui/md-renderer";
import { DOC_NAV_ITEMS } from "@/components/layout/docs-sidebar";
import { cn } from "@/lib/utils";

const DOC_FILES: Record<string, string> = {
  "": "README",
  "getting-started": "getting-started",
  "using-agents": "using-agents",
  "using-skills": "using-skills",
  "using-orchestrator": "using-orchestrator",
  "using-tools": "using-tools",
  "using-schedules": "using-schedules",
  "using-memory": "using-memory",
  "using-profile": "using-profile",
  "using-workspaces": "using-workspaces",
  "workspace-transfer": "workspace-transfer",
  "using-event-workflows":"using-event-workflows",
  "using-notifications": "using-notifications"
};

type Heading = { id: string; text: string; level: number };

export default function DocsPage() {
  const params = useParams();
  const slug = (params.slug as string[] | undefined)?.[0] ?? "";
  const [content, setContent] = React.useState<string>("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [headings, setHeadings] = React.useState<Heading[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  const fileName = DOC_FILES[slug] ?? DOC_FILES[""];
  const mdPath = fileName === "README" ? "README.md" : `${fileName}.md`;

  React.useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/docs-md/${mdPath}`)
      .then((res) => {
        if (!res.ok) throw new Error("Document not found");
        return res.text();
      })
      .then(setContent)
      .catch(() => setError("Document not found"))
      .finally(() => setLoading(false));
  }, [mdPath]);

  const processedContent = React.useMemo(() => {
    if (!content) return content;
    return content.replace(
      /\[([^\]]+)\]\(([^)]+\.md)\)/g,
      (_, text, file) => `[${text}](/docs/${file.replace(".md", "")})`
    );
  }, [content]);

  // Read the real heading ids straight from the rendered DOM (no slug guessing).
  React.useEffect(() => {
    if (loading || error || !processedContent) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const root = contentRef.current;
        if (!root) return;
        const els = root.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id]");
        const hs: Heading[] = Array.from(els).map((el) => ({
          id: el.id,
          text: el.textContent ?? "",
          level: Number(el.tagName[1]),
        }));
        setHeadings(hs);
        setActiveId((prev) => prev ?? hs[0]?.id ?? null);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [processedContent, loading, error]);

  // Scroll spy — the document scrolls (sticky sidebar + navbar).
  React.useEffect(() => {
    if (headings.length === 0) return;

    const onScroll = () => {
      let current = headings[0].id;
      for (const h of headings) {
        const el = document.getElementById(h.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= 96) current = h.id;
        else break;
      }
      setActiveId(current);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [headings]);

  const handleTocClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
    history.replaceState(null, "", `#${id}`);
  };

  // Prev / next from the docs nav order
  const currentHref = slug ? `/docs/${slug}` : "/docs";
  const navIdx = DOC_NAV_ITEMS.findIndex((i) => i.href === currentHref);
  const prevDoc = navIdx > 0 ? DOC_NAV_ITEMS[navIdx - 1] : null;
  const nextDoc =
    navIdx >= 0 && navIdx < DOC_NAV_ITEMS.length - 1 ? DOC_NAV_ITEMS[navIdx + 1] : null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading documentation…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <div className="rounded-full bg-destructive/10 p-4">
          <svg className="size-8 text-destructive" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-destructive">{error}</p>
          <p className="mt-1 text-xs text-muted-foreground">The requested documentation page could not be found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl gap-10 px-6 py-12 lg:px-8">
      {/* Main content */}
      <article ref={contentRef} className="min-w-0 max-w-3xl flex-1">
        <MdRenderer content={processedContent} variant="docs" />

        {/* Prev / next */}
        {(prevDoc || nextDoc) && (
          <nav className="mt-14 grid gap-3 border-t pt-6 sm:grid-cols-2">
            {prevDoc ? (
              <Link
                href={prevDoc.href}
                className="group flex flex-col gap-1 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ArrowLeft className="size-3.5" />
                  Previous
                </span>
                <span className="font-medium text-foreground group-hover:text-primary">{prevDoc.name}</span>
              </Link>
            ) : (
              <span className="hidden sm:block" />
            )}
            {nextDoc ? (
              <Link
                href={nextDoc.href}
                className="group flex flex-col items-end gap-1 rounded-xl border bg-card p-4 text-right transition-colors hover:border-primary/40 sm:col-start-2"
              >
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  Next
                  <ArrowRight className="size-3.5" />
                </span>
                <span className="font-medium text-foreground group-hover:text-primary">{nextDoc.name}</span>
              </Link>
            ) : null}
          </nav>
        )}
      </article>

      {/* Right - table of contents (sticky within the page scroll) */}
      {headings.length > 0 && (
        <aside className="hidden w-56 shrink-0 xl:block">
          <nav className="sticky top-20">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              On this page
            </p>
            <ul className="space-y-0.5 border-l border-border">
              {headings.map((h) => {
                const isActive = activeId === h.id;
                return (
                  <li key={h.id} className={cn("relative text-[13px]", h.level === 3 && "pl-3")}>
                    {isActive && (
                      <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-x-px -translate-y-1/2 rounded-full bg-primary" />
                    )}
                    <a
                      href={`#${h.id}`}
                      onClick={(e) => handleTocClick(e, h.id)}
                      className={cn(
                        "block py-1.5 pl-4 pr-2 leading-snug transition-colors",
                        isActive ? "font-medium text-primary" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {h.text}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>
      )}
    </div>
  );
}
