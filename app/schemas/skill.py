from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class SkillCreate(BaseModel):
    model_config = {"extra": "ignore"}

    name: str
    description: str | None = None
    instructions: str
    tools: list[dict[str, Any]] = []
    folder_id: int | None = None
    type: str = "skill"


class SkillUpdate(BaseModel):
    model_config = {"extra": "ignore"}

    name: str | None = None
    description: str | None = None
    instructions: str | None = None
    tools: list[dict[str, Any]] | None = None
    folder_id: int | None = None
    type: str | None = None


class SkillOut(BaseModel):
    id: int
    name: str
    description: str | None = None
    instructions: str
    tools: list[dict[str, Any]] = []
    folder_id: int | None = None
    type: str = "skill"
    workspace_id: int | None = None
    created_by: int | None = None
    created_at: datetime
    updated_at: datetime


class SkillBulkDelete(BaseModel):
    ids: list[int]
