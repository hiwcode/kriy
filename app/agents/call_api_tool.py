"""Call API tool for agents — make HTTP requests to external APIs."""

from __future__ import annotations

import json
import logging

import httpx
from google.adk.tools import FunctionTool

logger = logging.getLogger(__name__)

_TIMEOUT = 60


def make_call_api_tools() -> list[FunctionTool]:
    """Create the call_api tool."""

    async def call_api(
        url: str,
        method: str = "GET",
        headers: str = "",
        body: str = "",
        params: str = "",
    ) -> str:
        """Make an HTTP request to an external API and return the response.

        Use this to fetch data from REST APIs, webhooks, or any HTTP endpoint.

        Args:
            url: The full URL to call (e.g. "https://api.example.com/data").
            method: HTTP method — GET, POST, PUT, PATCH, DELETE (default: GET).
            headers: Optional JSON string of headers, e.g. '{"Authorization": "Bearer token"}'.
            body: Optional JSON string for the request body (for POST/PUT/PATCH).
            params: Optional JSON string of query parameters, e.g. '{"page": "1"}'.
        """
        method = method.upper()
        if method not in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}:
            return json.dumps({"error": f"unsupported HTTP method: {method}"})

        parsed_headers: dict[str, str] = {}
        if headers:
            try:
                parsed_headers = json.loads(headers)
            except json.JSONDecodeError:
                return json.dumps({"error": "invalid JSON in headers"})

        parsed_params: dict[str, str] = {}
        if params:
            try:
                parsed_params = json.loads(params)
            except json.JSONDecodeError:
                return json.dumps({"error": "invalid JSON in params"})

        parsed_body: dict | list | str | None = None
        if body:
            try:
                parsed_body = json.loads(body)
            except json.JSONDecodeError:
                # Send as plain text if not valid JSON
                parsed_body = body

        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                kwargs: dict = {
                    "method": method,
                    "url": url,
                    "headers": parsed_headers,
                    "params": parsed_params,
                }
                if parsed_body is not None and method in {"POST", "PUT", "PATCH"}:
                    if isinstance(parsed_body, (dict, list)):
                        kwargs["json"] = parsed_body
                    else:
                        kwargs["content"] = str(parsed_body)

                response = await client.request(**kwargs)

            # Build result
            result: dict = {
                "status_code": response.status_code,
                "headers": dict(response.headers),
            }

            # Try to parse response as JSON
            try:
                result["body"] = response.json()
            except Exception:
                text = response.text
                # Truncate very large responses
                if len(text) > 50_000:
                    text = text[:50_000] + "\n... [truncated]"
                result["body"] = text

            return json.dumps(result, default=str)
        except httpx.TimeoutException:
            return json.dumps({"error": f"request timed out after {_TIMEOUT}s"})
        except Exception as e:  # noqa: BLE001
            logger.warning("call_api failed: %s", e)
            return json.dumps({"error": f"request failed: {e}"})

    return [FunctionTool(func=call_api)]
