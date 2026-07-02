"""Unit tests for the deterministic policy engine (app/core/policies.py)."""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from app.core.policies import (  # noqa: E402
    enforce_policies,
    mask_value,
    match_policies,
    policy_guidance,
)


def pol(name, action="*", rules=None, guidance=None, enabled=True):
    return {"name": name, "action": action, "enabled": enabled, "guidance": guidance, "rules": rules or []}


class TestMatch(unittest.TestCase):
    def test_glob_and_enabled(self):
        policies = [
            pol("a", action="db.update.*"),
            pol("b", action="http.*"),
            pol("c", action="*", enabled=False),
        ]
        names = [p["name"] for p in match_policies(policies, "db.update.orders")]
        self.assertEqual(names, ["a"])
        names = [p["name"] for p in match_policies(policies, "http.post")]
        self.assertEqual(names, ["b"])

    def test_guidance(self):
        g = policy_guidance([pol("Cap", guidance="discounts <= 50")])
        self.assertIn("Cap", g)
        self.assertIn("discounts <= 50", g)
        self.assertEqual(policy_guidance([pol("x")]), "")


class TestEnforce(unittest.TestCase):
    def test_max_clamps(self):
        d, payload, fired, _ = enforce_policies({"discount": 80}, [pol("Cap", rules=[{"field": "discount", "op": "max", "value": 50}])])
        self.assertEqual(d, "modify")
        self.assertEqual(payload["discount"], 50)
        self.assertEqual(fired, ["Cap"])

    def test_min_raises(self):
        d, payload, _, _ = enforce_policies({"qty": 0}, [pol("Min", rules=[{"field": "qty", "op": "min", "value": 1}])])
        self.assertEqual(payload["qty"], 1)
        self.assertEqual(d, "modify")

    def test_mask(self):
        d, payload, _, _ = enforce_policies({"email": "jordan@x.com"}, [pol("PII", rules=[{"field": "email", "op": "mask"}])])
        self.assertEqual(payload["email"], "j***@x.com")
        self.assertEqual(d, "modify")

    def test_redact(self):
        d, payload, _, _ = enforce_policies({"secret": "abc", "keep": 1}, [pol("R", rules=[{"field": "secret", "op": "redact"}])])
        self.assertNotIn("secret", payload)
        self.assertEqual(payload["keep"], 1)

    def test_deny_above(self):
        d, payload, fired, reasons = enforce_policies({"amount": 5000}, [pol("Limit", rules=[{"field": "amount", "op": "deny_above", "value": 1000}])])
        self.assertEqual(d, "deny")
        self.assertEqual(payload, {"amount": 5000})  # original returned on deny
        self.assertEqual(fired, ["Limit"])
        self.assertTrue(reasons)

    def test_deny_if_present(self):
        d, _, _, _ = enforce_policies({"ssn": "123"}, [pol("NoSSN", rules=[{"field": "ssn", "op": "deny_if_present"}])])
        self.assertEqual(d, "deny")

    def test_required_missing_denies(self):
        d, _, _, _ = enforce_policies({"a": 1}, [pol("Req", rules=[{"field": "user_id", "op": "required"}])])
        self.assertEqual(d, "deny")

    def test_allow_values(self):
        rules = [{"field": "status", "op": "allow_values", "value": ["pending", "paid"]}]
        self.assertEqual(enforce_policies({"status": "paid"}, [pol("S", rules=rules)])[0], None)
        self.assertEqual(enforce_policies({"status": "hacked"}, [pol("S", rules=rules)])[0], "deny")

    def test_no_opinion_returns_none(self):
        d, payload, fired, _ = enforce_policies({"discount": 10}, [pol("Cap", rules=[{"field": "discount", "op": "max", "value": 50}])])
        self.assertIsNone(d)
        self.assertEqual(fired, [])

    def test_multiple_rules_and_policies(self):
        policies = [
            pol("Cap", rules=[{"field": "discount", "op": "max", "value": 50}]),
            pol("PII", rules=[{"field": "email", "op": "mask"}]),
        ]
        d, payload, fired, _ = enforce_policies({"discount": 90, "email": "a@b.com"}, policies)
        self.assertEqual(d, "modify")
        self.assertEqual(payload["discount"], 50)
        self.assertEqual(payload["email"], "a***@b.com")
        self.assertEqual(set(fired), {"Cap", "PII"})

    def test_non_dict_payload(self):
        self.assertEqual(enforce_policies("hello", [pol("x")]), (None, "hello", [], []))


class TestMaskValue(unittest.TestCase):
    def test_email(self):
        self.assertEqual(mask_value("jordan@example.com"), "j***@example.com")

    def test_phone_like(self):
        self.assertEqual(mask_value("4155551234"), "***1234")

    def test_generic(self):
        self.assertEqual(mask_value("secret"), "s****t")


if __name__ == "__main__":
    unittest.main()
