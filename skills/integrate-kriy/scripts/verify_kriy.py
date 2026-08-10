#!/usr/bin/env python3
"""Read-only connectivity and contract check for a KRIY deployment."""

from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen


REQUIRED_OPENAPI_PATHS = (
    "/api/v1/agents/",
    "/api/v1/agents/{agent_id}/run",
    "/api/v1/events",
    "/api/v1/events/decide",
    "/api/v1/workflows",
    "/api/v1/workflows/runs/{run_id}",
    "/api/v1/webhooks",
)


class CheckError(RuntimeError):
    pass


@dataclass(frozen=True)
class Result:
    name: str
    detail: str


def normalize_base_url(value: str) -> str:
    value = value.strip()
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise CheckError("base URL must be an absolute http(s) URL")
    path = parsed.path.rstrip("/")
    if path.endswith("/api/v1"):
        path = path[: -len("/api/v1")]
    if parsed.query or parsed.fragment:
        raise CheckError("base URL must not contain a query or fragment")
    return urlunsplit((parsed.scheme, parsed.netloc, path, "", "")).rstrip("/")


def read_json(
    base_url: str,
    path: str,
    *,
    headers: dict[str, str] | None = None,
    timeout: float = 10.0,
    insecure: bool = False,
) -> tuple[int, Any]:
    request = Request(
        f"{base_url}{path}",
        headers={"Accept": "application/json", **(headers or {})},
        method="GET",
    )
    context = ssl._create_unverified_context() if insecure else None
    try:
        with urlopen(request, timeout=timeout, context=context) as response:
            raw = response.read()
            status = response.status
    except HTTPError as error:
        raw = error.read()
        status = error.code
    except (URLError, TimeoutError, OSError) as error:
        raise CheckError(f"request to {path} failed: {error.reason if isinstance(error, URLError) else error}") from error

    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise CheckError(f"{path} returned HTTP {status} with non-JSON content") from error
    return status, payload


def check_health(base_url: str, timeout: float, insecure: bool) -> Result:
    status, payload = read_json(
        base_url, "/api/v1/health", timeout=timeout, insecure=insecure
    )
    health_status = None
    if isinstance(payload, dict):
        health_status = payload.get("status")
        if isinstance(payload.get("data"), dict):
            health_status = payload["data"].get("status", health_status)
    if status != 200 or health_status != "ok":
        raise CheckError(f"health check failed with HTTP {status}: {payload!r}")
    return Result("health", "reachable")


def check_auth(
    base_url: str,
    api_key: str,
    workspace_id: str | None,
    timeout: float,
    insecure: bool,
) -> Result:
    headers = {"X-API-Key": api_key}
    if workspace_id:
        headers["X-Workspace-Id"] = workspace_id
    status, payload = read_json(
        base_url,
        "/api/v1/agents/",
        headers=headers,
        timeout=timeout,
        insecure=insecure,
    )
    if status != 200:
        detail = payload.get("detail") if isinstance(payload, dict) else None
        raise CheckError(f"authentication check failed with HTTP {status}: {detail or 'request rejected'}")
    if not isinstance(payload, dict) or payload.get("success") is not True:
        raise CheckError("agent-list response does not match the KRIY response envelope")
    count = len(payload.get("data") or []) if isinstance(payload.get("data"), list) else 0
    return Result("authentication", f"accepted; {count} accessible agent(s)")


def check_openapi(base_url: str, timeout: float, insecure: bool) -> Result:
    status, payload = read_json(
        base_url, "/api/openapi.json", timeout=timeout, insecure=insecure
    )
    if status == 404:
        raise CheckError("OpenAPI is disabled on this deployment")
    if status != 200 or not isinstance(payload, dict):
        raise CheckError(f"OpenAPI check failed with HTTP {status}")
    paths = payload.get("paths")
    if not isinstance(paths, dict):
        raise CheckError("OpenAPI document has no paths object")
    missing = [path for path in REQUIRED_OPENAPI_PATHS if path not in paths]
    if missing:
        raise CheckError("OpenAPI is missing required integration paths: " + ", ".join(missing))
    version = payload.get("info", {}).get("version", "unknown")
    return Result("contract", f"required paths present; API version {version}")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify a KRIY host using read-only requests without printing secrets."
    )
    parser.add_argument(
        "--base-url",
        default=os.getenv("KRIY_BASE_URL"),
        help="KRIY origin; defaults to KRIY_BASE_URL",
    )
    parser.add_argument(
        "--api-key-env",
        default="KRIY_API_KEY",
        help="name of the environment variable containing the personal API key",
    )
    parser.add_argument(
        "--workspace-id",
        default=os.getenv("KRIY_WORKSPACE_ID"),
        help="optional workspace ID; defaults to KRIY_WORKSPACE_ID",
    )
    parser.add_argument("--timeout", type=float, default=10.0)
    parser.add_argument(
        "--check-openapi",
        action="store_true",
        help="also require the public OpenAPI document and integration paths",
    )
    parser.add_argument(
        "--health-only",
        action="store_true",
        help="skip the authenticated read even when an API key is set",
    )
    parser.add_argument(
        "--insecure",
        action="store_true",
        help="disable TLS certificate verification for local development only",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    if not args.base_url:
        print("ERROR: provide --base-url or set KRIY_BASE_URL", file=sys.stderr)
        return 2
    if args.timeout <= 0:
        print("ERROR: timeout must be greater than zero", file=sys.stderr)
        return 2

    try:
        base_url = normalize_base_url(args.base_url)
        results = [check_health(base_url, args.timeout, args.insecure)]
        if args.check_openapi:
            results.append(check_openapi(base_url, args.timeout, args.insecure))
        if not args.health_only:
            api_key = os.getenv(args.api_key_env)
            if not api_key:
                raise CheckError(
                    f"set {args.api_key_env} to perform the authenticated check, or use --health-only"
                )
            results.append(
                check_auth(
                    base_url,
                    api_key,
                    str(args.workspace_id).strip() if args.workspace_id else None,
                    args.timeout,
                    args.insecure,
                )
            )
    except CheckError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    for result in results:
        print(f"OK {result.name}: {result.detail}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
