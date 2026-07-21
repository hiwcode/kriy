"""Model catalog — list available models with per-1M pricing, add/override, delete.

Built-in defaults (app/core/model_pricing.py) are always present; rows added here
override a built-in's price or introduce a new model, scoped to the workspace.
"""

from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.security import AuthContext, api_key_auth, require_google_auth
from app.deps import get_current_workspace, get_db
from app.repositories import model_repo
from app.schemas.response import ApiResponse

router = APIRouter(prefix="/models", tags=["models"], dependencies=[Depends(api_key_auth)])


def _ws_id(workspace: dict | None) -> int | None:
    return workspace["id"] if workspace else None


class ModelIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    label: str = Field(default="", max_length=200)
    input_per_million: float = Field(..., ge=0)
    output_per_million: float = Field(..., ge=0)


@router.get("", response_model=ApiResponse)
async def list_models(
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    catalog = await model_repo.list_catalog(pool, _ws_id(workspace))
    return {"success": True, "message": "Models fetched", "data": catalog, "pagination": None}


@router.put("", response_model=ApiResponse)
async def upsert_model(
    data: ModelIn,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Model name is required")
    row = await model_repo.upsert(
        pool,
        workspace_id=_ws_id(workspace),
        user_id=auth.user_id,
        name=name,
        label=data.label.strip(),
        input_per_million=data.input_per_million,
        output_per_million=data.output_per_million,
    )
    return {"success": True, "message": "Model saved", "data": row, "pagination": None}


@router.delete("/{name}", response_model=ApiResponse)
async def delete_model(
    name: str,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    await model_repo.delete(pool, workspace_id=_ws_id(workspace), name=name)
    return {"success": True, "message": "Model removed", "data": {"name": name}, "pagination": None}
