"""Opik observability via the official ADK integration (per-user config).

Uses opik.integrations.adk.OpikTracer + track_adk_agent_recursive to get
deep tracing: every sub-agent call, every tool call/response, every LLM
invocation with token usage — all as hierarchical spans in Opik.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

_opik_available = False

try:
    import opik
    from opik.integrations.adk import OpikTracer, track_adk_agent_recursive

    _opik_available = True
except ImportError:
    logger.debug("opik package not installed — deep tracing disabled")


def setup_opik_tracing(
    opik_config: dict[str, Any] | None,
    agent: Any,
    *,
    agent_name: str,
    agent_id: int,
    session_id: str,
    workspace_id: int | None = None,
) -> Any | None:
    """Configure Opik for this user and inject deep tracing into the agent tree.

    Returns the OpikTracer (for flushing later) or None if disabled.
    """
    if not _opik_available or not opik_config:
        return None

    if not opik_config.get("opik_enabled"):
        return None

    api_key = opik_config.get("opik_api_key")
    if not api_key:
        return None

    try:
        # Configure the global Opik client for this user
        configure_kwargs: dict[str, Any] = {
            "api_key": api_key,
            "force": True,  # re-configure even if already set
        }
        if opik_config.get("opik_workspace"):
            configure_kwargs["workspace"] = opik_config["opik_workspace"]
        if opik_config.get("opik_url_override"):
            configure_kwargs["url"] = opik_config["opik_url_override"]

        opik.configure(**configure_kwargs)

        # Create tracer with agent name as project (each agent = its own Opik project)
        tracer = OpikTracer(
            name=f"agent-run/{agent_name}",
            project_name=agent_name,
            tags=["agent-run", agent_name],
            metadata={
                "agent_id": agent_id,
                "agent_name": agent_name,
                "session_id": session_id,
                "workspace_id": workspace_id,
                "source": "atelier",
            },
        )

        # Recursively inject callbacks into the entire agent tree
        # This instruments: agents, sub-agents, tool calls, LLM calls
        track_adk_agent_recursive(agent, tracer)

        logger.info("Opik deep tracing enabled for agent '%s'", agent_name)
        return tracer

    except Exception:
        logger.debug("Failed to set up Opik tracing", exc_info=True)
        return None


def flush_tracer(tracer: Any | None) -> None:
    """Flush pending Opik data."""
    if tracer is not None:
        try:
            tracer.flush()
        except Exception:
            logger.debug("Failed to flush Opik tracer", exc_info=True)
