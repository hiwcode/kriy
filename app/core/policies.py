"""Custom-logic policies for agentic interception.

A *policy* is attached to an agent (stored under ``extra_fields.policies``) and
combines optional natural-language ``guidance`` (injected into the agent prompt)
with deterministic ``rules`` that are enforced server-side — so business limits
like "discount <= 50" are never left to the model.

Policy shape::

    {
      "name": "Discount cap",
      "action": "db.update.*",          # glob matched against the request action
      "enabled": true,
      "guidance": "Discounts may never exceed 50%.",
      "rules": [
        {"field": "discount", "op": "max", "value": 50},
        {"field": "email",    "op": "mask"},
        {"field": "amount",   "op": "deny_above", "value": 1000},
        {"field": "ssn",      "op": "deny_if_present"},
        {"field": "status",   "op": "allow_values", "value": ["pending", "paid"]}
      ]
    }
"""

from __future__ import annotations

import copy
import fnmatch
from typing import Any, Optional

# Supported deterministic rule operations.
RULE_OPS = {
    "max",            # clamp numeric down to value
    "min",            # raise numeric up to value
    "mask",           # mask a string (PII)
    "redact",         # remove the field entirely
    "deny_above",     # deny if numeric > value
    "deny_below",     # deny if numeric < value
    "deny_if_present",  # deny if the field exists
    "required",       # deny if the field is missing
    "allow_values",   # deny if value not in the provided list
    "deny_if_contains",  # deny if the string field contains value (case-insensitive)
    "deny_if_equals",    # deny if the field equals value
    "deny_if_matches",   # deny if the string field matches value (regex)
}


def match_policies(policies: list[dict], action: str) -> list[dict]:
    """Return enabled policies whose ``action`` glob matches ``action``."""
    matched = []
    for pol in policies or []:
        if not isinstance(pol, dict):
            continue
        if pol.get("enabled") is False:
            continue
        pattern = pol.get("action") or "*"
        if fnmatch.fnmatch(action or "", str(pattern)):
            matched.append(pol)
    return matched


# Condition operators (the "WHEN" side — predicates over payload + context).
def _condition_true(cond: dict, data: dict) -> bool:
    field = cond.get("field")
    op = cond.get("op")
    value = cond.get("value")
    if not field or not op:
        return False
    cur = data.get(field)
    if op == "equals":
        return cur == value
    if op == "not_equals":
        return cur != value
    if op == "contains":
        return isinstance(cur, str) and isinstance(value, str) and value.lower() in cur.lower()
    if op == "matches":
        import re
        try:
            return isinstance(cur, str) and isinstance(value, str) and bool(re.search(value, cur))
        except re.error:
            return False
    if op == "in":
        return isinstance(value, list) and cur in value
    if op == "gt":
        return isinstance(cur, (int, float)) and isinstance(value, (int, float)) and cur > value
    if op == "lt":
        return isinstance(cur, (int, float)) and isinstance(value, (int, float)) and cur < value
    return False


def policy_applies(policy: dict, data: dict) -> bool:
    """Whether a policy's conditions match ``data`` (payload merged with context).

    Empty conditions = always applies. ``match`` is 'all' (AND, default) or 'any' (OR).
    """
    conditions = policy.get("conditions") or []
    if not conditions:
        return True
    results = [_condition_true(c, data) for c in conditions if isinstance(c, dict)]
    if not results:
        return True
    return any(results) if policy.get("match") == "any" else all(results)


def filter_applicable(policies: list[dict], payload: Any, context: dict | None = None) -> list[dict]:
    """Keep only policies whose conditions match the payload + context."""
    data: dict = {}
    if isinstance(context, dict):
        data.update(context)
    if isinstance(payload, dict):
        data.update(payload)
    return [p for p in policies if policy_applies(p, data)]


def policy_guidance(policies: list[dict]) -> str:
    """Concatenate natural-language guidance from matched policies (for the prompt)."""
    lines = []
    for pol in policies:
        g = pol.get("guidance")
        if g:
            lines.append(f"- {pol.get('name', 'policy')}: {g}")
    if not lines:
        return ""
    return "POLICIES (you must follow these):\n" + "\n".join(lines)


def mask_value(value: str) -> str:
    """Mask a string, preserving just enough to stay recognizable."""
    if "@" in value:  # email
        name, _, domain = value.partition("@")
        return (name[:1] + "***@" + domain) if domain else value
    digits = [c for c in value if c.isdigit()]
    if len(digits) >= 7:  # phone / card / ssn-like
        return "***" + value[-4:]
    if len(value) <= 2:
        return "*" * len(value)
    return value[0] + "*" * (len(value) - 2) + value[-1]


def enforce_policies(
    payload: Any,
    policies: list[dict],
) -> tuple[Optional[str], Any, list[str], list[str]]:
    """Apply deterministic rules from matched policies.

    Returns ``(decision, payload, fired_policy_names, reasons)`` where ``decision``
    is ``"deny"``, ``"modify"``, or ``None`` (policies had no opinion -> keep the
    agent's verdict).
    """
    if not isinstance(payload, dict) or not policies:
        return None, payload, [], []

    final = copy.deepcopy(payload)
    fired: list[str] = []
    reasons: list[str] = []

    for pol in policies:
        name = pol.get("name", "policy")
        pol_fired = False
        denied_here: Optional[str] = None

        for rule in pol.get("rules", []) or []:
            if not isinstance(rule, dict):
                continue
            field = rule.get("field")
            op = rule.get("op")
            value = rule.get("value")
            if not field or op not in RULE_OPS:
                continue

            present = field in final
            cur = final.get(field)

            if op == "deny_if_present":
                if present:
                    denied_here = f"{name}: field '{field}' is not allowed"
                    pol_fired = True
                    break
                continue
            if op == "required":
                if not present:
                    denied_here = f"{name}: field '{field}' is required"
                    pol_fired = True
                    break
                continue
            if not present:
                continue

            if op == "max" and isinstance(cur, (int, float)) and cur > value:
                final[field] = value
                reasons.append(f"{name}: clamped {field} to max {value}")
                pol_fired = True
            elif op == "min" and isinstance(cur, (int, float)) and cur < value:
                final[field] = value
                reasons.append(f"{name}: raised {field} to min {value}")
                pol_fired = True
            elif op == "deny_above" and isinstance(cur, (int, float)) and cur > value:
                denied_here = f"{name}: {field} {cur} exceeds limit {value}"
                pol_fired = True
                break
            elif op == "deny_below" and isinstance(cur, (int, float)) and cur < value:
                denied_here = f"{name}: {field} {cur} is below minimum {value}"
                pol_fired = True
                break
            elif op == "mask" and isinstance(cur, str):
                masked = mask_value(cur)
                if masked != cur:
                    final[field] = masked
                    reasons.append(f"{name}: masked {field}")
                    pol_fired = True
            elif op == "redact":
                del final[field]
                reasons.append(f"{name}: removed {field}")
                pol_fired = True
            elif op == "allow_values" and isinstance(value, list) and cur not in value:
                denied_here = f"{name}: {field}={cur!r} is not an allowed value"
                pol_fired = True
                break
            elif op == "deny_if_contains" and isinstance(cur, str) and isinstance(value, str) and value.lower() in cur.lower():
                denied_here = f"{name}: {field} contains {value!r}"
                pol_fired = True
                break
            elif op == "deny_if_equals" and cur == value:
                denied_here = f"{name}: {field} equals {value!r}"
                pol_fired = True
                break
            elif op == "deny_if_matches" and isinstance(cur, str) and isinstance(value, str):
                import re
                try:
                    if re.search(value, cur):
                        denied_here = f"{name}: {field} matches /{value}/"
                        pol_fired = True
                        break
                except re.error:
                    pass

        if pol_fired:
            fired.append(name)
        if denied_here:
            return "deny", payload, fired, [denied_here]

    if final != payload:
        return "modify", final, fired, reasons
    return None, payload, fired, reasons
