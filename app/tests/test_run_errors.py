"""Unit tests for run-error classification (no DB, no network)."""

from __future__ import annotations

from app.services.run_errors import classify_run_error


class _HttpError(Exception):
    """Stand-in for provider SDK errors that expose a status code."""
    def __init__(self, message: str, status_code: int):
        super().__init__(message)
        self.status_code = status_code


def test_429_is_retryable_rate_limit():
    err = classify_run_error(_HttpError("boom", 429))
    assert err.kind == "rate_limit"
    assert err.retryable is True


def test_5xx_is_retryable_provider_error():
    for code in (500, 502, 503, 504):
        err = classify_run_error(_HttpError("upstream", code))
        assert err.kind == "provider"
        assert err.retryable is True


def test_auth_errors_are_not_retryable():
    for code in (401, 403):
        err = classify_run_error(_HttpError("nope", code))
        assert err.kind == "auth"
        assert err.retryable is False


def test_invalid_request_not_retryable():
    err = classify_run_error(_HttpError("bad", 400))
    assert err.kind == "invalid"
    assert err.retryable is False


def test_message_text_signals_when_no_status():
    assert classify_run_error(Exception("Rate limit exceeded")).kind == "rate_limit"
    assert classify_run_error(Exception("quota exhausted for the day")).retryable is True
    assert classify_run_error(Exception("request timed out")).kind == "timeout"
    assert classify_run_error(Exception("Connection reset by peer")).kind == "connection"


def test_auth_message_signal_not_retryable():
    err = classify_run_error(Exception("Invalid API key provided"))
    assert err.kind == "auth"
    assert err.retryable is False


def test_unknown_defaults_to_non_retryable():
    err = classify_run_error(ValueError("something odd happened"))
    assert err.kind == "unknown"
    assert err.retryable is False


def test_user_message_is_short_and_present():
    # Provider noise must not leak: message is our short line, not str(exc).
    err = classify_run_error(_HttpError("HUGE raw provider json blob ...", 429))
    assert "raw provider json" not in err.message
    assert err.message
