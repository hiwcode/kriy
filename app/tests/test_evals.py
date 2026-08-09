"""Unit tests for the eval harness scoring + dataset loading (no model calls)."""

from __future__ import annotations

import json

from app.evals.harness import load_dataset, score_assertion


def test_contains_is_case_insensitive():
    ok, _ = score_assertion({"type": "contains", "value": "Hello"}, "well, HELLO there")
    assert ok is True
    ok, _ = score_assertion({"type": "contains", "value": "bye"}, "hello")
    assert ok is False


def test_equals_trims():
    assert score_assertion({"type": "equals", "value": "4"}, "  4 \n")[0] is True
    assert score_assertion({"type": "equals", "value": "4"}, "4.0")[0] is False


def test_regex_search():
    assert score_assertion({"type": "regex", "value": r"\b4\b"}, "the answer is 4!")[0] is True
    assert score_assertion({"type": "regex", "value": r"\b4\b"}, "forty")[0] is False


def test_judge_type_not_scored_inline():
    ok, detail = score_assertion({"type": "judge", "rubric": "x"}, "anything")
    assert ok is False
    assert "judge" in detail.lower()


def test_unknown_type_fails_safely():
    ok, detail = score_assertion({"type": "bogus"}, "x")
    assert ok is False
    assert "unknown" in detail.lower()


def test_default_type_is_contains():
    assert score_assertion({"value": "hi"}, "hi there")[0] is True


def test_load_dataset_skips_comments_and_blanks(tmp_path):
    p = tmp_path / "d.jsonl"
    p.write_text(
        "# comment\n\n"
        '{"id": "a", "prompt": "p", "assert": {"type": "contains", "value": "x"}}\n',
        encoding="utf-8",
    )
    cases = load_dataset(str(p))
    assert len(cases) == 1
    assert cases[0]["id"] == "a"


def test_smoke_dataset_is_valid_json_lines():
    # The shipped dataset must always parse.
    cases = load_dataset("app/evals/datasets/smoke.jsonl")
    assert len(cases) >= 4
    for c in cases:
        assert "id" in c and "prompt" in c and "assert" in c
        json.dumps(c)  # round-trips
