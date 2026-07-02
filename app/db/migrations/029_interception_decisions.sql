-- Interception decisions: a log of every /decide verdict (shadow + enforce),
-- powering the Decisions view and AI policy proposals.
CREATE TABLE IF NOT EXISTS interception_decisions (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    decision TEXT NOT NULL,                 -- allow | deny | modify
    mode TEXT NOT NULL DEFAULT 'enforce',   -- observe | suggest | enforce
    changed BOOLEAN NOT NULL DEFAULT FALSE,
    original_payload JSONB,
    final_payload JSONB,
    reason TEXT,
    confidence REAL,
    applied_policies JSONB NOT NULL DEFAULT '[]',
    latency_ms INTEGER,
    user_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interception_decisions_agent
    ON interception_decisions (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interception_decisions_action
    ON interception_decisions (agent_id, action);
