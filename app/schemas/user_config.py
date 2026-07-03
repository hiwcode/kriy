from __future__ import annotations

from pydantic import BaseModel


class UserConfigUpdate(BaseModel):
    google_api_key: str | None = None
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    default_model: str | None = None
    opik_api_key: str | None = None
    opik_workspace: str | None = None
    opik_project_name: str | None = None
    opik_url_override: str | None = None
    opik_enabled: bool | None = None
    slack_bot_token: str | None = None
    slack_signing_secret: str | None = None
    slack_app_token: str | None = None
    slack_bot_user_id: str | None = None
    slack_default_channel: str | None = None
    slack_default_agent_id: int | None = None
    slack_enabled: bool | None = None
    gmail_address: str | None = None
    gmail_app_password: str | None = None


class UserConfigOut(BaseModel):
    user_id: int
    google_api_key: str | None
    openai_api_key: str | None
    anthropic_api_key: str | None
    default_model: str | None
    opik_api_key: str | None
    opik_workspace: str | None
    opik_project_name: str | None
    opik_url_override: str | None
    opik_enabled: bool | None
    slack_bot_token: str | None
    slack_signing_secret: str | None
    slack_app_token: str | None
    slack_bot_user_id: str | None
    slack_default_channel: str | None
    slack_default_agent_id: int | None
    slack_enabled: bool | None
    gmail_address: str | None
    gmail_app_password: str | None
    created_at: str
    updated_at: str
