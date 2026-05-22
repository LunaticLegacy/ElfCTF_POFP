"""FastAPI router collection for the API package."""

from fastapi import APIRouter

auth_router = APIRouter(prefix='/api', tags=['auth'])
config_router = APIRouter(prefix='/api', tags=['config'])
models_router = APIRouter(prefix='/api', tags=['models'])
tasks_router = APIRouter(prefix='/api', tags=['tasks'])
mcp_router = APIRouter(prefix='/api', tags=['mcp'])
tools_router = APIRouter(prefix='/api', tags=['tools'])
skills_router = APIRouter(prefix='/api', tags=['skills'])
knowledge_router = APIRouter(prefix='/api', tags=['knowledge'])
background_router = APIRouter(prefix='/api', tags=['background'])

# Import route modules after router creation so decorators can bind endpoints.
from .routes import auth, background, config, knowledge, mcp, models, skills, tasks, temp_mcp, tools, user_mcp

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
