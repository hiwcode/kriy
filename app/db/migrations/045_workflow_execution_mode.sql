-- Per-workflow execution mode: serial (one run at a time, default) or parallel.
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS execution_mode TEXT NOT NULL DEFAULT 'serial';
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS max_concurrency INTEGER NOT NULL DEFAULT 3;
