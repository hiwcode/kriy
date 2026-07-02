from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ScheduleCreate(BaseModel):
    model_config = {"extra": "ignore"}

    name: str
    description: str | None = None
    agent_id: int
    message: str
    schedule_type: str = "one_time"  # one_time | recurring
    cron_expression: str | None = None
    run_at: datetime | None = None
    max_runs: int | None = None


class ScheduleUpdate(BaseModel):
    model_config = {"extra": "ignore"}

    name: str | None = None
    description: str | None = None
    message: str | None = None
    schedule_type: str | None = None
    cron_expression: str | None = None
    run_at: datetime | None = None
    max_runs: int | None = None
    status: str | None = None
