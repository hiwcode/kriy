"""FastAPI todo app — HTML template UI + a small JSON API.

Run:
    uvicorn app:app --reload --port 8004
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Body, FastAPI, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

import store

BASE_DIR = Path(__file__).parent
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

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
        },
    )


@app.post("/add")
def add(title: str = Form(...)):
    try:
        store.add_todo(title)
    except ValueError:
        pass
    return RedirectResponse("/", status_code=303)


@app.post("/toggle/{todo_id}")
def toggle(todo_id: int):
    store.toggle_todo(todo_id)
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
def api_set_done(todo_id: int, done: bool = Body(..., embed=True)):
    todo = store.set_done(todo_id, done)
    if todo is None:
        raise HTTPException(status_code=404, detail="todo not found")
    return todo


@app.delete("/api/todos/{todo_id}", status_code=204)
def api_delete(todo_id: int):
    if not store.delete_todo(todo_id):
        raise HTTPException(status_code=404, detail="todo not found")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="127.0.0.1", port=8004, reload=True)
