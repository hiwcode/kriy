from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class SkillFolderCreate(BaseModel):
    model_config = {"extra": "ignore"}

    name: str
    parent_id: int | None = None
    skill_id: int | None = None


class SkillFolderUpdate(BaseModel):
    model_config = {"extra": "ignore"}

    name: str | None = None
    parent_id: int | None = None
    skill_id: int | None = None


class SkillFolderOut(BaseModel):
    id: int
    name: str
    parent_id: int | None = None
    skill_id: int | None = None
    workspace_id: int | None = None
    created_by: int | None = None
    created_at: datetime
    updated_at: datetime
