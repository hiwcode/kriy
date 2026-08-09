"""Unit tests for prompt/context assembly helpers in the agent runtime.

These guard the brace-escaping that stops ADK from treating literal ``{...}`` in a
user's prompt as a state-variable lookup, plus A2A metadata/URL normalization.
"""

from __future__ import annotations

from app.agents.runtime import _agent_card_url, _coerce_metadata, _escape_adk_braces


def test_escape_braces_rewrites_single_braces():
    # ADK would strip {json} and try a state lookup — we neutralize it.
    assert _escape_adk_braces('reply with {json}') == 'reply with [json]'


def test_escape_braces_handles_multiple_and_keeps_text():
    out = _escape_adk_braces("use {a} then {b} now")
    assert out == "use [a] then [b] now"


def test_escape_braces_noop_without_braces():
    assert _escape_adk_braces("plain instruction") == "plain instruction"


def test_coerce_metadata_dict_passthrough():
    assert _coerce_metadata({"user_id": 1}) == {"user_id": 1}


def test_coerce_metadata_parses_json_string():
    assert _coerce_metadata('{"carrier_id": "x"}') == {"carrier_id": "x"}


def test_coerce_metadata_rejects_non_dict_and_garbage():
    assert _coerce_metadata("[1,2,3]") == {}      # valid JSON but not an object
    assert _coerce_metadata("not json") == {}
    assert _coerce_metadata(None) == {}
    assert _coerce_metadata("") == {}


def test_agent_card_url_appends_well_known_suffix():
    assert _agent_card_url("https://x.dev").endswith("/.well-known/agent.json")
    assert _agent_card_url("https://x.dev/") == "https://x.dev/.well-known/agent.json"


def test_agent_card_url_left_alone_when_already_a_card():
    url = "https://x.dev/.well-known/agent.json"
    assert _agent_card_url(url) == url
