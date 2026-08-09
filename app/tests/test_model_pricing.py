"""Unit tests for model pricing resolution and cost math (no DB)."""

from __future__ import annotations

from app.core.model_pricing import cost_for, match_pricing

PRICING = {
    "gemini-2.0-flash": (0.10, 0.40),
    "claude-sonnet-5": (3.0, 15.0),
}


def test_exact_match_case_insensitive():
    assert match_pricing("gemini-2.0-flash", PRICING) == (0.10, 0.40)
    assert match_pricing("GEMINI-2.0-FLASH", PRICING) == (0.10, 0.40)


def test_substring_match_for_provider_prefixed_names():
    # Provider-prefixed model names still resolve to the configured entry.
    assert match_pricing("models/gemini-2.0-flash", PRICING) == (0.10, 0.40)


def test_unpriced_model_is_zero_not_a_guess():
    # No built-in fallback: an unknown/unpriced model costs nothing.
    assert match_pricing("ollama_chat/qwen3:8b", PRICING) == (0.0, 0.0)
    assert match_pricing(None, PRICING) == (0.0, 0.0)
    assert match_pricing("anything", {}) == (0.0, 0.0)


def test_cost_for_computes_per_million():
    # 1M input @0.10 + 1M output @0.40 = 0.50
    assert cost_for("gemini-2.0-flash", 1_000_000, 1_000_000, PRICING) == 0.50


def test_cost_for_zero_when_unpriced():
    assert cost_for("mystery-model", 5_000, 5_000, PRICING) == 0.0
    assert cost_for("gemini-2.0-flash", 0, 0, PRICING) == 0.0
