"""Shared SQLite-backed todo store.

Used by both the FastAPI web app and the FastMCP server so they operate on the
same data. SQLite (a single file) lets the two processes stay in sync.
"""

from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

DB_PATH = Path(__file__).parent / "todos.db"
_lock = threading.Lock()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def _db() -> Iterator[sqlite3.Connection]:
    conn = _connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with _lock, _db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS todos (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                title      TEXT NOT NULL,
                done       INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """
        )


def _row(r: sqlite3.Row) -> dict[str, Any]:
    return {"id": r["id"], "title": r["title"], "done": bool(r["done"]), "created_at": r["created_at"]}


def list_todos() -> list[dict[str, Any]]:
    with _lock, _db() as conn:
        rows = conn.execute("SELECT * FROM todos ORDER BY done ASC, id DESC").fetchall()
        return [_row(r) for r in rows]


def get_todo(todo_id: int) -> dict[str, Any] | None:
    with _lock, _db() as conn:
        r = conn.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
        return _row(r) if r else None


def add_todo(title: str) -> dict[str, Any]:
    title = (title or "").strip()
    if not title:
        raise ValueError("title is required")
    with _lock, _db() as conn:
        cur = conn.execute(
            "INSERT INTO todos (title, done, created_at) VALUES (?, 0, ?)",
            (title, datetime.now(timezone.utc).isoformat()),
        )
        r = conn.execute("SELECT * FROM todos WHERE id = ?", (cur.lastrowid,)).fetchone()
        return _row(r)


def set_done(todo_id: int, done: bool) -> dict[str, Any] | None:
    with _lock, _db() as conn:
        conn.execute("UPDATE todos SET done = ? WHERE id = ?", (1 if done else 0, todo_id))
        r = conn.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
        return _row(r) if r else None


def toggle_todo(todo_id: int) -> dict[str, Any] | None:
    current = get_todo(todo_id)
    if current is None:
        return None
    return set_done(todo_id, not current["done"])


def delete_todo(todo_id: int) -> bool:
    with _lock, _db() as conn:
        cur = conn.execute("DELETE FROM todos WHERE id = ?", (todo_id,))
        return cur.rowcount > 0


def clear_completed() -> int:
    with _lock, _db() as conn:
        cur = conn.execute("DELETE FROM todos WHERE done = 1")
        return cur.rowcount


def reset_if_all_done(fresh_title: str = "todo-1") -> dict[str, Any]:
    """If every todo is completed, clear them and start a fresh list with one new todo.

    Atomic + idempotent: a no-op when the list is empty or any todo is still pending.
    Doing the whole rule in one DB transaction means a single tool call for the agent
    (no fragile multi-step tool chaining) and a deterministic outcome.
    """
    with _lock, _db() as conn:
        rows = conn.execute("SELECT done FROM todos").fetchall()
        if not rows:
            return {"reset": False, "reason": "list is empty"}
        if any(r["done"] == 0 for r in rows):
            return {"reset": False, "reason": "pending todos remain"}
        cleared = conn.execute("DELETE FROM todos WHERE done = 1").rowcount
        cur = conn.execute(
            "INSERT INTO todos (title, done, created_at) VALUES (?, 0, ?)",
            (fresh_title, datetime.now(timezone.utc).isoformat()),
        )
        r = conn.execute("SELECT * FROM todos WHERE id = ?", (cur.lastrowid,)).fetchone()
        return {"reset": True, "cleared": cleared, "created": _row(r)}
