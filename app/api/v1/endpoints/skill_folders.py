from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.security import AuthContext, api_key_auth, require_google_auth
from app.core.access import require_resource_access
from app.deps import get_db, get_current_workspace
from app.schemas.skill_folder import SkillFolderCreate, SkillFolderUpdate
from app.schemas.response import ApiResponse
from app.services import skill_folder_service

import asyncpg


router = APIRouter(
    prefix="/skill-folders",
    tags=["skill-folders"],
    dependencies=[Depends(api_key_auth)],
)


async def _require_folder_access(folder_id: int, pool: asyncpg.Pool, auth: AuthContext) -> dict:
    folder = await skill_folder_service.get_folder(pool, folder_id)
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    await require_resource_access(folder, pool, auth)
    return folder


@router.post("/", response_model=ApiResponse, status_code=status.HTTP_201_CREATED)
async def create_folder(
    data: SkillFolderCreate,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    workspace_id = workspace["id"] if workspace else None
    folder = await skill_folder_service.create_folder(
        pool, data, created_by=auth.user_id, workspace_id=workspace_id
    )
    return {
        "success": True,
        "message": "Folder created",
        "data": folder,
        "pagination": None,
    }


@router.get("/", response_model=ApiResponse)
async def list_folders(
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
    parent_id: int | None = Query(None),
    skill_id: int | None = Query(None),
) -> dict:
    workspace_id = workspace["id"] if workspace else None
    folders = await skill_folder_service.list_folders(
        pool,
        parent_id=parent_id,
        skill_id=skill_id,
        workspace_id=workspace_id,
        user_id=auth.user_id,
    )
    return {
        "success": True,
        "message": "Folders fetched",
        "data": folders,
        "pagination": None,
    }


@router.get("/{folder_id}", response_model=ApiResponse)
async def get_folder(
    folder_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    folder = await _require_folder_access(folder_id, pool, auth)
    return {
        "success": True,
        "message": "Folder fetched",
        "data": folder,
        "pagination": None,
    }


@router.get("/{folder_id}/path", response_model=ApiResponse)
async def get_folder_path(
    folder_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    await _require_folder_access(folder_id, pool, auth)
    path = await skill_folder_service.get_folder_path(pool, folder_id)
    return {
        "success": True,
        "message": "Folder path fetched",
        "data": path,
        "pagination": None,
    }


@router.patch("/{folder_id}", response_model=ApiResponse)
async def update_folder(
    folder_id: int,
    data: SkillFolderUpdate,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    await _require_folder_access(folder_id, pool, auth)
    folder = await skill_folder_service.update_folder(pool, folder_id, data)
    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found"
        )
    return {
        "success": True,
        "message": "Folder updated",
        "data": folder,
        "pagination": None,
    }


@router.delete("/{folder_id}", response_model=ApiResponse, status_code=status.HTTP_200_OK)
async def delete_folder(
    folder_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    await _require_folder_access(folder_id, pool, auth)
    deleted = await skill_folder_service.delete_folder(pool, folder_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found"
        )
    return {
        "success": True,
        "message": "Folder deleted",
        "data": None,
        "pagination": None,
    }
