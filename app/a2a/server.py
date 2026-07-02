"""
Build A2A Starlette applications for agents stored in the database.

Each agent gets its own mount at  /a2a/{agent_id}/  which serves:
  • POST /              – JSON-RPC endpoint (tasks/send, tasks/sendSubscribe …)
  • GET  /.well-known/agent.json  – Agent Card
"""

from __future__ import annotations

import logging
from typing import Any

import asyncpg
from starlette.applications import Starlette

from a2a.server.apps import A2AStarletteApplication
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import AgentCapabilities, AgentCard, AgentSkill

from google.adk.a2a.executor.a2a_agent_executor import A2aAgentExecutor
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.auth.credential_service.in_memory_credential_service import InMemoryCredentialService
from google.adk.runners import Runner

from app.agents.runtime import build_agent_from_config
from app.core.config import settings
from app.services.session_service import PostgresSessionService
from app.services.postgres_memory_service import PostgresMemoryService

logger = logging.getLogger(__name__)


async def build_a2a_app(
    pool: asyncpg.Pool,
    agent_config: dict[str, Any],
    *,
    mount_path: str = "",
    base_url: str | None = None,
) -> Starlette:
    """
    Create a Starlette A2A application for *agent_config* (a row from ``agents`` table).

    Parameters
    ----------
    pool:
        asyncpg connection pool (shared with the main FastAPI app).
    agent_config:
        Agent row dict – must contain at least ``id``, ``name``, ``description``.
    mount_path:
        The path at which this app will be mounted (used for agent card URL).
    base_url:
        Public base URL.  Defaults to ``settings.BACKEND_URL``.
    """
    agent_id: int = agent_config["id"]
    agent_name: str = agent_config.get("name") or f"agent_{agent_id}"
    agent_label: str = agent_config.get("label") or agent_name
    agent_description: str = agent_config.get("description") or "An AI agent"

    # Resolve prompts to build instruction text for the skill card
    instruction: str = agent_config.get("instruction") or agent_config.get("system_prompt") or ""

    base = (base_url or settings.BACKEND_URL).rstrip("/")
    rpc_url = f"{base}{mount_path}"

    # ----- runner factory (called lazily per task) -----
    async def _create_runner() -> Runner:
        agent = await build_agent_from_config(pool, agent_config, include_memory_tool=True)
        session_service = PostgresSessionService(pool, agent_id)
        memory_service = PostgresMemoryService(
            pool, agent_id, workspace_id=agent_config.get("workspace_id"),
        )
        return Runner(
            app_name=agent_name,
            agent=agent,
            artifact_service=InMemoryArtifactService(),
            session_service=session_service,
            memory_service=memory_service,
            credential_service=InMemoryCredentialService(),
        )

    task_store = InMemoryTaskStore()

    agent_executor = A2aAgentExecutor(runner=_create_runner)

    request_handler = DefaultRequestHandler(
        agent_executor=agent_executor,
        task_store=task_store,
    )

    skills = [
        AgentSkill(
            id=agent_name,
            name=agent_label,
            description=instruction[:500] if instruction else agent_description,
            tags=["llm"],
        )
    ]

    agent_card = AgentCard(
        name=agent_label,
        description=agent_description,
        url=rpc_url,
        version="0.1.0",
        defaultInputModes=["text/plain"],
        defaultOutputModes=["text/plain"],
        capabilities=AgentCapabilities(),
        skills=skills,
    )

    a2a_app = A2AStarletteApplication(
        agent_card=agent_card,
        http_handler=request_handler,
    )

    app = Starlette()
    a2a_app.add_routes_to_app(app)
    return app


async def mount_all_a2a(app: Any, pool: asyncpg.Pool) -> int:
    """
    Discover all agents in the DB and mount an A2A sub-app for each.

    Returns the number of agents mounted.
    """
    from starlette.routing import Mount

    rows = await pool.fetch(
        "SELECT id, name, label, model, description, system_prompt, instruction, "
        "tools, extra_fields, is_orchestrator, sub_agent_ids, created_by, workspace_id, "
        "system_prompt_id, instruction_prompt_id "
        "FROM agents ORDER BY id"
    )

    count = 0
    for row in rows:
        agent_config = dict(row)
        agent_id = agent_config["id"]
        mount_path = f"/a2a/{agent_id}/"

        try:
            starlette_app = await build_a2a_app(
                pool, agent_config, mount_path=mount_path,
            )
            app.mount(mount_path, starlette_app)
            count += 1
            logger.info("Mounted A2A for agent %s (%s) at %s", agent_id, agent_config.get("name"), mount_path)
        except Exception:
            logger.exception("Failed to mount A2A for agent %s", agent_id)

    # Start all Starlette sub-apps
    for route in app.routes:
        if isinstance(route, Mount) and isinstance(route.app, Starlette):
            try:
                await route.app.router.startup()
            except Exception:
                logger.debug("Startup for mounted route failed (may be harmless)")

    logger.info("Mounted %d A2A agents", count)
    return count
