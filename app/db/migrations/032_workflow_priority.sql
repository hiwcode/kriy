-- Workflow priority + a real run queue.
--
-- priority orders execution (higher runs first); the worker claims pending runs
-- one at a time in (priority DESC, created_at ASC) order instead of firing all at
-- once. priority is copied onto each run at enqueue time so the queue can sort
-- without joining back to workflows.
ALTER TABLE workflows     ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;

-- Partial index supporting the queue-claim query.
CREATE INDEX IF NOT EXISTS idx_workflow_runs_queue
    ON workflow_runs (priority DESC, created_at ASC)
    WHERE status = 'pending';
