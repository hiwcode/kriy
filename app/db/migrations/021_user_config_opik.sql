-- Add Opik observability fields to user_config
ALTER TABLE user_config ADD COLUMN IF NOT EXISTS opik_api_key TEXT;
ALTER TABLE user_config ADD COLUMN IF NOT EXISTS opik_workspace TEXT;
ALTER TABLE user_config ADD COLUMN IF NOT EXISTS opik_project_name TEXT DEFAULT 'kriy';
ALTER TABLE user_config ADD COLUMN IF NOT EXISTS opik_url_override TEXT;
ALTER TABLE user_config ADD COLUMN IF NOT EXISTS opik_enabled BOOLEAN DEFAULT FALSE;
