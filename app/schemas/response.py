from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class Pagination(BaseModel):
    limit: int | None = None
    offset: int | None = None
    total: int | None = None
    page: int | None = None
    page_size: int | None = None


class ApiResponse(BaseModel):
    success: bool
    message: str
    data: Any = None
    pagination: Pagination | None = None
