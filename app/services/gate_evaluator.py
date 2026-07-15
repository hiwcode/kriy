"""Pure evaluator for decision-gate condition trees.

A gate's ``conditions`` is a recursive tree. A node is either:

* a **group**  ``{"match": "all"|"any"|"none", "conditions": [<node>, ...]}``
* a **leaf**   ``{"field": "payload.user.role", "op": "eq", "value": "admin"}``

Groups nest arbitrarily, so a single gate can express things like
``role == "admin" AND (amount > 500 OR currency == "USD")``::

    {"match": "all", "conditions": [
        {"field": "payload.user.role", "op": "eq", "value": "admin"},
        {"match": "any", "conditions": [
            {"field": "payload.amount",   "op": "gt", "value": 500},
            {"field": "payload.currency", "op": "eq", "value": "USD"}
        ]}
    ]}

Evaluation is **total**: a missing field, a type mismatch, or a bad regex makes a
leaf ``False`` instead of raising, so a gate can never crash the request it guards.
A group with zero conditions is inert (never matches) — a rule must have at least
one condition to fire. ``validate_conditions`` is the strict counterpart used at
save time so malformed rules are rejected up front instead of silently never
matching.

Fields are dot paths resolved against ``{"payload": <payload>, "type": <event>}``,
e.g. ``payload.user.role``, ``payload.items.0.sku``, or ``type``.
"""

from __future__ import annotations

import re
from typing import Any

MATCH_KINDS = {"all", "any", "none"}
LEAF_OPS = {
    "eq", "ne",
    "gt", "gte", "lt", "lte",
    "in", "not_in",
    "contains", "not_contains",
    "matches",
    "exists", "not_exists",
}
# Ops whose truth for a genuinely-absent field is True (the field is "not that").
_MISSING_TRUE_OPS = {"ne", "not_in", "not_contains"}

_MAX_DEPTH = 25
_MISSING = object()  # sentinel: field path did not resolve


def _resolve(path: str, ctx: dict) -> Any:
    """Walk a dot path (``payload.user.role``) into ctx. Returns ``_MISSING`` if
    any hop is absent or not traversable. Numeric segments index into lists."""
    cur: Any = ctx
    for part in path.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        elif isinstance(cur, (list, tuple)) and part.lstrip("-").isdigit():
            idx = int(part)
            if -len(cur) <= idx < len(cur):
                cur = cur[idx]
            else:
                return _MISSING
        else:
            return _MISSING
    return cur


def _as_number(v: Any) -> float | int | None:
    # bool is an int subclass — exclude it so True/False don't compare as 1/0.
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return v
    return None


def _cmp(actual: Any, expected: Any, op: str) -> bool:
    a, b = _as_number(actual), _as_number(expected)
    if a is None or b is None:
        return False
    if op == "gt":
        return a > b
    if op == "gte":
        return a >= b
    if op == "lt":
        return a < b
    if op == "lte":
        return a <= b
    return False


def _eval_leaf(node: dict, ctx: dict) -> bool:
    op = node.get("op")
    field = node.get("field") or ""
    expected = node.get("value")
    actual = _resolve(field, ctx) if field else _MISSING

    if op == "exists":
        return actual is not _MISSING and actual is not None
    if op == "not_exists":
        return actual is _MISSING or actual is None
    if actual is _MISSING:
        return op in _MISSING_TRUE_OPS

    if op == "eq":
        return actual == expected
    if op == "ne":
        return actual != expected
    if op in ("gt", "gte", "lt", "lte"):
        return _cmp(actual, expected, op)
    if op in ("in", "not_in"):
        matched = isinstance(expected, (list, tuple)) and actual in expected
        return matched if op == "in" else not matched
    if op in ("contains", "not_contains"):
        try:
            matched = expected in actual  # substring in str, or item in list
        except TypeError:
            matched = False
        return matched if op == "contains" else not matched
    if op == "matches":
        if not isinstance(expected, str):
            return False
        try:
            return re.search(expected, str(actual)) is not None
        except re.error:
            return False
    return False


def _eval_node(node: Any, ctx: dict, depth: int) -> bool:
    if depth > _MAX_DEPTH or not isinstance(node, dict):
        return False
    if "match" in node:
        children = node.get("conditions") or []
        if not children:
            return False  # an empty group is inert, never matches
        results = [_eval_node(c, ctx, depth + 1) for c in children]
        kind = node.get("match")
        if kind == "all":
            return all(results)
        if kind == "any":
            return any(results)
        if kind == "none":
            return not any(results)
        return False
    return _eval_leaf(node, ctx)


def evaluate(conditions: Any, *, payload: Any, event_type: str) -> bool:
    """True if the condition tree matches this event. A falsy/empty tree never
    matches, so an unconfigured gate is inert."""
    if not conditions:
        return False
    ctx = {"payload": payload, "type": event_type}
    return _eval_node(conditions, ctx, 0)


# --------------------------------------------------------------------------- #
# Validation (save-time; strict — raises ValueError with a helpful message)
# --------------------------------------------------------------------------- #


def _validate_tree(node: Any, depth: int) -> None:
    if depth > _MAX_DEPTH:
        raise ValueError("condition tree is nested too deeply")
    if not isinstance(node, dict):
        raise ValueError("each condition must be an object")
    if "match" in node:
        if node["match"] not in MATCH_KINDS:
            raise ValueError(
                f"invalid group match '{node['match']}' (use one of {sorted(MATCH_KINDS)})"
            )
        conds = node.get("conditions")
        if not isinstance(conds, list):
            raise ValueError("a group's 'conditions' must be a list")
        for child in conds:
            _validate_tree(child, depth + 1)
        return
    # leaf
    op = node.get("op")
    if op not in LEAF_OPS:
        raise ValueError(f"invalid operator '{op}' (use one of {sorted(LEAF_OPS)})")
    field = node.get("field")
    if not isinstance(field, str) or not field:
        raise ValueError("a condition needs a non-empty 'field'")
    if op in ("in", "not_in") and not isinstance(node.get("value"), list):
        raise ValueError(f"operator '{op}' needs 'value' to be a list")
    if op == "matches":
        value = node.get("value")
        if not isinstance(value, str):
            raise ValueError("operator 'matches' needs a string 'value' (a regex)")
        try:
            re.compile(value)
        except re.error as exc:
            raise ValueError(f"invalid regex in 'matches': {exc}") from exc


def validate_conditions(root: Any) -> None:
    """Validate a gate's root condition tree. Raises ``ValueError`` if malformed
    or empty (a gate must have at least one condition)."""
    if not isinstance(root, dict):
        raise ValueError("conditions must be an object (a group or a single leaf)")
    if "match" in root and not (root.get("conditions") or []):
        raise ValueError("a gate needs at least one condition")
    _validate_tree(root, 0)
