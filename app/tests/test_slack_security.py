import hashlib
import hmac

from app.api.v1.endpoints import slack


def _signature(secret: str, timestamp: str, body: bytes) -> str:
    message = f"v0:{timestamp}:{body.decode('utf-8')}".encode()
    return "v0=" + hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def test_slack_signature_accepts_valid_current_request(monkeypatch):
    secret = "test-signing-secret"
    timestamp = "1700000000"
    body = b'{"type":"url_verification"}'
    monkeypatch.setattr(slack.time, "time", lambda: 1700000000)

    assert slack._verify_slack_signature(
        secret,
        timestamp,
        body,
        _signature(secret, timestamp, body),
    )


def test_slack_signature_rejects_tampered_stale_and_incomplete_requests(monkeypatch):
    secret = "test-signing-secret"
    timestamp = "1700000000"
    body = b'{"type":"event_callback"}'
    signature = _signature(secret, timestamp, body)

    monkeypatch.setattr(slack.time, "time", lambda: 1700000000)
    assert not slack._verify_slack_signature(secret, timestamp, body + b" ", signature)
    assert not slack._verify_slack_signature("", timestamp, body, signature)
    assert not slack._verify_slack_signature(secret, "not-a-number", body, signature)

    monkeypatch.setattr(slack.time, "time", lambda: 1700000301)
    assert not slack._verify_slack_signature(secret, timestamp, body, signature)
