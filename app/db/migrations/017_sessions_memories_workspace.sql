-- Add workspace_id to agent_sessions and agent_memories so they can be scoped by workspace
-- and transferred with agents.

-- Agent sessions
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_agent_sessions_workspace_id ON agent_sessions(workspace_id);

-- Backfill from agent's workspace
UPDATE agent_sessions s
SET workspace_id = a.workspace_id
FROM agents a
WHERE a.id = s.agent_id AND s.workspace_id IS NULL AND a.workspace_id IS NOT NULL;

-- Agent memories
ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_agent_memories_workspace_id ON agent_memories(workspace_id);

-- Backfill from agent's workspace
UPDATE agent_memories m
SET workspace_id = a.workspace_id
FROM agents a
WHERE a.id = m.agent_id AND m.workspace_id IS NULL AND a.workspace_id IS NOT NULL;
