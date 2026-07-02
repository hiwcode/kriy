"""Schemas for database connections."""

from pydantic import BaseModel, Field


class DatabaseConnectionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    connection_url: str = Field(..., min_length=1)
    read_only: bool = True
    max_rows: int = Field(default=100, ge=1, le=1000)


class DatabaseConnectionUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    connection_url: str | None = Field(None, min_length=1)
    read_only: bool | None = None
    max_rows: int | None = Field(None, ge=1, le=1000)
