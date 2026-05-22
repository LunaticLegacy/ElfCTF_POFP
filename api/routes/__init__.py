"""FastAPI route package that reuses the parent API router objects."""

from fastapi import APIRouter

from .. import (
    auth_router,
    background_router,
    config_router,
    knowledge_router,
    mcp_router,
    models_router,
    skills_router,
    tasks_router,
    tools_router,
)

# Import route modules after router creation so decorators can bind endpoints.
from . import auth, background, config, knowledge, mcp, models, skills, tasks, temp_mcp, tools, user_mcp

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(config_router)
api_router.include_router(models_router)
api_router.include_router(tasks_router)
api_router.include_router(mcp_router)
api_router.include_router(tools_router)
api_router.include_router(skills_router)
api_router.include_router(knowledge_router)
api_router.include_router(background_router)

__all__ = [
    'api_router',
    'auth_router',
    'config_router',
    'models_router',
    'tasks_router',
    'mcp_router',
    'tools_router',
    'skills_router',
    'knowledge_router',
    'background_router',
]
