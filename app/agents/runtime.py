"""Build LlmAgent from database configuration."""

from __future__ import annotations

import json
import logging
from typing import Any

import asyncpg
import httpx
from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools.agent_tool import AgentTool
from google.adk.tools.mcp_tool import MCPToolset, StreamableHTTPConnectionParams, SseConnectionParams, StdioConnectionParams
from mcp import StdioServerParameters

from app.core.config import settings
from app.agents.database_tool import make_database_tool
from app.agents.schedule_tool import make_schedule_tools
from app.agents.workflow_tool import make_workflow_tools
from app.agents.event_tool import make_event_tools
from app.agents.notify_tool import make_notify_tools
from app.agents.email_tool import make_email_tools
from app.agents.call_api_tool import make_call_api_tools
from app.agents.document_tool import make_document_tools
from app.agents.analyze_tools import make_analyze_tools
from app.agents.self_learning_tool import make_self_learning_tools
from app.agents.ui_tools import make_ui_tools, UI_TOOL_NAMES
from app.agents.custom_skill_toolset import DynamicSkillToolset
from app.agents.skill_code_executor import AutoVenvSkillCodeExecutor
from app.agents.tool_registry import get_builtin_tool
from app.repositories import agent_repo, database_connection_repo, mcp_connection_repo, prompt_library_repo, skill_repo, skill_file_repo

logger = logging.getLogger(__name__)

try:
    from google.adk.agents.remote_a2a_agent import RemoteA2aAgent
except ImportError:
    RemoteA2aAgent = None  # type: ignore

AGENT_CARD_SUFFIX = "/.well-known/agent.json"


def _agent_card_url(url: str) -> str:
    """Normalize URL to agent card: use as-is if already ends with .well-known/agent.json."""
    u = url.strip().rstrip("/")
    if u.endswith(".well-known/agent.json"):
        return u
    return u + AGENT_CARD_SUFFIX

try:
    from google.adk.tools import load_memory, preload_memory
except ImportError:
    load_memory = None  # type: ignore
    preload_memory = None  # type: ignore

DEFAULT_INSTRUCTION = (
    "You are a helpful AI assistant. "
    "When the user asks about themselves, past preferences, or what you remember about them, "
    "use the load_memory tool to search stored facts before answering."
)


async def _resolve_prompt(
    pool: asyncpg.Pool,
    direct: str | None,
    prompt_id: int | None,
) -> str | None:
    """Resolve prompt from library or use direct text."""
    if prompt_id:
        prompt = await prompt_library_repo.get_prompt(pool, prompt_id)
        if prompt and prompt.get("prompt"):
            return prompt["prompt"]
    return direct


def _escape_adk_braces(text: str) -> str:
    """Replace curly-brace groups that ADK would treat as state variable lookups.

    ADK regex ``{+[^{}]*}+`` matches ANY ``{...}`` (even ``{{...}}``), strips
    all braces, and attempts a state lookup.  There is no escape sequence.
    The only safe approach is to replace ``{word}`` patterns that are NOT
    intentional state references with a brace-free alternative.
    """
    import re

    # Replace {word} patterns with ⟨word⟩ (unicode angle brackets) so they
    # render visually similar but don't trigger ADK state lookup.
    return re.sub(r"\{([^{}]+)\}", r"[\1]", text)


async def _resolve_instruction(
    pool: asyncpg.Pool,
    system_prompt: str | None,
    system_prompt_id: int | None,
    instruction: str | None,
    instruction_prompt_id: int | None,
) -> str:
    """Resolve system prompt + instructions and combine into final instruction."""
    system = await _resolve_prompt(pool, system_prompt, system_prompt_id)
    instructions = await _resolve_prompt(pool, instruction, instruction_prompt_id)
    parts: list[str] = []
    if system and system.strip():
        parts.append(system.strip())
    if instructions and instructions.strip():
        parts.append(instructions.strip())
    if not parts:
        return DEFAULT_INSTRUCTION
    combined = "\n\n".join(parts)
    return _escape_adk_braces(combined)


async def _build_adk_skills(pool: asyncpg.Pool, skill_ids: list[int]) -> list[Any]:
    """Convert DB skills into ADK Skill objects with files mapped to resources."""
    from google.adk.skills.models import Skill, Frontmatter, Resources, Script
    import re

    skill_configs = await skill_repo.get_skills_by_ids(pool, skill_ids)
    adk_skills: list[Any] = []

    for sc in skill_configs:
        sid = sc["id"]
        raw_name = sc.get("name", "skill")
        # ADK requires kebab-case names (a-z, 0-9, hyphens)
        kebab_name = re.sub(r"[^a-z0-9]+", "-", raw_name.lower()).strip("-")[:64]
        if not kebab_name:
            kebab_name = f"skill-{sid}"

        description = sc.get("description") or f"Skill: {raw_name}"
        instructions = sc.get("instructions") or ""

        # Load files from skill_files table
        tree = await skill_file_repo.get_skill_tree(pool, sid)
        files = tree.get("files", [])
        folders = tree.get("folders", [])

        # Build folder-id → path mapping
        folder_map: dict[int, str] = {}
        for f in folders:
            folder_map[f["id"]] = f["name"]
        # Resolve full paths for nested folders
        for f in folders:
            parts = [f["name"]]
            pid = f.get("parent_id")
            while pid and pid in folder_map:
                parts.insert(0, folder_map[pid])
                parent = next((ff for ff in folders if ff["id"] == pid), None)
                pid = parent.get("parent_id") if parent else None
            folder_map[f["id"]] = "/".join(parts)

        references: dict[str, str | bytes] = {}
        assets: dict[str, str | bytes] = {}
        scripts: dict[str, Script] = {}

        _SCRIPT_EXTS = {"py", "sh", "bash", "zsh", "rb", "js", "ts"}

        for file in files:
            fname = file["name"]
            fcontent = file.get("content", "")
            fid = file.get("folder_id")
            folder_path = folder_map.get(fid, "") if fid else ""
            full_path = f"{folder_path}/{fname}" if folder_path else fname
            file_ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""

            if fname == "SKILL.md" and not folder_path:
                # Root SKILL.md → main instructions
                if fcontent.strip():
                    instructions = fcontent
                continue

            # Register scripts by extension OR folder (available via run_skill_script)
            if file_ext in _SCRIPT_EXTS or folder_path.startswith("scripts"):
                scripts[full_path] = Script(src=fcontent)

            # ALSO register everything as references so load_skill_resource
            # can access any file regardless of type
            if folder_path.startswith("assets"):
                assets[full_path.removeprefix("assets/")] = fcontent
            elif folder_path.startswith("references"):
                references[full_path.removeprefix("references/")] = fcontent
            else:
                # All other files go to references for discoverability
                references[full_path] = fcontent

        try:
            frontmatter = Frontmatter(name=kebab_name, description=description[:1024])
            skill = Skill(
                frontmatter=frontmatter,
                instructions=instructions,
                resources=Resources(
                    references=references,
                    assets=assets,
                    scripts=scripts,
                ),
            )
            adk_skills.append(skill)
            logger.info("Built ADK skill '%s' with %d refs, %d assets, %d scripts",
                        kebab_name, len(references), len(assets), len(scripts))
        except Exception as e:
            logger.warning("Failed to build ADK skill '%s': %s", raw_name, e)

    return adk_skills


def _dedupe_tools(tools: list[Any]) -> list[Any]:
    """Drop duplicate function tools by name.

    Gemini rejects a request with two function declarations of the same name
    (e.g. an agent given two tools that each define ``list_event_types``). Toolsets
    (MCP, skills) are left untouched — only single named FunctionTools are deduped.
    """
    seen: set[str] = set()
    result: list[Any] = []
    for t in tools:
        name = getattr(t, "name", None)
        if isinstance(name, str) and name:
            if name in seen:
                logger.warning("Dropping duplicate tool declaration '%s'", name)
                continue
            seen.add(name)
        result.append(t)
    return result


def _normalize_tools_config(tools_config: Any) -> list[Any]:
    """Normalize tools config: handle string (JSON), list, or invalid."""
    if tools_config is None:
        return []
    if isinstance(tools_config, list):
        return tools_config
    if isinstance(tools_config, str):
        try:
            parsed = json.loads(tools_config)
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            logger.warning("Tools config is invalid JSON string: %s", tools_config[:100])
            return []
    logger.warning("Tools config has unexpected type: %s", type(tools_config).__name__)
    return []


def _conn_in_tenant(conn: dict | None, workspace_id: int | None, created_by: int | None) -> bool:
    """Tenancy gate for id-referenced connections (DB / MCP).

    A connection is usable by an agent only when it lives in the agent's
    workspace. When the agent has no workspace, fall back to owner match so a
    workspace-less connection isn't shared across users. Prevents an agent
    config from referencing another tenant's connection id (IDOR).
    """
    if not conn:
        return False
    conn_ws = conn.get("workspace_id")
    if workspace_id is not None:
        return conn_ws == workspace_id
    return conn_ws is None and conn.get("created_by") == created_by


async def _build_tools(
    pool: asyncpg.Pool,
    tools_config: Any,
    *,
    created_by: int | None = None,
    workspace_id: int | None = None,
    default_agent_id: int | None = None,
    agent_name: str | None = None,
    session_id: str | None = None,
) -> list[Any]:
    """Build tool instances from tools JSON config."""
    result: list[Any] = []
    items = _normalize_tools_config(tools_config)
    for item in items:
        if isinstance(item, str):
            item = {"type": "builtin", "name": item}
        elif not isinstance(item, dict):
            continue
        tool_type = item.get("type")
        if tool_type == "builtin":
            name = item.get("name")
            if name == "schedule":
                schedule_tools = make_schedule_tools(pool, workspace_id=workspace_id, created_by=created_by, default_agent_id=default_agent_id)
                result.extend(schedule_tools)
                logger.info("Schedule tools added (via builtin)")
            elif name == "workflow":
                result.extend(
                    make_workflow_tools(
                        pool, created_by, workspace_id, default_agent_id=default_agent_id
                    )
                )
                logger.info("Workflow tools added (via builtin)")
            elif name == "events":
                result.extend(make_event_tools(pool, created_by, workspace_id))
                logger.info("Event tools added (via builtin)")
            elif name == "notify":
                result.extend(make_notify_tools(pool, created_by, workspace_id, source=agent_name))
                logger.info("Notify tool added (via builtin)")
            elif name == "send_email":
                result.extend(make_email_tools(pool, created_by))
                logger.info("Email tool added (via builtin)")
            elif name == "call_api":
                result.extend(make_call_api_tools())
                logger.info("Call API tool added (via builtin)")
            elif name == "web_search":
                from google.adk.tools import google_search
                result.append(google_search)
                logger.info("Web search (ADK google_search) added (via builtin)")
            elif name == "documents":
                result.extend(make_document_tools(pool, workspace_id, agent_id=default_agent_id, session_id=session_id))
                logger.info("Document tools added (via builtin)")
            elif name == "analyze":
                result.extend(make_analyze_tools(pool, created_by, workspace_id, agent_id=default_agent_id, session_id=session_id))
                logger.info("Analyze tools added (via builtin)")
            elif name == "self_learning":
                result.extend(make_self_learning_tools(pool, created_by, workspace_id, agent_id=default_agent_id))
                logger.info("Self-learning tools added (via builtin)")
            elif name == "ui":
                result.extend(make_ui_tools())
                logger.info("UI card tools added (via builtin)")
            elif name:
                tool = get_builtin_tool(name)
                if tool:
                    result.append(tool)
                else:
                    logger.warning("Unknown builtin tool: %s", name)
        elif tool_type == "database":
            db_id = item.get("database_connection_id")
            if db_id:
                conn = await database_connection_repo.get_database_connection(
                    pool, int(db_id)
                )
                if conn and not _conn_in_tenant(conn, workspace_id, created_by):
                    logger.warning("Database connection %s outside agent tenant — refused", db_id)
                    conn = None
                if conn:
                    tools = make_database_tool(
                        connection_url=conn["connection_url"],
                        read_only=bool(conn.get("read_only", True)),
                        max_rows=int(conn.get("max_rows", 100)),
                    )
                    result.extend(tools)
                    logger.info("Database tools added for connection %s", db_id)
                else:
                    logger.warning("Database connection not found: %s", db_id)
        elif tool_type == "mcp":
            mcp_id = item.get("mcp_connection_id")
            if mcp_id:
                conn = await mcp_connection_repo.get_mcp_connection(
                    pool, mcp_id
                )
                if conn and not _conn_in_tenant(conn, workspace_id, created_by):
                    logger.warning("MCP connection %s outside agent tenant — refused", mcp_id)
                    conn = None
                if conn:
                    headers = conn.get("headers") or {}
                    if not isinstance(headers, dict):
                        try:
                            headers = json.loads(headers) if isinstance(headers, str) else {}
                        except (json.JSONDecodeError, TypeError):
                            headers = {}
                    headers_str = {
                        str(k): str(v) for k, v in headers.items()
                    }
                    tool_names = item.get("tool_names")
                    if isinstance(tool_names, list) and len(tool_names) == 0:
                        tool_names = None
                    transport_type = str(conn.get("transport_type", "streamable_http"))
                    try:
                        if transport_type == "stdio":
                            connection_params = StdioConnectionParams(
                                server_params=StdioServerParameters(
                                    command=conn.get("command") or "",
                                    args=conn.get("args") or [],
                                    env=conn.get("env"),
                                ),
                                timeout=float(conn.get("timeout_seconds", 60)),
                            )
                        elif transport_type == "sse":
                            connection_params = SseConnectionParams(
                                url=str(conn.get("url") or ""),
                                headers=headers_str,
                                timeout=float(conn.get("timeout_seconds", 60)),
                            )
                        else:
                            connection_params = StreamableHTTPConnectionParams(
                                url=str(conn.get("url") or ""),
                                headers=headers_str,
                                timeout=float(conn.get("timeout_seconds", 60)),
                            )
                        toolset = MCPToolset(
                            connection_params=connection_params,
                            tool_filter=tool_names if tool_names else None,
                        )
                        result.append(toolset)
                        logger.info("MCP toolset added for connection %s (url=%s)", mcp_id, conn.get("url"))
                    except Exception as e:
                        logger.exception("Failed to create MCP toolset for connection %s: %s", mcp_id, e)
                else:
                    logger.warning("MCP connection not found: %s", mcp_id)
        elif tool_type == "schedule":
            schedule_tools = make_schedule_tools(pool, workspace_id=workspace_id, created_by=created_by)
            result.extend(schedule_tools)
            logger.info("Schedule tools added")
        elif tool_type == "workflow":
            result.extend(
                make_workflow_tools(pool, created_by, workspace_id, default_agent_id=default_agent_id)
            )
            logger.info("Workflow tools added")
        elif tool_type == "events":
            result.extend(make_event_tools(pool, created_by, workspace_id))
            logger.info("Event tools added")
        elif tool_type == "notify":
            result.extend(make_notify_tools(pool, created_by, workspace_id, source=agent_name))
            logger.info("Notify tool added")
        elif tool_type == "send_email":
            result.extend(make_email_tools(pool, created_by))
            logger.info("Email tool added")
        elif tool_type == "call_api":
            result.extend(make_call_api_tools())
            logger.info("Call API tool added")
        elif tool_type == "web_search":
            from google.adk.tools import google_search
            result.append(google_search)
            logger.info("Web search (ADK google_search) added")
        elif tool_type == "documents":
            result.extend(make_document_tools(pool, workspace_id))
            logger.info("Document tools added")
        elif tool_type == "analyze":
            result.extend(make_analyze_tools(pool, created_by, workspace_id, agent_id=default_agent_id, session_id=session_id))
            logger.info("Analyze tools added")
        elif tool_type == "self_learning":
            result.extend(make_self_learning_tools(pool, created_by, workspace_id, agent_id=default_agent_id))
            logger.info("Self-learning tools added")
        elif tool_type == "ui":
            result.extend(make_ui_tools())
            logger.info("UI card tools added")
    logger.info("Built %d tools from config (%d items)", len(result), len(items))
    return result


# Guidance auto-injected when the presentational UI-card tools are enabled, so
# the agent actually uses them without the user having to edit the prompt.
_UI_TOOLS_HINT = """

# Rich chat UI (card tools)
You can render rich cards in the chat instead of plain text. Prefer them when they fit:
- `plan(title, steps)` — show an ordered plan BEFORE you start multi-step work.
- `todo_write(title, todos, done, in_progress)` — track task progress; call it again with updated `done` / `in_progress` as you complete tasks.
- `show_card(title, body, footer, variant)` — present a structured summary or highlighted note (variant: info | success | warning | error).
Use `plan` to outline approaches, `todo_write` to track multi-step progress, and `show_card` for final summaries or results. Always follow a card with a short natural-language reply.
"""


def _has_ui_tools(tools: list[Any]) -> bool:
    """True if any presentational (UI-card) tool is present in the tool list."""
    for t in tools:
        fn = getattr(t, "func", None)
        if fn is not None and getattr(fn, "__name__", None) in UI_TOOL_NAMES:
            return True
    return False


async def build_agent_from_config(
    pool: asyncpg.Pool,
    agent_config: dict[str, Any],
    *,
    as_sub_agent: bool = False,
    include_memory_tool: bool = False,
    session_id: str | None = None,
) -> LlmAgent:
    """
    Build an LlmAgent or RemoteA2aAgent from a database agent config.

    When agent has extra_fields.type == "a2a" and a2a_url, returns RemoteA2aAgent
    for testing external A2A agents individually.

    Args:
        pool: Database connection pool
        agent_config: Agent row from database
        as_sub_agent: If True, build without sub-agents (used when this agent
            is itself a sub-agent of an orchestrator)

    Returns:
        Configured LlmAgent or RemoteA2aAgent instance
    """
    extra = agent_config.get("extra_fields") or {}
    if isinstance(extra, dict):
        agent_type = extra.get("type") or extra.get("agent_type")
        a2a_url = extra.get("a2a_url")
        if (agent_type == "a2a" or a2a_url) and a2a_url and RemoteA2aAgent is not None:
            url = str(a2a_url).strip()
            if url:
                headers = extra.get("a2a_headers") or {}
                if not isinstance(headers, dict):
                    try:
                        headers = json.loads(headers) if isinstance(headers, str) else {}
                    except (json.JSONDecodeError, TypeError):
                        headers = {}
                headers_str = {str(k): str(v) for k, v in headers.items()}
                try:
                    httpx_client = httpx.AsyncClient(
                        timeout=httpx.Timeout(timeout=60),
                        headers=headers_str,
                    )
                    remote = RemoteA2aAgent(
                        name=agent_config.get("name", "a2a_agent"),
                        agent_card=_agent_card_url(url),
                        description=agent_config.get("description") or "",
                        httpx_client=httpx_client,
                    )
                    logger.info("Built A2A agent: %s at %s", agent_config.get("name"), url)
                    return remote
                except Exception as e:
                    logger.warning("Failed to build A2A agent %s: %s", url, e)
                    raise

    instruction = await _resolve_instruction(
        pool,
        agent_config.get("system_prompt"),
        agent_config.get("system_prompt_id"),
        agent_config.get("instruction"),
        agent_config.get("instruction_prompt_id"),
    )

    _owner_id = agent_config.get("created_by")
    _workspace_id = agent_config.get("workspace_id")
    _self_agent_id = agent_config.get("id")
    _agent_name = agent_config.get("name")

    tools = await _build_tools(
        pool,
        agent_config.get("tools"),
        created_by=_owner_id,
        workspace_id=_workspace_id,
        default_agent_id=_self_agent_id,
        agent_name=_agent_name,
        session_id=session_id,
    )

    # Inject skills via ADK SkillToolset + direct tool registration
    skill_ids = agent_config.get("skill_ids") or []
    if isinstance(skill_ids, str):
        skill_ids = []
    if skill_ids:
        skill_configs = await skill_repo.get_skills_by_ids(pool, list(skill_ids))

        # 1) Add tools defined on each skill DIRECTLY to the agent
        #    (builtin tools, MCP tools, DB tools — these need to be available immediately)
        for sc in skill_configs:
            sc_tools = sc.get("tools")
            if sc_tools:
                built = await _build_tools(
                    pool, sc_tools,
                    created_by=_owner_id,
                    workspace_id=_workspace_id,
                    default_agent_id=_self_agent_id,
                    agent_name=_agent_name,
                    session_id=session_id,
                )
                tools = list(tools) + built
                logger.info("Added %d direct tools from skill '%s'", len(built), sc.get("name"))

        # 2) Build ADK SkillToolset for skill discovery + script execution
        adk_skills = await _build_adk_skills(pool, list(skill_ids))
        if adk_skills:
            try:
                skill_toolset = DynamicSkillToolset(
                    adk_skills,
                    code_executor=AutoVenvSkillCodeExecutor(),
                )
                tools = list(tools) + [skill_toolset]
                logger.info("Registered SkillToolset with %d skills", len(adk_skills))
            except Exception as e:
                logger.warning("Failed to build SkillToolset, falling back: %s", e)
                parts: list[str] = []
                for sc in skill_configs:
                    instr = sc.get("instructions", "")
                    if instr and instr.strip():
                        parts.append(f"## Skill: {sc.get('name', 'Skill')}\n{instr.strip()}")
                if parts:
                    instruction = instruction + _escape_adk_braces("\n\n# Skills\n\n" + "\n\n".join(parts))

    # Add A2A connections as AgentTools for any agent (orchestrator or not)
    extra = agent_config.get("extra_fields") or {}
    if isinstance(extra, dict) and RemoteA2aAgent is not None:
        a2a_connections = extra.get("a2a_connections")
        if isinstance(a2a_connections, list):
            for conn in a2a_connections:
                if isinstance(conn, dict):
                    url = conn.get("url")
                    name = conn.get("name") or "external_agent"
                    if url and isinstance(url, str) and url.strip():
                        try:
                            conn_headers = conn.get("headers") or {}
                            if not isinstance(conn_headers, dict):
                                conn_headers = {}
                            kwargs: dict[str, Any] = {}
                            if conn_headers:
                                kwargs["httpx_client"] = httpx.AsyncClient(
                                    timeout=httpx.Timeout(timeout=60),
                                    headers={str(k): str(v) for k, v in conn_headers.items()},
                                )
                            remote = RemoteA2aAgent(
                                name=str(name).strip(),
                                agent_card=_agent_card_url(url),
                                **kwargs,
                            )
                            tools = list(tools) + [AgentTool(agent=remote)]
                            logger.info("Added A2A tool: %s at %s", name, url)
                        except Exception as e:
                            logger.warning("Failed to add A2A agent %s: %s", url, e)

    if include_memory_tool:
        memory_tools: list[Any] = []
        if preload_memory is not None:
            memory_tools.append(preload_memory)
        if load_memory is not None:
            memory_tools.append(load_memory)
        if memory_tools:
            tools = list(tools) + memory_tools

    async def _auto_save_session_to_memory(callback_context: Any) -> None:
        """Save session to fact memory after each turn."""
        ctx = getattr(callback_context, "_invocation_context", None)
        if ctx and getattr(ctx, "memory_service", None) and getattr(ctx, "session", None):
            try:
                await ctx.memory_service.add_session_to_memory(ctx.session)
            except Exception as e:
                logger.debug("Failed to save session to memory: %s", e)

    sub_agents: list[Any] = []
    if not as_sub_agent and agent_config.get("is_orchestrator"):
        # Local sub-agents (from DB, optionally via A2A if they have a2a_url)
        # Note: a2a_connections are added as tools above for all agents
        sub_agent_ids = agent_config.get("sub_agent_ids") or []
        if isinstance(sub_agent_ids, str):
            sub_agent_ids = []
        sub_agent_configs = await agent_repo.get_agents_by_ids(
            pool, list(sub_agent_ids)
        )
        for sub_config in sub_agent_configs:
            sub_extra = sub_config.get("extra_fields") or {}
            a2a_url = sub_extra.get("a2a_url") if isinstance(sub_extra, dict) else None
            if a2a_url and RemoteA2aAgent is not None:
                remote = RemoteA2aAgent(
                    name=sub_config["name"],
                    agent_card=_agent_card_url(a2a_url),
                )
                sub_agents.append(AgentTool(agent=remote))
            else:
                built = await build_agent_from_config(
                    pool, sub_config, as_sub_agent=True
                )
                sub_agents.append(AgentTool(agent=built))

    # Fall back to the app-level default so env `DEFAULT_MODEL` works.
    raw_model = agent_config.get("model") or settings.DEFAULT_MODEL
    # raw_model=settings.DEFAULT_MODEL
    _GEMINI_PREFIXES = ("gemini-", "models/gemini")
    if any(raw_model.startswith(p) for p in _GEMINI_PREFIXES):
        resolved_model: Any = raw_model
    else:
        # Prevent infinite hangs when a backend (e.g. Ollama) stalls.
        # Without this, the SSE stream can sit "in progress" forever.
        resolved_model = LiteLlm(model=raw_model, timeout=120)

    # Auto-inject UI-card usage guidance when those tools are enabled (main
    # config or via a skill), so they're actually used without prompt edits.
    if _has_ui_tools(tools):
        instruction = (instruction or "") + _escape_adk_braces(_UI_TOOLS_HINT)
        logger.info("Injected UI-card usage hint into instruction")

    agent_kwargs: dict[str, Any] = {
        "name": agent_config.get("name", "agent"),
        "model": resolved_model,
        "description": agent_config.get("description") or "",
        "instruction": instruction,
        "tools": _dedupe_tools(tools + sub_agents),
    }
    if include_memory_tool:
        agent_kwargs["after_agent_callback"] = _auto_save_session_to_memory
    return LlmAgent(**agent_kwargs)
