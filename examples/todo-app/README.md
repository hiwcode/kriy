# Todo App — FastAPI + FastMCP example

A tiny todo app that demonstrates the two halves of Atelier on one shared data store:

- **Web UI / API** — FastAPI with server-rendered HTML templates (`app.py`)
- **Agent tools** — a FastMCP server exposing the same todos as MCP tools (`mcp_server.py`)
- **Shared store** — a single SQLite file (`store.py`) both processes read/write, so the
UI and the agent always see the same list.

```
todo-app/
├── store.py          # shared SQLite todo store
├── app.py            # FastAPI: HTML UI (Jinja2) + JSON API
├── mcp_server.py     # FastMCP server (list/add/complete/reopen/delete/clear)
├── templates/
│   └── index.html    # the UI
└── requirements.txt
```

## Setup

```bash
cd examples/todo-app
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## 1. Run the web app

```bash
uvicorn app:app --reload --port 8004
```

Open **[http://127.0.0.1:8004 — add, complete, and delete todos (no JavaScript; plain](http://127.0.0.1:8000)** form posts). There's also a JSON API:


| Method   | Path              | Body                 |
| -------- | ----------------- | -------------------- |
| `GET`    | `/api/todos`      | —                    |
| `POST`   | `/api/todos`      | `{ "title": "..." }` |
| `PATCH`  | `/api/todos/{id}` | `{ "done": true }`   |
| `DELETE` | `/api/todos/{id}` | —                    |


## 2. Run the MCP server

```bash
python mcp_server.py
```

This serves MCP over streamable HTTP at **[http://127.0.0.1:8005/mcp/](http://127.0.0.1:8005/mcp/)**. Tools: `list_todos`, `add_todo`, `complete_todo`, `reopen_todo`, `delete_todo`, `clear_completed`.

## 3. Connect it to Atelier

1. In Atelier, go to **MCP Connections** and add a connection pointing at
  `http://127.0.0.1:8005/mcp/`.
2. Attach it to an agent (or test it in **MCP Tester**).
3. Ask the agent things like *"add a todo to buy milk"* or *"what's left on my list?"* —
  then refresh the web UI at :8000 to see the agent's changes, and vice-versa.

> Both the UI and the agent operate on the same `todos.db`, so changes from either side
> show up everywhere.

## 4. Event-based workflows (SDK)

This shows the **event-driven, multi-tenant** side of Atelier. The app does one thing when
a todo is completed: it **emits an event**. It has no idea what should happen — that's a
*workflow*, defined per user in Atelier. Different users can react to the same event in
completely different ways.

How the app side works (`app.py`) — note there's no agent id and no rule here:

```python
from atelier_agentic import AtelierClient
atelier = AtelierClient(api_key=os.environ["ATELIER_API_KEY"])  # identifies the user

# fired (in the background) right after a todo is marked done:
atelier.emit("todo.completed", {"todos": store.list_todos()})
```

`emit()` returns immediately (`{event, matched, run_ids}`) and fails open — an integration
hiccup never breaks the app. Atelier looks up every enabled workflow you have for
`todo.completed`, and runs each one's agent in the background with the event payload.

### Define a workflow (the rule lives here, not in the app)

A workflow = `{ event_type, agent_id, instructions }`, scoped to your user. Create one via
the API (or the Workflows UI / chat):

```bash
curl -X POST http://localhost:8000/api/v1/workflows \
  -H 'Content-Type: application/json' -H "X-API-Key: ate-..." \
  -d '{
    "name": "Auto-reset todos",
    "event_type": "todo.completed",
    "agent_id": 3,
    "instructions": "Call reset_if_all_done once with title \"todo-1\", then reply reset or pending."
  }'
```

The agent acts through this app's MCP tools — here a single atomic `reset_if_all_done`
tool (in `mcp_server.py`) that clears the list and starts a fresh `todo-1` only when every
todo is done. (One deterministic tool call beats asking the model to chain two writes.)

Setup:

1. Create an agent with this app's MCP connection attached (step 3 above); note its **agent id**.
2. Generate a **per-user API key** (Config → API key; starts with `ate-`). Use that — *not*
   the global `API_KEYS` value, which has no user and is rejected.
3. Create a `todo.completed` workflow pointing at your agent (curl above).
4. `cp .env.example .env`, set `ATELIER_API_KEY`, restart the app, complete every todo, and
   watch your workflow run. Inspect runs at `GET /api/v1/workflows/{id}/runs`.

> **Why events, not a hardcoded trigger?** With many users wanting different reactions to the
> same event, the app can't own the logic. It just reports *what happened*; Atelier owns
> *what to do about it*, per user. Add or change behaviour by editing a workflow — no deploy.
>
> Recurring vs event-based: you could instead let an agent poll on a schedule (cron + MCP
> tools) — simpler but laggy. Events react the moment something happens.

