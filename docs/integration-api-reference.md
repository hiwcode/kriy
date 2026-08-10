# Integration API Reference

This reference covers KRIY's public application-integration surface. The live OpenAPI
document is available at `/api/openapi.json`, with Swagger UI at `/api/docs` and ReDoc at
`/api/redoc` when API documentation is enabled.

## Base URL and versioning

All stable endpoints use the `/api/v1` prefix:

```text
https://your-kriy-host.example/api/v1
```

Additive response fields may appear without a version change. Removing or changing a
field, method, path, or meaning requires a new API version.

## Authentication

External applications should send a personal API key:

```http
X-API-Key: kriy-...
```

Generate it after signing in under **Config → API Key**. The raw value is returned once.
Regenerating or deleting it immediately invalidates the previous key.

Browser clients may instead send a KRIY session access token:

```http
Authorization: Bearer <access-token>
```

Server-level keys from the `API_KEYS` environment variable can authenticate selected
administrative calls, but they have no user identity and must not be used for
workspace-scoped integrations.

## Workspace selection

Resources, gates, workflows, events, and webhooks are workspace-scoped.

```http
X-Workspace-Id: 17
```

- Omit the header to use the API-key owner's personal workspace.
- The authenticated user must be a member of the requested workspace.
- Never reuse an API key across customers. Use a separate KRIY user or workspace model
  that matches your tenant boundary.

## Response formats

Most management endpoints use this envelope:

```json
{
  "success": true,
  "message": "Workflow created",
  "data": {},
  "pagination": null
}
```

Latency-sensitive integration endpoints return their contract directly:

- `POST /events` returns `{event, matched, run_ids, registered}`.
- `POST /events/decide` returns the gate verdict directly.

FastAPI errors use:

```json
{"detail":"Human-readable error"}
```

Validation errors use FastAPI's `detail` array with field locations and messages.

## Status codes and retries

| Status | Meaning | Retry? |
| --- | --- | --- |
| `200` | Request completed | No |
| `201` | Resource created | No |
| `400` | Malformed query or unsupported operation | Fix the request |
| `401` | Missing, invalid, expired, or revoked credentials | Refresh or replace credentials |
| `403` | Authenticated but not permitted | Fix membership/role; do not retry blindly |
| `404` | Missing resource, or resource hidden by workspace isolation | Fix the identifier/workspace |
| `409` | Resource conflict | Resolve the conflict |
| `422` | JSON/schema/URL validation failed | Fix the payload |
| `429` | Rate limited | Retry after `Retry-After`, with jitter |
| `500` | Unexpected server failure | Retry a bounded number of times if the operation is safe |
| `503` | Dependency or authentication provider unavailable | Retry with exponential backoff |

Use connection and total timeouts in every client. For retryable responses, use bounded
exponential backoff with jitter, for example 1s, 2s, 4s, then stop. `POST /events` does
not currently accept an idempotency key, so a retry can enqueue a second run. Include a
stable ID in the payload and make the resulting tools/actions idempotent.

## Events and workflows

### Register or update an event

`PUT /api/v1/event-types`

```json
{
  "name": "order.created",
  "description": "A committed order",
  "payload_schema": {"type":"object","required":["order_id"]}
}
```

Registration is optional. When a schema is present, invalid emitted payloads return
`422` before any workflow is queued.

### Create a workflow

`POST /api/v1/workflows`

```json
{
  "name": "Handle orders",
  "event_types": ["order.created"],
  "agent_id": 3,
  "instructions": "Review the order.",
  "enabled": true,
  "priority": 0,
  "execution_mode": "serial",
  "max_concurrency": 3
}
```

`event_types` is a non-empty array. Entries may be exact types or shell-style globs such
as `order.*`. Higher priority workflows are queued first. Execution mode is `serial` or
`parallel`; `max_concurrency` is between 1 and 20.

| Method and path | Purpose |
| --- | --- |
| `GET /api/v1/workflows` | List workflows |
| `POST /api/v1/workflows` | Create a workflow |
| `PUT /api/v1/workflows/{id}` | Replace a workflow configuration |
| `DELETE /api/v1/workflows/{id}` | Delete a workflow |
| `GET /api/v1/workflows/{id}/runs` | List its runs and results |
| `GET /api/v1/workflows/runs/{run_id}` | Read one run returned by `POST /events` |
| `GET /api/v1/workflows/queue/all` | Inspect queued/running work |

### Emit an event

`POST /api/v1/events`

```json
{"type":"order.created","payload":{"order_id":"ord_123"}}
```

Response:

```json
{"event":"order.created","matched":1,"run_ids":[42],"registered":true}
```

The response confirms queuing, not agent completion. `matched: 0` is a successful no-op.
Runs retry transient agent failures up to their configured maximum and expose `pending`,
`running`, `done`, or `error` state.

## Decision gates

### Decide before acting

`POST /api/v1/events/decide`

```json
{"type":"refund.requested","payload":{"amount":900}}
```

```json
{
  "event": "refund.requested",
  "decision": "deny",
  "reason": "Supervisor required",
  "matched_gate_id": 7,
  "matched_gate_name": "Large refunds",
  "overridable": true,
  "evaluated": 2
}
```

No matching rule returns `allow`. KRIY only returns the verdict; the caller is responsible
for enforcing it. A deny with `overridable: true` may be sent through the caller's own
human-approval flow.

Gate management endpoints are documented in [Gates](using-gates.md) and the live OpenAPI
reference.

## Webhooks

### Create a subscription

`POST /api/v1/webhooks`

```json
{"url":"https://app.example/webhooks/kriy","event_types":["run.completed"]}
```

The management response uses the common envelope. `data.secret` is present only on create
and secret rotation. Persist it before discarding the response.

Currently emitted event:

| Event | When |
| --- | --- |
| `run.completed` | A triggered workflow finishes successfully |

Webhook delivery is at-least-once. A receiver must:

1. Read the raw request body.
2. Verify `X-KRIY-Signature` and reject timestamps outside its tolerance.
3. Deduplicate on the envelope `id`.
4. Persist before returning `2xx`.
5. Process asynchronously after acknowledging.

Delivery timeout is 10 seconds. Non-2xx and network failures receive bounded immediate
retries and are logged. Delayed automatic redelivery is not available; replay a failed
delivery from the UI or API.

| Method and path | Purpose |
| --- | --- |
| `GET /api/v1/webhooks` | List subscriptions; secrets are redacted |
| `POST /api/v1/webhooks` | Create and reveal the secret once |
| `PUT /api/v1/webhooks/{id}` | Update URL, event types, and enabled state |
| `POST /api/v1/webhooks/{id}/rotate-secret` | Rotate and reveal a new secret once |
| `DELETE /api/v1/webhooks/{id}` | Delete |
| `GET /api/v1/webhooks/{id}/deliveries` | List up to 500 deliveries |
| `POST /api/v1/webhooks/deliveries/{id}/replay` | Replay a recorded delivery |

See [Webhooks](using-webhooks.md) for complete Python and Node signature examples.

## Agents needed by workflows

| Method and path | Purpose |
| --- | --- |
| `GET /api/v1/agents/` | List accessible agents |
| `POST /api/v1/agents/` | Create an agent |
| `GET /api/v1/agents/{id}` | Read an agent |
| `PATCH /api/v1/agents/{id}` | Update an agent |

Minimum create body:

```json
{
  "name": "order_handler",
  "label": "Order handler"
}
```

The agent uses the configured default model when `model` is omitted. Its provider must be
configured for the user or server before the agent runs.

## Security boundaries

- API keys authorize the owning user; workspace roles further restrict mutations.
- Cross-workspace resources are returned as `404` in many endpoints to avoid leaking
  their existence.
- Webhook URLs must be public HTTPS in production. Private, loopback, link-local, and
  cloud metadata destinations are rejected; localhost is allowed only in development.
- Webhook secrets and provider credentials are write-only/redacted and encrypted at rest.
- Never place provider keys, KRIY API keys, or webhook secrets in event payloads.

## Support diagnostics

When reporting an integration failure, include:

- HTTP method and path, without secrets
- response status and `detail`/`message`
- workspace ID
- event type, workflow ID, and run ID where relevant
- webhook envelope ID and delivery ID where relevant
- server timestamp and correlation ID

Do not include API keys, provider credentials, raw webhook secrets, or sensitive payloads.
