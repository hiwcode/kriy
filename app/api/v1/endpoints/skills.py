from __future__ import annotations

import json
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.access import require_resource_access
from app.core.security import AuthContext, api_key_auth, require_google_auth
from app.deps import get_db, get_current_workspace
from app.schemas.skill import SkillCreate, SkillUpdate, SkillBulkDelete
from app.schemas.response import ApiResponse, Pagination
from app.services import skill_service

import asyncpg


async def _require_skill_access(
    skill_id: int,
    pool: asyncpg.Pool,
    auth: AuthContext,
) -> dict:
    """Get skill if it exists and user has access. Raises 404 otherwise."""
    skill = await skill_service.get_skill(pool, skill_id)
    if not skill:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found"
        )
    await require_resource_access(skill, pool, auth)
    return skill


router = APIRouter(
    prefix="/skills",
    tags=["skills"],
    dependencies=[Depends(api_key_auth)],
)


@router.post("/", response_model=ApiResponse, status_code=status.HTTP_201_CREATED)
async def create_skill(
    data: SkillCreate,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    workspace_id = workspace["id"] if workspace else None
    skill = await skill_service.create_skill(
        pool, data, created_by=auth.user_id, workspace_id=workspace_id
    )
    return {
        "success": True,
        "message": "Skill created",
        "data": skill,
        "pagination": None,
    }


@router.get("/", response_model=ApiResponse)
async def list_skills(
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    search: str | None = Query(None, min_length=1),
    filters: str | None = Query(None),
    sort_field: str | None = Query(None, alias="sortField", min_length=1),
    sort_order: str | None = Query(None, alias="sortOrder", min_length=1),
    browse: bool = Query(False),
    folder_id: int | None = Query(None, alias="folderId"),
) -> dict:
    parsed_filters: list[dict] | None = None
    if filters:
        try:
            raw_filters = json.loads(filters)
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid filters JSON",
            ) from exc
        if not isinstance(raw_filters, list):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="filters must be a list",
            )
        parsed_filters = []
        for item in raw_filters:
            if not isinstance(item, dict):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Each filter must be an object",
                )
            field = item.get("filterField") or item.get("filter_field")
            op = item.get("filterOp") or item.get("filter_op")
            value = (
                item.get("filterValue")
                if "filterValue" in item
                else item.get("filter_value")
            )
            parsed_filters.append(
                {"filter_field": field, "filter_op": op, "filter_value": value}
            )
    workspace_id = workspace["id"] if workspace else None
    try:
        skills, total = await skill_service.list_skills(
            pool,
            limit=limit,
            offset=offset,
            search=search,
            filters=parsed_filters,
            sort_field=sort_field,
            sort_order=sort_order,
            user_id=auth.user_id,
            workspace_id=workspace_id,
            folder_id=folder_id,
            folder_id_filter=browse,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    page = (offset // limit) + 1 if limit else 1
    return {
        "success": True,
        "message": "Skills fetched",
        "data": skills,
        "pagination": Pagination(
            limit=limit, offset=offset, total=total, page=page, page_size=limit
        ),
    }


@router.get("/{skill_id}", response_model=ApiResponse)
async def get_skill(
    skill_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    skill = await _require_skill_access(skill_id, pool, auth)
    return {
        "success": True,
        "message": "Skill fetched",
        "data": skill,
        "pagination": None,
    }


@router.patch("/{skill_id}", response_model=ApiResponse)
async def update_skill(
    skill_id: int,
    data: SkillUpdate,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    await _require_skill_access(skill_id, pool, auth)
    skill = await skill_service.update_skill(pool, skill_id, data)
    if not skill:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found"
        )
    return {
        "success": True,
        "message": "Skill updated",
        "data": skill,
        "pagination": None,
    }


@router.delete("/{skill_id}", response_model=ApiResponse, status_code=status.HTTP_200_OK)
async def delete_skill(
    skill_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    await _require_skill_access(skill_id, pool, auth)
    deleted = await skill_service.delete_skill(pool, skill_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found"
        )
    return {
        "success": True,
        "message": "Skill deleted",
        "data": None,
        "pagination": None,
    }


@router.post("/bulk-delete", response_model=ApiResponse)
async def bulk_delete(
    payload: SkillBulkDelete,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    workspace_id = workspace["id"] if workspace else None
    deleted_ids = await skill_service.bulk_delete_skills(
        pool, payload.ids, user_id=auth.user_id, workspace_id=workspace_id
    )
    return {
        "success": True,
        "message": "Skills deleted",
        "data": {"deleted_ids": deleted_ids},
        "pagination": None,
    }
