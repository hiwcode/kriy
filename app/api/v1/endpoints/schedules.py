from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.security import AuthContext, api_key_auth, require_google_auth
from app.deps import get_db, get_current_workspace
from app.schemas.schedule import ScheduleCreate, ScheduleUpdate
from app.schemas.response import ApiResponse, Pagination
from app.services import schedule_service

import asyncpg


router = APIRouter(
    prefix="/schedules",
    tags=["schedules"],
    dependencies=[Depends(api_key_auth)],
)


@router.post("/", response_model=ApiResponse, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    data: ScheduleCreate,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    workspace_id = workspace["id"] if workspace else None
    schedule = await schedule_service.create_schedule(
        pool, data, created_by=auth.user_id, workspace_id=workspace_id,
    )
    return {
        "success": True,
        "message": "Schedule created",
        "data": schedule,
        "pagination": None,
    }


@router.get("/", response_model=ApiResponse)
async def list_schedules(
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict:
    workspace_id = workspace["id"] if workspace else None
    items, total = await schedule_service.list_schedules(
        pool, workspace_id=workspace_id, status=status_filter,
        limit=limit, offset=offset,
    )
    return {
        "success": True,
        "message": "Schedules retrieved",
        "data": items,
        "pagination": Pagination(
            limit=limit, offset=offset, total=total,
        ),
    }


@router.get("/{schedule_id}", response_model=ApiResponse)
async def get_schedule(
    schedule_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    schedule = await schedule_service.get_schedule(pool, schedule_id)
    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")
    return {
        "success": True,
        "message": "Schedule retrieved",
        "data": schedule,
        "pagination": None,
    }


@router.patch("/{schedule_id}", response_model=ApiResponse)
async def update_schedule(
    schedule_id: int,
    data: ScheduleUpdate,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    schedule = await schedule_service.update_schedule(pool, schedule_id, data)
    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")
    return {
        "success": True,
        "message": "Schedule updated",
        "data": schedule,
        "pagination": None,
    }


@router.delete("/{schedule_id}", response_model=ApiResponse)
async def delete_schedule(
    schedule_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    deleted = await schedule_service.delete_schedule(pool, schedule_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")
    return {
        "success": True,
        "message": "Schedule deleted",
        "data": None,
        "pagination": None,
    }


@router.post("/{schedule_id}/trigger", response_model=ApiResponse)
async def trigger_schedule(
    schedule_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Manually trigger a schedule to run now."""
    from app.services.scheduler_runner import run_schedule_now

    schedule = await schedule_service.get_schedule(pool, schedule_id)
    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")

    result = await run_schedule_now(pool, schedule, db_user_id=auth.user_id)
    return {
        "success": True,
        "message": "Schedule triggered",
        "data": result,
        "pagination": None,
    }
