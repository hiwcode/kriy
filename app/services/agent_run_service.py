"""Service for running agents and streaming responses."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import AsyncGenerator

import asyncpg
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.auth.credential_service.in_memory_credential_service import (
    InMemoryCredentialService,
)
from google.adk.runners import Runner
from google.genai import types

from app.agents.runtime import build_agent_from_config
from app.agents.ui_tools import UI_TOOL_NAMES, build_ui_card
from app.core.config import settings
from app.services import agent_service
from app.services.session_service import PostgresSessionService
from app.services.postgres_memory_service import PostgresMemoryService
from app.services.opik_service import setup_opik_tracing, flush_tracer
from app.services.llm_key_resolver import resolve_api_key, api_key_context, detect_provider
from app.services.run_errors import classify_run_error

logger = logging.getLogger(__name__)

# RunConfig lets us cap model calls per run (guards runaway tool loops). Imported
# defensively so a future ADK layout change can't break run startup.
try:
    from google.adk.agents.run_config import RunConfig
except ImportError:  # pragma: no cover - depends on ADK version
    try:
        from google.adk.runners import RunConfig  # type: ignore
    except ImportError:  # pragma: no cover
        RunConfig = None  # type: ignore


def _build_run_config():
    """RunConfig with a max-LLM-calls safety cap, or None when unavailable/disabled."""
    cap = settings.LLM_MAX_CALLS_PER_RUN
    if RunConfig is None or cap is None or cap <= 0:
        return None
    try:
        return RunConfig(max_llm_calls=cap)
    except Exception:  # pragma: no cover - unexpected RunConfig signature
        return None

# Lock to prevent concurrent agent runs from overwriting env API keys
_agent_run_lock = asyncio.Lock()

# Store pending runners for tool confirmation round-trips
# Key: "{agent_id}:{session_id}" → (Runner, user_id, opik_tracer, env_var, api_key)
_pending_runners: dict[str, tuple] = {}


def _extract_confirmations(event) -> list[dict]:
    """Extract tool confirmation requests from an ADK event."""
    results = []
    if not hasattr(event, "actions") or not event.actions:
        return results
    confirmations = getattr(event.actions, "requested_tool_confirmations", None)
    if not confirmations:
        return results

    # Get function calls from the event content to extract tool name + args
    fc_map = {}
    if event.content and event.content.parts:
        for part in event.content.parts:
            if hasattr(part, "function_call") and part.function_call:
                fc = part.function_call
                if fc.id:
                    fc_map[fc.id] = fc

    # Also check for adk_request_confirmation function calls (long-running pattern)
    for part in (event.content.parts if event.content and event.content.parts else []):
        if hasattr(part, "function_call") and part.function_call:
            fc = part.function_call
            if fc.name == "adk_request_confirmation" and fc.id:
                args = dict(fc.args) if fc.args else {}
                original_fc = args.get("originalFunctionCall", {})
                tool_conf = args.get("toolConfirmation", {})
                results.append({
                    "function_call_id": fc.id,
                    "tool_name": original_fc.get("name", ""),
                    "args": original_fc.get("args", {}),
                    "hint": tool_conf.get("hint", "Please approve or reject this action."),
                })

    # Direct confirmation requests (non-long-running)
    for fc_id, conf in confirmations.items():
        if not any(r["function_call_id"] == fc_id for r in results):
            fc = fc_map.get(fc_id)
            results.append({
                "function_call_id": fc_id,
                "tool_name": fc.name if fc else "",
                "args": dict(fc.args) if fc and fc.args else {},
                "hint": conf.hint or "Please approve or reject this action.",
            })

    return results


async def _process_events(runner, user_id, session_id, message, agent_id, opik_tracer):
    """Process runner events and yield SSE data, handling confirmations."""
    # Scope code-exec / file tools to a per-session workspace subdir so one
    # session's artifacts can't collide with or leak into another's.
    from app.agents import tool_registry
    tool_registry.current_session.set(session_id)

    pending_confirmations = []
    emitted_text = False
    emitted_card = False
    had_tool_activity = False
    event_count = 0
    run_config = _build_run_config()
    run_kwargs: dict = {"user_id": user_id, "session_id": session_id, "new_message": message}
    if run_config is not None:
        run_kwargs["run_config"] = run_config

    # Retry only a *transient* failure that happens before ANY output/tool activity
    # this run — retrying after side effects would duplicate them. This covers the
    # common 429/quota-at-first-call case without re-running tools.
    max_attempts = max(1, settings.LLM_MAX_RETRIES + 1)
    attempt = 0

    try:
        while True:
            attempt += 1
            try:
                async for event in runner.run_async(**run_kwargs):
                    event_count += 1
                    author = getattr(event, 'author', '?')
                    has_content = bool(event.content and event.content.parts)
                    has_fc = bool(event.get_function_calls()) if hasattr(event, 'get_function_calls') else False
                    has_fr = bool(event.get_function_responses()) if hasattr(event, 'get_function_responses') else False
                    if has_fc or has_fr:
                        had_tool_activity = True

                    # Debug: log every event
                    logger.info(
                        "ADK event #%d: author=%s, long_running=%s, has_content=%s, has_fc=%s, has_fr=%s, actions_confs=%s",
                        event_count,
                        author,
                        bool(event.long_running_tool_ids) if hasattr(event, 'long_running_tool_ids') else False,
                        has_content,
                        has_fc,
                        has_fr,
                        bool(getattr(getattr(event, 'actions', None), 'requested_tool_confirmations', None)),
                    )

                    # Log raw parts for debugging empty responses
                    if has_content:
                        part_types = []
                        for p in event.content.parts:
                            if p.text:
                                part_types.append(f"text({len(p.text)}ch)")
                            elif hasattr(p, 'function_call') and p.function_call:
                                part_types.append(f"fc({p.function_call.name})")
                            elif hasattr(p, 'function_response') and p.function_response:
                                part_types.append(f"fr({p.function_response.name})")
                            else:
                                part_types.append("other")
                        logger.debug("ADK event #%d parts: %s", event_count, ", ".join(part_types))

                    # Check for long-running tool IDs (confirmation requests from ADK)
                    if event.long_running_tool_ids:
                        confs = _extract_confirmations(event)
                        if confs:
                            logger.info("Tool confirmation requested: %s", confs)
                            pending_confirmations = confs
                            for conf in confs:
                                yield f"data: {json.dumps({'type': 'tool_confirmation', **conf})}\n\n"
                            return

                    # Also check actions.requested_tool_confirmations directly
                    if hasattr(event, 'actions') and event.actions:
                        direct_confs = getattr(event.actions, 'requested_tool_confirmations', None)
                        if direct_confs:
                            confs = _extract_confirmations(event)
                            if confs:
                                logger.info("Direct tool confirmation requested: %s", confs)
                                pending_confirmations = confs
                                for conf in confs:
                                    yield f"data: {json.dumps({'type': 'tool_confirmation', **conf})}\n\n"
                                return

                    if event.content and event.content.parts:
                        for part in event.content.parts:
                            if part.text:
                                emitted_text = True
                                yield f"data: {json.dumps({'type': 'text', 'text': part.text})}\n\n"
                            elif getattr(part, "function_call", None) and part.function_call.name in UI_TOOL_NAMES:
                                # Presentational tool → stream a UI card straight from the args.
                                card = build_ui_card(
                                    part.function_call.name,
                                    dict(part.function_call.args) if part.function_call.args else {},
                                )
                                if card:
                                    emitted_card = True
                                    yield f"data: {json.dumps({'type': 'card', 'card': card})}\n\n"

                # After all events: if the model ran tools but returned no closing text
                # (a known gemini-3.1-flash-lite behaviour), emit a fallback so this turn counts
                # as successful. Without it the caller would retry the whole turn — re-running
                # the tools and duplicating their side effects (e.g. a second schedule).
                if not emitted_text and not emitted_card and not pending_confirmations and had_tool_activity:
                    logger.info(
                        "Tools ran but model returned no text; emitting fallback for agent_id=%s session=%s",
                        agent_id, session_id,
                    )
                    yield f"data: {json.dumps({'type': 'text', 'text': 'Done.'})}\n\n"
                    emitted_text = True
                elif not emitted_text and not emitted_card and not pending_confirmations:
                    logger.warning(
                        "Agent produced %d event(s) but no text output for agent_id=%s session=%s",
                        event_count, agent_id, session_id,
                    )
                break  # completed without raising — leave the retry loop

            except Exception as e:
                err = classify_run_error(e)
                # Retry only if nothing was emitted this run and no tools fired, so a
                # retry can't duplicate output or tool side effects.
                can_retry = (
                    err.retryable
                    and attempt < max_attempts
                    and not emitted_text
                    and not emitted_card
                    and not had_tool_activity
                )
                if can_retry:
                    delay = settings.LLM_RETRY_BASE_DELAY * (2 ** (attempt - 1))
                    logger.warning(
                        "Transient LLM error (%s) attempt %d/%d for agent_id=%s session=%s; retrying in %.1fs: %s",
                        err.kind, attempt, max_attempts, agent_id, session_id, delay, e,
                    )
                    event_count = 0
                    await asyncio.sleep(delay)
                    continue
                logger.exception("Agent run failed (%s)", err.kind)
                yield f"data: {json.dumps({'type': 'error', 'error': err.message})}\n\n"
                emitted_text = True  # Prevent empty-response retry after exception
                break
    finally:
        if not pending_confirmations:
            # Only flush if we're done (no pending confirmations)
            flush_tracer(opik_tracer)
            # Clean up pending runner
            key = f"{agent_id}:{session_id}"
            _pending_runners.pop(key, None)


async def run_agent_stream(
    pool: asyncpg.Pool,
    agent_id: int,
    user_input: str,
    session_id: str | None = None,
    user_id: str = "user",
    db_user_id: int | None = None,
    document_ids: list[int] | None = None,
) -> AsyncGenerator[str, None]:
    """Run an agent and stream the response as SSE events."""
    agent_config = await agent_service.get_agent(pool, agent_id)
    if not agent_config:
        yield f"data: {json.dumps({'type': 'error', 'error': 'Agent not found'})}\n\n"
        return

    env_var, api_key, user_config = await resolve_api_key(pool, agent_config, db_user_id)

    if env_var and not api_key:
        provider, *_ = detect_provider(agent_config.get("model") or settings.DEFAULT_MODEL)
        yield f"data: {json.dumps({'type': 'error', 'error': f'Missing API key for {provider} model. Set it in Config > Configuration'})}\n\n"
        return

    async with _agent_run_lock:
        ctx = api_key_context(env_var, api_key)
        with ctx:
            existing_session_id = session_id
            session_id = session_id or str(uuid.uuid4())

            try:
                agent = await build_agent_from_config(
                    pool, agent_config, include_memory_tool=True,
                    session_id=session_id,
                )
            except Exception as e:
                logger.exception("Failed to build agent")
                yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
                return

            app_name = agent_config.get("name", "agent")
            session_service = PostgresSessionService(pool, agent_id)
            memory_service = PostgresMemoryService(
                pool, agent_id, workspace_id=agent_config.get("workspace_id")
            )
            if existing_session_id:
                logger.info("Using existing session %s for context", existing_session_id)

            opik_tracer = setup_opik_tracing(
                user_config,
                agent,
                agent_name=app_name,
                agent_id=agent_id,
                session_id=session_id,
                workspace_id=agent_config.get("workspace_id"),
            )

            runner = Runner(
                app_name=app_name,
                agent=agent,
                artifact_service=InMemoryArtifactService(),
                session_service=session_service,
                memory_service=memory_service,
                credential_service=InMemoryCredentialService(),
                auto_create_session=True,
            )

            yield f"data: {json.dumps({'type': 'session', 'session_id': session_id})}\n\n"

            parts = [types.Part(text=user_input)]

            # Inject uploaded image documents as inline image parts for vision
            if document_ids:
                from app.repositories import document_repo
                from app.core import storage as doc_storage
                for doc_id in document_ids:
                    try:
                        doc = await document_repo.get(pool, doc_id)
                        if not doc or not doc.get("mime_type", "").startswith("image/"):
                            continue
                        # Scope check: only inject docs this agent+session may see
                        # (prevents cross-tenant image read via arbitrary doc ids).
                        if not document_repo.is_visible(doc, agent_id, session_id):
                            continue
                        if doc.get("bucket_key"):
                            img_bytes = doc_storage.download_bytes(doc["bucket_key"])
                        elif doc.get("url"):
                            import httpx
                            from app.core.net_guard import assert_public_url
                            assert_public_url(doc["url"])  # SSRF guard
                            async with httpx.AsyncClient(timeout=30, follow_redirects=False) as hc:
                                resp = await hc.get(doc["url"])
                                resp.raise_for_status()
                                img_bytes = resp.content
                        else:
                            continue
                        parts.append(types.Part(
                            inline_data=types.Blob(
                                mime_type=doc["mime_type"],
                                data=img_bytes,
                            )
                        ))
                    except Exception as exc:
                        logger.warning("Failed to inject image doc %s: %s", doc_id, exc)

            content = types.Content(parts=parts)

            # Store runner for potential confirmation round-trip
            key = f"{agent_id}:{session_id}"
            _pending_runners[key] = (
                runner,
                user_id,
                opik_tracer,
                env_var,
                api_key,
                session_service,
                memory_service,
            )

            # Run with one automatic retry on empty response
            max_attempts = 2
            for attempt in range(1, max_attempts + 1):
                got_output = False
                async for chunk in _process_events(runner, user_id, session_id, content, agent_id, opik_tracer):
                    got_output = True
                    yield chunk

                if got_output or attempt == max_attempts:
                    break

                # Empty response on first attempt — retry after a brief pause
                logger.info(
                    "Empty response from model on attempt %d, retrying for agent_id=%s session=%s",
                    attempt, agent_id, session_id,
                )
                await asyncio.sleep(1)

            if not got_output:
                yield f"data: {json.dumps({'type': 'error', 'error': 'The model returned an empty response after retrying. This can happen when MCP tool connections are unstable or the model filters the response. Please try again.'})}\n\n"


async def confirm_tool_stream(
    pool: asyncpg.Pool,
    agent_id: int,
    session_id: str,
    function_call_id: str,
    confirmed: bool,
    user_id: str = "user",
    db_user_id: int | None = None,
) -> AsyncGenerator[str, None]:
    """Resume agent execution after tool confirmation."""
    key = f"{agent_id}:{session_id}"
    pending = _pending_runners.get(key)

    if not pending:
        # Runner not cached - need to rebuild
        agent_config = await agent_service.get_agent(pool, agent_id)
        if not agent_config:
            yield f"data: {json.dumps({'type': 'error', 'error': 'Agent not found'})}\n\n"
            return

        env_var, api_key, user_config = await resolve_api_key(pool, agent_config, db_user_id)

        if env_var and not api_key:
            provider, *_ = detect_provider(agent_config.get("model") or settings.DEFAULT_MODEL)
            yield f"data: {json.dumps({'type': 'error', 'error': f'Missing API key for {provider} model. Set it in Config > Configuration'})}\n\n"
            return

        async with _agent_run_lock:
            ctx = api_key_context(env_var, api_key)
            with ctx:
                try:
                    agent = await build_agent_from_config(
                        pool, agent_config, include_memory_tool=True,
                        session_id=session_id,
                    )
                except Exception as e:
                    yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
                    return

                app_name = agent_config.get("name", "agent")
                session_service = PostgresSessionService(pool, agent_id)
                memory_service = PostgresMemoryService(
                    pool, agent_id, workspace_id=agent_config.get("workspace_id")
                )
                opik_tracer = setup_opik_tracing(
                    user_config, agent, agent_name=app_name,
                    agent_id=agent_id, session_id=session_id,
                    workspace_id=agent_config.get("workspace_id"),
                )

                runner = Runner(
                    app_name=app_name,
                    agent=agent,
                    artifact_service=InMemoryArtifactService(),
                    session_service=session_service,
                    memory_service=memory_service,
                    credential_service=InMemoryCredentialService(),
                    auto_create_session=True,
                )
                pending = (
                    runner,
                    user_id,
                    opik_tracer,
                    env_var,
                    api_key,
                    session_service,
                    memory_service,
                )
                _pending_runners[key] = pending
    else:
        env_var = pending[3]
        api_key = pending[4]

    runner = pending[0]
    opik_tracer = pending[2]

    async with _agent_run_lock:
        ctx = api_key_context(env_var, api_key)
        with ctx:
            # Send FunctionResponse for the adk_request_confirmation call
            logger.info(
                "Sending tool confirmation: fc_id=%s, confirmed=%s, session=%s",
                function_call_id, confirmed, session_id
            )
            confirmation_response = types.Content(
                role="user",
                parts=[
                    types.Part(
                        function_response=types.FunctionResponse(
                            id=function_call_id,
                            name="adk_request_confirmation",
                            response={"confirmed": confirmed},
                        )
                    )
                ],
            )

            async for chunk in _process_events(
                runner, user_id, session_id, confirmation_response, agent_id, opik_tracer
            ):
                yield chunk
