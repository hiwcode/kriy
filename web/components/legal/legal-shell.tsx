import Link from "next/link";
import { ArrowLeft, Github } from "lucide-react";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";

/** Shared shell for static legal pages (Privacy and Terms). */
export function LegalShell({
  eyebrow,
  title,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  const Logo = siteConfig.logo;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
            <div className="flex size-8 items-center justify-center overflow-hidden rounded-lg bg-primary ring-1 ring-inset ring-primary-foreground/15">
              <Logo size={28} />
            </div>
            <span className="text-lg font-semibold tracking-tight">{siteConfig.name}</span>
          </Link>
          <Button variant="outline" size="sm" asChild>
            <a href={siteConfig.github} target="_blank" rel="noopener noreferrer">
              <Github className="size-4" />
              GitHub
            </a>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-14">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back home
        </Link>

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">Last updated: {updated}</p>
        </div>

        <div className="mt-10 space-y-8">{children}</div>

        <div className="mt-14 flex gap-5 border-t border-border pt-6 text-sm">
          <Link href="/privacy" className="text-muted-foreground transition-colors hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="text-muted-foreground transition-colors hover:text-foreground">
            Terms
          </Link>
          <Link href="/docs" className="text-muted-foreground transition-colors hover:text-foreground">
            Docs
          </Link>
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-3xl px-6 py-8 text-sm text-muted-foreground">
          {siteConfig.name} · Source-available AI workspace.
        </div>
      </footer>
    </div>
  );
}

/** A titled section within a legal page. */
export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
