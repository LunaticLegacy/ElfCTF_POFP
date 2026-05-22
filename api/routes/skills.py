"""Skill API routes implemented with FastAPI."""

from fastapi import Request
from fastapi.responses import JSONResponse

from . import skills_router
from ..dependencies import api_response, get_services


@skills_router.get('/skills')
def get_skills(request: Request, task_type: str = '') -> JSONResponse:
    """Return all skills or skills matching a task type.

    Args:
        request: Current FastAPI request used to access services.
        task_type: Optional task type filter supplied as a query parameter.

    Returns:
        A normalized API response containing serialized skill records.
    """
    # Select either a task-specific subset or the full skill catalog.
    services = get_services(request)
    normalized_task_type = str(task_type).strip().upper()
    skills = (
        services.skill_service.get_skills_for_task_type(normalized_task_type)
        if normalized_task_type
        else services.skill_service.get_all_skills()
    )
    return api_response(True, data=[skill.to_dict() for skill in skills])


@skills_router.get('/skills/{skill_id}')
def get_skill(request: Request, skill_id: str) -> JSONResponse:
    """Return detail for one skill.

    Args:
        request: Current FastAPI request used to access services.
        skill_id: Skill identifier from the path.

    Returns:
        A normalized API response containing skill detail or a not-found error.
    """
    # Look up the skill by id and serialize it when present.
    services = get_services(request)
    skill = services.skill_service.get_skill(skill_id)
    if skill is None:
        return api_response(False, message='Skill 未找到', status_code=404)
    return api_response(True, data=skill.to_dict())
