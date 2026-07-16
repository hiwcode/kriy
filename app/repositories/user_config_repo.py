from __future__ import annotations

from typing import Any

import asyncpg

from app.core.encryption import decrypt_or_none, encrypt_or_none

_UNCHANGED = object()

_COLUMNS = (
    "user_id, google_api_key, openai_api_key, anthropic_api_key, default_model, "
    "opik_api_key, opik_workspace, opik_project_name, opik_url_override, opik_enabled, "
    "slack_bot_token, slack_signing_secret, slack_app_token, slack_bot_user_id, slack_default_channel, slack_default_agent_id, slack_enabled, "
    "gmail_address, gmail_app_password, "
    "created_at, updated_at"
)


def _decrypt_row(row: dict[str, Any]) -> dict[str, Any]:
    result = dict(row)
    result["google_api_key"] = decrypt_or_none(result.get("google_api_key"))
    result["openai_api_key"] = decrypt_or_none(result.get("openai_api_key"))
    result["anthropic_api_key"] = decrypt_or_none(result.get("anthropic_api_key"))
    result["opik_api_key"] = decrypt_or_none(result.get("opik_api_key"))
    result["slack_bot_token"] = decrypt_or_none(result.get("slack_bot_token"))
    result["slack_signing_secret"] = decrypt_or_none(result.get("slack_signing_secret"))
    result["slack_app_token"] = decrypt_or_none(result.get("slack_app_token"))
    result["gmail_app_password"] = decrypt_or_none(result.get("gmail_app_password"))
    return result


async def get_config(pool: asyncpg.Pool, user_id: int) -> dict[str, Any] | None:
    query = f"""
    SELECT {_COLUMNS}
    FROM user_config
    WHERE user_id = $1;
    """
    row = await pool.fetchrow(query, user_id)
    if not row:
        return None
    return _decrypt_row(row)


async def upsert_config(
    pool: asyncpg.Pool,
    user_id: int,
    *,
    google_api_key: Any = _UNCHANGED,
    openai_api_key: Any = _UNCHANGED,
    anthropic_api_key: Any = _UNCHANGED,
    default_model: Any = _UNCHANGED,
    opik_api_key: Any = _UNCHANGED,
    opik_workspace: Any = _UNCHANGED,
    opik_project_name: Any = _UNCHANGED,
    opik_url_override: Any = _UNCHANGED,
    opik_enabled: Any = _UNCHANGED,
    slack_bot_token: Any = _UNCHANGED,
    slack_signing_secret: Any = _UNCHANGED,
    slack_app_token: Any = _UNCHANGED,
    slack_bot_user_id: Any = _UNCHANGED,
    slack_default_channel: Any = _UNCHANGED,
    slack_default_agent_id: Any = _UNCHANGED,
    slack_enabled: Any = _UNCHANGED,
    gmail_address: Any = _UNCHANGED,
    gmail_app_password: Any = _UNCHANGED,
) -> dict[str, Any]:
    """Upsert config. Omit kwargs for fields to leave unchanged."""
    existing = await get_config(pool, user_id)
    if existing:
        gkey = google_api_key if google_api_key is not _UNCHANGED else existing.get("google_api_key")
        oai_key = openai_api_key if openai_api_key is not _UNCHANGED else existing.get("openai_api_key")
        ant_key = anthropic_api_key if anthropic_api_key is not _UNCHANGED else existing.get("anthropic_api_key")
        dmodel = default_model if default_model is not _UNCHANGED else existing.get("default_model")
        o_key = opik_api_key if opik_api_key is not _UNCHANGED else existing.get("opik_api_key")
        o_ws = opik_workspace if opik_workspace is not _UNCHANGED else existing.get("opik_workspace")
        o_proj = opik_project_name if opik_project_name is not _UNCHANGED else existing.get("opik_project_name")
        o_url = opik_url_override if opik_url_override is not _UNCHANGED else existing.get("opik_url_override")
        o_en = opik_enabled if opik_enabled is not _UNCHANGED else existing.get("opik_enabled")
        s_bot_token = slack_bot_token if slack_bot_token is not _UNCHANGED else existing.get("slack_bot_token")
        s_signing_secret = slack_signing_secret if slack_signing_secret is not _UNCHANGED else existing.get("slack_signing_secret")
        s_app_token = slack_app_token if slack_app_token is not _UNCHANGED else existing.get("slack_app_token")
        s_bot_user_id = slack_bot_user_id if slack_bot_user_id is not _UNCHANGED else existing.get("slack_bot_user_id")
        s_default_channel = slack_default_channel if slack_default_channel is not _UNCHANGED else existing.get("slack_default_channel")
        s_default_agent_id = slack_default_agent_id if slack_default_agent_id is not _UNCHANGED else existing.get("slack_default_agent_id")
        s_enabled = slack_enabled if slack_enabled is not _UNCHANGED else existing.get("slack_enabled")
        g_addr = gmail_address if gmail_address is not _UNCHANGED else existing.get("gmail_address")
        g_pass = gmail_app_password if gmail_app_password is not _UNCHANGED else existing.get("gmail_app_password")
    else:
        gkey = google_api_key if google_api_key is not _UNCHANGED else None
        oai_key = openai_api_key if openai_api_key is not _UNCHANGED else None
        ant_key = anthropic_api_key if anthropic_api_key is not _UNCHANGED else None
        dmodel = default_model if default_model is not _UNCHANGED else "gemini-3.1-flash-lite"
        o_key = opik_api_key if opik_api_key is not _UNCHANGED else None
        o_ws = opik_workspace if opik_workspace is not _UNCHANGED else None
        o_proj = opik_project_name if opik_project_name is not _UNCHANGED else "atelier"
        o_url = opik_url_override if opik_url_override is not _UNCHANGED else None
        o_en = opik_enabled if opik_enabled is not _UNCHANGED else False
        s_bot_token = slack_bot_token if slack_bot_token is not _UNCHANGED else None
        s_signing_secret = slack_signing_secret if slack_signing_secret is not _UNCHANGED else None
        s_app_token = slack_app_token if slack_app_token is not _UNCHANGED else None
        s_bot_user_id = slack_bot_user_id if slack_bot_user_id is not _UNCHANGED else None
        s_default_channel = slack_default_channel if slack_default_channel is not _UNCHANGED else None
        s_default_agent_id = slack_default_agent_id if slack_default_agent_id is not _UNCHANGED else None
        s_enabled = slack_enabled if slack_enabled is not _UNCHANGED else False
        g_addr = gmail_address if gmail_address is not _UNCHANGED else None
        g_pass = gmail_app_password if gmail_app_password is not _UNCHANGED else None

    query = f"""
    INSERT INTO user_config (user_id, google_api_key, openai_api_key, anthropic_api_key, default_model,
        opik_api_key, opik_workspace, opik_project_name, opik_url_override, opik_enabled,
        slack_bot_token, slack_signing_secret, slack_app_token, slack_bot_user_id, slack_default_channel, slack_default_agent_id, slack_enabled,
        gmail_address, gmail_app_password)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    ON CONFLICT (user_id) DO UPDATE SET
        google_api_key = EXCLUDED.google_api_key,
        openai_api_key = EXCLUDED.openai_api_key,
        anthropic_api_key = EXCLUDED.anthropic_api_key,
        default_model = EXCLUDED.default_model,
        opik_api_key = EXCLUDED.opik_api_key,
        opik_workspace = EXCLUDED.opik_workspace,
        opik_project_name = EXCLUDED.opik_project_name,
        opik_url_override = EXCLUDED.opik_url_override,
        opik_enabled = EXCLUDED.opik_enabled,
        slack_bot_token = EXCLUDED.slack_bot_token,
        slack_signing_secret = EXCLUDED.slack_signing_secret,
        slack_app_token = EXCLUDED.slack_app_token,
        slack_bot_user_id = EXCLUDED.slack_bot_user_id,
        slack_default_channel = EXCLUDED.slack_default_channel,
        slack_default_agent_id = EXCLUDED.slack_default_agent_id,
        slack_enabled = EXCLUDED.slack_enabled,
        gmail_address = EXCLUDED.gmail_address,
        gmail_app_password = EXCLUDED.gmail_app_password,
        updated_at = NOW()
    RETURNING {_COLUMNS};
    """
    encrypted_gkey = encrypt_or_none(gkey)
    encrypted_oai_key = encrypt_or_none(oai_key)
    encrypted_ant_key = encrypt_or_none(ant_key)
    encrypted_okey = encrypt_or_none(o_key)
    encrypted_slack_bot_token = encrypt_or_none(s_bot_token)
    encrypted_slack_signing_secret = encrypt_or_none(s_signing_secret)
    encrypted_slack_app_token = encrypt_or_none(s_app_token)
    encrypted_gmail_app_password = encrypt_or_none(g_pass)
    row = await pool.fetchrow(
        query,
        user_id,
        encrypted_gkey,
        encrypted_oai_key,
        encrypted_ant_key,
        dmodel or "gemini-3.1-flash-lite",
        encrypted_okey,
        o_ws or None,
        o_proj or "atelier",
        o_url or None,
        bool(o_en),
        encrypted_slack_bot_token,
        encrypted_slack_signing_secret,
        encrypted_slack_app_token,
        s_bot_user_id or None,
        s_default_channel or None,
        s_default_agent_id,
        bool(s_enabled),
        g_addr or None,
        encrypted_gmail_app_password,
    )
    if not row:
        return {}
    return _decrypt_row(row)


async def list_slack_enabled_configs(pool: asyncpg.Pool) -> list[dict[str, Any]]:
    """Return all user configs with Slack enabled and signing secret present."""
    query = f"""
    SELECT {_COLUMNS}
    FROM user_config
    WHERE slack_enabled = TRUE
      AND slack_signing_secret IS NOT NULL;
    """
    rows = await pool.fetch(query)
    return [_decrypt_row(dict(row)) for row in rows]
