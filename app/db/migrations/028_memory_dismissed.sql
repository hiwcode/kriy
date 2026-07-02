-- Track dismissed memories so they don't come back on re-sync
ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS is_dismissed BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_agent_memories_not_dismissed
    ON agent_memories (agent_id, user_id) WHERE is_dismissed = FALSE;
