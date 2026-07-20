-- A webhook subscribes to MANY event types, not one. Replace the single
-- event_glob with an event_types array (each entry is a glob, matched against
-- the event type). Backfills existing rows from the old column.
ALTER TABLE webhook_subscriptions ADD COLUMN IF NOT EXISTS event_types text[] NOT NULL DEFAULT '{}';

UPDATE webhook_subscriptions
   SET event_types = ARRAY[event_glob]
 WHERE event_glob IS NOT NULL
   AND (event_types IS NULL OR event_types = '{}');

ALTER TABLE webhook_subscriptions DROP COLUMN IF EXISTS event_glob;
