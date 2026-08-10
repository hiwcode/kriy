# Triggers

Triggers connect an external app to your agents. When your app emits an event, KRIY
queues every matching enabled workflow. Each workflow identifies the agent to run and
the instructions it receives.

> Not to be confused with the **Orchestrator** (visual multi-agent flows) or **Schedules**
> (time-based runs). A trigger is event-driven: something happens in your app, then an
> agent reacts asynchronously.

There are three pieces:

| Piece | What it is |
| --- | --- |
| **Event** | A named signal your app sends, e.g. `order.created`. It may be registered in the **Events** catalog. |
| **Workflow** | The configured event-to-agent rule shown under **Triggers**. |
| **Emit** | Your app sends the event with `POST /api/v1/events`. |

Everything is **workspace-scoped** — workflows and events belong to a workspace, like schedules.

---

## 1. Register an event

Open **Triggers** in the sidebar (under Automation) → **Events** button.

- **Name** — the event your app emits, e.g. `order.created`
- **Description** — what it means
- **Payload schema** *(optional)* — JSON Schema; emits are validated against it

Events are shared across the workspace; an event can have many workflows (across different
agents) subscribing to it. The Events list shows the subscriber count per event.

## 2. Create a workflow

In **Triggers**, pick an **agent tab**, then **New workflow**:

- **Name** — a short label
- **Event type** — the event to react to (globs such as `order.*` are supported)
- **Agent** — which agent runs (defaults to the current tab's agent)
- **Instructions** — what the agent should do when the event fires (it acts through its own tools)
- **Priority** — higher runs first when several workflows match one event
- **Enabled** — toggle on/off

You can also **describe it in plain English** and let the agent compile the workflow for you.

## 3. Emit events from your app

Emit with a plain HTTP `POST` — no agent id or rules in your app; the workflow owns those.

**Synchronous Python**

Requires `requests` (`pip install requests`).

```python
import requests

response = requests.post(
    "http://localhost:8000/api/v1/events",
    headers={"X-API-Key": "kriy-..."},   # per-user key; no agent_id needed
    json={"type": "order.created", "payload": {"order_id": "ord_123"}},
    timeout=10,
)
response.raise_for_status()
queued = response.json()  # accepted and queued; the agent has not necessarily finished
```

**Asynchronous TypeScript**

```ts
const response = await fetch("http://localhost:8000/api/v1/events", {
  method: "POST",
  headers: { "X-API-Key": "kriy-...", "Content-Type": "application/json" },
  body: JSON.stringify({ type: "order.created", payload: { order_id: "ord_123" } }),
  signal: AbortSignal.timeout(10_000),
});
if (!response.ok) throw new Error(`KRIY ${response.status}: ${await response.text()}`);
const queued = await response.json();
```

**curl**

```bash
curl -X POST http://localhost:8000/api/v1/events \
  -H "X-API-Key: kriy-..." -H "Content-Type: application/json" \
  -d '{"type":"order.created","payload":{"order_id":"ord_123"}}'
# -> { "event": "order.created", "matched": 2, "run_ids": [...], "registered": true }
```

> Use a **per-user API key** (starts with `kriy-`, from **Config → API key**), not the global
> `API_KEYS` value. The workspace is taken from the `X-Workspace-Id` header, or your
> personal workspace by default.

## 4. How runs execute

- Emitting **enqueues** a run per matching workflow — nothing runs inline, so a burst of
  events never fans out all at once.
- The worker runs serial workflows one at a time. Parallel workflows run up to their
  configured `max_concurrency`; higher-priority runs are claimed first.
- A failed run (e.g. a transient model error) is **retried with exponential backoff** up to
  3 attempts, then marked `error`.
- See every run (status, attempts, response/error) under a workflow's **Runs** view.

## Related

- [Notifications](using-notifications.md) — have a workflow's agent notify you when it runs
- [Schedules](using-schedules.md) — time-based runs instead of event-based
