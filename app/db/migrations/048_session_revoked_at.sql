-- Refresh-token rotation: record when a session was revoked so we can tell a
-- benign concurrent-refresh race (revoked moments ago) from genuine reuse of a
-- long-dead token (which should revoke the whole session family).
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
