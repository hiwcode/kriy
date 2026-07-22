-- Per-session pricing snapshot: the model rates frozen at the time a session's
-- cost was first computed. Cost is otherwise derived on read from the live
-- catalog; snapshotting keeps already-run sessions stable when a user later
-- edits a model's price or changes an agent's model.
--
-- pricing: { "<model_version>": [input_per_million, output_per_million], ... }
-- Keyed by (agent_id, session_id); ADK session ids are UUIDs (unique per session).
CREATE TABLE IF NOT EXISTS session_pricing_snapshots (
    agent_id integer NOT NULL,
    session_id text NOT NULL,
    pricing jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (agent_id, session_id)
);
