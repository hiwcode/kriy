-- Add OpenAI and Anthropic API key columns to user_config
ALTER TABLE user_config ADD COLUMN IF NOT EXISTS openai_api_key TEXT;
ALTER TABLE user_config ADD COLUMN IF NOT EXISTS anthropic_api_key TEXT;
