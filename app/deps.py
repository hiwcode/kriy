from __future__ import annotations

from fastapi import Depends, Header

from app.core.security import AuthContext, get_auth_context
from app.db.get_db import get_db
from app.repositories import workspace_repo

# Re-export for backward compatibility
__all__ = ["get_db", "get_current_workspace"]


async def get_current_workspace(
    pool = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
    x_workspace_id: int | None = Header(None, alias="X-Workspace-Id"),
) -> dict | None:
    """
    Resolve the active workspace for the request.
    Uses X-Workspace-Id header if provided and user is member; else user's personal workspace.
    Returns None if user is not authenticated.
    """
    if auth.user_id is None:
        return None
    if x_workspace_id is not None:
        if await workspace_repo.user_is_member(pool, x_workspace_id, auth.user_id):
            ws = await workspace_repo.get_workspace(pool, x_workspace_id)
            if ws:
                return ws
    return await workspace_repo.get_or_create_personal_workspace(pool, auth.user_id)
