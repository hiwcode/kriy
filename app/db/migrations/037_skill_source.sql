-- Track where a skill came from. NULL/absent = created manually; 'self-learned' =
-- written by an agent's self_learning tool from a conversation (so they can be
-- reviewed / pruned separately from hand-authored skills).
ALTER TABLE skills ADD COLUMN IF NOT EXISTS source TEXT;
