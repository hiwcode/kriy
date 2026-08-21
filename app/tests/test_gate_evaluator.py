"""Unit tests for the decision-gate condition evaluator (pure, no DB)."""

import pytest

from app.services import gate_evaluator as ge


def ev(conditions, payload=None, event_type="test.event"):
    return ge.evaluate(conditions, payload=payload, event_type=event_type)


# --------------------------------------------------------------------------- #
# Leaf operators
# --------------------------------------------------------------------------- #


def test_eq_and_ne():
    c = {"field": "payload.status", "op": "eq", "value": "open"}
    assert ev(c, {"status": "open"})
    assert not ev(c, {"status": "closed"})
    c2 = {"field": "payload.status", "op": "ne", "value": "open"}
    assert ev(c2, {"status": "closed"})
    assert not ev(c2, {"status": "open"})


def test_numeric_comparisons():
    c = {"field": "payload.amount", "op": "gt", "value": 500}
    assert ev(c, {"amount": 750})
    assert not ev(c, {"amount": 500})
    assert not ev(c, {"amount": 100})
    assert ev({"field": "payload.amount", "op": "gte", "value": 500}, {"amount": 500})
    assert ev({"field": "payload.amount", "op": "lte", "value": 500}, {"amount": 500})


def test_bool_is_not_a_number():
    # True must not compare as 1 for gt/lt — avoids surprising verdicts.
    assert not ev({"field": "payload.flag", "op": "gt", "value": 0}, {"flag": True})


def test_in_and_not_in():
    c = {"field": "payload.role", "op": "in", "value": ["admin", "owner"]}
    assert ev(c, {"role": "admin"})
    assert not ev(c, {"role": "member"})
    c2 = {"field": "payload.role", "op": "not_in", "value": ["admin", "owner"]}
    assert ev(c2, {"role": "member"})


def test_contains_string_and_list():
    assert ev({"field": "payload.tags", "op": "contains", "value": "urgent"}, {"tags": ["urgent", "vip"]})
    assert ev({"field": "payload.note", "op": "contains", "value": "fail"}, {"note": "job failed"})
    assert not ev({"field": "payload.tags", "op": "contains", "value": "x"}, {"tags": ["a"]})


def test_matches_regex_and_bad_regex():
    assert ev({"field": "payload.email", "op": "matches", "value": r".+@corp\.com$"}, {"email": "a@corp.com"})
    assert not ev({"field": "payload.email", "op": "matches", "value": r".+@corp\.com$"}, {"email": "a@other.com"})
    # A malformed regex must not raise — the leaf is simply False.
    assert not ev({"field": "payload.email", "op": "matches", "value": "("}, {"email": "a@corp.com"})


def test_exists_and_missing_fields():
    assert ev({"field": "payload.user", "op": "exists"}, {"user": "x"})
    assert not ev({"field": "payload.user", "op": "exists"}, {})
    assert ev({"field": "payload.user", "op": "not_exists"}, {})
    # Comparing a missing field: only the negative ops are True.
    assert ev({"field": "payload.missing", "op": "ne", "value": "x"}, {})
    assert not ev({"field": "payload.missing", "op": "eq", "value": "x"}, {})
    assert not ev({"field": "payload.missing", "op": "gt", "value": 5}, {})


def test_nested_path_and_list_index():
    payload = {"user": {"role": "admin"}, "items": [{"sku": "A1"}, {"sku": "B2"}]}
    assert ev({"field": "payload.user.role", "op": "eq", "value": "admin"}, payload)
    assert ev({"field": "payload.items.1.sku", "op": "eq", "value": "B2"}, payload)


def test_event_type_field():
    assert ev({"field": "type", "op": "eq", "value": "refund.requested"}, {}, event_type="refund.requested")


# --------------------------------------------------------------------------- #
# Groups: AND / OR / NONE and nesting
# --------------------------------------------------------------------------- #


def test_all_group_and():
    tree = {"match": "all", "conditions": [
        {"field": "payload.a", "op": "eq", "value": 1},
        {"field": "payload.b", "op": "eq", "value": 2},
    ]}
    assert ev(tree, {"a": 1, "b": 2})
    assert not ev(tree, {"a": 1, "b": 9})


def test_any_group_or():
    tree = {"match": "any", "conditions": [
        {"field": "payload.a", "op": "eq", "value": 1},
        {"field": "payload.b", "op": "eq", "value": 2},
    ]}
    assert ev(tree, {"a": 9, "b": 2})
    assert not ev(tree, {"a": 9, "b": 9})


def test_none_group():
    tree = {"match": "none", "conditions": [
        {"field": "payload.blocked", "op": "eq", "value": True},
    ]}
    assert ev(tree, {"blocked": False})
    assert not ev(tree, {"blocked": True})


def test_nested_and_or_the_user_example():
    # role == "admin" AND (amount > 500 OR currency == "USD")
    tree = {"match": "all", "conditions": [
        {"field": "payload.user.role", "op": "eq", "value": "admin"},
        {"match": "any", "conditions": [
            {"field": "payload.amount", "op": "gt", "value": 500},
            {"field": "payload.currency", "op": "eq", "value": "USD"},
        ]},
    ]}
    assert ev(tree, {"user": {"role": "admin"}, "amount": 750, "currency": "EUR"})   # amount branch
    assert ev(tree, {"user": {"role": "admin"}, "amount": 10, "currency": "USD"})    # currency branch
    assert not ev(tree, {"user": {"role": "admin"}, "amount": 10, "currency": "EUR"})  # neither OR branch
    assert not ev(tree, {"user": {"role": "member"}, "amount": 999, "currency": "USD"})  # AND fails on role


def test_empty_group_is_inert():
    assert not ev({"match": "all", "conditions": []}, {"a": 1})
    assert not ev({"match": "none", "conditions": []}, {"a": 1})
    assert not ev(None, {"a": 1})


# --------------------------------------------------------------------------- #
# Validation (save-time)
# --------------------------------------------------------------------------- #


def test_validate_accepts_good_tree():
    ge.validate_conditions({"match": "all", "conditions": [
        {"field": "payload.a", "op": "eq", "value": 1},
    ]})  # no raise


def test_validate_rejects_empty_gate():
    with pytest.raises(ValueError):
        ge.validate_conditions({"match": "all", "conditions": []})


def test_validate_rejects_bad_operator():
    with pytest.raises(ValueError):
        ge.validate_conditions({"field": "payload.a", "op": "wat", "value": 1})


def test_validate_rejects_in_without_list():
    with pytest.raises(ValueError):
        ge.validate_conditions({"field": "payload.a", "op": "in", "value": "notalist"})


def test_validate_rejects_bad_regex():
    with pytest.raises(ValueError):
        ge.validate_conditions({"field": "payload.a", "op": "matches", "value": "("})


def test_validate_rejects_missing_field():
    with pytest.raises(ValueError):
        ge.validate_conditions({"op": "eq", "value": 1})


# --------------------------------------------------------------------------- #
# Decision fallback: default-deny once an event is gated (via _decide)
# --------------------------------------------------------------------------- #


def _gate(gid, action, conditions, name="g", reason="r", allow_override=False):
    return {
        "id": gid, "name": name, "action": action, "reason": reason,
        "conditions": conditions, "allow_override": allow_override,
    }


def test_decide_no_gates_allows():
    from app.api.v1.endpoints.gates import _decide

    v = _decide([], payload={"amount": 1}, event_type="x")
    assert v["decision"] == "allow"
    assert v["matched_gate_id"] is None


def test_decide_gated_but_unmatched_allows():
    from app.api.v1.endpoints.gates import _decide

    # Default is ALLOW: a gate exists but nothing matched → allowed, not denied.
    gates = [_gate(1, "deny", {"field": "payload.amount", "op": "gt", "value": 500})]
    v = _decide(gates, payload={"amount": 10}, event_type="x")
    assert v["decision"] == "allow"
    assert v["matched_gate_id"] is None


def test_decide_matching_rule_wins():
    from app.api.v1.endpoints.gates import _decide

    gates = [_gate(1, "deny", {"field": "payload.amount", "op": "gt", "value": 500}, reason="too big")]
    v = _decide(gates, payload={"amount": 999}, event_type="x")
    assert v["decision"] == "deny"
    assert v["matched_gate_id"] == 1
    assert v["reason"] == "too big"


def test_decide_first_match_wins_over_later():
    from app.api.v1.endpoints.gates import _decide

    gates = [
        _gate(1, "allow", {"field": "payload.role", "op": "eq", "value": "admin"}, name="allow-admin"),
        _gate(2, "deny", {"field": "payload.amount", "op": "gt", "value": 100}, name="deny-big"),
    ]
    v = _decide(gates, payload={"role": "admin", "amount": 9999}, event_type="x")
    assert v["decision"] == "allow"  # the earlier allow rule wins
    assert v["matched_gate_id"] == 1


def test_decide_override_flag_makes_deny_soft():
    from app.api.v1.endpoints.gates import _decide

    cond = {"field": "payload.amount", "op": "gt", "value": 500}
    hard = _gate(1, "deny", cond, allow_override=False)
    soft = _gate(1, "deny", cond, allow_override=True)
    assert _decide([hard], payload={"amount": 999}, event_type="x")["overridable"] is False
    assert _decide([soft], payload={"amount": 999}, event_type="x")["overridable"] is True
    # allow_override only softens a *deny*, not an allow.
    allow_ov = _gate(1, "allow", cond, allow_override=True)
    assert _decide([allow_ov], payload={"amount": 999}, event_type="x")["overridable"] is False
    # default deny is never overridable.
    assert _decide([hard], payload={"amount": 1}, event_type="x")["overridable"] is False


# --------------------------------------------------------------------------- #
# Field normalization: a bare path is payload-relative
# --------------------------------------------------------------------------- #


def test_bare_field_is_payload_relative():
    # Regression: rules written (or LLM-compiled) without the `payload.` prefix
    # used to resolve to nothing and silently never fire.
    c = {"field": "amount", "op": "gt", "value": 500}
    assert ev(c, {"amount": 750})
    assert not ev(c, {"amount": 100})


def test_reported_regression_bare_username_email_tree():
    tree = {
        "match": "all",
        "conditions": [
            {"op": "ne", "field": "username", "value": "ultron"},
            {"op": "eq", "field": "email", "value": "ultron@example.com"},
        ],
    }
    payload = {"username": "ultron1", "email": "ultron@example.com"}
    assert ev(tree, payload, event_type="user.updated")


def test_normalize_field_leaves_allowed_roots_alone():
    assert ge.normalize_field("payload.user.role") == "payload.user.role"
    assert ge.normalize_field("type") == "type"
    assert ge.normalize_field("user.role") == "payload.user.role"
    assert ge.normalize_field("  amount ") == "payload.amount"
    assert ge.normalize_field("") == ""


def test_payload_key_named_type_needs_explicit_prefix():
    # `type` is the event name; a payload key called "type" is `payload.type`.
    assert ev({"field": "type", "op": "eq", "value": "a.b"}, {"type": "x"}, event_type="a.b")
    assert ev({"field": "payload.type", "op": "eq", "value": "x"}, {"type": "x"}, event_type="a.b")


def test_normalize_fields_rewrites_tree_without_mutating_input():
    tree = {
        "match": "all",
        "conditions": [
            {"field": "amount", "op": "gt", "value": 5},
            {"match": "any", "conditions": [{"field": "type", "op": "eq", "value": "x"}]},
        ],
    }
    out = ge.normalize_fields(tree)
    assert out["conditions"][0]["field"] == "payload.amount"
    assert out["conditions"][1]["conditions"][0]["field"] == "type"
    assert tree["conditions"][0]["field"] == "amount"  # input untouched


def test_validate_rejects_unresolvable_field_root():
    with pytest.raises(ValueError, match="must start with 'payload.'"):
        ge.validate_conditions({"match": "all", "conditions": [{"field": "amount", "op": "eq", "value": 1}]})
    # normalize first and it passes
    ge.validate_conditions(
        ge.normalize_fields({"match": "all", "conditions": [{"field": "amount", "op": "eq", "value": 1}]})
    )


# --------------------------------------------------------------------------- #
# explain(): per-node trace
# --------------------------------------------------------------------------- #


def test_explain_marks_unresolved_fields():
    tree = {
        "match": "all",
        "conditions": [
            {"field": "payload.amount", "op": "gt", "value": 500},
            {"field": "payload.missing.deep", "op": "eq", "value": 1},
        ],
    }
    t = ge.explain(tree, payload={"amount": 750}, event_type="x")
    assert t["kind"] == "group" and t["result"] is False
    ok, bad = t["conditions"]
    assert ok["resolved"] is True and ok["actual"] == 750 and ok["result"] is True
    assert bad["resolved"] is False and bad["actual"] is None and bad["result"] is False


def test_explain_verdict_matches_evaluate():
    tree = {
        "match": "any",
        "conditions": [
            {"field": "amount", "op": "gt", "value": 500},
            {"field": "currency", "op": "eq", "value": "USD"},
        ],
    }
    for payload in ({"amount": 750}, {"amount": 1, "currency": "USD"}, {"amount": 1}):
        assert ge.explain(tree, payload=payload, event_type="x")["result"] == ev(tree, payload)


def test_explain_normalizes_field_in_the_trace():
    t = ge.explain(
        {"field": "amount", "op": "gt", "value": 5}, payload={"amount": 9}, event_type="x"
    )
    assert t["field"] == "payload.amount" and t["result"] is True


def test_explain_empty_tree_explains_itself():
    t = ge.explain({}, payload={}, event_type="x")
    assert t["result"] is False and "never matches" in t["note"]
    t2 = ge.explain({"match": "all", "conditions": []}, payload={}, event_type="x")
    assert t2["result"] is False and "empty group" in t2["note"]


def test_explain_truncates_a_huge_string_value():
    t = ge.explain(
        {"field": "payload.blob", "op": "eq", "value": "x"},
        payload={"blob": "y" * 5000},
        event_type="x",
    )
    assert len(t["actual"]) <= 201
