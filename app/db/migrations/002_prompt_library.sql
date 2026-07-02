-- Prompt library table
CREATE TABLE IF NOT EXISTS prompt_library (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    createdby INTEGER NOT NULL REFERENCES users(id),
    tokens INTEGER,
    extradata JSONB,
    createdat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updatedat TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prompt_library_title ON prompt_library (title);
CREATE INDEX IF NOT EXISTS idx_prompt_library_createdby ON prompt_library (createdby);
