-- Agents table for dynamic agent configuration
CREATE TABLE IF NOT EXISTS agents (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT 'gemini-3.1-flash-lite',
    description TEXT,
    instruction TEXT,
    instruction_prompt_id INTEGER REFERENCES prompt_library(id),
    tools JSONB DEFAULT '[]',
    extra_fields JSONB DEFAULT '{}',
    is_orchestrator BOOLEAN DEFAULT FALSE,
    sub_agent_ids INTEGER[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_agents_name ON agents (name);
CREATE INDEX IF NOT EXISTS idx_agents_created_by ON agents (created_by);
CREATE INDEX IF NOT EXISTS idx_agents_is_orchestrator ON agents (is_orchestrator);
