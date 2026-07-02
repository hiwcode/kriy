"""FastAPI todo app — HTML template UI + a small JSON API.

Run:
    uvicorn app:app --reload --port 8000
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import quote

from fastapi import BackgroundTasks, Body, FastAPI, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

import store

BASE_DIR = Path(__file__).parent
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


# ---------------------------------------------------------------------------
# Event-based Atelier integration (SDK)
#
# When a todo is completed we EMIT an event to Atelier — that's all the app does.
# It doesn't know what (if anything) should happen: each user defines their own
# "todo.completed" workflow in Atelier (via the UI / chat), and Atelier runs the
# matching ones in the background. Same event, different behaviour per user.
#
# Configure via env (the app runs fine without these — emit just no-ops):
#   ATELIER_API_KEY    a per-user API key (starts with "ate-") — identifies the user
#   ATELIER_BASE_URL   defaults to http://localhost:8000
# ---------------------------------------------------------------------------

def _load_dotenv() -> None:
    """Minimal .env loader (no extra dependency) — only sets keys not already set."""
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


_load_dotenv()

try:
    from atelier_agentic import AtelierClient, AtelierDenied
except ImportError:  # SDK not installed — app still works, events disabled
    AtelierClient = None  # type: ignore[assignment]
    AtelierDenied = Exception  # type: ignore[assignment,misc]

# One client for both patterns:
#   - emit(...)  → fire-and-forget event workflows (react AFTER)
#   - guard(...) → synchronous, blocking policy check (decide BEFORE). Needs an
#     agent id so its deterministic policies (e.g. "deny todo.complete if name
#     contains 'Standup'") are enforced. Set ATELIER_AGENT_ID to enable guards.
_AGENT_ID = os.getenv("ATELIER_AGENT_ID")
atelier = (
    AtelierClient(agent_id=int(_AGENT_ID) if _AGENT_ID else None, fail_open=True)
    if AtelierClient and os.getenv("ATELIER_API_KEY")
    else None
)


def _guard_complete(name: str) -> str | None:
    """Deterministic pre-check before completing a todo. Returns a block reason,
    or None to allow. Fast (no LLM) when the agent's policy is rule-based."""
    if atelier is None or atelier.agent_id is None:
        return None
    try:
        atelier.guard("todo.complete", {"name": name})
        return None
    except AtelierDenied as e:  # blocked by a policy
        return str(e) or "Blocked by policy"


def _on_todo_completed() -> None:
    """Fire-and-forget: tell Atelier a todo was completed; it runs the user's workflows."""
    if atelier is None:
        return
    try:
        atelier.emit("todo.completed", {"todos": store.list_todos()})
    except Exception:  # never let an integration hiccup break the app
        pass

def _on_todo_create(title: str="") -> None:
    """Fire-and-forget: tell Atelier a todo was added; it runs the user's workflows."""
    if atelier is None:
        return
    try:
        atelier.emit("todo.create", {"todo": f"New toto added: {title}"})
    except Exception:  # never let an integration hiccup break the app
        pass


@asynccontextmanager
async def lifespan(_: FastAPI):
    store.init_db()
    yield


app = FastAPI(title="Todo App", lifespan=lifespan)


# ---------------------------------------------------------------------------
# HTML UI (server-rendered, no JS required)
# ---------------------------------------------------------------------------


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    todos = store.list_todos()
    active = [t for t in todos if not t["done"]]
    return templates.TemplateResponse(
        request,
        "index.html",
        {
            "todos": todos,
            "remaining": len(active),
            "completed": len(todos) - len(active),
            "blocked": request.query_params.get("blocked"),
        },
    )


@app.post("/add")
def add(background: BackgroundTasks, title: str = Form(...)):
    try:
        store.add_todo(title)
        # Schedule the emit (pass the function + arg) — don't call it inline.
        background.add_task(_on_todo_create, title)
    except ValueError:
        pass
    return RedirectResponse("/", status_code=303)


@app.post("/toggle/{todo_id}")
def toggle(todo_id: int, background: BackgroundTasks):
    current = store.get_todo(todo_id)
    # Completing (not un-completing)? Run the deterministic guard first.
    if current and not current["done"]:
        blocked = _guard_complete(current["title"])
        if blocked:
            return RedirectResponse(f"/?blocked={quote(blocked)}", status_code=303)
    todo = store.toggle_todo(todo_id)
    if todo and todo["done"]:
        background.add_task(_on_todo_completed)
    return RedirectResponse("/", status_code=303)


@app.post("/delete/{todo_id}")
def delete(todo_id: int):
    store.delete_todo(todo_id)
    return RedirectResponse("/", status_code=303)


@app.post("/clear-completed")
def clear_completed():
    store.clear_completed()
    return RedirectResponse("/", status_code=303)


# ---------------------------------------------------------------------------
# JSON API (same data the MCP server exposes)
# ---------------------------------------------------------------------------


@app.get("/api/todos")
def api_list():
    return store.list_todos()


@app.post("/api/todos", status_code=201)
def api_add(title: str = Body(..., embed=True)):
    try:
        return store.add_todo(title)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.patch("/api/todos/{todo_id}")
def api_set_done(todo_id: int, background: BackgroundTasks, done: bool = Body(..., embed=True)):
    if done:
        current = store.get_todo(todo_id)
        if current is None:
            raise HTTPException(status_code=404, detail="todo not found")
        blocked = _guard_complete(current["title"])
        if blocked:
            raise HTTPException(status_code=409, detail=blocked)
    todo = store.set_done(todo_id, done)
    if todo is None:
        raise HTTPException(status_code=404, detail="todo not found")
    if done:
        background.add_task(_on_todo_completed)
    return todo


@app.delete("/api/todos/{todo_id}", status_code=204)
def api_delete(todo_id: int):
    if not store.delete_todo(todo_id):
        raise HTTPException(status_code=404, detail="todo not found")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="127.0.0.1", port=8004, reload=True)
