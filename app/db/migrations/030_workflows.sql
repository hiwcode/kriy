-- Event-driven workflows: per-user subscriptions that react to app events.
--
-- An app emits an event (e.g. "todo.completed") to POST /events; the dispatcher
-- finds every enabled workflow for that user whose event_type glob matches and
-- runs its agent with the event context + the workflow's instructions. Two users
-- can subscribe to the same event and have it do completely different things.
CREATE TABLE IF NOT EXISTS workflows (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER,
    workspace_id INTEGER,
    name         TEXT NOT NULL,
    event_type   TEXT NOT NULL,                  -- glob matched against the emitted event type
    enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    agent_id     INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    instructions TEXT NOT NULL DEFAULT '',       -- the rule the agent follows (NL, often chat-compiled)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflows_user_event
    ON workflows (user_id, event_type) WHERE enabled;

-- One row per workflow execution triggered by an event (queue + audit log).
CREATE TABLE IF NOT EXISTS workflow_runs (
    id            SERIAL PRIMARY KEY,
    workflow_id   INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    agent_id      INTEGER NOT NULL,
    user_id       INTEGER,
    event_type    TEXT NOT NULL,
    event_payload JSONB,
    status        TEXT NOT NULL DEFAULT 'pending',  -- pending | running | done | error
    response      TEXT,
    error         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow
    ON workflow_runs (workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status
    ON workflow_runs (status, created_at);
