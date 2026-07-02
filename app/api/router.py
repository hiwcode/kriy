from fastapi import APIRouter

from app.api.v1.router import router as v1_router
from app.api.v1.endpoints.health import router as health_router

router = APIRouter()

# Root health endpoint
router.include_router(health_router)
# Versioned API
router.include_router(v1_router, prefix="/api/v1")
