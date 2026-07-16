"""Fast, dependency-free tests for the security primitives added during hardening.

No DB / network — these guard the SSRF filter, the workspace-URL signer, and the
document visibility (tenant/session scoping) rule against regressions.
"""

from app.core import net_guard, workspace_signing
from app.core.config import settings
from app.repositories import document_repo


def test_ssrf_always_blocks_metadata_and_bad_schemes(monkeypatch):
    # Blocked in every environment — including dev.
    for env in ("production", "development"):
        monkeypatch.setattr(settings, "ENVIRONMENT", env)
        for url in [
            "http://169.254.169.254/latest/meta-data/",  # cloud metadata
            "file:///etc/passwd",                         # non-http scheme
            "ftp://example.com/",                         # non-http scheme
        ]:
            assert not net_guard.is_public_url(url), f"should block {url} in {env}"


def test_ssrf_blocks_private_in_production(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    for url in [
        "http://127.0.0.1:8000/admin",   # loopback
        "http://localhost/",              # loopback name
        "http://10.0.0.5/",               # private
        "http://192.168.1.1/",            # private
    ]:
        assert not net_guard.is_public_url(url), f"should block {url} in prod"


def test_ssrf_relaxed_in_development(monkeypatch):
    # Dev allows localhost/private so local integrations work…
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    assert net_guard.is_public_url("http://127.0.0.1:8000/admin")
    assert net_guard.is_public_url("http://10.0.0.5/")
    # …but the metadata endpoint stays blocked.
    assert not net_guard.is_public_url("http://169.254.169.254/")


def test_ssrf_allows_public_https():
    assert net_guard.is_public_url("https://api.github.com/repos")


def test_workspace_signing_roundtrip():
    sig = workspace_signing.sign_path("docs/a/b/chart.png")
    assert workspace_signing.verify_path("docs/a/b/chart.png", sig) is True
    assert workspace_signing.verify_path("docs/a/b/chart.png", "tampered") is False
    assert workspace_signing.verify_path("docs/other.png", sig) is False
    assert workspace_signing.verify_path("docs/a/b/chart.png", None) is False


def test_document_visibility_scoping():
    def doc(agent_id, session_id):
        return {"agent_id": agent_id, "session_id": session_id}

    # own session, and agent-level (session NULL) shared docs, are visible
    assert document_repo.is_visible(doc(1, "s1"), 1, "s1") is True
    assert document_repo.is_visible(doc(1, None), 1, "s1") is True
    # cross-agent and cross-session are not
    assert document_repo.is_visible(doc(2, "s1"), 1, "s1") is False
    assert document_repo.is_visible(doc(1, "s2"), 1, "s1") is False
    # no agent context → never visible
    assert document_repo.is_visible(doc(1, None), None, "s1") is False


def test_builtin_ui_card_shapes():
    from app.agents.ui_tools import build_ui_card

    plan = build_ui_card("plan", {"title": "P", "steps": ["a", "b"], "done": ["a"], "current": "b"})
    assert plan["type"] == "plan" and plan["done"] == ["a"] and plan["current"] == "b"
    assert build_ui_card("todo_write", {"todos": ["x"]})["type"] == "todo"
    assert build_ui_card("unknown", {}) is None
