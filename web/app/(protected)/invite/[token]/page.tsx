"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { PageLayout } from "@/components/ui/page-layout";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { acceptInvite } from "@/lib/api/workspaces";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { Users, Loader2 } from "lucide-react";

export default function InviteAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const workspace = useWorkspace();
  const [info, setInfo] = React.useState<{ workspace_name: string; email: string; role: string } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [accepting, setAccepting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!token) return;
    apiFetch<{ workspace_name: string; email: string; role: string }>(`/api/v1/workspaces/invite/${token}`)
      .then((r) => setInfo(r.data ?? null))
      .catch(() => setError("Invalid or expired invite"))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    setError(null);
    try {
      const ws = await acceptInvite(token);
      await workspace?.refreshWorkspaces();
      workspace?.setActiveWorkspace(ws);
      router.push("/agents");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to accept invite");
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <PageLayout title="Invite" subtitle="Loading...">
          <div className="flex justify-center p-12">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        </PageLayout>
      </AppLayout>
    );
  }

  if (error && !info) {
    return (
      <AppLayout>
        <PageLayout title="Invite" subtitle="Invalid invite">
          <div className="rounded-lg bg-destructive/10 text-destructive px-4 py-3">
            {error}
          </div>
          <Button variant="outline" onClick={() => router.push("/agents")} className="mt-4">
            Go to Agents
          </Button>
        </PageLayout>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageLayout title="Workspace Invite" subtitle={`Join ${info?.workspace_name}`}>
        <div className="max-w-md space-y-6">
          <div className="rounded-lg border p-6 text-center">
            <Users className="size-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold">You&apos;re invited to join</h2>
            <p className="text-2xl font-bold mt-2">{info?.workspace_name}</p>
            <p className="text-sm text-muted-foreground mt-2">
              as {info?.role}
            </p>
          </div>
          {error && (
            <div className="rounded-lg bg-destructive/10 text-destructive px-4 py-3 text-sm">
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={handleAccept} disabled={accepting} className="flex-1">
              {accepting ? <Loader2 className="size-4 animate-spin" /> : "Accept invite"}
            </Button>
            <Button variant="outline" onClick={() => router.push("/agents")}>
              Decline
            </Button>
          </div>
        </div>
      </PageLayout>
    </AppLayout>
  );
}
