"""PostgreSQL-backed session service for persistent chat history."""

from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any, Optional

import asyncpg
from google.adk.events.event import Event
from google.adk.sessions.base_session_service import (
    BaseSessionService,
    GetSessionConfig,
    ListSessionsResponse,
)
from google.adk.sessions.session import Session

logger = logging.getLogger(__name__)


class PostgresSessionService(BaseSessionService):
    """
    PostgreSQL-backed session service for persistent chat history.
    Stores sessions per agent and user.
    """

    def __init__(self, pool: asyncpg.Pool, agent_id: int):
        self.pool = pool
        self.agent_id = agent_id

    def _serialize_session(self, session: Session) -> str:
        """Serialize Session to JSON for storage."""
        return session.model_dump_json()

    def _deserialize_session(self, data: str) -> Session:
        """Deserialize Session from JSON."""
        return Session.model_validate_json(data)

    async def create_session(
        self,
        *,
        app_name: str,
        user_id: str,
        state: Optional[dict[str, Any]] = None,
        session_id: Optional[str] = None,
    ) -> Session:
        """Create a new session."""
        session_id = session_id or str(uuid.uuid4())
        session = Session(
            app_name=app_name,
            user_id=user_id,
            id=session_id,
            state=state or {},
            last_update_time=time.time(),
            events=[],
        )
        await self._save_session(session)
        return session

    async def _save_session(self, session: Session) -> None:
        """Persist session to PostgreSQL (workspace_id from agent)."""
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO agent_sessions
                (agent_id, user_id, session_id, session_data, last_update_time, workspace_id)
                VALUES ($1, $2, $3, $4, $5, (SELECT workspace_id FROM agents WHERE id = $1))
                ON CONFLICT (agent_id, user_id, session_id)
                DO UPDATE SET
                    session_data = EXCLUDED.session_data,
                    last_update_time = EXCLUDED.last_update_time,
                    workspace_id = (SELECT workspace_id FROM agents WHERE id = agent_sessions.agent_id)
                """,
                self.agent_id,
                session.user_id,
                session.id,
                self._serialize_session(session),
                session.last_update_time,
            )

    async def get_session(
        self,
        *,
        app_name: str,
        user_id: str,
        session_id: str,
        config: Optional[GetSessionConfig] = None,
    ) -> Optional[Session]:
        """Get a session from the database."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT session_data FROM agent_sessions
                WHERE agent_id = $1 AND user_id = $2 AND session_id = $3
                """,
                self.agent_id,
                user_id,
                session_id,
            )
        if not row:
            return None
        session = self._deserialize_session(row["session_data"])
        if config:
            session = session.model_copy(deep=True)
            if config.num_recent_events and session.events:
                session.events = session.events[-config.num_recent_events :]
            if config.after_timestamp and session.events:
                session.events = [
                    e for e in session.events if e.timestamp > config.after_timestamp
                ]
        return session

    async def list_sessions(
        self, *, app_name: str, user_id: str
    ) -> ListSessionsResponse:
        """List all sessions for an agent and user."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT session_id, session_data, last_update_time
                FROM agent_sessions
                WHERE agent_id = $1 AND user_id = $2
                ORDER BY last_update_time DESC
                """,
                self.agent_id,
                user_id,
            )
        sessions = []
        for row in rows:
            session = self._deserialize_session(row["session_data"])
            session_copy = session.model_copy(deep=True)
            session_copy.events = []
            sessions.append(session_copy)
        return ListSessionsResponse(sessions=sessions)

    async def append_event(self, session: Session, event: Event) -> Event:
        """Append event and persist."""
        await super().append_event(session, event)
        session.last_update_time = event.timestamp
        if not session.state.get("title") and event.author == "user":
            text = None
            if event.content and event.content.parts:
                text = " ".join(
                    p.text for p in event.content.parts if p.text
                ).strip()
            if text:
                session.state["title"] = (
                    text[:100] + ("..." if len(text) > 100 else "")
                )
        await self._save_session(session)
        return event

    async def delete_session(
        self, *, app_name: str, user_id: str, session_id: str
    ) -> None:
        """Delete a session."""
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                DELETE FROM agent_sessions
                WHERE agent_id = $1 AND user_id = $2 AND session_id = $3
                """,
                self.agent_id,
                user_id,
                session_id,
            )
