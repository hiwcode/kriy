-- Scope skill_folders to a specific skill
ALTER TABLE skill_folders ADD COLUMN IF NOT EXISTS skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_skill_folders_skill_id ON skill_folders (skill_id);

-- Skill files table
CREATE TABLE IF NOT EXISTS skill_files (
    id SERIAL PRIMARY KEY,
    skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    file_type TEXT NOT NULL DEFAULT 'md',
    folder_id INTEGER REFERENCES skill_folders(id) ON DELETE SET NULL,
    workspace_id INTEGER REFERENCES workspaces(id),
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(skill_id, name, folder_id)
);

CREATE INDEX IF NOT EXISTS idx_skill_files_skill_id ON skill_files (skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_files_folder_id ON skill_files (folder_id);

-- Backfill SKILL.md for existing skills
INSERT INTO skill_files (skill_id, name, content, file_type, workspace_id, created_by)
SELECT id, 'SKILL.md', instructions, 'md', workspace_id, created_by
FROM skills
WHERE NOT EXISTS (
    SELECT 1 FROM skill_files sf WHERE sf.skill_id = skills.id AND sf.name = 'SKILL.md'
);
