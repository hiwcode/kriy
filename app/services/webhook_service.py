"""Outbound webhook delivery — sign, POST, retry (bounded), and log.

Phase 1 delivers `run.completed` from the event worker. Delivery is at-least-once;
consumers must dedupe on the event ``id``. Signature scheme (Stripe-style):

    X-KRIY-Signature: t=<unix>,v1=<hex>
    v1 = HMAC_SHA256(subscription.secret, "<t>.<raw_body>")

Note: MVP does a couple of bounded inline retries. Durable long-backoff redelivery
is Phase 2 (a delivery queue); failed deliveries can be replayed manually meanwhile.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import secrets
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.net_guard import assert_public_url
from app.repositories import webhook_repo

logger = logging.getLogger(__name__)

_TIMEOUT = 10.0
_MAX_ATTEMPTS = 2  # bounded inline retries; Phase 2 adds durable backoff


def new_secret() -> str:
    return "whsec_" + secrets.token_urlsafe(32)


def signature_header(secret: str, body: str, ts: int | None = None) -> str:
    ts = ts or int(time.time())
    mac = hmac.new(secret.encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()
    return f"t={ts},v1={mac}"


def verify(secret: str, body: str, header: str, tolerance: int = 300) -> bool:
    """Consumer-side helper (also used in tests): validate a signature header."""
    try:
        parts = dict(p.split("=", 1) for p in header.split(","))
        ts = int(parts["t"])
        if abs(time.time() - ts) > tolerance:
            return False
        expected = hmac.new(secret.encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, parts.get("v1", ""))
    except Exception:  # noqa: BLE001
        return False


def _correlation_id(payload: Any) -> str | None:
    if isinstance(payload, dict):
        for key in ("correlation_id", "application_id", "id"):
            if payload.get(key):
                return str(payload[key])
    return None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _deliver(pool, sub: dict, event_id: str, event_type: str, envelope: dict) -> None:
    body = json.dumps(envelope, default=str)
    # SSRF guard: never POST to internal/metadata hosts (localhost allowed in dev).
    try:
        assert_public_url(sub["url"])
    except ValueError as e:
        await webhook_repo.log_delivery(
            pool, subscription_id=sub["id"], event_id=event_id, type=event_type,
            payload=envelope, status="failed", attempts=0, response_code=None,
            error=f"blocked: {e}",
        )
        logger.warning("webhook to sub %s blocked (SSRF): %s", sub["id"], e)
        return
    status, code, error, attempts = "failed", None, None, 0
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        attempts = attempt
        try:
            headers = {
                "Content-Type": "application/json",
                "X-KRIY-Event": event_type,
                "X-KRIY-Signature": signature_header(sub["secret"], body),
            }
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                resp = await client.post(sub["url"], content=body, headers=headers)
            code = resp.status_code
            if 200 <= code < 300:
                status, error = "success", None
                break
            error = f"HTTP {code}"
        except Exception as e:  # noqa: BLE001
            error = str(e)[:300]
        if attempt < _MAX_ATTEMPTS:
            await asyncio.sleep(1.0)

    await webhook_repo.log_delivery(
        pool, subscription_id=sub["id"], event_id=event_id, type=event_type,
        payload=envelope, status=status, attempts=attempts, response_code=code, error=error,
        delivered_at=datetime.now(timezone.utc) if status == "success" else None,
    )
    if status != "success":
        logger.warning("webhook %s delivery to sub %s failed: %s", event_type, sub["id"], error)


async def deliver_event(
    pool, *, workspace_id: int | None, event_type: str, correlation_id: str | None, data: dict
) -> None:
    """Fan a platform event out to every matching subscription. Never raises."""
    try:
        subs = await webhook_repo.find_matching(pool, workspace_id=workspace_id, event_type=event_type)
    except Exception as e:  # noqa: BLE001
        logger.warning("webhook subscription lookup failed: %s", e)
        return
    for sub in subs:
        envelope = {
            "id": "evt_" + uuid.uuid4().hex,
            "type": event_type,
            "created_at": _now_iso(),
            "correlation_id": correlation_id,
            "data": data,
        }
        await _deliver(pool, sub, envelope["id"], event_type, envelope)


async def deliver_run_completed(pool, *, workflow: dict, run: dict, result: str) -> None:
    """Build and fan out the run.completed event for a finished workflow run."""
    payload = run.get("event_payload")
    await deliver_event(
        pool,
        workspace_id=workflow.get("workspace_id"),
        event_type="run.completed",
        correlation_id=_correlation_id(payload),
        data={
            "run_id": run.get("id"),
            "workflow_id": workflow.get("id"),
            "workflow_name": workflow.get("name"),
            "event_type": run.get("event_type"),
            "status": "done",
            "result": result,
            "event_payload": payload,
        },
    )


async def replay(pool, delivery_id: int) -> dict | None:
    """Re-send a past delivery (new attempt, new delivery row). Returns the subscription
    or None if the delivery/subscription no longer exists."""
    delivery = await webhook_repo.get_delivery(pool, delivery_id)
    if not delivery:
        return None
    sub = await webhook_repo.get(pool, delivery["subscription_id"])
    if not sub:
        return None
    envelope = delivery.get("payload") or {}
    event_id = envelope.get("id") or ("evt_" + uuid.uuid4().hex)
    await _deliver(pool, sub, event_id, delivery["type"], envelope)
    return sub
