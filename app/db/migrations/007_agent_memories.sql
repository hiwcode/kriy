-- Agent memories: extracted facts from sessions
CREATE TABLE IF NOT EXISTS agent_memories (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    session_id TEXT,
    content TEXT NOT NULL,
    memory_type TEXT DEFAULT 'fact',
    confidence REAL DEFAULT 1.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_memories_agent_user ON agent_memories (agent_id, user_id);
CREATE INDEX IF NOT EXISTS idx_agent_memories_updated ON agent_memories (updated_at DESC);
