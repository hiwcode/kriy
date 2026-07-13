"""Slack tool for agents — post a message to a Slack channel.

Uses the owner's Slack bot token (configured under Config → Slack). The
connection is global to the user; only the channel + text are per-call, so any
agent with this tool enabled can post to a channel (e.g. from a workflow:
"on order.shipped, post to #shipping").
"""

from __future__ import annotations

import json
import logging

import asyncpg
import httpx
from google.adk.tools import FunctionTool

from app.repositories import user_config_repo

logger = logging.getLogger(__name__)


def make_slack_tools(pool: asyncpg.Pool, user_id: int | None) -> list[FunctionTool]:
    """Create the send_slack_message tool bound to the given user's Slack config."""

    async def send_slack_message(text: str, channel: str = "") -> str:
        """Post a message to a Slack channel via the user's connected Slack bot.

        Requires the user to have set a Slack bot token under Config → Slack.

        Args:
            text: The message to post.
            channel: Target channel — an ID like "C0123456789" or a name like
                "#general". Defaults to the configured default channel if omitted.
        """
        if user_id is None:
            return json.dumps({"error": "no user context — cannot send Slack message"})
        if not text.strip():
            return json.dumps({"error": "message text is empty"})

        config = await user_config_repo.get_config(pool, user_id)
        bot_token = (config or {}).get("slack_bot_token")
        if not bot_token:
            return json.dumps({"error": "Slack is not configured. Add a bot token under Config → Slack."})

        target = channel.strip() or (config or {}).get("slack_default_channel") or ""
        if not target:
            return json.dumps({"error": "no channel provided and no default channel configured"})

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    "https://slack.com/api/chat.postMessage",
                    json={"channel": target, "text": text},
                    headers={
                        "Authorization": f"Bearer {bot_token}",
                        "Content-Type": "application/json; charset=utf-8",
                    },
                )
            data = resp.json()
            if not data.get("ok"):
                return json.dumps({"error": f"Slack API error: {data.get('error', 'unknown_error')}"})
            return json.dumps({"success": True, "channel": data.get("channel", target), "ts": data.get("ts")})
        except Exception as e:  # noqa: BLE001
            logger.warning("send_slack_message failed for user %s: %s", user_id, e)
            return json.dumps({"error": f"failed to send Slack message: {e}"})

    return [FunctionTool(func=send_slack_message)]
