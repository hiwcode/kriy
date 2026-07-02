from __future__ import annotations

import asyncpg
import json
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.access import require_resource_access
from app.core.security import AuthContext, api_key_auth, require_google_auth
from app.deps import get_db, get_current_workspace
from app.schemas.prompt_library import (
    PromptLibraryBulkDelete,
    PromptLibraryCreate,
    PromptLibraryUpdate,
)
from app.schemas.response import ApiResponse, Pagination
from app.services import prompt_library_service

router = APIRouter(
    prefix="/prompt-library", tags=["prompt-library"], dependencies=[Depends(api_key_auth)]
)


@router.post("/", response_model=ApiResponse, status_code=status.HTTP_201_CREATED)
async def create_prompt(
    data: PromptLibraryCreate,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    workspace_id = workspace["id"] if workspace else None
    prompt = await prompt_library_service.create_prompt(
        pool, data, created_by=auth.user_id, workspace_id=workspace_id
    )
    return {
        "success": True,
        "message": "Prompt created",
        "data": prompt,
        "pagination": None,
    }


@router.get("/", response_model=ApiResponse)
async def list_prompts(
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    search: str | None = Query(None, min_length=1),
    filters: str | None = Query(None),
    sort_field: str | None = Query(None, alias="sortField", min_length=1),
    sort_order: str | None = Query(None, alias="sortOrder", min_length=1),
) -> dict:
    parsed_filters: list[dict] | None = None
    if filters:
        try:
            raw_filters = json.loads(filters)
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid filters JSON"
            ) from exc
        if not isinstance(raw_filters, list):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="filters must be a list"
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
            value = item.get("filterValue") if "filterValue" in item else item.get("filter_value")
            parsed_filters.append(
                {"filter_field": field, "filter_op": op, "filter_value": value}
            )
    workspace_id = workspace["id"] if workspace else None
    try:
        prompts, total = await prompt_library_service.list_prompts(
            pool,
            limit=limit,
            offset=offset,
            search=search,
            filters=parsed_filters,
            sort_field=sort_field,
            sort_order=sort_order,
            user_id=auth.user_id,
            workspace_id=workspace_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    page = (offset // limit) + 1 if limit else 1
    return {
        "success": True,
        "message": "Prompts fetched",
        "data": prompts,
        "pagination": Pagination(
            limit=limit, offset=offset, total=total, page=page, page_size=limit
        ),
    }


@router.get("/{prompt_id}", response_model=ApiResponse)
async def get_prompt(
    prompt_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    prompt = await prompt_library_service.get_prompt(pool, prompt_id)
    if not prompt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")
    await require_resource_access(prompt, pool, auth, created_by_field="createdby")
    return {
        "success": True,
        "message": "Prompt fetched",
        "data": prompt,
        "pagination": None,
    }


@router.patch("/{prompt_id}", response_model=ApiResponse)
async def update_prompt(
    prompt_id: int,
    data: PromptLibraryUpdate,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    existing = await prompt_library_service.get_prompt(pool, prompt_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")
    await require_resource_access(existing, pool, auth, created_by_field="createdby")
    prompt = await prompt_library_service.update_prompt(pool, prompt_id, data)
    if not prompt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")
    return {
        "success": True,
        "message": "Prompt updated",
        "data": prompt,
        "pagination": None,
    }


@router.delete("/{prompt_id}", response_model=ApiResponse, status_code=status.HTTP_200_OK)
async def delete_prompt(
    prompt_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    existing = await prompt_library_service.get_prompt(pool, prompt_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")
    await require_resource_access(existing, pool, auth, created_by_field="createdby")
    deleted = await prompt_library_service.delete_prompt(pool, prompt_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")
    return {
        "success": True,
        "message": "Prompt deleted",
        "data": None,
        "pagination": None,
    }


@router.post("/bulk-delete", response_model=ApiResponse)
async def bulk_delete(
    payload: PromptLibraryBulkDelete,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    workspace_id = workspace["id"] if workspace else None
    deleted_ids = await prompt_library_service.bulk_delete_prompts(
        pool, payload.ids, user_id=auth.user_id, workspace_id=workspace_id
    )
    return {
        "success": True,
        "message": "Prompts deleted",
        "data": {"deleted_ids": deleted_ids},
        "pagination": None,
    }


@router.post("/{prompt_id}/duplicate", response_model=ApiResponse)
async def duplicate_prompt(
    prompt_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    existing = await prompt_library_service.get_prompt(pool, prompt_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")
    await require_resource_access(existing, pool, auth, created_by_field="createdby")
    workspace_id = workspace["id"] if workspace else None
    prompt = await prompt_library_service.duplicate_prompt(
        pool, prompt_id, workspace_id=workspace_id
    )
    if not prompt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")
    return {
        "success": True,
        "message": "Prompt duplicated",
        "data": prompt,
        "pagination": None,
    }
