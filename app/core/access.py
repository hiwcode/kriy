"""Shared access-control helpers for workspace-scoped resources."""

from __future__ import annotations

import asyncpg
from fastapi import HTTPException, status

from app.core.security import AuthContext
from app.repositories import workspace_repo


async def require_resource_access(
    resource: dict,
    pool: asyncpg.Pool,
    auth: AuthContext,
    created_by_field: str = "created_by",
) -> None:
    """Ensure the authenticated user can access *resource*.

    Access is granted when:
    1. The resource belongs to a workspace the user is a member of, **or**
    2. The resource has no workspace and the user owns it directly.

    Raises HTTP 404 (not 403) to avoid leaking existence of resources.
    """
    if auth.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found",
        )

    ws_id = resource.get("workspace_id")
    if ws_id is not None:
        if await workspace_repo.user_is_member(pool, ws_id, auth.user_id):
            return
    elif resource.get(created_by_field) == auth.user_id:
        return

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Resource not found",
    )
