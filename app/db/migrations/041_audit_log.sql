-- Audit log: one row per mutating request (POST/PUT/PATCH/DELETE). Records who
-- did what, when, and the outcome. Written by middleware; not surfaced in the UI.
CREATE TABLE IF NOT EXISTS audit_log (
    id           BIGSERIAL PRIMARY KEY,
    user_id      INTEGER,
    workspace_id INTEGER,
    method       TEXT NOT NULL,
    path         TEXT NOT NULL,
    status_code  INTEGER,
    ip           TEXT,
    user_agent   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC);
