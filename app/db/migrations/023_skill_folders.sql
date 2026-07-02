-- Skill folders for organizing skills in a file/folder structure
CREATE TABLE IF NOT EXISTS skill_folders (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id INTEGER REFERENCES skill_folders(id) ON DELETE CASCADE,
    workspace_id INTEGER REFERENCES workspaces(id),
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(name, parent_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_skill_folders_workspace_id ON skill_folders (workspace_id);
CREATE INDEX IF NOT EXISTS idx_skill_folders_parent_id ON skill_folders (parent_id);

-- Add folder_id and type to skills table
ALTER TABLE skills ADD COLUMN IF NOT EXISTS folder_id INTEGER REFERENCES skill_folders(id) ON DELETE SET NULL;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'skill';

CREATE INDEX IF NOT EXISTS idx_skills_folder_id ON skills (folder_id);
CREATE INDEX IF NOT EXISTS idx_skills_type ON skills (type);
