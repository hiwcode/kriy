-- Add Slack integration fields to user_config
ALTER TABLE user_config ADD COLUMN IF NOT EXISTS slack_bot_token TEXT;
ALTER TABLE user_config ADD COLUMN IF NOT EXISTS slack_signing_secret TEXT;
ALTER TABLE user_config ADD COLUMN IF NOT EXISTS slack_app_token TEXT;
ALTER TABLE user_config ADD COLUMN IF NOT EXISTS slack_bot_user_id TEXT;
ALTER TABLE user_config ADD COLUMN IF NOT EXISTS slack_default_channel TEXT;
ALTER TABLE user_config ADD COLUMN IF NOT EXISTS slack_default_agent_id INTEGER;
ALTER TABLE user_config ADD COLUMN IF NOT EXISTS slack_enabled BOOLEAN DEFAULT FALSE;
