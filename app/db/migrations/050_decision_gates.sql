-- Decision gates: rules-based pre-action gate evaluated synchronously via
-- POST /events/decide. Each row is one rule bound to an event_type (glob).
-- `conditions` is a recursive AND/OR/NONE tree (see app/services/gate_evaluator.py).
-- When a rule's conditions match, its `action` (allow|deny) is the verdict and
-- evaluation stops (first match wins, priority DESC then id ASC). If no rule
-- matches, the caller decides the default (v1: allow).
CREATE TABLE IF NOT EXISTS decision_gates (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER,
    workspace_id INTEGER,
    name         TEXT    NOT NULL,
    event_type   TEXT    NOT NULL DEFAULT '*',
    enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    priority     INTEGER NOT NULL DEFAULT 0,
    conditions   JSONB   NOT NULL DEFAULT '{"match":"all","conditions":[]}'::jsonb,
    action       TEXT    NOT NULL DEFAULT 'deny',
    reason       TEXT    NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_gates_ws
    ON decision_gates (workspace_id, enabled, priority DESC, id ASC);
