# Integrate KRIY in 15 Minutes

This guide takes an external application from zero to a completed agent run. It uses
plain HTTP throughout, so it works in any language without a KRIY-specific library.

## What you will build

Your application will emit `order.created`. KRIY will match that event to a workflow,
run an agent asynchronously, and return a `run_id` that you can poll. You can then add a
signed webhook to receive completed results without polling.

## Prerequisites

- KRIY is running and reachable. For local development, the API is
  `http://localhost:8000`.
- You have signed in once and configured at least one model provider under **Config**.
- You have generated a personal API key under **Config → API Key**. Copy the `kriy-...`
  value when it is shown; it cannot be retrieved later.
- `curl` is installed. `jq` is optional but makes the commands easier to copy.

Set these values in your terminal:

```bash
export KRIY_BASE_URL="http://localhost:8000"
export KRIY_API_KEY="kriy-replace-me"
# Optional for a team workspace. Omit this header to use your personal workspace.
export KRIY_WORKSPACE_ID=""
```

Use this reusable header in the commands below when targeting a team workspace:

```bash
-H "X-Workspace-Id: $KRIY_WORKSPACE_ID"
```

Do not send an empty `X-Workspace-Id`. Simply omit the header for your personal workspace.

## 1. Verify connectivity and authentication

The health endpoint is public:

```bash
curl "$KRIY_BASE_URL/api/v1/health"
```

Verify your personal API key by listing agents:

```bash
curl "$KRIY_BASE_URL/api/v1/agents/" \
  -H "X-API-Key: $KRIY_API_KEY"
```

A successful protected response has this common envelope:

```json
{"success":true,"message":"Agents fetched","data":[],"pagination":{"total":0}}
```

If you receive `401`, generate a new personal key. Do not use the server-level
`API_KEYS` setting for workspace integrations because it is not associated with a user.

## 2. Create an agent

You can create the agent in the UI or over HTTP:

```bash
curl -X POST "$KRIY_BASE_URL/api/v1/agents/" \
  -H "X-API-Key: $KRIY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "order_handler",
    "label": "Order handler",
    "instruction": "Summarize the order and flag anything that needs attention.",
    "tools": []
  }'
```

Copy `data.id` from the response:

```bash
export KRIY_AGENT_ID="1"
```

## 3. Register the event contract

Registering an event is optional, but recommended. It catches payload drift before an
agent run is queued.

```bash
curl -X PUT "$KRIY_BASE_URL/api/v1/event-types" \
  -H "X-API-Key: $KRIY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "order.created",
    "description": "A new order was committed by the commerce service.",
    "payload_schema": {
      "type": "object",
      "required": ["order_id", "total"],
      "properties": {
        "order_id": {"type": "string"},
        "total": {"type": "number"}
      },
      "additionalProperties": true
    }
  }'
```

An unregistered event is still accepted and returns `"registered": false`. A registered
event with an invalid payload returns `422` and does not queue a run.

## 4. Create the workflow

The workflow connects one or more event patterns to the agent. `event_types` is always an
array; exact names and globs such as `order.*` are supported.

```bash
curl -X POST "$KRIY_BASE_URL/api/v1/workflows" \
  -H "X-API-Key: $KRIY_API_KEY" \
  -H "Content-Type: application/json" \
  -d @- <<JSON
{
  "name": "Handle new orders",
  "event_types": ["order.created"],
  "agent_id": $KRIY_AGENT_ID,
  "instructions": "Review the event payload and return a concise operational summary.",
  "enabled": true,
  "priority": 0,
  "execution_mode": "serial",
  "max_concurrency": 3
}
JSON
```

Copy `data.id` from the response if you want to list every run for this workflow.

## 5. Emit from your application

```bash
curl -X POST "$KRIY_BASE_URL/api/v1/events" \
  -H "X-API-Key: $KRIY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "order.created",
    "payload": {
      "order_id": "ord_123",
      "total": 149.50,
      "correlation_id": "checkout-8b5f"
    }
  }'
```

The event endpoint is intentionally asynchronous:

```json
{
  "event": "order.created",
  "matched": 1,
  "run_ids": [42],
  "registered": true
}
```

- `matched: 0` means authentication succeeded, but no enabled workflow in the active
  workspace matched the event.
- `run_ids` are durable workflow-run identifiers.
- Reusing the same payload does create another event. If your producer retries, include a
  stable correlation identifier and make downstream actions idempotent.

## 6. Read the result

Poll the specific run returned by the event endpoint:

```bash
export KRIY_RUN_ID="42"
curl "$KRIY_BASE_URL/api/v1/workflows/runs/$KRIY_RUN_ID" \
  -H "X-API-Key: $KRIY_API_KEY"
```

Run states are `pending`, `running`, `done`, or `error`. A completed item contains
`response`; a failed item contains `error` and its attempt counts.

For production, prefer a `run.completed` webhook over polling. Follow
[Webhooks](using-webhooks.md) to create a subscription and verify its HMAC signature.

## 7. Add a synchronous gate

Use a gate before an action that must be allowed or denied inline:

```bash
curl -X POST "$KRIY_BASE_URL/api/v1/events/decide" \
  -H "X-API-Key: $KRIY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"refund.requested","payload":{"amount":900}}'
```

No matching rule defaults to `allow`. Your application—not KRIY—must enforce a returned
`deny`. See [Gates](using-gates.md) for rule creation and the full verdict contract.

## 8. Choose a synchronous or asynchronous client

Use a synchronous client for command-line tools, background jobs that process one item
at a time, and traditional synchronous web handlers. Use an asynchronous client inside
async web servers or workers that handle many concurrent requests. In both cases:

- Wait for `POST /events` to return before considering the event accepted. The agent run
  itself remains asynchronous.
- Always wait for `POST /events/decide` before performing the protected action. A gate is
  deliberately synchronous because its answer controls whether the action may proceed.
- Poll runs asynchronously or receive a webhook; do not block a request thread waiting
  for an agent to finish.

### Synchronous Python

This example uses only Python's standard library:

```python
import json
import os
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

base_url = os.environ.get("KRIY_BASE_URL", "http://localhost:8000").rstrip("/")
headers = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "X-API-Key": os.environ["KRIY_API_KEY"],
}
if workspace_id := os.environ.get("KRIY_WORKSPACE_ID"):
    headers["X-Workspace-Id"] = workspace_id

def request_json(method, path, body=None):
    request = Request(
        f"{base_url}{path}",
        data=json.dumps(body).encode() if body is not None else None,
        headers=headers,
        method=method,
    )
    try:
        with urlopen(request, timeout=10) as response:
            return json.load(response)
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"KRIY HTTP {error.code}: {detail}") from error

# Event ingestion acknowledges queuing; it does not wait for the agent.
queued = request_json("POST", "/api/v1/events", {
    "type": "order.created",
    "payload": {"order_id": "ord_123", "total": 149.50},
})

# A gate is inline: get and enforce the verdict before changing state.
verdict = request_json("POST", "/api/v1/events/decide", {
    "type": "refund.requested",
    "payload": {"amount": 900},
})
if verdict["decision"] == "deny" and not verdict["overridable"]:
    raise PermissionError(verdict["reason"] or "Action denied by KRIY")

# Poll only in a job/CLI. Production services should normally consume a webhook.
if queued["run_ids"]:
    run_id = queued["run_ids"][0]
    for _ in range(20):
        run = request_json("GET", f"/api/v1/workflows/runs/{run_id}")
        if run["data"]["status"] in {"done", "error"}:
            print(run["data"])
            break
        time.sleep(1)
```

### Asynchronous TypeScript (Node.js or server runtime)

Use this pattern in Node.js or another server runtime that provides `fetch` and
`AbortSignal.timeout`:

```typescript
const baseUrl = process.env.KRIY_BASE_URL ?? "http://localhost:8000";
const headers: Record<string, string> = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "X-API-Key": process.env.KRIY_API_KEY!,
};
if (process.env.KRIY_WORKSPACE_ID) {
  headers["X-Workspace-Id"] = process.env.KRIY_WORKSPACE_ID;
}

async function kriy<T>(path: string, init: RequestInit = {}): Promise<T> {
  const requestHeaders = new Headers(headers);
  new Headers(init.headers).forEach((value, key) => requestHeaders.set(key, value));
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: requestHeaders,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`KRIY ${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

type Verdict = {
  decision: "allow" | "deny";
  reason: string;
  overridable: boolean;
};

// Gates stay in the request path because the action depends on their answer.
const verdict = await kriy<Verdict>("/api/v1/events/decide", {
  method: "POST",
  body: JSON.stringify({
    type: "refund.requested",
    payload: { refund_id: "ref_123", amount: 900 },
  }),
});
if (verdict.decision === "deny" && !verdict.overridable) {
  throw new Error(verdict.reason || "Action denied by KRIY");
}

// Commit the protected action here, then emit what happened.
const queued = await kriy<{ run_ids: number[] }>("/api/v1/events", {
  method: "POST",
  body: JSON.stringify({
    type: "refund.approved",
    payload: { refund_id: "ref_123", amount: 900 },
  }),
});
console.log(queued.run_ids);
```

Do not use an unobserved `void fetch(...)` for important events: transport failures and
authentication errors would be lost. If the application cannot afford to lose an event,
write it to a transactional outbox with the business change and deliver it from a worker.

## Production checklist

- Use HTTPS for KRIY and webhook URLs.
- Store API keys and webhook secrets in a secret manager, never source control.
- Set `X-Workspace-Id` explicitly for team integrations.
- Set client timeouts; retry `429` and transient `5xx` responses with bounded backoff.
- Do not blindly retry validation (`422`) or authentication (`401`/`403`) failures.
- Treat event production and webhook consumption as at-least-once; make side effects
  idempotent and deduplicate webhooks by envelope `id`.
- Alert on workflow runs that exhaust their retries and on failed webhook deliveries.

For exact request shapes, errors, limits, and retry guidance, see the
[Integration API reference](integration-api-reference.md).
