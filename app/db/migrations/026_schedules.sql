-- Schedules table for one-time and recurring agent tasks
CREATE TABLE IF NOT EXISTS schedules (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    schedule_type TEXT NOT NULL DEFAULT 'one_time' CHECK (schedule_type IN ('one_time', 'recurring')),
    cron_expression TEXT,
    run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    last_run_at TIMESTAMPTZ,
    last_run_status TEXT,
    last_run_result TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'failed')),
    run_count INTEGER NOT NULL DEFAULT 0,
    max_runs INTEGER,
    workspace_id INTEGER REFERENCES workspaces(id),
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedules_agent_id ON schedules (agent_id);
CREATE INDEX IF NOT EXISTS idx_schedules_workspace_id ON schedules (workspace_id);
CREATE INDEX IF NOT EXISTS idx_schedules_status ON schedules (status);
CREATE INDEX IF NOT EXISTS idx_schedules_next_run_at ON schedules (next_run_at) WHERE status = 'active';
