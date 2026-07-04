"""Audit logging for mutating HTTP requests.

Best-effort: identity is resolved from the request's own auth headers (session
token or API key) and the write never blocks or breaks the request. Called from
middleware in ``app.main``.
"""

from __future__ import annotations

import logging

import asyncpg

logger = logging.getLogger(__name__)

# Methods that mutate state — GET/HEAD/OPTIONS are intentionally not audited.
AUDIT_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

_ACTION_BY_METHOD = {"POST": "create", "PUT": "update", "PATCH": "update", "DELETE": "delete"}


def _derive_event(method: str, path: str) -> tuple[str, str | None, str | None]:
    """Turn (method, path) into (action, resource_type, resource_id).

    e.g. ``PATCH /api/v1/agents/5`` -> ("update", "agents", "5");
         ``DELETE /api/v1/mcp-connections/3`` -> ("delete", "mcp-connections", "3");
         ``POST /api/v1/agents`` -> ("create", "agents", None).
    """
    action = _ACTION_BY_METHOD.get(method, method.lower())
    resource_type: str | None = None
    resource_id: str | None = None

    parts = [p for p in path.split("/") if p]
    if len(parts) >= 2 and parts[0] == "api" and parts[1].startswith("v"):
        parts = parts[2:]  # strip the /api/v1 prefix

    if parts:
        resource_type = parts[0]
        for seg in parts[1:]:
            if seg.isdigit():
                resource_id = seg
                break

    # Friendlier verbs for auth actions.
    if resource_type == "auth":
        if path.endswith("/google"):
            action = "login"
        elif path.endswith("/logout"):
            action = "logout"
        elif path.endswith("/refresh"):
            action = "refresh"

    return action, resource_type, resource_id


def set_actor(request, *, user_id: int | None, email: str | None = None) -> None:
    """Let an endpoint declare who is acting, for requests where identity isn't in
    the headers yet (e.g. login) or clears mid-request (logout). The middleware
    prefers this over header-based resolution.
    """
    request.state.audit_user_id = user_id
    request.state.audit_email = email


def _resolve_identity(request) -> tuple[int | None, str | None, int | None, str | None]:
    """Resolve (user_id, email, workspace_id, api_key) synchronously from headers.

    user_id/email may come from a backend session token (no network); otherwise
    the api key is returned so the caller can resolve it against the DB.
    """
    user_id: int | None = None
    email: str | None = None
    workspace_id: int | None = None

    ws = request.headers.get("x-workspace-id")
    if ws:
        try:
            workspace_id = int(ws)
        except (ValueError, TypeError):
            pass

    auth = request.headers.get("authorization")
    if auth and auth.startswith("Bearer "):
        from app.core.auth_tokens import verify_access_token

        claims = verify_access_token(auth[7:].strip())
        if claims and claims.get("sub"):
            try:
                user_id = int(claims["sub"])
            except (ValueError, TypeError):
                user_id = None
            email = claims.get("email")

    api_key = request.headers.get("x-api-key")
    return user_id, email, workspace_id, api_key


def _client_ip(request) -> str | None:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


async def log_request(request, status_code: int, pool: asyncpg.Pool) -> None:
    """Record a mutating request. Swallows all errors — auditing must never break a request."""
    try:
        user_id, email, workspace_id, api_key = _resolve_identity(request)

        # An endpoint may have declared the actor (login/logout) — that wins.
        stamped_uid = getattr(request.state, "audit_user_id", None)
        if stamped_uid is not None:
            user_id = stamped_uid
            email = getattr(request.state, "audit_email", None) or email

        if user_id is None and api_key:
            from app.repositories import user_api_key_repo

            user_id = await user_api_key_repo.get_user_by_key(pool, api_key)

        action, resource_type, resource_id = _derive_event(request.method, request.url.path)

        from app.repositories import audit_repo

        await audit_repo.record(
            pool,
            user_id=user_id,
            email=email,
            workspace_id=workspace_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            method=request.method,
            path=request.url.path,
            status_code=status_code,
            ip=_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    except Exception:  # noqa: BLE001 — auditing is best-effort
        logger.debug("Audit log write failed", exc_info=True)
