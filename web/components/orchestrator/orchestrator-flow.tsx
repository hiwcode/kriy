"use client";

import * as React from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type EdgeChange,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type NodeProps,
} from "@xyflow/react";
import type { NodeBase } from "@xyflow/system";
import "@xyflow/react/dist/style.css";
import { Bot, Sparkles, X, Globe, BrainCircuit } from "lucide-react";
import { cn, ensureExtraFields } from "@/lib/utils";
import type { AgentItem } from "@/lib/api/agents";

const ORCHESTRATOR_NODE = "orchestrator";
const SUB_AGENT_NODE = "subAgent";

type AgentNodeData = {
  label: string;
  agent?: AgentItem;
  a2aUrl?: string;
  onRemove?: () => void;
};
type AgentNode = NodeBase<AgentNodeData>;

const HANDLE_CLS = "!size-2.5 !border-2 !border-background !bg-primary";

function OrchestratorNode(props: NodeProps<AgentNode>) {
  const { data, selected } = props;
  const model = data.agent?.model;
  return (
    <div
      className={cn(
        "relative flex min-w-[190px] flex-col gap-2 rounded-2xl border border-white/10 bg-gradient-to-br from-primary to-fuchsia-600 px-4 py-3 text-primary-foreground shadow-lg shadow-primary/25 transition-all",
        selected
          ? "ring-2 ring-primary/40 ring-offset-2 ring-offset-background"
          : "hover:shadow-xl hover:shadow-primary/30"
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/20">
          <BrainCircuit className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">{data.label}</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/70">Orchestrator</p>
        </div>
      </div>
      {model && (
        <span className="w-fit rounded-md bg-white/15 px-1.5 py-0.5 font-mono text-[10px] text-white/90">{model}</span>
      )}
      <Handle type="source" position={Position.Bottom} className={HANDLE_CLS} />
    </div>
  );
}

function SubAgentNode(props: NodeProps<AgentNode>) {
  const { data, selected } = props;
  const isExternal = !!data.a2aUrl;
  const sub = isExternal ? "External A2A" : data.agent?.model || "local agent";
  return (
    <div
      className={cn(
        "group relative flex min-w-[180px] items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 shadow-sm transition-all",
        selected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/50 hover:shadow-md"
      )}
    >
      <Handle type="target" position={Position.Left} className={HANDLE_CLS} />
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {isExternal ? <Globe className="size-4" aria-label="External A2A" /> : <Bot className="size-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight text-foreground">{data.label}</p>
        <p className="truncate text-[10px] text-muted-foreground">{sub}</p>
      </div>
      {data.onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            data.onRemove?.();
          }}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          title="Remove sub-agent"
        >
          <X className="size-3.5" />
        </button>
      )}
      <Handle type="source" position={Position.Right} className={HANDLE_CLS} />
    </div>
  );
}

const nodeTypes = {
  [ORCHESTRATOR_NODE]: OrchestratorNode,
  [SUB_AGENT_NODE]: SubAgentNode,
};

interface A2aConnection {
  url: string;
  name: string;
}

function flowNodesFromAgents(
  orchestrator: AgentItem,
  subAgents: AgentItem[],
  agents: AgentItem[]
): { nodes: Node[]; edges: Edge[] } {
  const subIds = orchestrator.sub_agent_ids ?? [];
  const connected = subAgents.filter((a) => subIds.includes(a.id));
  const extra = ensureExtraFields(orchestrator.extra_fields);
  const a2aList = (extra.a2a_connections as A2aConnection[] | undefined) ?? [];
  const a2aFiltered = a2aList.filter(
    (c): c is A2aConnection => c != null && typeof c === "object" && typeof c.url === "string" && c.url.trim() !== ""
  );
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const orchestratorNode: Node = {
    id: `orch-${orchestrator.id}`,
    type: ORCHESTRATOR_NODE,
    position: { x: 0, y: 0 },
    data: { label: orchestrator.label || orchestrator.name, agent: orchestrator },
    draggable: true,
  };
  nodes.push(orchestratorNode);

  const allSubs = [
    ...connected.map((a) => ({ id: `sub-${a.id}`, label: a.label || a.name, agent: a, a2aUrl: undefined as string | undefined })),
    ...a2aFiltered.map((c, i) => ({
      id: `a2a-${i}`,
      label: c.name || "External",
      agent: undefined as AgentItem | undefined,
      a2aUrl: c.url,
    })),
  ];
  const cols = Math.ceil(Math.sqrt(allSubs.length + 1));
  allSubs.forEach((item, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    nodes.push({
      id: item.id,
      type: SUB_AGENT_NODE,
      position: { x: 180 + col * 200, y: row * 100 },
      data: { label: item.label, agent: item.agent, a2aUrl: item.a2aUrl },
      draggable: true,
    });
    edges.push({
      id: `e-orch-${orchestrator.id}-${item.id}`,
      source: `orch-${orchestrator.id}`,
      target: item.id,
      type: "smoothstep",
      animated: true,
    });
  });

  return { nodes, edges };
}

interface OrchestratorFlowInnerProps {
  orchestrator: AgentItem | null;
  agents: AgentItem[];
  onConnect: (subAgentId: number) => void;
  onDisconnect: (subAgentId: number) => void;
  onDisconnectA2a?: (url: string) => void;
  onChatAgent?: (agent: AgentItem) => void;
  onNodesChange?: (nodes: Node[]) => void;
}

function OrchestratorFlowInner({
  orchestrator,
  agents,
  onConnect,
  onDisconnect,
  onDisconnectA2a,
  onChatAgent,
}: OrchestratorFlowInnerProps) {
  const subAgents = agents.filter((a) => !a.is_orchestrator);
  const { nodes: initialNodes, edges: initialEdges } = orchestrator
    ? flowNodesFromAgents(
        orchestrator,
        subAgents.filter((a) =>
          (orchestrator.sub_agent_ids ?? []).includes(a.id)
        ),
        agents
      )
    : { nodes: [], edges: [] };

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { screenToFlowPosition } = useReactFlow();

  React.useEffect(() => {
    const { nodes: n, edges: e } = orchestrator
      ? flowNodesFromAgents(
          orchestrator,
          subAgents.filter((a) =>
            (orchestrator.sub_agent_ids ?? []).includes(a.id)
          ),
          agents
        )
      : { nodes: [], edges: [] };
    const nodesWithRemove = n.map((node) => {
      if (node.type === SUB_AGENT_NODE && node.data) {
        const d = node.data as AgentNodeData;
        if (d.a2aUrl && onDisconnectA2a) {
          return {
            ...node,
            data: { ...d, onRemove: () => onDisconnectA2a(d.a2aUrl!) },
          };
        }
        if (d.agent) {
          return {
            ...node,
            data: { ...d, onRemove: () => onDisconnect(d.agent!.id) },
          };
        }
      }
      return node;
    });
    setNodes(nodesWithRemove);
    setEdges(e);
  }, [
    orchestrator?.id,
    orchestrator?.sub_agent_ids,
    orchestrator?.extra_fields,
    agents,
    onDisconnect,
    onDisconnectA2a,
    setNodes,
    setEdges,
  ]);

  const onConnectHandler = React.useCallback(
    (params: Connection) => {
      if (!params.source || !params.target || !orchestrator) return;
      const sourceId = String(params.source);
      const targetId = String(params.target);
      const subId = targetId.startsWith("sub-")
        ? parseInt(targetId.replace("sub-", ""), 10)
        : sourceId.startsWith("sub-")
          ? parseInt(sourceId.replace("sub-", ""), 10)
          : null;
      if (subId && !(orchestrator.sub_agent_ids ?? []).includes(subId)) {
        onConnect(subId);
      }
      setEdges((eds) => addEdge(params, eds));
    },
    [orchestrator, onConnect, setEdges]
  );

  const onEdgesChangeHandler = React.useCallback(
    (changes: EdgeChange[]) => {
      for (const c of changes) {
        if (c.type === "remove" && "id" in c && c.id) {
          const edge = edges.find((e) => e.id === c.id);
          if (edge && orchestrator) {
            const targetId =
              typeof edge.target === "string" ? edge.target : String(edge.target);
            if (targetId.startsWith("a2a-")) {
              const idx = parseInt(targetId.replace("a2a-", ""), 10);
              const extra = ensureExtraFields(orchestrator?.extra_fields);
              const list = (extra.a2a_connections as { url?: string }[] | undefined) ?? [];
              const conn = list[idx];
              if (conn?.url && onDisconnectA2a) onDisconnectA2a(conn.url);
            } else {
              const subId = targetId.startsWith("sub-")
                ? parseInt(targetId.replace("sub-", ""), 10)
                : null;
              if (subId) onDisconnect(subId);
            }
          }
        }
      }
      onEdgesChange(changes);
    },
    [edges, orchestrator, onDisconnect, onEdgesChange]
  );

  const onDrop = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const agentIdStr = event.dataTransfer.getData("application/agent-id");
      if (!agentIdStr || !orchestrator) return;
      const agentId = parseInt(agentIdStr, 10);
      if (isNaN(agentId) || (orchestrator.sub_agent_ids ?? []).includes(agentId))
        return;
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      onConnect(agentId);
      setNodes((nds) => {
        const agent = agents.find((a) => a.id === agentId);
        if (!agent) return nds;
        return nds.concat({
          id: `sub-${agentId}`,
          type: SUB_AGENT_NODE,
          position,
          data: { label: agent.label || agent.name, agent },
          draggable: true,
        });
      });
      setEdges((eds) =>
        eds.concat({
          id: `e-orch-${orchestrator.id}-sub-${agentId}`,
          source: `orch-${orchestrator.id}`,
          target: `sub-${agentId}`,
          type: "smoothstep",
          animated: true,
        })
      );
    },
    [orchestrator, agents, onConnect, screenToFlowPosition, setNodes, setEdges]
  );

  const onDragOver = React.useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onNodeClick = React.useCallback(
    (_: React.MouseEvent, node: Node) => {
      const agent = (node.data as AgentNodeData)?.agent;
      if (agent) onChatAgent?.(agent);
    },
    [onChatAgent]
  );

  if (!orchestrator) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/20">
        <div className="text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="size-8" />
          </div>
          <p className="font-medium text-foreground">Select an orchestrator to design its flow</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Then drag sub-agents from the sidebar onto the canvas to connect them.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChangeHandler}
      onConnect={onConnectHandler}
      onNodeClick={onNodeClick}
      onDrop={onDrop}
      onDragOver={onDragOver}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      snapToGrid
      snapGrid={[16, 16]}
      proOptions={{ hideAttribution: true }}
      defaultEdgeOptions={{
        type: "smoothstep",
        animated: true,
        style: { stroke: "var(--primary)", strokeWidth: 1.5, opacity: 0.55 },
      }}
      className="bg-muted/10 [&_.react-flow__node]:cursor-pointer"
    >
      <Background gap={22} size={1} className="!text-border" />
      <Controls
        showInteractive={false}
        className="!rounded-lg !border !border-border !bg-card !shadow-sm [&_button]:!border-border [&_button]:!bg-card [&_button:hover]:!bg-muted [&_button_svg]:!fill-foreground"
      />
      <MiniMap
        pannable
        zoomable
        className="!rounded-lg !border !border-border !bg-card/80 !shadow-sm"
        nodeColor={(n) => (n.type === ORCHESTRATOR_NODE ? "var(--primary)" : "var(--muted-foreground)")}
        nodeStrokeWidth={2}
        maskColor="color-mix(in oklch, var(--background) 75%, transparent)"
      />
    </ReactFlow>
  );
}

export interface OrchestratorFlowProps {
  orchestrator: AgentItem | null;
  agents: AgentItem[];
  onConnect: (subAgentId: number) => void;
  onDisconnect: (subAgentId: number) => void;
  onDisconnectA2a?: (url: string) => void;
  onChatAgent?: (agent: AgentItem) => void;
}

export function OrchestratorFlow({
  orchestrator,
  agents,
  onConnect,
  onDisconnect,
  onDisconnectA2a,
  onChatAgent,
}: OrchestratorFlowProps) {
  return (
    <ReactFlowProvider>
      <div className="h-full w-full">
        <OrchestratorFlowInner
          orchestrator={orchestrator}
          agents={agents}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
          onDisconnectA2a={onDisconnectA2a}
          onChatAgent={onChatAgent}
        />
      </div>
    </ReactFlowProvider>
  );
}
