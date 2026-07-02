-- Add prompt_type to prompt_library: 'system' | 'instructions'
ALTER TABLE prompt_library
ADD COLUMN IF NOT EXISTS prompt_type TEXT NOT NULL DEFAULT 'instructions';

CREATE INDEX IF NOT EXISTS idx_prompt_library_prompt_type ON prompt_library (prompt_type);

-- Add system_prompt and system_prompt_id to agents
ALTER TABLE agents
ADD COLUMN IF NOT EXISTS system_prompt TEXT,
ADD COLUMN IF NOT EXISTS system_prompt_id INTEGER REFERENCES prompt_library(id);
