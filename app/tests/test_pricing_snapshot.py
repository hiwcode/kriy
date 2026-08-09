"""Unit tests for per-session pricing snapshot resolution (pure logic, no DB)."""

from __future__ import annotations

from app.repositories.pricing_snapshot_repo import _resolve, models_in_events


def test_models_in_events_collects_distinct_model_versions():
    events = [
        {"model_version": "gemini-2.0-flash"},
        {"model_version": "gemini-2.0-flash"},
        {"model_version": "claude-sonnet-5"},
        {"author": "user"},          # no model_version
        {"model_version": None},     # ignored
    ]
    assert models_in_events(events) == {"gemini-2.0-flash", "claude-sonnet-5"}


def test_models_in_events_empty():
    assert models_in_events([]) == set()
    assert models_in_events(None) == set()


def test_resolve_with_no_snapshot_pulls_from_live():
    live = {"gemini-2.0-flash": (0.10, 0.40)}
    eff, added = _resolve({"gemini-2.0-flash"}, None, live)
    assert eff == {"gemini-2.0-flash": (0.10, 0.40)}
    assert added is True


def test_resolve_freezes_snapshot_rate_even_if_live_changed():
    # The session already ran at 0.10/0.40; live catalog was edited to 0.20/0.80.
    snapshot = {"gemini-2.0-flash": (0.10, 0.40)}
    live = {"gemini-2.0-flash": (0.20, 0.80)}
    eff, added = _resolve({"gemini-2.0-flash"}, snapshot, live)
    assert eff["gemini-2.0-flash"] == (0.10, 0.40)  # frozen, not re-priced
    assert added is False


def test_resolve_adds_new_model_not_in_snapshot():
    snapshot = {"gemini-2.0-flash": (0.10, 0.40)}
    live = {"gemini-2.0-flash": (0.20, 0.80), "claude-sonnet-5": (3.0, 15.0)}
    eff, added = _resolve({"gemini-2.0-flash", "claude-sonnet-5"}, snapshot, live)
    assert eff["gemini-2.0-flash"] == (0.10, 0.40)   # existing stays frozen
    assert eff["claude-sonnet-5"] == (3.0, 15.0)     # new model resolved live
    assert added is True


def test_resolve_unpriced_model_freezes_zero():
    eff, added = _resolve({"ollama_chat/qwen3:8b"}, None, {})
    assert eff["ollama_chat/qwen3:8b"] == (0.0, 0.0)
    assert added is True
