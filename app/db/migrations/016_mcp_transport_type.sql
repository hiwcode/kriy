-- Add transport_type to mcp_connections (sse or streamable_http)
ALTER TABLE mcp_connections ADD COLUMN IF NOT EXISTS transport_type TEXT NOT NULL DEFAULT 'streamable_http';
