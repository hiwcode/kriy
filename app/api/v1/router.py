from fastapi import APIRouter

from app.api.v1.endpoints import (
    users,
    health,
    prompt_library,
    agents,
    skills,
    skill_folders,
    skill_files,
    mcp_connections,
    database_connections,
    dashboard,
    user_config,
    workspaces,
    integration,
    slack,
    schedules,
    workflows,
    notifications,
    auth,
    activity,
    documents,
    gates,
)

router = APIRouter()

router.include_router(health.router)
router.include_router(users.router)
router.include_router(workspaces.router)
router.include_router(prompt_library.router)
router.include_router(agents.router)
router.include_router(agents.workspace_router)
router.include_router(skills.router)
router.include_router(skill_folders.router)
router.include_router(skill_files.router)
router.include_router(mcp_connections.router)
router.include_router(database_connections.router)
router.include_router(dashboard.router)
router.include_router(user_config.router)
router.include_router(integration.router)
router.include_router(slack.router)
router.include_router(schedules.router)
router.include_router(workflows.router)
router.include_router(workflows.events_router)
router.include_router(workflows.event_types_router)
router.include_router(notifications.router)
router.include_router(notifications.ws_router)
router.include_router(auth.router)
router.include_router(activity.router)
router.include_router(documents.router)
router.include_router(documents.local_files_router)
router.include_router(gates.router)
router.include_router(gates.decide_router)