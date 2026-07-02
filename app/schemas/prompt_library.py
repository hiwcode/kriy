from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class PromptLibraryBase(BaseModel):
    title: str
    prompt: str
    extradata: dict[str, Any] | None = None
    prompt_type: str = "instructions"  # "system" | "instructions"


class PromptLibraryCreate(PromptLibraryBase):
    model_config = {"extra": "ignore"}


class PromptLibraryUpdate(BaseModel):
    model_config = {"extra": "ignore"}

    title: str | None = None
    prompt: str | None = None
    extradata: dict[str, Any] | None = None
    prompt_type: str | None = None


class PromptLibraryOut(BaseModel):
    id: int
    title: str
    prompt: str
    createdby: int | None = None
    extradata: dict[str, Any] | None = None
    prompt_type: str = "instructions"
    tokens: int | None = None
    createdat: datetime
    updatedat: datetime


class PromptLibraryBulkDelete(BaseModel):
    ids: list[int]
