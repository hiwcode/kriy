-- Skills table for reusable capability definitions
CREATE TABLE IF NOT EXISTS skills (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    instructions TEXT NOT NULL,
    tools JSONB DEFAULT '[]',
    workspace_id INTEGER REFERENCES workspaces(id),
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(name, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_skills_workspace_id ON skills (workspace_id);
CREATE INDEX IF NOT EXISTS idx_skills_created_by ON skills (created_by);

-- Add skill_ids to agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS skill_ids INTEGER[] DEFAULT '{}';
