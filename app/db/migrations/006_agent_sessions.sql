-- Agent sessions for persistent chat history
CREATE TABLE IF NOT EXISTS agent_sessions (
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    session_data JSONB NOT NULL,
    last_update_time REAL NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (agent_id, user_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent_user ON agent_sessions (agent_id, user_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_last_update ON agent_sessions (last_update_time DESC);
