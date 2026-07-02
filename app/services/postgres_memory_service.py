"""PostgreSQL-backed memory service for ADK Runner."""

from __future__ import annotations

import logging
from typing import Any

import asyncpg
from google.adk.memory.base_memory_service import (
    BaseMemoryService,
    SearchMemoryResponse,
)
from google.adk.memory.memory_entry import MemoryEntry
from google.genai.types import Content, Part

from app.repositories import memory_repo
from app.services.memory_service import _extract_fallback, _extract_user_messages

logger = logging.getLogger(__name__)


class PostgresMemoryService(BaseMemoryService):
    """
    PostgreSQL-backed memory service.
    Facts are stored in agent_memories and available across all sessions of an agent.
    When workspace_id is set, searches return ALL users' memories for the agent.
    """

    def __init__(self, pool: asyncpg.Pool, agent_id: int, workspace_id: int | None = None):
        self.pool = pool
        self.agent_id = agent_id
        self.workspace_id = workspace_id

    async def search_memory(
        self,
        *,
        app_name: str,
        user_id: str,
        query: str,
    ) -> SearchMemoryResponse:
        """Search stored facts for this agent.
        In workspace mode, searches across all users' memories.
        """
        search_user_id = None if self.workspace_id else user_id
        rows = await memory_repo.search_memories(
            self.pool,
            agent_id=self.agent_id,
            user_id=search_user_id,
            query=query,
            limit=20,
        )
        memories = [
            MemoryEntry(
                content=Content(parts=[Part(text=r["content"])]),
                id=str(r["id"]),
                custom_metadata={"memory_type": r.get("memory_type", "fact")},
            )
            for r in rows
        ]
        return SearchMemoryResponse(memories=memories)

    async def add_session_to_memory(self, session: Any) -> None:
        """Extract facts from user messages in session events and store them."""
        # Build event dicts from ADK session objects
        events = []
        for event in getattr(session, "events", []) or []:
            content = getattr(event, "content", None)
            if not content:
                continue
            author = getattr(event, "author", None) or ""
            role = getattr(content, "role", None) or ""
            parts_raw = getattr(content, "parts", None) or []
            parts = []
            for p in parts_raw:
                text = getattr(p, "text", None)
                if text:
                    parts.append({"text": text})
            if parts:
                events.append({
                    "author": author,
                    "content": {"role": role, "parts": parts},
                })

        # Extract only user messages
        conversation_text = _extract_user_messages(events)
        if not conversation_text.strip():
            return

        user_id = getattr(session, "user_id", "user") or "user"
        session_id = getattr(session, "id", None)

        # Load existing + dismissed keys to skip duplicates
        existing_keys = await memory_repo.get_existing_memory_keys(
            self.pool, self.agent_id, user_id
        )
        dismissed_keys = await memory_repo.get_dismissed_memory_keys(
            self.pool, self.agent_id, user_id
        )
        blocked = existing_keys | dismissed_keys

        # Use fast regex fallback (no API call in hot path)
        extracted = _extract_fallback(conversation_text)
        for content, memory_type in extracted:
            key = (content.lower().strip(), memory_type)
            if key in blocked:
                continue
            blocked.add(key)
            try:
                await memory_repo.create_memory(
                    self.pool,
                    agent_id=self.agent_id,
                    user_id=user_id,
                    content=content,
                    session_id=session_id,
                    memory_type=memory_type,
                    confidence=0.85,
                )
            except Exception as e:
                logger.debug("Skip duplicate memory: %s", e)
