-- Add workspace_id to resources for workspace-scoped access

-- Agents
ALTER TABLE agents ADD COLUMN IF NOT EXISTS workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_agents_workspace_id ON agents(workspace_id);
-- Drop global unique on name; add per-workspace unique later after backfill
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_workspace_name ON agents(workspace_id, name) WHERE workspace_id IS NOT NULL;

-- Prompt library
ALTER TABLE prompt_library ADD COLUMN IF NOT EXISTS workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_prompt_library_workspace_id ON prompt_library(workspace_id);

-- MCP connections
ALTER TABLE mcp_connections ADD COLUMN IF NOT EXISTS workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_mcp_connections_workspace_id ON mcp_connections(workspace_id);

-- Database connections
ALTER TABLE database_connections ADD COLUMN IF NOT EXISTS workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_database_connections_workspace_id ON database_connections(workspace_id);

-- Backfill: create personal workspace per user
INSERT INTO workspaces (name, slug, is_personal, created_by)
SELECT
    'Personal',
    'personal-' || u.id::TEXT,
    TRUE,
    u.id
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.slug = 'personal-' || u.id::TEXT);

-- Add workspace_id to agents - match by created_by
UPDATE agents a
SET workspace_id = w.id
FROM workspaces w
WHERE w.created_by = a.created_by AND w.is_personal = TRUE
  AND a.workspace_id IS NULL;

-- Add workspace_id to prompt_library
UPDATE prompt_library p
SET workspace_id = w.id
FROM workspaces w
WHERE w.created_by = p.createdby AND w.is_personal = TRUE
  AND p.workspace_id IS NULL;

-- Add workspace_id to mcp_connections
UPDATE mcp_connections m
SET workspace_id = w.id
FROM workspaces w
WHERE w.created_by = m.created_by AND w.is_personal = TRUE
  AND m.workspace_id IS NULL;

-- Add workspace_id to database_connections
UPDATE database_connections d
SET workspace_id = w.id
FROM workspaces w
WHERE w.created_by = d.created_by AND w.is_personal = TRUE
  AND d.workspace_id IS NULL;

-- Add owners as workspace_members for personal workspaces
INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT id, created_by, 'owner'
FROM workspaces
WHERE is_personal = TRUE AND created_by IS NOT NULL
ON CONFLICT (workspace_id, user_id) DO NOTHING;
