# KRIY integration contract

## Base URL and authentication

Use an origin such as `https://kriy.example.com`; stable endpoints start with `/api/v1`.

For a backend integration send:

```http
X-API-Key: kriy-...
Accept: application/json
```

For JSON requests also send `Content-Type: application/json`. A personal API key carries
the user identity required by workspace resources. Do not use a server-level `API_KEYS`
value for workspace integrations.

Optionally select a team workspace:

```http
X-Workspace-Id: 17
```

Omit the header for the API-key owner's personal workspace. The user must be a member of
the selected workspace.

Use these environment variables unless the target repository has an equivalent naming
scheme:

```text
KRIY_BASE_URL
KRIY_API_KEY
KRIY_WORKSPACE_ID   # optional
KRIY_WEBHOOK_SECRET # only for a receiver
```

## Health and discovery

- `GET /api/v1/health` is public and returns the common envelope with
  `data.status: "ok"`.
- `GET /api/openapi.json` is public only when API documentation is enabled.
- `GET /api/v1/agents/` verifies authentication and lists accessible agents.

Most management endpoints return:

```json
{"success":true,"message":"...","data":{},"pagination":null}
```

FastAPI errors return `{"detail":"..."}` or a validation `detail` array.

## Direct interactive agent runs

Start or attach to a run:

```http
POST /api/v1/agents/{agent_id}/run
Content-Type: application/json
Accept: text/event-stream
```

```json
{
  "message": "Summarize this order",
  "session_id": "optional-stable-session-id",
  "document_ids": [12, 13]
}
```

The response is Server-Sent Events. Each `data:` value is JSON with one of these shapes:

```json
{"type":"session","session_id":"uuid"}
{"type":"text","text":"incremental text"}
{"type":"card","card":{"type":"..."}}
{"type":"tool_confirmation","function_call_id":"...","tool_name":"...","args":{},"hint":"..."}
{"type":"error","error":"safe error message"}
```

Concatenate `text` payloads in arrival order. Preserve the emitted `session_id` for later
messages and reattachment. A stream closing after `tool_confirmation` is expected.

Resume a confirmed/rejected tool call and consume the returned SSE stream:

```http
POST /api/v1/agents/{agent_id}/confirm
```

```json
{
  "session_id": "uuid",
  "function_call_id": "call-id",
  "confirmed": true
}
```

Run lifecycle helpers:

| Endpoint | Purpose |
| --- | --- |
| `POST /api/v1/agents/{id}/sessions` | Allocate a session ID |
| `GET /api/v1/agents/{id}/sessions` | List sessions |
| `GET /api/v1/agents/{id}/sessions/{session_id}` | Read persisted history |
| `GET /api/v1/agents/{id}/runs/{session_id}/status` | Read active/recent status |
| `GET /api/v1/agents/{id}/runs/{session_id}/stream` | Replay and tail a run over SSE |
| `POST /api/v1/agents/{id}/runs/{session_id}/stop` | Stop an active run |

The current live run buffer is process-local. A multi-instance KRIY deployment requires
sticky routing or a shared run coordinator for status/reattachment; persisted session
history remains durable.

## Events and workflows

Optionally register an event contract:

```http
PUT /api/v1/event-types
```

```json
{
  "name":"order.created",
  "description":"A committed order",
  "payload_schema":{"type":"object","required":["order_id"]}
}
```

Create a workflow:

```http
POST /api/v1/workflows
```

```json
{
  "name":"Handle orders",
  "event_types":["order.created"],
  "agent_id":3,
  "instructions":"Review the order.",
  "enabled":true,
  "priority":0,
  "execution_mode":"serial",
  "max_concurrency":3
}
```

Emit a durable application event:

```http
POST /api/v1/events
```

```json
{"type":"order.created","payload":{"order_id":"ord_123","correlation_id":"checkout-8b5f"}}
```

Direct response (not the common envelope):

```json
{"event":"order.created","matched":1,"run_ids":[42],"registered":true}
```

This acknowledges queuing, not completion. `matched: 0` is a successful no-op. Read a
run using `GET /api/v1/workflows/runs/{run_id}`. States are `pending`, `running`, `done`,
or `error`; completed data includes `response`, while failed data includes `error`.

## Synchronous decision gates

```http
POST /api/v1/events/decide
```

```json
{"type":"refund.requested","payload":{"amount":900}}
```

Direct response:

```json
{
  "event":"refund.requested",
  "decision":"deny",
  "reason":"Supervisor required",
  "matched_gate_id":7,
  "matched_gate_name":"Large refunds",
  "overridable":true,
  "evaluated":2
}
```

No matching gate defaults to `allow`. KRIY returns a decision; the caller must enforce it.

## Completion webhooks

Create a subscription with `POST /api/v1/webhooks`:

```json
{"url":"https://app.example/webhooks/kriy","event_types":["run.completed"]}
```

Persist `data.secret` from the creation response; it is shown once. Deliveries contain:

```json
{
  "id":"evt_...",
  "type":"run.completed",
  "created_at":"2026-08-09T10:00:00+00:00",
  "correlation_id":"checkout-8b5f",
  "data":{
    "run_id":42,
    "workflow_id":7,
    "workflow_name":"Handle orders",
    "event_type":"order.created",
    "status":"done",
    "result":"agent output",
    "event_payload":{}
  }
}
```

Headers include `X-KRIY-Event` and:

```text
X-KRIY-Signature: t=<unix-seconds>,v1=<hex-hmac>
```

Compute `v1 = HMAC_SHA256(secret, "<t>.<raw-body-bytes>")`. Reject malformed signatures
and timestamps outside about five minutes. Compare in constant time, deduplicate by
envelope `id`, persist before returning `2xx`, and process asynchronously. Delivery is
at-least-once and has a 10-second timeout.

## Status and retry policy

| Status | Handling |
| --- | --- |
| `400`, `422` | Fix request; do not retry |
| `401` | Replace/reload credentials; do not loop |
| `403` | Fix workspace membership or role |
| `404` | Fix identifier/workspace; resources may be hidden across workspaces |
| `409` | Resolve conflict |
| `429` | Respect `Retry-After`; bounded backoff with jitter |
| `500`, `503` | Retry only when the operation is safe from duplicate effects |

Always set connect and total timeouts. Do not log API keys, webhook secrets, provider
credentials, raw sensitive payloads, or authorization headers.
