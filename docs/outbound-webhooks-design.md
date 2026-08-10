# Outbound Webhooks — design note

Status: proposed · Scope: the outbound half of KRIY's integration surface.

## Problem

Integration is inbound-only today:

| Direction | Sync | Async |
|---|---|---|
| Inbound (app → KRIY) | `POST /events/decide` (gate verdict) | `POST /events` (event → triggers) |
| Outbound (KRIY → app) | REST API (pull) | **— missing —** |

`decide` returns inline, so gates are covered. But an async trigger's **result never gets back** to the caller (e.g. an agent analyzes an uploaded doc; the outcome stays in KRIY). We need a platform-owned outbound channel.

## Two kinds of "outbound" (don't conflate)

1. **Agent actions** (agent → the world): create a ticket, post to Slack, call an API mid-run. **Already solved** by tools / MCP / `call_api`. No new architecture.
2. **Platform events** (KRIY → subscribers): "run completed", "gate denied". **This spec.** Standard answer: webhooks.

## Model: symmetric event hub

Apps emit events *in*; KRIY emits events *out*, over the **same event bus**. The dispatch that fans an event to internal triggers also fans lifecycle events to external webhook subscribers. `emit` (in) ↔ webhook (out). Future events are just new `type`s.

## Event envelope (stable public contract)

```json
{
  "id": "evt_01H…",              // unique per delivery attempt's event
  "type": "run.completed",
  "created_at": "2026-07-17T10:00:00Z",
  "correlation_id": "APP-1013",  // from the originating emit/decide, ties result → request
  "data": { "run_id": 42, "workflow_id": 7, "event_type": "document.uploaded",
            "status": "done", "result": "…agent output…" }
}
```

## Signing

- Header `X-KRIY-Signature: t=<unix>,v1=<hex>` where `v1 = HMAC_SHA256(secret, "<t>.<raw_body>")`.
- Consumers reject if `t` is older than ~5 min (replay protection). Reuse `workspace_signing`'s HMAC.

## Delivery semantics

- **At-least-once.** Consumers **must dedupe on `id`** (idempotency key).
- Retries with exponential backoff (e.g. 30s, 2m, 10m, 1h; ~5 attempts), then dead-letter.
- Every attempt written to a `webhook_deliveries` log (status, code, response snippet) — with **manual replay**.
- Delivery runs off the request path (the existing worker), never blocking a run.

## Data model

```
webhook_subscriptions(id, workspace_id, url, secret, event_glob, enabled, created_at)
webhook_deliveries(id, subscription_id, event_id, type, status, attempts,
                   response_code, error, created_at, delivered_at)
```

`event_glob` matches the event `type` (same globbing as triggers) — e.g. `run.completed`, `gate.*`, `application.*`.

## Event catalog

- **Phase 1:** `run.completed` (carries the agent's result — closes the gap).
- **Phase 2:** `run.failed`, `gate.decided`; optional re-broadcast of processed app events.

## API surface

- `POST/GET/DELETE /webhooks` — manage subscriptions (secret shown once; rotate endpoint).
- `GET /webhooks/{id}/deliveries` + `POST /webhooks/deliveries/{id}/replay`.

## Non-goals / decisions

- **Not** routing results through the agent (`call_api`) as the platform mechanism — LLM-dependent and non-uniform. Agent tool-calls remain for *actions*, not result delivery.
- **Polling** (`GET /workflows/runs/{id}`) stays as the zero-config fallback for consumers that can't expose an endpoint.

## Phased build

1. **MVP:** `webhook_subscriptions` table + deliver `run.completed` from the event worker after `finish_run` (signed, retried, logged). Reuses the bus, the worker, and the HMAC signer — ~a migration + a small delivery module.
2. Webhooks page in the sidebar (subscribe, rotate secret, view deliveries, replay) + more event types.
