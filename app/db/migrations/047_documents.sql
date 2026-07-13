-- Documents table: metadata for files uploaded to object storage (DO Spaces/S3).
-- bucket_key is set for uploaded files, url is set for external references.
CREATE TABLE IF NOT EXISTS documents (
    id           SERIAL PRIMARY KEY,
    name         TEXT NOT NULL,
    mime_type    TEXT NOT NULL DEFAULT 'application/octet-stream',
    size_bytes   BIGINT NOT NULL DEFAULT 0,
    bucket_key   TEXT,
    url          TEXT,
    agent_id     INTEGER REFERENCES agents(id) ON DELETE CASCADE,
    session_id   TEXT,
    user_id      INTEGER REFERENCES users(id),
    workspace_id INTEGER REFERENCES workspaces(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- If table already exists from earlier migration, add missing columns.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS agent_id INTEGER REFERENCES agents(id) ON DELETE CASCADE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS session_id TEXT;
-- Rename r2_key -> bucket_key if the old column exists.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'r2_key') THEN
    ALTER TABLE documents RENAME COLUMN r2_key TO bucket_key;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_user ON documents (user_id);
CREATE INDEX IF NOT EXISTS idx_documents_agent ON documents (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_session ON documents (agent_id, session_id, created_at DESC);
