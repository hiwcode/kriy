-- In-app notifications (delivered live over WebSocket, also persisted for history).
CREATE TABLE IF NOT EXISTS notifications (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL,
    workspace_id INTEGER,
    title        TEXT NOT NULL,
    body         TEXT NOT NULL DEFAULT '',
    level        TEXT NOT NULL DEFAULT 'info',   -- info | success | warning | error
    source       TEXT,                           -- e.g. the agent name that sent it
    link         TEXT,                           -- optional URL to open
    read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (user_id) WHERE read = FALSE;
