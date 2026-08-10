"use client";

import * as React from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { PageLayout } from "@/components/ui/page-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { WorkspaceTransferDialog } from "@/components/workspace/workspace-transfer-dialog";
import {
  listWorkspaceMembers,
  createWorkspaceInvite,
  listWorkspaceInvites,
  removeMember,
  updateMemberRole,
  createWorkspace,
  listMyInvitations,
  acceptInvitation,
  declineInvitation,
  type WorkspaceMember,
  type WorkspaceInvite,
  type MyInvitation,
} from "@/lib/api/workspaces";
import {
  Users,
  UserPlus,
  Mail,
  Trash2,
  Loader2,
  ArrowRightLeft,
  Plus,
  Copy,
  Check,
  ChevronRight,
  AlertTriangle,
  Clock,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function RoleBadge({ role }: { role: string }) {
  const r = role.toLowerCase();
  if (r === "owner")
    return <Badge className="border-0 bg-primary/10 capitalize text-primary">owner</Badge>;
  if (r === "admin")
    return <Badge variant="secondary" className="capitalize">admin</Badge>;
  return (
    <Badge variant="outline" className="capitalize text-muted-foreground">
      {r}
    </Badge>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {action}
    </div>
  );
}

/** A clickable row that opens an action (matches config page). */
function ActionRow({
  icon: Icon,
  title,
  description,
  onClick,
  disabled,
  actionLabel = "Open",
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  actionLabel?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border disabled:hover:shadow-sm"
    >
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary group-disabled:bg-muted group-disabled:text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">{description}</p>
      </div>
      <span className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">
        <span className="hidden sm:inline">{actionLabel}</span>
        <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}

function CopyWorkspaceId({ workspace }: { workspace: object }) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    navigator.clipboard.writeText(String(JSON.stringify(workspace)));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="outline" size="sm" onClick={copy} className="">
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied!" : `Copy`}
    </Button>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function WorkspaceSettingsPage() {
  const workspace = useWorkspace();
  const [members, setMembers] = React.useState<WorkspaceMember[]>([]);
  const [invites, setInvites] = React.useState<WorkspaceInvite[]>([]);
  const [invitations, setInvitations] = React.useState<MyInvitation[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [openDialog, setOpenDialog] = React.useState<null | "invite" | "create">(null);
  const [transferDialogOpen, setTransferDialogOpen] = React.useState(false);

  const activeWs = workspace?.activeWorkspace;

  const loadData = React.useCallback(async () => {
    if (!activeWs) return;
    setLoading(true);
    setError(null);
    // Members: visible to any member of the workspace.
    try {
      setMembers(await listWorkspaceMembers(activeWs.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
    // Invites: admin/owner-only. A 403 for regular members is expected — ignore
    // it (and keep the list empty) rather than failing the whole page.
    try {
      setInvites(await listWorkspaceInvites(activeWs.id));
    } catch {
      setInvites([]);
    }
  }, [activeWs]);

  const loadInvitations = React.useCallback(async () => {
    try {
      setInvitations(await listMyInvitations());
    } catch {
      setInvitations([]);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  React.useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  const handleAcceptInvitation = async (inviteId: number) => {
    try {
      const ws = await acceptInvitation(inviteId);
      await workspace?.refreshWorkspaces();
      workspace?.setActiveWorkspace(ws); // jump into the workspace you just joined
      await loadInvitations();
    } catch {
      /* toast handled in api */
    }
  };

  const handleDeclineInvitation = async (inviteId: number) => {
    try {
      await declineInvitation(inviteId);
      await loadInvitations();
    } catch {
      /* toast handled in api */
    }
  };

  const handleRemoveMember = async (userId: number) => {
    if (!activeWs) return;
    if (!confirm("Remove this member from the workspace?")) return;
    try {
      await removeMember(activeWs.id, userId);
      await loadData();
      await workspace?.refreshWorkspaces();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove");
    }
  };

  const handleRoleChange = async (userId: number, newRole: "admin" | "member") => {
    if (!activeWs) return;
    try {
      await updateMemberRole(activeWs.id, userId, newRole);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update role");
    }
  };

  const handleTransferComplete = React.useCallback(async () => {
    await workspace?.refreshWorkspaces();
  }, [workspace]);

  if (!workspace) {
    return (
      <AppLayout>
        <PageLayout title="Workspace settings" subtitle="Manage workspace access, members, invitations, and resource ownership.">
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="h-28 animate-pulse rounded-2xl border bg-card" />
            <div className="h-20 animate-pulse rounded-xl border bg-card" />
            <div className="h-20 animate-pulse rounded-xl border bg-card" />
          </div>
        </PageLayout>
      </AppLayout>
    );
  }

  // Only owners/admins of a shared workspace can manage members & invites.
  const role = activeWs?.role?.toLowerCase();
  const canManage =
    !!activeWs && !activeWs.is_personal && (role === "owner" || role === "admin");
  // Only the owner can change member roles.
  const isOwner = !!activeWs && !activeWs.is_personal && role === "owner";

  return (
    <AppLayout>
      <PageLayout title="Workspace settings" subtitle="Manage workspace access, members, invitations, and resource ownership.">
        <div className="mx-auto max-w-3xl animate-fade-in-up space-y-8">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="size-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Your invitations (pending, addressed to you) */}
          {invitations.length > 0 && (
            <section className="space-y-3">
              <SectionHeader title="Your invitations" />
              <div className="divide-y rounded-xl border bg-card">
                {invitations.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-3 p-4">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Users className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {inv.workspace_name ?? "A workspace"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        Invited as {inv.role}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => handleAcceptInvitation(inv.id)}>
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeclineInvitation(inv.id)}
                    >
                      Decline
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Workspace banner */}
          {activeWs && (
            <div className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="h-20 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent" />
              <div className="-mt-10 flex items-end gap-4 px-6 pb-6">
                <div className="flex size-20 shrink-0 items-center justify-center rounded-2xl border-4 border-card bg-primary shadow-md">
                  <Users className="size-9 text-primary-foreground" />
                </div>
                <div className="mb-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-lg font-semibold tracking-tight">{activeWs.name}</p>
                    {activeWs.is_personal ? (
                      <Badge variant="secondary" className="border-0">Personal</Badge>
                    ) : (
                      <Badge className="border-0 bg-primary/10 text-primary">Team</Badge>
                    )}
                    <CopyWorkspaceId workspace={{
                      id: activeWs.id,
                      name: activeWs.name,
                      slug: activeWs.slug,
                      created_at: activeWs.created_at
                    }} />
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {members.length} member{members.length === 1 ? "" : "s"}
                    {invites.length > 0 && ` · ${invites.length} pending invite${invites.length === 1 ? "" : "s"}`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Members */}
          <section className="space-y-3">
            <SectionHeader
              title="Members"
              action={
                canManage && (
                  <Button size="sm" onClick={() => setOpenDialog("invite")}>
                    <UserPlus className="size-4" />
                    Invite
                  </Button>
                )
              }
            />

            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
              {loading ? (
                <div className="divide-y">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-4">
                      <div className="size-9 animate-pulse rounded-full bg-muted" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3.5 w-32 animate-pulse rounded bg-muted" />
                        <div className="h-3 w-48 animate-pulse rounded bg-muted/70" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : members.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">No members yet.</div>
              ) : (
                <ul className="divide-y">
                  {members.map((m) => {
                    const name = m.full_name || m.email;
                    return (
                      <li key={m.user_id} className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/40">
                        <Avatar className="size-9">
                          <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                            {initials(name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{name}</p>
                          <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                        </div>
                        {isOwner && m.role.toLowerCase() !== "owner" ? (
                          <Select
                            value={m.role.toLowerCase()}
                            onValueChange={(v) => handleRoleChange(m.user_id, v as "admin" | "member")}
                          >
                            <SelectTrigger size="sm" className="w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="member">Member</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <RoleBadge role={m.role} />
                        )}
                        {canManage && m.role.toLowerCase() !== "owner" && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleRemoveMember(m.user_id)}
                            title="Remove member"
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Pending invites */}
            {canManage && invites.length > 0 && (
              <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="border-b bg-muted/30 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Pending invites
                </div>
                <ul className="divide-y">
                  {invites.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 p-4">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Mail className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{i.email}</p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="size-3" />
                          Expires {new Date(i.expires_at).toLocaleDateString()}
                        </p>
                      </div>
                      <RoleBadge role={i.role} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Workspaces */}
          <section className="space-y-3">
            <SectionHeader title="Workspaces" />
            <ActionRow
              icon={Plus}
              title="Create workspace"
              description="Set up a new shared workspace to collaborate with others"
              actionLabel="Create"
              onClick={() => setOpenDialog("create")}
            />
            <ActionRow
              icon={ArrowRightLeft}
              title="Resource transfer"
              description={
                workspace.workspaces.length < 2
                  ? "Need at least 2 workspaces to transfer resources"
                  : "Move agents, prompts, skills & connections between workspaces"
              }
              actionLabel="Transfer"
              disabled={workspace.workspaces.length < 2}
              onClick={() => setTransferDialogOpen(true)}
            />
          </section>
        </div>

        {/* ---- Dialogs ---- */}
        {activeWs && (
          <InviteDialog
            open={openDialog === "invite"}
            onOpenChange={(o) => setOpenDialog(o ? "invite" : null)}
            workspaceId={activeWs.id}
            onInvited={loadData}
          />
        )}

        <CreateWorkspaceDialog
          open={openDialog === "create"}
          onOpenChange={(o) => setOpenDialog(o ? "create" : null)}
          onCreated={async (ws) => {
            await workspace.refreshWorkspaces();
            workspace.setActiveWorkspace(ws);
          }}
        />

        <WorkspaceTransferDialog
          open={transferDialogOpen}
          onOpenChange={setTransferDialogOpen}
          workspaces={workspace.workspaces}
          currentWorkspace={activeWs ?? null}
          onTransferComplete={handleTransferComplete}
        />
      </PageLayout>
    </AppLayout>
  );
}

/* ------------------------------------------------------------------ */
/*  Dialog: Invite member                                             */
/* ------------------------------------------------------------------ */

function InviteDialog({
  open,
  onOpenChange,
  workspaceId,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  workspaceId: number;
  onInvited: () => Promise<void>;
}) {
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"admin" | "member">("member");
  const [inviting, setInviting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [inviteLink, setInviteLink] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setEmail("");
      setRole("member");
      setError(null);
      setInviteLink(null);
      setCopied(false);
    }
  }, [open]);

  const submit = async () => {
    if (!email.trim()) return;
    setInviting(true);
    setError(null);
    try {
      const inv = await createWorkspaceInvite(workspaceId, email.trim(), role);
      const fullUrl =
        typeof window !== "undefined" ? `${window.location.origin}/invite/${inv.token ?? ""}` : "";
      setInviteLink(fullUrl);
      await onInvited();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to invite");
    } finally {
      setInviting(false);
    }
  };

  const copy = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5 text-primary" />
            Invite member
          </DialogTitle>
          <DialogDescription>
            Create an invite link and share it with the person you want to add.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        {inviteLink ? (
          <div className="space-y-3 py-1">
            <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
              <Check className="size-4 shrink-0" />
              Invite created — share this link to join.
            </div>
            <div className="flex gap-2">
              <Input readOnly value={inviteLink} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={copy} title="Copy">
                {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email address</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as "admin" | "member")}>
                <SelectTrigger id="invite-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member — can use workspace resources</SelectItem>
                  <SelectItem value="admin">Admin — can manage members & settings</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter showCloseButton={!!inviteLink}>
          {!inviteLink && (
            <Button onClick={submit} disabled={inviting || !email.trim()}>
              {inviting ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
              {inviting ? "Creating…" : "Create invite"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Dialog: Create workspace                                          */
/* ------------------------------------------------------------------ */

function CreateWorkspaceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (ws: Awaited<ReturnType<typeof createWorkspace>>) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName("");
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const ws = await createWorkspace(name.trim());
      await onCreated(ws);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="size-5 text-primary" />
            Create workspace
          </DialogTitle>
          <DialogDescription>
            Workspaces keep agents, prompts and connections organized for a team.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="space-y-2 py-1">
          <Label htmlFor="ws-name">Workspace name</Label>
          <Input
            id="ws-name"
            placeholder="e.g. Acme Team"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            autoFocus
          />
        </div>

        <DialogFooter showCloseButton>
          <Button onClick={submit} disabled={creating || !name.trim()}>
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {creating ? "Creating…" : "Create workspace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
