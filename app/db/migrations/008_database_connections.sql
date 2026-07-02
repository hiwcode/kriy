-- Database connections for agent SQL query tool
CREATE TABLE IF NOT EXISTS database_connections (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    connection_url TEXT NOT NULL,
    read_only BOOLEAN DEFAULT true,
    max_rows INTEGER DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_database_connections_name ON database_connections (name);
