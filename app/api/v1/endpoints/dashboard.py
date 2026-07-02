"""Dashboard API endpoints."""

from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends, Query

from app.core.security import api_key_auth, require_google_auth
from app.deps import get_db, get_current_workspace
from app.repositories import dashboard_repo
from app.repositories import agent_repo, prompt_library_repo

# Default pricing per 1M tokens (USD) - gemini-2.5-flash
DEFAULT_INPUT_PRICE = 0.15
DEFAULT_OUTPUT_PRICE = 0.60


def _compute_cost(input_tokens: int, output_tokens: int) -> float:
    return (input_tokens * DEFAULT_INPUT_PRICE + output_tokens * DEFAULT_OUTPUT_PRICE) / 1_000_000


router = APIRouter(
    prefix="/dashboard",
    tags=["dashboard"],
    dependencies=[Depends(api_key_auth)],
)


@router.get("")
async def get_dashboard(
    pool: asyncpg.Pool = Depends(get_db),
    auth=Depends(require_google_auth),
    workspace=Depends(get_current_workspace),
) -> dict:
    """Get all dashboard data in one request. Scoped by current workspace when signed in."""
    db_user_id = auth.user_id
    workspace_id = workspace["id"] if workspace else None

    # When workspace is set, all dashboard queries are workspace-scoped
    # (no user_id filter) so invited members see the full picture.
    session_user_id = None if workspace_id else str(db_user_id)

    agent_count = await agent_repo.count_agents(
        pool, user_id=db_user_id if workspace_id is None else None, workspace_id=workspace_id
    )
    prompt_count = await prompt_library_repo.count_prompts(
        pool, user_id=db_user_id if workspace_id is None else None, workspace_id=workspace_id
    )
    session_count = await dashboard_repo.get_session_count(
        pool, user_id=session_user_id, workspace_id=workspace_id
    )
    total_input, total_output = await dashboard_repo.get_total_tokens(
        pool, user_id=session_user_id, workspace_id=workspace_id
    )
    total_tokens = total_input + total_output
    estimated_cost = _compute_cost(total_input, total_output)

    usage_data = await dashboard_repo.get_daily_usage(
        pool, user_id=session_user_id, days=7, workspace_id=workspace_id
    )
    agent_stats = await dashboard_repo.get_agent_stats(
        pool,
        user_id=session_user_id,
        limit=5,
        agent_user_id=db_user_id,
        workspace_id=workspace_id,
    )
    tokens_per_agent = await dashboard_repo.get_tokens_per_agent(
        pool,
        user_id=session_user_id,
        agent_user_id=db_user_id,
        workspace_id=workspace_id,
    )
    recent_activity = await dashboard_repo.get_recent_activity(
        pool,
        user_id=session_user_id,
        limit=5,
        prompt_user_id=db_user_id,
        workspace_id=workspace_id,
    )

    # Agent performance: session count per agent
    agent_performance = [
        {"name": a["name"], "tasks": a["session_count"]}
        for a in agent_stats
    ]

    return {
        "success": True,
        "message": "Dashboard data fetched",
        "data": {
            "stats": {
                "active_agents": agent_count,
                "total_prompts": prompt_count,
                "conversations": session_count,
                "tokens_used": total_tokens,
                "estimated_cost": round(estimated_cost, 4),
            },
            "usage_data": usage_data,
            "agent_performance": agent_performance,
            "tokens_per_agent": tokens_per_agent,
            "agents": agent_stats,
            "recent_activity": recent_activity,
        },
        "pagination": None,
    }
