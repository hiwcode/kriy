"""Workspace activity feed — a curated, read-only view over the audit log.

Shows recent create/update/delete events in the current workspace with friendly
resource names. Hides raw audit detail (IP, user-agent, status, failures, auth
noise). GET only, so it isn't itself audited.
"""

from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends, Query

from app.core.security import AuthContext, api_key_auth, require_google_auth
from app.deps import get_current_workspace, get_db
from app.repositories import audit_repo
from app.schemas.response import ApiResponse, Pagination

router = APIRouter(
    prefix="/activity",
    tags=["activity"],
    dependencies=[Depends(api_key_auth)],
)


@router.get("", response_model=ApiResponse)
async def workspace_activity(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    if workspace is None:
        return {"success": True, "message": "No workspace", "data": [], "pagination": None}

    rows = await audit_repo.list_workspace_activity(
        pool, workspace["id"], limit=limit, offset=offset
    )
    total = await audit_repo.count_workspace_activity(pool, workspace["id"])
    names = await audit_repo.resolve_resource_names(pool, rows)

    items = []
    for r in rows:
        rid = r.get("resource_id")
        resource_name = None
        if rid and str(rid).isdigit():
            resource_name = names.get((r["resource_type"], int(rid)))
        items.append(
            {
                "id": r["id"],
                "action": r["action"],
                "resource_type": r["resource_type"],
                "resource_id": rid,
                "resource_name": resource_name,
                "actor_email": r.get("email"),
                "actor_user_id": r.get("user_id"),
                "created_at": r.get("created_at"),
            }
        )

    page = (offset // limit) + 1 if limit else 1
    return {
        "success": True,
        "message": "Activity fetched",
        "data": items,
        "pagination": Pagination(
            limit=limit, offset=offset, total=total, page=page, page_size=limit
        ),
    }
