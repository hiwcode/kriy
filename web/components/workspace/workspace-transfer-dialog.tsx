"use client";

import * as React from "react";
import { ArrowRightIcon, Loader2Icon, CheckCircle2Icon, AlertCircleIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  transferResources,
  type Workspace,
  type WorkspaceTransferRequest,
  type WorkspaceTransferResponse,
} from "@/lib/api/workspaces";

interface WorkspaceTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  onTransferComplete?: () => void;
}

const RESOURCE_TYPES = [
  { value: "all", label: "All Resources" },
  { value: "agents", label: "Agents Only" },
  { value: "prompts", label: "Prompts Only" },
  { value: "skills", label: "Skills Only" },
  { value: "mcp_connections", label: "MCP Connections Only" },
  { value: "database_connections", label: "Database Connections Only" },
  { value: "schedules", label: "Schedules Only" },
  { value: "workflows", label: "Workflows Only" },
  { value: "events", label: "Event Types Only" },
  { value: "webhooks", label: "Webhooks Only" },
  { value: "gates", label: "Decision Gates Only" },
  { value: "documents", label: "Documents Only" },
] as const;

export function WorkspaceTransferDialog({
  open,
  onOpenChange,
  workspaces,
  currentWorkspace,
  onTransferComplete,
}: WorkspaceTransferDialogProps) {
  const [sourceWorkspaceId, setSourceWorkspaceId] = React.useState<string>("");
  const [targetWorkspaceId, setTargetWorkspaceId] = React.useState<string>("");
  const [resourceType, setResourceType] = React.useState<WorkspaceTransferRequest["resource_type"]>("all");
  const [isTransferring, setIsTransferring] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<WorkspaceTransferResponse | null>(null);

  // Set default source workspace to current workspace when dialog opens
  React.useEffect(() => {
    if (open && currentWorkspace) {
      setSourceWorkspaceId(String(currentWorkspace.id));
    }
  }, [open, currentWorkspace]);

  // All workspaces the user is a member of (no owner restriction)
  const availableWorkspaces = workspaces;

  // Available target workspaces (exclude source)
  const targetWorkspaces = React.useMemo(() => {
    return availableWorkspaces.filter(ws => String(ws.id) !== sourceWorkspaceId);
  }, [availableWorkspaces, sourceWorkspaceId]);

  const handleTransfer = async () => {
    if (!sourceWorkspaceId || !targetWorkspaceId) {
      setError("Please select both source and target workspaces");
      return;
    }

    setIsTransferring(true);
    setError(null);
    setSuccess(null);
    
    try {
      const result = await transferResources({
        source_workspace_id: parseInt(sourceWorkspaceId, 10),
        target_workspace_id: parseInt(targetWorkspaceId, 10),
        resource_type: resourceType,
      });

      setSuccess(result);
      
      // Auto-close after showing success for 2 seconds
      setTimeout(() => {
        onOpenChange(false);
        onTransferComplete?.();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to transfer resources");
    } finally {
      setIsTransferring(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isTransferring) {
      onOpenChange(newOpen);
      if (!newOpen) {
        // Reset form when closing
        setSourceWorkspaceId("");
        setTargetWorkspaceId("");
        setResourceType("all");
        setError(null);
        setSuccess(null);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-125">
        <DialogHeader>
          <DialogTitle>Transfer Resources</DialogTitle>
          <DialogDescription>
            Move resources between workspaces. You must be the owner of the source
            workspace and a member of the target. Dependent data moves automatically —
            an agent&apos;s sessions, memories and documents; a skill&apos;s files; a gate&apos;s
            decision history.
          </DialogDescription>
        </DialogHeader>

        {/* Error Message */}
        {error && (
          <div className="rounded-lg bg-destructive/10 text-destructive px-4 py-3 text-sm flex items-start gap-2">
            <AlertCircleIcon className="size-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="rounded-lg bg-green-500/10 text-green-700 dark:text-green-400 px-4 py-3 text-sm">
            <div className="flex items-start gap-2">
              <CheckCircle2Icon className="size-4 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">
                  Successfully transferred {success.total_transferred} resource(s)
                </p>
                {success.total_transferred > 0 && (
                  <ul className="text-xs space-y-0.5 opacity-90">
                    {success.transferred_agents > 0 && (
                      <li>• {success.transferred_agents} agent(s)</li>
                    )}
                    {success.transferred_prompts > 0 && (
                      <li>• {success.transferred_prompts} prompt(s)</li>
                    )}
                    {success.transferred_skills > 0 && (
                      <li>• {success.transferred_skills} skill(s)</li>
                    )}
                    {success.transferred_mcp_connections > 0 && (
                      <li>• {success.transferred_mcp_connections} MCP connection(s)</li>
                    )}
                    {success.transferred_database_connections > 0 && (
                      <li>• {success.transferred_database_connections} database connection(s)</li>
                    )}
                    {(success.transferred_schedules ?? 0) > 0 && (
                      <li>• {success.transferred_schedules} schedule(s)</li>
                    )}
                    {(success.transferred_workflows ?? 0) > 0 && (
                      <li>• {success.transferred_workflows} workflow(s)</li>
                    )}
                    {(success.transferred_events ?? 0) > 0 && (
                      <li>• {success.transferred_events} event type(s)</li>
                    )}
                    {(success.transferred_webhooks ?? 0) > 0 && (
                      <li>• {success.transferred_webhooks} webhook(s)</li>
                    )}
                    {(success.transferred_gates ?? 0) > 0 && (
                      <li>• {success.transferred_gates} decision gate(s)</li>
                    )}
                    {(success.transferred_documents ?? 0) > 0 && (
                      <li>• {success.transferred_documents} document(s)</li>
                    )}
                    {success.transferred_sessions > 0 && (
                      <li>• {success.transferred_sessions} session(s)</li>
                    )}
                    {success.transferred_memories > 0 && (
                      <li>• {success.transferred_memories} memor{success.transferred_memories === 1 ? 'y' : 'ies'}</li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4 py-4">
          {/* Source Workspace */}
          <div className="space-y-2">
            <Label htmlFor="source-workspace">From Workspace</Label>
            <Select
              value={sourceWorkspaceId}
              onValueChange={setSourceWorkspaceId}
              disabled={isTransferring}
            >
              <SelectTrigger id="source-workspace" className="w-full">
                <SelectValue placeholder="Select source workspace" />
              </SelectTrigger>
              <SelectContent>
                {availableWorkspaces.map((ws) => (
                  <SelectItem key={ws.id} value={String(ws.id)}>
                    {ws.name} {ws.is_personal && "(Personal)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Arrow Icon */}
          <div className="flex justify-center">
            <ArrowRightIcon className="size-5 text-muted-foreground" />
          </div>

          {/* Target Workspace */}
          <div className="space-y-2">
            <Label htmlFor="target-workspace">To Workspace</Label>
            <Select
              value={targetWorkspaceId}
              onValueChange={setTargetWorkspaceId}
              disabled={isTransferring || !sourceWorkspaceId}
            >
              <SelectTrigger id="target-workspace" className="w-full">
                <SelectValue placeholder="Select target workspace" />
              </SelectTrigger>
              <SelectContent>
                {targetWorkspaces.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No other workspaces available
                  </div>
                ) : (
                  targetWorkspaces.map((ws) => (
                    <SelectItem key={ws.id} value={String(ws.id)}>
                      {ws.name} {ws.is_personal && "(Personal)"}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Resource Type */}
          <div className="space-y-2">
            <Label htmlFor="resource-type">What to Transfer</Label>
            <Select
              value={resourceType}
              onValueChange={(value) => setResourceType(value as WorkspaceTransferRequest["resource_type"])}
              disabled={isTransferring}
            >
              <SelectTrigger id="resource-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOURCE_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter showCloseButton>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isTransferring}
          >
            Cancel
          </Button>
          <Button
            onClick={handleTransfer}
            disabled={isTransferring || !sourceWorkspaceId || !targetWorkspaceId}
          >
            {isTransferring ? (
              <>
                <Loader2Icon className="mr-2 size-4 animate-spin" />
                Transferring...
              </>
            ) : (
              "Transfer Resources"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
