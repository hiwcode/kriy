"""Service to list and call tools from an MCP server."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from mcp import ClientSession, StdioServerParameters, stdio_client
from mcp.client.streamable_http import streamablehttp_client
from mcp.client.sse import sse_client
from mcp.types import ListToolsResult

logger = logging.getLogger(__name__)


def _serialize_content_block(block: Any) -> dict[str, Any]:
    """Serialize a ContentBlock to a JSON-serializable dict."""
    if hasattr(block, "model_dump"):
        return block.model_dump()
    if hasattr(block, "type"):
        out = {"type": getattr(block, "type", "text")}
        if hasattr(block, "text"):
            out["text"] = block.text
        return out
    return {"raw": str(block)}


async def list_mcp_tools(
    url: str = "",
    headers: dict[str, str] | None = None,
    timeout: float = 60,
    transport_type: str = "streamable_http",
    command: str | None = None,
    args: list[str] | None = None,
    env: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """
    Connect to an MCP server and list available tools.

    Args:
        url: MCP server URL (for sse/streamable_http)
        headers: Optional headers for authentication
        timeout: Timeout in seconds
        transport_type: "sse", "streamable_http", or "stdio"
        command: Command to run (for stdio)
        args: Command arguments (for stdio)
        env: Environment variables (for stdio)

    Returns:
        List of tool info dicts: [{"name": str, "description": str | None}, ...]
    """
    merged_headers = dict(headers) if headers else {}
    sse_read_timeout = timedelta(seconds=timeout)
    timeout_delta = timedelta(seconds=min(timeout, 30))

    if transport_type == "stdio":
        server_params = StdioServerParameters(
            command=command or "",
            args=args or [],
            env=env,
        )
        async with stdio_client(server_params) as transports:
            read_stream, write_stream = transports[:2]
            async with ClientSession(
                read_stream,
                write_stream,
                read_timeout_seconds=sse_read_timeout,
            ) as session:
                await session.initialize()
                return _extract_tools(await session.list_tools())
    elif transport_type == "sse":
        async with sse_client(
            url=url,
            headers=merged_headers,
            timeout=timeout,
            sse_read_timeout=timeout,
        ) as transports:
            read_stream, write_stream = transports[:2]
            async with ClientSession(
                read_stream,
                write_stream,
                read_timeout_seconds=sse_read_timeout,
            ) as session:
                await session.initialize()
                return _extract_tools(await session.list_tools())
    else:
        async with streamablehttp_client(
            url=url,
            headers=merged_headers,
            timeout=timeout_delta,
            sse_read_timeout=sse_read_timeout,
        ) as transports:
            read_stream, write_stream = transports[:2]
            async with ClientSession(
                read_stream,
                write_stream,
                read_timeout_seconds=sse_read_timeout,
            ) as session:
                await session.initialize()
                return _extract_tools(await session.list_tools())


def _extract_tools(result: ListToolsResult) -> list[dict[str, Any]]:
    """Extract tool information from a ListToolsResult."""
    tools_out = []
    for t in result.tools:
        schema = None
        schema_obj = getattr(t, "input_schema", None) or getattr(
            t, "inputSchema", None
        )
        if schema_obj is not None:
            if hasattr(schema_obj, "model_dump"):
                schema = schema_obj.model_dump()
            elif isinstance(schema_obj, dict):
                schema = schema_obj
        tools_out.append(
            {
                "name": t.name,
                "description": t.description or "",
                "inputSchema": schema,
            }
        )
    return tools_out


async def call_mcp_tool(
    url: str = "",
    tool_name: str = "",
    arguments: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = 60,
    transport_type: str = "streamable_http",
    command: str | None = None,
    args: list[str] | None = None,
    env: dict[str, str] | None = None,
) -> dict[str, Any]:
    """
    Connect to an MCP server and call a tool by name.

    Args:
        url: MCP server URL (for sse/streamable_http)
        tool_name: Name of the tool to call
        arguments: Tool arguments (must match inputSchema)
        headers: Optional headers for authentication
        timeout: Timeout in seconds
        transport_type: "sse", "streamable_http", or "stdio"
        command: Command to run (for stdio)
        args: Command arguments (for stdio)
        env: Environment variables (for stdio)

    Returns:
        Dict with content (list of content blocks), isError, structuredContent
    """
    merged_headers = dict(headers) if headers else {}
    sse_read_timeout = timedelta(seconds=timeout)
    timeout_delta = timedelta(seconds=min(timeout, 30))

    if transport_type == "stdio":
        server_params = StdioServerParameters(
            command=command or "",
            args=args or [],
            env=env,
        )
        async with stdio_client(server_params) as transports:
            read_stream, write_stream = transports[:2]
            async with ClientSession(
                read_stream,
                write_stream,
                read_timeout_seconds=sse_read_timeout,
            ) as session:
                await session.initialize()
                return await _call_tool_session(session, tool_name, arguments)
    elif transport_type == "sse":
        async with sse_client(
            url=url,
            headers=merged_headers,
            timeout=timeout,
            sse_read_timeout=timeout,
        ) as transports:
            read_stream, write_stream = transports[:2]
            async with ClientSession(
                read_stream,
                write_stream,
                read_timeout_seconds=sse_read_timeout,
            ) as session:
                await session.initialize()
                return await _call_tool_session(session, tool_name, arguments)
    else:
        async with streamablehttp_client(
            url=url,
            headers=merged_headers,
            timeout=timeout_delta,
            sse_read_timeout=sse_read_timeout,
        ) as transports:
            read_stream, write_stream = transports[:2]
            async with ClientSession(
                read_stream,
                write_stream,
                read_timeout_seconds=sse_read_timeout,
            ) as session:
                await session.initialize()
                return await _call_tool_session(session, tool_name, arguments)


async def _call_tool_session(
    session: ClientSession,
    tool_name: str,
    arguments: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Execute a tool call within an active MCP session."""
    result = await session.call_tool(
        name=tool_name,
        arguments=arguments or {},
    )
    content_out = []
    if result.content:
        for block in result.content:
            content_out.append(_serialize_content_block(block))
    structured = None
    structured_raw = getattr(result, "structured_content", None) or getattr(
        result, "structuredContent", None
    )
    if structured_raw is not None:
        if hasattr(structured_raw, "model_dump"):
            structured = structured_raw.model_dump()
        elif isinstance(structured_raw, dict):
            structured = structured_raw
        else:
            structured = {"value": str(structured_raw)}
    return {
        "content": content_out,
        "isError": getattr(result, "is_error", False) or getattr(result, "isError", False),
        "structuredContent": structured,
    }
