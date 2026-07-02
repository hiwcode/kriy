from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.security import AuthContext, api_key_auth, require_google_auth
from app.deps import get_db
from app.schemas.response import ApiResponse, Pagination
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"], dependencies=[Depends(api_key_auth)])


@router.get("/me", response_model=ApiResponse)
async def get_current_user(
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """Get the currently authenticated user's info."""
    user = await user_service.get_user(pool, auth.user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return {
        "success": True,
        "message": "Current user",
        "data": user,
        "pagination": None,
    }


@router.post("/", response_model=ApiResponse, status_code=status.HTTP_201_CREATED)
async def create_user(user_in: UserCreate, pool: asyncpg.Pool = Depends(get_db)) -> dict:
    try:
        user = await user_service.create_user(pool, user_in)
    except asyncpg.UniqueViolationError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="User already exists"
        ) from exc
    return {
        "success": True,
        "message": "User created",
        "data": user,
        "pagination": None,
    }


@router.get("/", response_model=ApiResponse)
async def list_users(
    pool: asyncpg.Pool = Depends(get_db),
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[dict]:
    users, total = await user_service.list_users(pool, limit=limit, offset=offset)
    page = (offset // limit) + 1 if limit else 1
    return {
        "success": True,
        "message": "Users fetched",
        "data": users,
        "pagination": Pagination(
            limit=limit, offset=offset, total=total, page=page, page_size=limit
        ),
    }


@router.get("/{user_id}", response_model=ApiResponse)
async def get_user(user_id: int, pool: asyncpg.Pool = Depends(get_db)) -> dict:
    user = await user_service.get_user(pool, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return {
        "success": True,
        "message": "User fetched",
        "data": user,
        "pagination": None,
    }


@router.patch("/{user_id}", response_model=ApiResponse)
async def update_user(
    user_id: int, user_in: UserUpdate, pool: asyncpg.Pool = Depends(get_db)
) -> dict:
    try:
        user = await user_service.update_user(pool, user_id, user_in)
    except asyncpg.UniqueViolationError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email already in use"
        ) from exc
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return {
        "success": True,
        "message": "User updated",
        "data": user,
        "pagination": None,
    }


@router.delete("/{user_id}", response_model=ApiResponse, status_code=status.HTTP_200_OK)
async def delete_user(user_id: int, pool: asyncpg.Pool = Depends(get_db)) -> dict:
    deleted = await user_service.delete_user(pool, user_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return {
        "success": True,
        "message": "User deleted",
        "data": None,
        "pagination": None,
    }
