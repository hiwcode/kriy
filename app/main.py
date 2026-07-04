import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from app.api.router import router as api_router
from app.core.config import settings
from app.core.logging import configure_logging
from app.db.session import close_db, init_db

configure_logging()
logger = logging.getLogger(__name__)

# Ensure Google AI SDK can find the API key (reads from os.environ)
if settings.GOOGLE_API_KEY:
    os.environ["GOOGLE_API_KEY"] = settings.GOOGLE_API_KEY

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Verify secrets encryption is correctly configured before anything reads or
    # writes encrypted data. A missing/invalid ENCRYPTION_KEY otherwise fails
    # silently at runtime, so surface it loudly at startup.
    try:
        from app.core.encryption import verify_encryption_key

        verify_encryption_key()
        logger.info("ENCRYPTION_KEY verified — secrets encryption is active")
    except Exception:
        logger.critical(
            "ENCRYPTION_KEY is missing or invalid — secret storage will fail. "
            "Generate one: python -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\" and set ENCRYPTION_KEY.",
        )

    await init_db(app)

    # Mount A2A endpoints for every agent in the database
    try:
        from app.a2a.server import mount_all_a2a

        pool = app.state.db_pool
        count = await mount_all_a2a(app, pool)
        logger.info("A2A startup: %d agents mounted", count)
    except Exception:
        logger.exception("Failed to mount A2A agents (non-fatal)")

    # Start background scheduler for scheduled agent runs
    try:
        from app.services.scheduler_runner import start_scheduler

        pool = app.state.db_pool
        start_scheduler(pool)
        logger.info("Background scheduler started")
    except Exception:
        logger.exception("Failed to start scheduler (non-fatal)")

    # Start background worker that drains the workflow event queue
    try:
        from app.services.event_worker import start_worker

        start_worker(app.state.db_pool)
        logger.info("Workflow event worker started")
    except Exception:
        logger.exception("Failed to start event worker (non-fatal)")

    yield

    try:
        from app.services.scheduler_runner import stop_scheduler
        stop_scheduler()
    except Exception:
        pass
    try:
        from app.services.event_worker import stop_worker
        stop_worker()
    except Exception:
        pass
    await close_db(app)


app = FastAPI(title="Atelier API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router)


@app.middleware("http")
async def audit_middleware(request, call_next):
    """Record every mutating request (POST/PUT/PATCH/DELETE) to the audit log."""
    response = await call_next(request)
    from app.core.audit import AUDIT_METHODS

    if request.method in AUDIT_METHODS:
        pool = getattr(request.app.state, "db_pool", None)
        if pool is not None:
            from app.core.audit import log_request

            await log_request(request, response.status_code, pool)
    return response


@app.middleware("http")
async def a2a_auth_middleware(request, call_next):
    """Gate the A2A-hosted agent endpoints (/a2a/{id}/) with an API key.

    Invoking an agent over A2A requires a valid per-user API key (``X-API-Key``),
    matching the rest of the API. Discovery stays open: the agent card at
    ``/.well-known/agent.json`` and CORS preflight (OPTIONS) are allowed through
    so clients can still discover capabilities.
    """
    path = request.url.path
    if (
        path.startswith("/a2a/")
        and request.method != "OPTIONS"
        and "/.well-known/" not in path
    ):
        api_key = request.headers.get("X-API-Key") or request.headers.get("x-api-key")
        pool = getattr(request.app.state, "db_pool", None)
        user_id = None
        if pool is not None and api_key:
            from app.repositories import user_api_key_repo

            user_id = await user_api_key_repo.get_user_by_key(pool, api_key)
        if user_id is None:
            return JSONResponse(
                {"detail": "A2A access requires a valid API key (X-API-Key)."},
                status_code=401,
            )
    return await call_next(request)


@app.get("/")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=int(settings.PORT),
    )
