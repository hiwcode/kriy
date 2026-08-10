# Todo App — FastAPI + FastMCP example

A tiny todo playground with a web app and MCP server on one shared data store:

- **Web UI / API** — FastAPI with server-rendered HTML templates (`app.py`)
- **Agent tools** — a FastMCP server exposing the same todos as MCP tools (`mcp_server.py`)
- **Shared store** — a single SQLite file (`store.py`) both processes read/write, so the
UI and the agent always see the same list.

```text
todo-app/
├── store.py          # shared SQLite todo store
├── app.py            # FastAPI: HTML UI (Jinja2) + JSON API
├── mcp_server.py     # FastMCP server (list/add/complete/reopen/delete/clear)
├── templates/
│   └── index.html    # the UI
└── pyproject.toml     # application dependencies
```

## Setup

```bash
cd examples/todo-app
uv sync
```

## 1. Run the web app

```bash
uv run uvicorn app:app --reload --port 8004
```

Open **[http://127.0.0.1:8004](http://127.0.0.1:8004)** to add, complete, and delete
todos. The UI uses plain server-rendered form posts. There is also a JSON API:


| Method   | Path              | Body                 |
| -------- | ----------------- | -------------------- |
| `GET`    | `/api/todos`      | —                    |
| `POST`   | `/api/todos`      | `{ "title": "..." }` |
| `PATCH`  | `/api/todos/{id}` | `{ "done": true }`   |
| `DELETE` | `/api/todos/{id}` | —                    |


## 2. Run the MCP server

```bash
uv run python mcp_server.py
```

This serves MCP over streamable HTTP at **[http://127.0.0.1:8005/mcp/](http://127.0.0.1:8005/mcp/)**. Tools: `list_todos`, `add_todo`, `complete_todo`, `reopen_todo`, `delete_todo`, `clear_completed`.
