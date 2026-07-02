"""Multi-provider LLM API key resolution and env context management."""
from __future__ import annotations

import os
import logging
from contextlib import contextmanager
from typing import Any

import asyncpg

from app.core.config import settings
from app.repositories import user_config_repo

logger = logging.getLogger(__name__)

# Model prefix → (provider name, env var name, user_config field, settings field)
_PROVIDER_MAP: list[tuple[tuple[str, ...], str, str, str, str | None]] = [
    # (prefixes, provider, env_var, user_config_key, settings_attr)
    (("gemini-", "models/gemini"), "google", "GOOGLE_API_KEY", "google_api_key", "GOOGLE_API_KEY"),
    (("gpt-", "o1-", "o3-", "o4-", "chatgpt-"), "openai", "OPENAI_API_KEY", "openai_api_key", None),
    (("claude-",), "anthropic", "ANTHROPIC_API_KEY", "anthropic_api_key", None),
]


def detect_provider(model: str) -> tuple[str, str, str, str | None]:
    """Detect provider from model string.

    Returns (provider_name, env_var_name, user_config_key, settings_attr).
    Falls back to 'unknown' if no match — LiteLLM will try to figure it out.
    """
    for prefixes, provider, env_var, config_key, settings_attr in _PROVIDER_MAP:
        if any(model.startswith(p) for p in prefixes):
            return provider, env_var, config_key, settings_attr
    # Unknown provider — might be Ollama, Azure, etc.
    return "unknown", "", "", None


async def resolve_api_key(
    pool: asyncpg.Pool,
    agent_config: dict[str, Any],
    db_user_id: int | None = None,
) -> tuple[str, str | None, dict | None]:
    """Resolve the API key for the model's provider.

    Priority: user_config table → settings/env → None

    Returns (env_var_name, api_key, user_config_dict).
    """
    raw_model = agent_config.get("model") or settings.DEFAULT_MODEL
    if not isinstance(raw_model, str):
        raw_model = str(raw_model)

    provider, env_var, config_key, settings_attr = detect_provider(raw_model)

    if provider == "unknown":
        # Unknown provider (Ollama, etc.) — no API key needed
        return "", None, None

    api_key = None
    user_config = None

    # 1) Try user's key from config table
    if db_user_id is not None:
        user_config = await user_config_repo.get_config(pool, db_user_id)
        if user_config and user_config.get(config_key):
            api_key = user_config[config_key]

    # 2) Fall back to settings / env
    if not api_key:
        if settings_attr:
            api_key = getattr(settings, settings_attr, None)
        if not api_key:
            api_key = os.environ.get(env_var)

    return env_var, api_key, user_config


@contextmanager
def api_key_context(env_var: str, api_key: str | None):
    """Temporarily set the provider's API key env var for this request.

    For Google, also disables Vertex AI to force API key auth.
    """
    if not env_var or not api_key:
        yield
        return

    old_values: dict[str, str | None] = {}

    # Set the main key
    old_values[env_var] = os.environ.get(env_var)
    os.environ[env_var] = api_key

    # Google-specific: disable Vertex
    if env_var == "GOOGLE_API_KEY":
        old_values["GOOGLE_GENAI_USE_VERTEXAI"] = os.environ.get("GOOGLE_GENAI_USE_VERTEXAI")
        os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "False"

    try:
        yield
    finally:
        for key, old_val in old_values.items():
            if old_val is not None:
                os.environ[key] = old_val
            elif key in os.environ:
                del os.environ[key]
