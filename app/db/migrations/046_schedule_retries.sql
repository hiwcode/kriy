-- Retry support for scheduled tasks.
-- On failure, the scheduler retries up to max_retries times with retry_delay_seconds
-- between attempts. retry_count tracks how many retries have been attempted for the
-- current run. Resets to 0 on success or when a new run starts.
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 0;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS retry_delay_seconds INTEGER NOT NULL DEFAULT 60;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;
