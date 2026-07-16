from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator


def _coerce_extra_fields(v: Any) -> dict[str, Any] | None:
    if v is None:
        return None
    if isinstance(v, dict):
        return v
    if isinstance(v, str):
        try:
            parsed = json.loads(v)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


class AgentToolConfig(BaseModel):
    type: str  # "builtin" | "mcp"
    name: str | None = None  # for builtin
    mcp_connection_id: int | None = None  # for mcp


class AgentBase(BaseModel):
    name: str
    label: str
    model: str = "gemini-3.1-flash-lite"
    description: str | None = None
    system_prompt: str | None = None
    system_prompt_id: int | None = None
    instruction: str | None = None
    instruction_prompt_id: int | None = None
    tools: list[dict[str, Any]] = []
    extra_fields: dict[str, Any] = {}
    is_orchestrator: bool = False
    sub_agent_ids: list[int] = []
    skill_ids: list[int] = []

    @field_validator("extra_fields", mode="before")
    @classmethod
    def validate_extra_fields(cls, v: Any) -> dict[str, Any]:
        result = _coerce_extra_fields(v)
        return result if result is not None else {}


class AgentCreate(AgentBase):
    model_config = {"extra": "ignore"}


class AgentUpdate(BaseModel):
    model_config = {"extra": "ignore"}

    name: str | None = None
    label: str | None = None
    model: str | None = None
    description: str | None = None
    system_prompt: str | None = None
    system_prompt_id: int | None = None
    instruction: str | None = None
    instruction_prompt_id: int | None = None
    tools: list[dict[str, Any]] | None = None
    extra_fields: dict[str, Any] | None = None
    is_orchestrator: bool | None = None
    sub_agent_ids: list[int] | None = None
    skill_ids: list[int] | None = None

    @field_validator("extra_fields", mode="before")
    @classmethod
    def validate_extra_fields(cls, v: Any) -> dict[str, Any] | None:
        return _coerce_extra_fields(v)


class AgentOut(BaseModel):
    id: int
    name: str
    label: str
    model: str
    description: str | None = None
    system_prompt: str | None = None
    system_prompt_id: int | None = None
    instruction: str | None = None
    instruction_prompt_id: int | None = None
    tools: list[dict[str, Any]] = []
    extra_fields: dict[str, Any] = {}
    is_orchestrator: bool = False
    sub_agent_ids: list[int] = []
    skill_ids: list[int] = []
    created_at: datetime
    updated_at: datetime
    created_by: int | None = None


class AgentBulkDelete(BaseModel):
    ids: list[int]
