"""Classify exceptions raised during an agent run.

The run harness (``agent_run_service``) catches anything thrown out of the ADK
runner / LiteLLM and has to decide two things:

1. Is this a *transient* failure worth retrying (rate limit, quota, provider 5xx,
   timeout, dropped connection) versus a permanent one (bad key, invalid request)?
2. What should the user actually see? Providers return long, noisy messages
   (stack-ish text, request ids, raw JSON) — we log the full detail but show a
   short, actionable line.

Kept dependency-free and pure so it is trivially unit-testable.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RunError:
    kind: str          # rate_limit | timeout | provider | auth | invalid | connection | unknown
    message: str       # short, user-facing
    retryable: bool    # safe to retry when nothing has been emitted yet


# Substrings that mark a transient provider/network condition (matched lowercase).
_RATE_LIMIT_HINTS = ("rate limit", "ratelimit", "too many requests", "quota", "resource_exhausted", "overloaded")
_TIMEOUT_HINTS = ("timeout", "timed out", "deadline exceeded")
_CONNECTION_HINTS = ("connection", "connection error", "connection reset", "temporarily unavailable", "unavailable")
_PROVIDER_5XX_HINTS = ("internal server error", "service unavailable", "bad gateway", "gateway timeout", "server error")
# Permanent failures — never retry these.
_AUTH_HINTS = ("api key", "api_key", "unauthorized", "permission denied", "invalid authentication", "authentication", "forbidden")
_INVALID_HINTS = ("invalid request", "invalid argument", "bad request", "not found", "unsupported")


def _status_code(exc: Exception) -> int | None:
    """Best-effort HTTP status extraction across litellm / httpx / google exceptions."""
    for attr in ("status_code", "code", "http_status", "status"):
        val = getattr(exc, attr, None)
        if isinstance(val, int):
            return val
    resp = getattr(exc, "response", None)
    if resp is not None:
        sc = getattr(resp, "status_code", None)
        if isinstance(sc, int):
            return sc
    return None


def classify_run_error(exc: Exception) -> RunError:
    """Map an exception to a (kind, user message, retryable) triple.

    Precedence: explicit HTTP status code first, then class name, then message text.
    Unknown errors default to non-retryable (we don't want to hammer a provider on a
    bug), but genuine transient signals flip them to retryable.
    """
    status = _status_code(exc)
    name = type(exc).__name__.lower()
    text = str(exc).lower()

    def has(hints: tuple[str, ...]) -> bool:
        return any(h in text for h in hints) or any(h.replace(" ", "") in name for h in hints)

    # 1) Authoritative HTTP status codes.
    if status == 429:
        return RunError("rate_limit", "The model is rate-limited or out of quota. Retrying shortly…", True)
    if status in (500, 502, 503, 504):
        return RunError("provider", "The model provider had a temporary error. Retrying shortly…", True)
    if status in (401, 403):
        return RunError("auth", "The provider rejected the API key (unauthorized). Check the key in Config.", False)
    if status in (400, 404, 422):
        return RunError("invalid", "The request was rejected as invalid by the provider.", False)

    # 2) Class-name / message signals for libraries that don't expose a status.
    if "ratelimit" in name or has(_RATE_LIMIT_HINTS):
        return RunError("rate_limit", "The model is rate-limited or out of quota. Retrying shortly…", True)
    if "timeout" in name or has(_TIMEOUT_HINTS):
        return RunError("timeout", "The model took too long to respond. Retrying shortly…", True)
    if any(k in name for k in ("serviceunavailable", "internalserver", "apiconnection", "servererror")) or has(_PROVIDER_5XX_HINTS):
        return RunError("provider", "The model provider had a temporary error. Retrying shortly…", True)
    if has(_AUTH_HINTS):
        return RunError("auth", "The provider rejected the API key (unauthorized). Check the key in Config.", False)
    if has(_CONNECTION_HINTS):
        return RunError("connection", "Could not reach the model provider. Retrying shortly…", True)
    if has(_INVALID_HINTS):
        return RunError("invalid", "The request was rejected as invalid by the provider.", False)

    # 3) Unknown — surface a generic line, don't retry.
    return RunError("unknown", "The agent run failed unexpectedly. Please try again.", False)
