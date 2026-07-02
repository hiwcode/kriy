from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any

import asyncpg
import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse

from app.deps import get_db
from app.services import agent_service, agent_run_service
from app.repositories import user_config_repo

router = APIRouter(
    prefix="/slack",
    tags=["slack"],
)

_SEEN_SLACK_EVENTS: dict[str, float] = {}
_SEEN_SLACK_EVENTS_TTL = 60 * 10


def _verify_slack_signature(signing_secret: str, timestamp: str, body: bytes, signature: str) -> bool:
    if not signing_secret or not timestamp or not signature:
        return False

    try:
        ts = int(timestamp)
    except ValueError:
        return False

    if abs(time.time() - ts) > 60 * 5:
        return False

    base = f"v0:{timestamp}:{body.decode('utf-8')}"
    digest = hmac.new(signing_secret.encode("utf-8"), base.encode("utf-8"), hashlib.sha256).hexdigest()
    expected = f"v0={digest}"
    return hmac.compare_digest(expected, signature)


async def _resolve_slack_config(
    pool: asyncpg.Pool,
    body: bytes,
    signature: str,
    timestamp: str,
) -> dict[str, Any] | None:
    configs = await user_config_repo.list_slack_enabled_configs(pool)
    for cfg in configs:
        secret = cfg.get("slack_signing_secret")
        if isinstance(secret, str) and _verify_slack_signature(secret, timestamp, body, signature):
            return cfg
    return None


async def _collect_agent_text(
    pool: asyncpg.Pool,
    *,
    agent_id: int,
    text: str,
    db_user_id: int,
) -> str:
    chunks: list[str] = []
    async for chunk in agent_run_service.run_agent_stream(
        pool,
        agent_id=agent_id,
        user_input=text,
        user_id=str(db_user_id),
        db_user_id=db_user_id,
    ):
        if not chunk.startswith("data: "):
            continue
        payload_str = chunk[6:].strip()
        if not payload_str:
            continue
        try:
            evt = json.loads(payload_str)
        except json.JSONDecodeError:
            continue
        if evt.get("type") == "text" and evt.get("text"):
            chunks.append(str(evt["text"]))
        if evt.get("type") == "error":
            return f"Error: {evt.get('error', 'Agent run failed')}"

    output = "".join(chunks).strip()
    return output or "I could not generate a response right now."


async def _post_slack_message(
    *,
    bot_token: str,
    channel: str,
    text: str,
    thread_ts: str | None,
) -> None:
    payload: dict[str, Any] = {"channel": channel, "text": text}
    if thread_ts:
        payload["thread_ts"] = thread_ts

    async with httpx.AsyncClient(timeout=httpx.Timeout(30)) as client:
        resp = await client.post(
            "https://slack.com/api/chat.postMessage",
            json=payload,
            headers={
                "Authorization": f"Bearer {bot_token}",
                "Content-Type": "application/json; charset=utf-8",
            },
        )
    data = resp.json()
    if not data.get("ok"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Slack API error: {data.get('error', 'unknown_error')}",
        )


@router.post("/events")
async def slack_events(
    request: Request,
    pool: asyncpg.Pool = Depends(get_db),
    x_slack_signature: str | None = Header(None, alias="X-Slack-Signature"),
    x_slack_request_timestamp: str | None = Header(None, alias="X-Slack-Request-Timestamp"),
    x_slack_retry_num: str | None = Header(None, alias="X-Slack-Retry-Num"),
) -> JSONResponse:
    if x_slack_retry_num is not None:
        return JSONResponse(content={"ok": True, "ignored": True, "reason": "retry"})
    body = await request.body()
    signature = x_slack_signature or ""
    timestamp = x_slack_request_timestamp or ""

    cfg = await _resolve_slack_config(pool, body, signature, timestamp)
    if not cfg:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Slack signature")

    try:
        payload = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload")

    if payload.get("type") == "url_verification":
        return JSONResponse(content={"challenge": payload.get("challenge", "")})

    event_id = str(payload.get("event_id") or "").strip()
    if event_id:
        now = time.time()
        expired = [key for key, ts in _SEEN_SLACK_EVENTS.items() if now - ts > _SEEN_SLACK_EVENTS_TTL]
        for key in expired:
            _SEEN_SLACK_EVENTS.pop(key, None)
        if event_id in _SEEN_SLACK_EVENTS:
            return JSONResponse(content={"ok": True, "ignored": True, "reason": "duplicate"})
        _SEEN_SLACK_EVENTS[event_id] = now

    if payload.get("type") != "event_callback":
        return JSONResponse(content={"ok": True, "ignored": True})

    event = payload.get("event") or {}
    event_type = event.get("type")
    if event_type not in {"message", "app_mention"}:
        return JSONResponse(content={"ok": True, "ignored": True})

    if event.get("subtype"):
        return JSONResponse(content={"ok": True, "ignored": True})

    if cfg.get("slack_bot_user_id") and event.get("user") == cfg.get("slack_bot_user_id"):
        return JSONResponse(content={"ok": True, "ignored": True})

    text = str(event.get("text") or "").strip()
    if event_type == "app_mention":
        bot_user_id = str(cfg.get("slack_bot_user_id") or "").strip()
        if bot_user_id:
            mention_token = f"<@{bot_user_id}>"
            text = text.replace(mention_token, " ").strip()
    if not text:
        return JSONResponse(content={"ok": True, "ignored": True})

    agent_id = cfg.get("slack_default_agent_id")
    if not agent_id:
        return JSONResponse(content={"ok": False, "error": "slack_default_agent_id_not_configured"})

    agent = await agent_service.get_agent(pool, int(agent_id))
    if not agent:
        return JSONResponse(content={"ok": False, "error": "configured_agent_not_found"})

    bot_token = cfg.get("slack_bot_token")
    if not bot_token:
        return JSONResponse(content={"ok": False, "error": "slack_bot_token_not_configured"})

    reply_text = await _collect_agent_text(
        pool,
        agent_id=int(agent_id),
        text=text,
        db_user_id=int(cfg["user_id"]),
    )

    channel = str(event.get("channel") or cfg.get("slack_default_channel") or "").strip()
    if not channel:
        return JSONResponse(content={"ok": False, "error": "channel_not_available"})
    thread_ts = event.get("thread_ts") or event.get("ts")

    await _post_slack_message(
        bot_token=bot_token,
        channel=channel,
        text=reply_text,
        thread_ts=str(thread_ts) if thread_ts else None,
    )
    return JSONResponse(content={"ok": True})