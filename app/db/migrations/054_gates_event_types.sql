-- A gate subscribes to MANY event types, not one. event_type (single) → event_types[].
ALTER TABLE decision_gates ADD COLUMN IF NOT EXISTS event_types text[] NOT NULL DEFAULT '{}';

UPDATE decision_gates
   SET event_types = ARRAY[event_type]
 WHERE event_type IS NOT NULL
   AND (event_types IS NULL OR event_types = '{}');

ALTER TABLE decision_gates DROP COLUMN IF EXISTS event_type;
