-- User config table for per-user settings (Google API key, model, etc.)
CREATE TABLE IF NOT EXISTS user_config (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    google_api_key TEXT,
    default_model TEXT DEFAULT 'gemini-2.5-flash',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
