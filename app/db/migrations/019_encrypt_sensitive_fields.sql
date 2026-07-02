-- Migrate headers from JSONB to TEXT for encrypted storage.
-- Existing rows with JSONB headers are cast to text (JSON string).
ALTER TABLE mcp_connections
    ALTER COLUMN headers DROP DEFAULT,
    ALTER COLUMN headers TYPE TEXT USING headers::TEXT,
    ALTER COLUMN headers SET DEFAULT '{}';
