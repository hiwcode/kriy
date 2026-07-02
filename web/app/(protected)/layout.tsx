"use client";

import * as React from "react";
import { Bot } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { WorkspaceProvider, useWorkspace } from "@/components/workspace/workspace-provider";
import { CurrentUserProvider } from "@/hooks/use-current-user";
import { BackendGate } from "@/components/backend-health-provider";

/** Inner wrapper that uses the workspace key to remount all pages on switch. */
function WorkspaceKeyedChildren({ children }: { children: React.ReactNode }) {
  const workspace = useWorkspace();
  return <React.Fragment key={workspace?.workspaceKey ?? 0}>{children}</React.Fragment>;
}

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const auth = useAuth();

  React.useEffect(() => {
    if (!auth?.isSignedIn && !auth?.isLoading) {
      router.replace("/");
      return;
    }
  }, [auth?.isSignedIn, auth?.isLoading, router]);

  if (auth?.isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <div className="relative flex size-12 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/25">
          <Bot className="size-6 text-primary-foreground" />
          <span className="absolute inset-0 animate-ping rounded-2xl bg-primary/20" />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-1.5 animate-pulse rounded-full bg-primary" />
          Loading your workspace…
        </div>
      </div>
    );
  }

  if (!auth?.isSignedIn) {
    return null;
  }

  return (
    <BackendGate>
      <CurrentUserProvider>
        <WorkspaceProvider>
          <WorkspaceKeyedChildren>{children}</WorkspaceKeyedChildren>
        </WorkspaceProvider>
      </CurrentUserProvider>
    </BackendGate>
  );
}
