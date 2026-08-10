"use client";

import * as React from "react";
import { checkBackendHealth } from "@/lib/api/health";
import { siteConfig } from "@/config/site";

const HEALTH_CHECK_INTERVAL_MS = 10000;

/** null = still checking, true = reachable, false = down. */
const BackendHealthContext = React.createContext<boolean | null>(null);

export function useBackendReady() {
  return React.useContext(BackendHealthContext);
}

/**
 * Polls backend health and exposes it via context. It does NOT block rendering —
 * public pages (landing and docs) must work even when the backend is down.
 * Use {@link BackendGate} to gate the authenticated app.
 */
export function BackendHealthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isReady, setIsReady] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      const ok = await checkBackendHealth();
      if (cancelled) return;
      if (ok) {
        setIsReady(true);
        return;
      }
      setIsReady(false);
      timeoutId = setTimeout(poll, HEALTH_CHECK_INTERVAL_MS);
    }

    poll();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return (
    <BackendHealthContext.Provider value={isReady}>
      {children}
    </BackendHealthContext.Provider>
  );
}

/**
 * Blocks its children with a "backend starting up" screen until the backend is
 * reachable. Wrap only the authenticated app with this — never public pages.
 */
export function BackendGate({ children }: { children: React.ReactNode }) {
  const isReady = useBackendReady();

  if (isReady) {
    return <>{children}</>;
  }

  const Logo = siteConfig.logo;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <div className="flex size-16 items-center justify-center overflow-hidden rounded-2xl bg-primary ring-1 ring-inset ring-primary-foreground/15">
          <Logo size={54} />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Please wait</h1>
          <p className="text-sm text-muted-foreground">
            Backend is starting up. This might take a moment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <span className="text-xs text-muted-foreground">Connecting to server...</span>
        </div>
      </div>
    </div>
  );
}
