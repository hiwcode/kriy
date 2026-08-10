"""FastMCP server exposing the todo store as agent tools.

Run (streamable HTTP at http://127.0.0.1:8005/mcp/):
    python mcp_server.py

Or over stdio (e.g. for local MCP clients):
    fastmcp run mcp_server.py
"""

from __future__ import annotations

from typing import Any

from fastmcp import FastMCP

import store

store.init_db()

mcp = FastMCP("Todo")


@mcp.tool()
def list_todos() -> list[dict[str, Any]]:
    """List all todo items (active first)."""
    return store.list_todos()


@mcp.tool()
def add_todo(title: str) -> dict[str, Any]:
    """Add a new todo item and return it."""
    return store.add_todo(title)


@mcp.tool()
def complete_todo(id: int) -> dict[str, Any]:
    """Mark a todo as completed."""
    todo = store.set_done(id, True)
    if todo is None:
        raise ValueError(f"todo {id} not found")
    return todo


@mcp.tool()
def reopen_todo(id: int) -> dict[str, Any]:
    """Mark a completed todo as active again."""
    todo = store.set_done(id, False)
    if todo is None:
        raise ValueError(f"todo {id} not found")
    return todo


@mcp.tool()
def delete_todo(id: int) -> dict[str, Any]:
    """Delete a todo by id."""
    return {"deleted": store.delete_todo(id), "id": id}


@mcp.tool()
def clear_completed() -> dict[str, Any]:
    """Delete all completed todos. Returns how many were removed."""
    return {"cleared": store.clear_completed()}


@mcp.tool()
def reset_if_all_done(fresh_title: str = "todo-1") -> dict[str, Any]:
    """If EVERY todo is completed, clear them and start a fresh list with one new todo.

    No-op when the list is empty or any todo is still pending. Atomic and idempotent —
    call it once after a todo is completed.
    """
    return store.reset_if_all_done(fresh_title)


if __name__ == "__main__":
    mcp.run(transport="http", host="127.0.0.1", port=8005)
