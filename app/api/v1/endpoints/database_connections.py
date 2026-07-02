"""Database connections API for agent query tool."""

from __future__ import annotations

import json

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.access import require_resource_access
from app.core.security import AuthContext, api_key_auth, require_google_auth
from app.deps import get_db, get_current_workspace
from app.repositories import database_connection_repo
from app.schemas.database_connection import (
    DatabaseConnectionCreate,
    DatabaseConnectionUpdate,
)
from app.schemas.response import ApiResponse, Pagination

router = APIRouter(
    prefix="/database-connections",
    tags=["database-connections"],
    dependencies=[Depends(api_key_auth)],
)


@router.post("/", response_model=ApiResponse, status_code=status.HTTP_201_CREATED)
async def create_database_connection(
    data: DatabaseConnectionCreate,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    workspace_id = workspace["id"] if workspace else None
    conn = await database_connection_repo.create_database_connection(
        pool,
        name=data.name,
        connection_url=data.connection_url,
        read_only=data.read_only,
        max_rows=data.max_rows,
        created_by=auth.user_id,
        workspace_id=workspace_id,
    )
    return {
        "success": True,
        "message": "Database connection created",
        "data": conn,
        "pagination": None,
    }


@router.get("/", response_model=ApiResponse)
async def list_database_connections(
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
        effective_sort_field = sort_field or "created_at"
        effective_sort_order = sort_order or "desc"
        connections = await database_connection_repo.list_database_connections(
            pool,
            limit=limit,
            offset=offset,
            search=search,
            filters=parsed_filters,
            sort_field=effective_sort_field,
            sort_order=effective_sort_order,
            user_id=auth.user_id,
            workspace_id=workspace_id,
        )
        total = await database_connection_repo.count_database_connections(
            pool,
            search=search,
            filters=parsed_filters,
            user_id=auth.user_id,
            workspace_id=workspace_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    return {
        "success": True,
        "message": "Database connections fetched",
        "data": connections,
        "pagination": Pagination(
            limit=limit, offset=offset, total=total, page=1, page_size=limit
        ),
    }


@router.get("/{connection_id}", response_model=ApiResponse)
async def get_database_connection(
    connection_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    conn = await database_connection_repo.get_database_connection(
        pool, connection_id
    )
    if not conn:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Database connection not found",
        )
    await require_resource_access(conn, pool, auth)
    return {
        "success": True,
        "message": "Database connection fetched",
        "data": conn,
        "pagination": None,
    }


@router.patch("/{connection_id}", response_model=ApiResponse)
async def update_database_connection(
    connection_id: int,
    data: DatabaseConnectionUpdate,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    existing = await database_connection_repo.get_database_connection(
        pool, connection_id
    )
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Database connection not found",
        )
    await require_resource_access(existing, pool, auth)
    updates = data.model_dump(exclude_unset=True)
    conn = await database_connection_repo.update_database_connection(
        pool,
        connection_id,
        **updates,
    )
    if not conn:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Database connection not found",
        )
    return {
        "success": True,
        "message": "Database connection updated",
        "data": conn,
        "pagination": None,
    }


@router.delete(
    "/{connection_id}", response_model=ApiResponse, status_code=status.HTTP_200_OK
)
async def delete_database_connection(
    connection_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    existing = await database_connection_repo.get_database_connection(
        pool, connection_id
    )
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Database connection not found",
        )
    await require_resource_access(existing, pool, auth)
    deleted = await database_connection_repo.delete_database_connection(
        pool, connection_id
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Database connection not found",
        )
    return {
        "success": True,
        "message": "Database connection deleted",
        "data": None,
        "pagination": None,
    }
