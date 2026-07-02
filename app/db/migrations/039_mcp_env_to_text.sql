-- Migrate env from JSONB to TEXT for encrypted storage.
-- env holds a Fernet token (see mcp_connection_repo.encrypt), which is not
-- valid JSON, so it cannot live in a JSONB column. Mirrors migration 019
-- which did the same for the headers column.
-- Existing rows with JSONB env are cast to text (JSON string).
ALTER TABLE mcp_connections
    ALTER COLUMN env TYPE TEXT USING env::TEXT;
