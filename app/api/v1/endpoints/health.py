from fastapi import APIRouter

from app.schemas.response import ApiResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=ApiResponse)
async def health_check() -> dict:
    return {
        "success": True,
        "message": "ok",
        "data": {"status": "ok"},
        "pagination": None,
    }
