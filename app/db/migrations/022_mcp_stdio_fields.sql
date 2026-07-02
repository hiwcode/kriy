-- Add stdio transport fields to mcp_connections
ALTER TABLE mcp_connections ADD COLUMN IF NOT EXISTS command TEXT;
ALTER TABLE mcp_connections ADD COLUMN IF NOT EXISTS args JSONB DEFAULT '[]';
ALTER TABLE mcp_connections ADD COLUMN IF NOT EXISTS env JSONB;

-- Make url nullable for stdio connections
ALTER TABLE mcp_connections ALTER COLUMN url DROP NOT NULL;
