-- Per-gate soft-deny flag + a decision audit log.
--
-- allow_override: when a gate with this flag denies, the verdict carries
-- overridable=true so the calling system MAY proceed instead of being hard
-- blocked (advisory deny). Default FALSE = a normal hard deny.
ALTER TABLE decision_gates
    ADD COLUMN IF NOT EXISTS allow_override BOOLEAN NOT NULL DEFAULT FALSE;

-- Every /events/decide verdict is recorded here so you can see which events were
-- allowed vs denied, by which rule, and on what payload.
CREATE TABLE IF NOT EXISTS gate_decisions (
    id                SERIAL PRIMARY KEY,
    workspace_id      INTEGER,
    user_id           INTEGER,
    event_type        TEXT    NOT NULL,
    decision          TEXT    NOT NULL,             -- 'allow' | 'deny'
    overridable       BOOLEAN NOT NULL DEFAULT FALSE,
    matched_gate_id   INTEGER,                       -- NULL for default allow/deny
    matched_gate_name TEXT,
    reason            TEXT    NOT NULL DEFAULT '',
    payload           JSONB,                         -- the evaluated payload (for debugging)
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gate_decisions_ws
    ON gate_decisions (workspace_id, created_at DESC);
