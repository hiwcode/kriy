from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator


def _normalize_headers(v: Any) -> dict[str, str]:
    """Normalize headers: accept dict or JSON string, always return dict."""
    if v is None:
        return {}
    if isinstance(v, dict):
        return {str(k): str(val) for k, val in v.items()}
    if isinstance(v, str):
        try:
            parsed = json.loads(v)
            return _normalize_headers(parsed)
        except json.JSONDecodeError:
            return {}
    return {}


class McpConnectionBase(BaseModel):
    name: str
    url: str = ""
    transport_type: str = "streamable_http"  # "sse", "streamable_http", or "stdio"
    headers: dict[str, str] = {}
    command: str | None = None
    args: list[str] = []
    env: dict[str, str] | None = None

    @field_validator("headers", mode="before")
    @classmethod
    def validate_headers(cls, v: Any) -> dict[str, str]:
        return _normalize_headers(v)

    @field_validator("transport_type", mode="before")
    @classmethod
    def validate_transport_type(cls, v: Any) -> str:
        allowed = ("sse", "streamable_http", "stdio")
        val = str(v).strip().lower() if v else "streamable_http"
        return val if val in allowed else "streamable_http"

    @field_validator("args", mode="before")
    @classmethod
    def validate_args(cls, v: Any) -> list[str]:
        if v is None:
            return []
        if isinstance(v, list):
            return [str(i) for i in v]
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                return [str(i) for i in parsed] if isinstance(parsed, list) else []
            except json.JSONDecodeError:
                return []
        return []

    @field_validator("env", mode="before")
    @classmethod
    def validate_env(cls, v: Any) -> dict[str, str] | None:
        if v is None:
            return None
        if isinstance(v, dict):
            return {str(k): str(val) for k, val in v.items()}
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, dict):
                    return {str(k): str(val) for k, val in parsed.items()}
            except json.JSONDecodeError:
                pass
        return None

    timeout_seconds: float = 60


class McpConnectionCreate(McpConnectionBase):
    model_config = {"extra": "ignore"}


class McpConnectionUpdate(BaseModel):
    model_config = {"extra": "ignore"}

    name: str | None = None
    url: str | None = None
    transport_type: str | None = None
    headers: dict[str, str] | None = None
    command: str | None = None
    args: list[str] | None = None
    env: dict[str, str] | None = None

    @field_validator("headers", mode="before")
    @classmethod
    def validate_headers(cls, v: Any) -> dict[str, str] | None:
        if v is None:
            return None
        return _normalize_headers(v)

    @field_validator("transport_type", mode="before")
    @classmethod
    def validate_transport_type(cls, v: Any) -> str | None:
        if v is None:
            return None
        allowed = ("sse", "streamable_http", "stdio")
        val = str(v).strip().lower()
        return val if val in allowed else "streamable_http"

    @field_validator("args", mode="before")
    @classmethod
    def validate_args(cls, v: Any) -> list[str] | None:
        if v is None:
            return None
        if isinstance(v, list):
            return [str(i) for i in v]
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                return [str(i) for i in parsed] if isinstance(parsed, list) else None
            except json.JSONDecodeError:
                return None
        return None

    @field_validator("env", mode="before")
    @classmethod
    def validate_env(cls, v: Any) -> dict[str, str] | None:
        if v is None:
            return None
        if isinstance(v, dict):
            return {str(k): str(val) for k, val in v.items()}
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, dict):
                    return {str(k): str(val) for k, val in parsed.items()}
            except json.JSONDecodeError:
                pass
        return None

    timeout_seconds: float | None = None


class McpConnectionOut(BaseModel):
    id: int
    name: str
    url: str = ""
    transport_type: str = "streamable_http"
    headers: dict[str, Any] = {}
    command: str | None = None
    args: list[str] = []
    env: dict[str, str] | None = None
    timeout_seconds: float = 60
    created_at: datetime
    updated_at: datetime
    created_by: int | None = None
