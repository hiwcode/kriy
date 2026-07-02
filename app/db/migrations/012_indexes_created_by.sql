-- Index for user-scoped queries
CREATE INDEX IF NOT EXISTS idx_database_connections_created_by ON database_connections (created_by);
