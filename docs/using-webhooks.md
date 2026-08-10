# Webhooks

Webhooks are the **outbound** half of KRIY's integration surface. Your app emits events
*in* ([Triggers](using-event-workflows.md)); KRIY posts platform events back *out* — so
when a triggered agent finishes, its **result reaches your app** instead of sitting in
KRIY.

| Direction | Synchronous | Asynchronous |
| --- | --- | --- |
| Inbound (your app → KRIY) | [`POST /events/decide`](using-gates.md) — a gate verdict | `POST /events` — an event that triggers agents |
| Outbound (KRIY → your app) | REST API (you poll) | **Webhooks** — this page |

> Webhooks carry **platform events** ("a run completed"). They're not how an agent *takes
> actions* in the world — that's what tools, MCP, and `call_api` are for.

---

## 1. Subscribe an endpoint

Open **Webhooks** in the sidebar (under Automation) → **New webhook**:

- **Endpoint URL** — where KRIY POSTs the signed event. Must be a public `https` URL in
  production; internal and cloud-metadata hosts are blocked (SSRF guard), and `localhost`
  is allowed only in development.
- **Events** — which platform event types to receive. `run.completed` is currently emitted.
  At least one event is required.
- **Enabled** — toggle delivery on/off without deleting the subscription.

The **signing secret is shown once**, on create and on rotate. Store it immediately —
afterwards only a hint (`…4f9c`) is returned. Use **Rotate secret** on the list to issue a
new one.

Subscriptions are **workspace-scoped**.

## 2. Event catalog

| Event | Payload `data` |
| --- | --- |
| `run.completed` | `run_id`, `workflow_id`, `workflow_name`, `event_type`, `status`, `result`, `event_payload` |

`run.completed` fires from the event worker after a triggered workflow run finishes, and
carries the agent's output as `result`.

## 3. The envelope

Every delivery is a JSON body in this shape — a stable public contract:

```json
{
  "id": "evt_9f2c…",
  "type": "run.completed",
  "created_at": "2026-08-09T10:00:00+00:00",
  "correlation_id": "APP-1013",
  "data": {
    "run_id": 42,
    "workflow_id": 7,
    "workflow_name": "Handle uploaded documents",
    "event_type": "document.uploaded",
    "status": "done",
    "result": "…agent output…",
    "event_payload": { "…": "the payload you emitted" }
  }
}
```

`correlation_id` is lifted from the payload you emitted (first of `correlation_id`,
`application_id`, or `id`), so you can tie a result back to the request that started it.

Headers on every POST:

| Header | Value |
| --- | --- |
| `Content-Type` | `application/json` |
| `X-KRIY-Event` | the event type, e.g. `run.completed` |
| `X-KRIY-Signature` | `t=<unix>,v1=<hex>` — see below |

## 4. Verify the signature

`v1 = HMAC_SHA256(secret, "<t>.<raw request body>")`. Compute it over the **raw** body
bytes — not a re-serialized parse — and reject timestamps older than ~5 minutes to block
replays.

The persistence functions below are application-specific placeholders. Implement them as
an atomic insert keyed by the envelope `id`; return success for duplicate deliveries.

**Python (FastAPI)**

```python
import hashlib, hmac, json, time

def verify(secret: str, body: bytes, header: str | None, tolerance: int = 300) -> bool:
    if not header:
        return False
    try:
        parts = dict(p.split("=", 1) for p in header.split(","))
        ts = int(parts["t"])
    except (KeyError, ValueError):
        return False
    if abs(time.time() - ts) > tolerance:
        return False
    signed = str(ts).encode() + b"." + body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts.get("v1", ""))


@app.post("/kriy/webhook")
async def receive(request: Request):
    raw = await request.body()
    if not verify(WHSEC, raw, request.headers.get("X-KRIY-Signature")):
        raise HTTPException(status_code=401, detail="bad signature")
    try:
        event = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="invalid JSON")
    await persist_if_new(event["id"], event)  # dedupe and persist before acknowledging
    return {"received": True}
```

**Node (Express)**

```ts
import crypto from "node:crypto";

function validSignature(secret: string, body: Buffer, header?: string): boolean {
  if (!header) return false;
  try {
    const parts = Object.fromEntries(
      header.split(",").map((part) => part.split("=", 2)),
    );
    const timestamp = Number(parts.t);
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) {
      return false;
    }
    const signed = Buffer.concat([Buffer.from(`${parts.t}.`), body]);
    const wanted = Buffer.from(
      crypto.createHmac("sha256", secret).update(signed).digest("hex"),
    );
    const actual = Buffer.from(parts.v1 ?? "");
    return actual.length === wanted.length && crypto.timingSafeEqual(wanted, actual);
  } catch {
    return false;
  }
}

// Keep req.body as a Buffer; signature verification must use the original bytes.
app.post("/kriy/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!validSignature(process.env.WHSEC!, req.body, req.header("X-KRIY-Signature"))) {
    return res.sendStatus(401);
  }

  let event;
  try {
    event = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "invalid JSON" });
  }
  await persistIfNew(event.id, event); // dedupe and persist before acknowledging
  res.sendStatus(200);                 // process persisted work asynchronously
});
```

## 5. Delivery semantics

- **At-least-once.** Your handler **must dedupe on the envelope `id`** — treat it as an
  idempotency key.
- Delivery runs **off the request path**, so a slow endpoint never blocks an agent run.
- A non-2xx response or network error receives bounded immediate retries. Failed
  deliveries remain in the log and can be replayed manually; delayed automatic
  redelivery is not available.
- **Every attempt is logged** — status, HTTP code, attempt count, and the error. Open
  **Deliveries** on a subscription to see them, and **Replay** to re-send one.
- Return `2xx` as soon as you've persisted the event; do the work afterwards. The delivery
  timeout is 10 seconds.

## 6. API surface

| Endpoint | What it does |
| --- | --- |
| `GET /api/v1/webhooks` | List subscriptions (secret hint only) |
| `POST /api/v1/webhooks` | Create — **returns the secret once** |
| `PUT /api/v1/webhooks/{id}` | Update URL, events, enabled |
| `POST /api/v1/webhooks/{id}/rotate-secret` | New secret, **returned once** |
| `DELETE /api/v1/webhooks/{id}` | Delete |
| `GET /api/v1/webhooks/{id}/deliveries` | Delivery log (default 100, max 500) |
| `POST /api/v1/webhooks/deliveries/{id}/replay` | Re-send a past delivery |

```bash
curl -X POST http://localhost:8000/api/v1/webhooks \
  -H "X-API-Key: kriy-..." -H "Content-Type: application/json" \
  -d '{"url":"https://api.acme.com/kriy","event_types":["run.completed"]}'
```

> Use a **per-user API key** (starts with `kriy-`, from **Config → API key**). The workspace
> comes from the `X-Workspace-Id` header, or your personal workspace by default.

## No endpoint to expose?

Polling stays the zero-config fallback — read a run's status and result from
`GET /api/v1/workflows/runs/{id}` instead of subscribing.

## Related

- [Triggers](using-event-workflows.md) — the inbound half: emit an event, an agent handles it
- [Gates](using-gates.md) — synchronous allow/deny before your app acts
