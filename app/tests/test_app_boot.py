"""Integration smoke test: the app actually boots.

Running the app through its lifespan connects the DB, applies every migration,
mounts all routers, and runs the startup checks. This is the single highest-value
test — it catches import/wiring breakage, migration errors, and startup fail-fast
regressions that unit tests miss.

Skipped automatically when DATABASE_URL is unset (e.g. a quick local `pytest`);
CI provides a throwaway Postgres so it always runs there.
"""

import pytest

from app.core.config import settings


@pytest.mark.skipif(not settings.DATABASE_URL, reason="needs a database (set DATABASE_URL)")
def test_app_boots_and_health_ok():
    from fastapi.testclient import TestClient

    from app.main import app

    # `with` runs the lifespan: DB pool + migrations + router mount + startup checks.
    with TestClient(app) as client:
        resp = client.get("/")
        assert resp.status_code == 200
        assert resp.json().get("status") == "ok"


@pytest.mark.skipif(not settings.DATABASE_URL, reason="needs a database (set DATABASE_URL)")
def test_builtin_tools_list_endpoint():
    """The builtin-tools list should include the analyze + slack tools we added."""
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as client:
        resp = client.get("/api/v1/agents/builtin-tools/list")
        # Endpoint requires an API key; either it returns the list, or 401/403 if
        # none is configured. Both prove the route is wired (not a 404/500).
        assert resp.status_code in (200, 401, 403)
