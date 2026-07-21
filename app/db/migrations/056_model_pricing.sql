-- Workspace-scoped model catalog: user-added models and price overrides.
-- Built-in defaults live in app/core/model_pricing.py; rows here override or add
-- to them per workspace (workspace_id NULL = personal).
CREATE TABLE IF NOT EXISTS model_pricing (
    id serial PRIMARY KEY,
    workspace_id integer REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id integer,
    name text NOT NULL,
    label text NOT NULL DEFAULT '',
    input_per_million numeric(12, 4) NOT NULL DEFAULT 0,
    output_per_million numeric(12, 4) NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- One row per (workspace, model name). COALESCE handles the NULL (personal)
-- workspace so a NULL scope can't hold duplicate names.
CREATE UNIQUE INDEX IF NOT EXISTS model_pricing_ws_name
    ON model_pricing (COALESCE(workspace_id, 0), name);
