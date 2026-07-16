-- User config table for per-user settings (Google API key, model, etc.)
CREATE TABLE IF NOT EXISTS user_config (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    google_api_key TEXT,
    default_model TEXT DEFAULT 'gemini-3.1-flash-lite',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
