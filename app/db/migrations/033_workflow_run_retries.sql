-- Retry/backoff for workflow runs.
--
-- A run that fails (e.g. transient model 429) is requeued with exponential backoff
-- until max_attempts, then marked error. next_attempt_at gates when a pending run
-- becomes claimable again.
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS attempts        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS max_attempts    INTEGER NOT NULL DEFAULT 3;
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;
