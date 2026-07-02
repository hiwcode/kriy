import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
