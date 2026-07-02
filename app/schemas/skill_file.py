from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel


class SkillFileCreate(BaseModel):
    model_config = {"extra": "ignore"}

    skill_id: int
    name: str
    content: str = ""
    file_type: str = "md"
    folder_id: int | None = None


class SkillFileUpdate(BaseModel):
    model_config = {"extra": "ignore"}

    name: str | None = None
    content: str | None = None
    file_type: str | None = None
    folder_id: int | None = None


class SkillFileOut(BaseModel):
    id: int
    skill_id: int
    name: str
    content: str
    file_type: str
    folder_id: int | None = None
    workspace_id: int | None = None
    created_by: int | None = None
    created_at: datetime
    updated_at: datetime


class SkillFileBulkDelete(BaseModel):
    ids: list[int]
