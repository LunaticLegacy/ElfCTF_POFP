"""Model listing API routes implemented with FastAPI."""

from fastapi import Request
from fastapi.responses import JSONResponse

from . import models_router
from ..dependencies import api_response, get_request_user_id, get_services
from ..schemas import ModelsRequest


@models_router.post('/models')
def get_models(request: Request, payload: ModelsRequest) -> JSONResponse:
    """Return available LLM models for supplied or saved credentials.

    Args:
        request: Current FastAPI request used for auth and services.
        payload: Optional credential and connector overrides.

    Returns:
        A normalized API response containing model data or an error message.
    """
    # Resolve effective credentials, allowing request fields to override config.
    services = get_services(request)
    user_id = get_request_user_id(request)
    request_data = ModelsRequest.from_payload(payload.__dict__)
    effective_config = services.config_handler.get_effective_config(user_id)
    api_key = request_data.api_key or effective_config.api_key
    api_base = request_data.api_base or effective_config.api_base
    if not api_key:
        return api_response(False, message='请输入API密钥，或为服务器配置兜底 API', status_code=400)

    # Ask the LLM client for model metadata and translate service status to HTTP.
    result = services.llm_client.fetch_models(api_key, api_base, request_data.connector_type)
    if result['success']:
        return api_response(True, data=result['data'], message=result.get('message', ''))
    return api_response(False, message=result['message'], status_code=500)
