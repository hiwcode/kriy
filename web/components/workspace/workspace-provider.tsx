"use client";

import * as React from "react";
import {
  listWorkspaces,
  getCurrentWorkspace,
  getStoredWorkspaceId,
  setStoredWorkspaceId,
  type Workspace,
} from "@/lib/api/workspaces";

interface WorkspaceContextValue {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  setActiveWorkspace: (ws: Workspace | null) => void;
  refreshWorkspaces: () => Promise<void>;
  isLoading: boolean;
  /** Increments every time the active workspace changes. Use as a React key to remount components. */
  workspaceKey: number;
}

const WorkspaceContext = React.createContext<WorkspaceContextValue | null>(null);

export function useWorkspace() {
  const ctx = React.useContext(WorkspaceContext);
  return ctx;
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaces, setWorkspaces] = React.useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspaceState] = React.useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [workspaceKey, setWorkspaceKey] = React.useState(0);

  const refreshWorkspaces = React.useCallback(async () => {
    try {
      const list = await listWorkspaces();
      setWorkspaces(list);
      const storedId = getStoredWorkspaceId();
      let current: Workspace | null = null;
      if (storedId != null) {
        current = list.find((w) => w.id === storedId) ?? null;
      }
      if (!current && list.length > 0) {
        current = list[0];
        setStoredWorkspaceId(current.id);
      }
      if (current) {
        setActiveWorkspaceState(current);
      } else {
        const me = await getCurrentWorkspace();
        if (me) {
          setActiveWorkspaceState(me);
          setStoredWorkspaceId(me.id);
        } else {
          setActiveWorkspaceState(null);
        }
      }
    } catch {
      setWorkspaces([]);
      setActiveWorkspaceState(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setActiveWorkspace = React.useCallback((ws: Workspace | null) => {
    setStoredWorkspaceId(ws?.id ?? null);
    setActiveWorkspaceState(ws ?? null);
    setWorkspaceKey((k) => k + 1);
  }, []);

  React.useEffect(() => {
    refreshWorkspaces();
  }, [refreshWorkspaces]);

  const value: WorkspaceContextValue = {
    workspaces,
    activeWorkspace,
    setActiveWorkspace,
    refreshWorkspaces,
    isLoading,
    workspaceKey,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
