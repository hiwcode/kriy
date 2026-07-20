-- A trigger (workflow) subscribes to MANY event types. event_type (single) → event_types[].
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS event_types text[] NOT NULL DEFAULT '{}';

UPDATE workflows
   SET event_types = ARRAY[event_type]
 WHERE event_type IS NOT NULL
   AND (event_types IS NULL OR event_types = '{}');

ALTER TABLE workflows DROP COLUMN IF EXISTS event_type;
