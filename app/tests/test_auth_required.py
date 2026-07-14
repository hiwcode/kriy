"""Every protected endpoint must reject unauthenticated requests (401/403).

This guards against the class of bug fixed during hardening — e.g. the users
router that had no per-user auth at all. If someone drops an auth dependency,
this fails. Boots the app once (module-scoped client); skipped without a DB.
"""

import pytest

from app.core.config import settings

pytestmark = pytest.mark.skipif(not settings.DATABASE_URL, reason="needs a database (set DATABASE_URL)")


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:  # runs lifespan (DB + migrations) once for the module
        yield c


# (method, path) for endpoints that must require authentication.
PROTECTED = [
    ("GET", "/api/v1/agents"),
    ("GET", "/api/v1/users/"),
    ("GET", "/api/v1/users/1"),
    ("DELETE", "/api/v1/users/1"),
    ("GET", "/api/v1/workflows"),
    ("GET", "/api/v1/schedules"),
    ("GET", "/api/v1/documents?agent_id=1"),
    ("GET", "/api/v1/documents/1"),
    ("GET", "/api/v1/skill-files/1"),
    ("GET", "/api/v1/skill-folders/1"),
    ("GET", "/api/v1/mcp-connections"),
    ("GET", "/api/v1/database-connections"),
    ("GET", "/api/v1/user-config/"),
]


@pytest.mark.parametrize("method,path", PROTECTED)
def test_protected_endpoint_rejects_anonymous(client, method, path):
    resp = client.request(method, path)
    assert resp.status_code in (401, 403), (
        f"{method} {path} must require auth, got {resp.status_code}"
    )


def test_health_is_public(client):
    assert client.get("/").status_code == 200
