-- MCP connections table for connecting MCP servers to agents
CREATE TABLE IF NOT EXISTS mcp_connections (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    headers JSONB DEFAULT '{}',
    timeout_seconds NUMERIC DEFAULT 60,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_mcp_connections_name ON mcp_connections (name);
CREATE INDEX IF NOT EXISTS idx_mcp_connections_created_by ON mcp_connections (created_by);
