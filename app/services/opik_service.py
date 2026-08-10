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
    from opik.integrations.adk.patchers import patch_adk

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

    client: Any | None = None
    try:
        # Build an isolated client instead of calling opik.configure(), which writes
        # user credentials to a process-global config file. KRIY is multi-tenant, so
        # every run must retain its own immutable client configuration.
        project_name = opik_config.get("opik_project_name") or "kriy"
        client = opik.Opik(
            project_name=project_name,
            workspace=opik_config.get("opik_workspace") or None,
            host=opik_config.get("opik_url_override") or None,
            api_key=api_key,
            _use_batching=True,
        )

        tracer = OpikTracer(
            name=f"agent-run/{agent_name}",
            project_name=project_name,
            tags=["agent-run", agent_name],
            metadata={
                "agent_id": agent_id,
                "agent_name": agent_name,
                "session_id": session_id,
                "workspace_id": workspace_id,
                "source": "kriy",
            },
        )

        # OpikTracer currently obtains a process-global cached client internally.
        # Replace it with this run's isolated client and re-patch ADK telemetry so
        # both callback and OpenTelemetry spans use the same tenant credentials.
        tracer._opik_client = client
        patch_adk(client)

        # Recursively inject callbacks into the entire agent tree
        # This instruments: agents, sub-agents, tool calls, LLM calls
        track_adk_agent_recursive(agent, tracer)

        logger.info("Opik deep tracing enabled for agent '%s'", agent_name)
        return tracer

    except Exception:
        if client is not None:
            try:
                client.end()
            except Exception:
                pass
        logger.warning("Failed to set up Opik tracing; this run will continue without traces")
        return None


def flush_tracer(tracer: Any | None) -> None:
    """Flush pending Opik data and release this run's background sender."""
    if tracer is not None:
        try:
            tracer.flush()
        except Exception:
            logger.warning("Failed to flush Opik tracer; trace delivery may be incomplete")
        finally:
            client = getattr(tracer, "_opik_client", None)
            if client is not None:
                try:
                    client.end()
                except Exception:
                    logger.warning("Failed to close Opik client cleanly")
