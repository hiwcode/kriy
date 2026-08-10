from unittest.mock import MagicMock, patch

from app.services import opik_service


def _config(**overrides):
    config = {
        "opik_enabled": True,
        "opik_api_key": "test-key",
        "opik_workspace": "test-workspace",
        "opik_project_name": "configured-project",
        "opik_url_override": "https://opik.example.test/api",
    }
    config.update(overrides)
    return config


def test_setup_uses_isolated_client_and_configured_project():
    agent = MagicMock()
    client = MagicMock()
    tracer = MagicMock()

    with (
        patch.object(opik_service.opik, "Opik", return_value=client) as make_client,
        patch.object(opik_service, "OpikTracer", return_value=tracer) as make_tracer,
        patch.object(opik_service, "patch_adk") as patch_adk,
        patch.object(opik_service, "track_adk_agent_recursive") as track_agent,
    ):
        result = opik_service.setup_opik_tracing(
            _config(),
            agent,
            agent_name="support-agent",
            agent_id=7,
            session_id="session-1",
            workspace_id=3,
        )

    assert result is tracer
    make_client.assert_called_once_with(
        project_name="configured-project",
        workspace="test-workspace",
        host="https://opik.example.test/api",
        api_key="test-key",
        _use_batching=True,
    )
    assert make_tracer.call_args.kwargs["project_name"] == "configured-project"
    assert tracer._opik_client is client
    patch_adk.assert_called_once_with(client)
    track_agent.assert_called_once_with(agent, tracer)


def test_setup_defaults_project_and_disables_cleanly():
    with patch.object(opik_service.opik, "Opik") as make_client:
        assert opik_service.setup_opik_tracing(
            _config(opik_enabled=False),
            MagicMock(),
            agent_name="agent",
            agent_id=1,
            session_id="session",
        ) is None
        make_client.assert_not_called()

    with (
        patch.object(opik_service.opik, "Opik", return_value=MagicMock()),
        patch.object(opik_service, "OpikTracer", return_value=MagicMock()) as make_tracer,
        patch.object(opik_service, "patch_adk"),
        patch.object(opik_service, "track_adk_agent_recursive"),
    ):
        opik_service.setup_opik_tracing(
            _config(opik_project_name=""),
            MagicMock(),
            agent_name="agent",
            agent_id=1,
            session_id="session",
        )
    assert make_tracer.call_args.kwargs["project_name"] == "kriy"


def test_flush_delegates_to_tracer():
    tracer = MagicMock()
    opik_service.flush_tracer(tracer)
    tracer.flush.assert_called_once_with()
    tracer._opik_client.end.assert_called_once_with()
