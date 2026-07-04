-- Turn the access log into a semantic audit trail: record the action taken, the
-- resource type, and which resource id. `detail` is reserved for an optional
-- field-level change summary (populated by a deeper layer if enabled).
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS action        TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS resource_type TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS resource_id   TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS detail        JSONB;

CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log (resource_type, resource_id);
