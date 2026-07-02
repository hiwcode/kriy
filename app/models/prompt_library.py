from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass
class PromptLibrary:
    id: int
    title: str
    prompt: str
    createdby: int
    tokens: int | None
    extradata: dict[str, Any] | None
    createdat: datetime
    updatedat: datetime
