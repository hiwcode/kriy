-- Event registry: a per-user catalog of event types apps can emit.
--
-- This is the shared contract between the emitter (your backend calls POST /events
-- with one of these names) and the subscribers (workflows reference the same names).
-- An optional payload_schema lets emits be validated. Without a registry, event names
-- are free-form strings prone to silent drift; with it, you define them once and wire
-- both sides to the same catalog.
CREATE TABLE IF NOT EXISTS event_types (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER,
    workspace_id   INTEGER,
    name           TEXT NOT NULL,              -- e.g. 'todo.completed'
    description    TEXT NOT NULL DEFAULT '',
    payload_schema JSONB,                      -- optional JSON Schema for the payload
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_types_user_name
    ON event_types (user_id, name);
