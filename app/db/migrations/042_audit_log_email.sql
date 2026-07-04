-- Store the acting user's email on each audit row so "who" is human-readable
-- without a join (and so login/logout rows are identifiable).
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS email TEXT;
