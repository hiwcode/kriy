-- Per-user API keys for external integration (Slack, Discord, custom apps, etc.)
-- Keys are hashed for lookup; prefix shown in UI for identification
CREATE TABLE IF NOT EXISTS user_api_keys (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_api_keys_key_hash ON user_api_keys(key_hash);
