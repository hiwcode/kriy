-- Remove duplicate agent_memories rows, keeping only the oldest per
-- (agent_id, user_id, content, memory_type) group, then add a unique
-- constraint so duplicates can never be inserted again.

-- Step 1: Delete duplicates – keep the row with the smallest id.
DELETE FROM agent_memories
WHERE id NOT IN (
    SELECT MIN(id)
    FROM agent_memories
    GROUP BY agent_id, user_id, LOWER(TRIM(content)), memory_type
);

-- Step 2: Add a unique index on the normalised content.
-- Using a functional index so the comparison is case-insensitive / trim-safe.
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_memories_content
    ON agent_memories (agent_id, user_id, LOWER(TRIM(content)), memory_type);
