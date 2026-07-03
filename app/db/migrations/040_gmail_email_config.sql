-- Gmail send-email config (per user). The app password is stored encrypted at
-- rest (Fernet), like all other secrets in user_config.
ALTER TABLE user_config ADD COLUMN IF NOT EXISTS gmail_address TEXT;
ALTER TABLE user_config ADD COLUMN IF NOT EXISTS gmail_app_password TEXT;
