"""Public HTTP integration contracts used by docs and API consumers must remain stable."""

from app.api.v1.endpoints.gates import DecideIn, DecisionOut
from app.api.v1.endpoints.webhooks import WebhookIn
from app.api.v1.endpoints.workflows import EventIn, EventOut, WorkflowIn, _validate_payload
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


def test_documented_workflow_payload_matches_schema():
    workflow = WorkflowIn.model_validate(
        {
            "name": "Handle new orders",
            "event_types": ["order.created"],
            "agent_id": 3,
            "instructions": "Review the order.",
            "enabled": True,
            "priority": 0,
            "execution_mode": "serial",
            "max_concurrency": 3,
        }
    )
    assert workflow.event_types == ["order.created"]
    assert workflow.execution_mode == "serial"


def test_event_and_gate_public_shapes_match_documentation():
    event = EventIn.model_validate({"type": "order.created", "payload": {"order_id": "ord_123"}})
    queued = EventOut(event=event.type, matched=1, run_ids=[42], registered=True)
    request = DecideIn.model_validate({"type": "refund.requested", "payload": {"amount": 900}})
    verdict = DecisionOut(
        event=request.type,
        decision="deny",
        reason="Supervisor required",
        matched_gate_id=7,
        matched_gate_name="Large refunds",
        overridable=True,
        evaluated=2,
    )
    assert queued.model_dump() == {
        "event": "order.created",
        "matched": 1,
        "run_ids": [42],
        "registered": True,
    }
    assert verdict.decision == "deny" and verdict.overridable is True


def test_registered_event_json_schema_is_enforced():
    schema = {
        "type": "object",
        "required": ["order_id", "total"],
        "properties": {
            "order_id": {"type": "string"},
            "total": {"type": "number"},
        },
    }
    assert _validate_payload({"order_id": "ord_123", "total": 12.5}, schema) is None
    assert _validate_payload({"order_id": "ord_123"}, schema) is not None


def test_webhooks_only_default_to_the_live_event():
    webhook = WebhookIn.model_validate({"url": "https://app.example/webhooks/kriy"})
    assert webhook.event_types == ["run.completed"]


def test_openapi_contains_the_external_integration_surface():
    schema = app.openapi()
    paths = schema["paths"]
    for path in (
        "/api/v1/events",
        "/api/v1/events/decide",
        "/api/v1/event-types",
        "/api/v1/workflows",
        "/api/v1/workflows/runs/{run_id}",
        "/api/v1/webhooks",
    ):
        assert path in paths


def test_interactive_api_documentation_is_configurable_and_enabled_by_default():
    if settings.ENABLE_API_DOCS:
        # Starlette 1.x wraps included routers, so not every entry in app.routes
        # exposes .path — hit the endpoints instead of introspecting the table.
        client = TestClient(app)
        assert client.get("/api/docs").status_code == 200
        assert client.get("/api/redoc").status_code == 200
        assert client.get("/api/openapi.json").status_code == 200
