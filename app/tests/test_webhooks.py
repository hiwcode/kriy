"""Unit tests for webhook signing/verification + helpers (pure, no DB)."""

from app.services import webhook_service as wh


def test_signature_roundtrip():
    secret = "whsec_test"
    body = '{"id":"evt_1","type":"run.completed"}'
    header = wh.signature_header(secret, body)
    assert header.startswith("t=") and ",v1=" in header
    assert wh.verify(secret, body, header)


def test_verify_rejects_tampered_body():
    secret = "whsec_test"
    header = wh.signature_header(secret, '{"a":1}')
    assert not wh.verify(secret, '{"a":2}', header)


def test_verify_rejects_wrong_secret():
    header = wh.signature_header("secret-a", "body")
    assert not wh.verify("secret-b", "body", header)


def test_verify_rejects_stale_timestamp():
    secret = "whsec_test"
    body = "body"
    header = wh.signature_header(secret, body, ts=1)  # 1970 → far outside tolerance
    assert not wh.verify(secret, body, header)


def test_new_secret_format():
    s = wh.new_secret()
    assert s.startswith("whsec_") and len(s) > 20
    assert wh.new_secret() != wh.new_secret()


def test_correlation_id_extraction():
    assert wh._correlation_id({"correlation_id": "C1"}) == "C1"
    assert wh._correlation_id({"application_id": "APP-9"}) == "APP-9"
    assert wh._correlation_id({"nope": 1}) is None
    assert wh._correlation_id(None) is None
