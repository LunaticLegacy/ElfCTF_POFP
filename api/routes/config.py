"""Configuration API routes implemented with FastAPI."""

from fastapi import Request
from fastapi.responses import JSONResponse
import requests

from . import config_router
from ..dependencies import api_response, get_request_user_id, get_services
from ..schemas import ConfigUpdateRequest


@config_router.get('/config')
def get_config(request: Request) -> JSONResponse:
    """Return the persisted and effective API configuration.

    Args:
        request: Current FastAPI request used for auth and services.

    Returns:
        A normalized API response containing visible configuration fields.
    """
    # Load both user-specific and effective config to expose fallback state.
    services = get_services(request)
    user_id = get_request_user_id(request)
    user_config = services.config_handler.get_user_config(user_id)
    effective_config = services.config_handler.get_effective_config(user_id)
    has_server_fallback = services.storage.config.has_server_fallback()
    using_server_fallback = bool(
        has_server_fallback
        and not user_config.api_key.strip()
        and effective_config.api_key.strip()
    )
    gzctf_status = services.gzctf_service.get_status(user_id, user_config)

    # Combine effective runtime fields with user-editable secrets and status flags.
    payload = {
        **effective_config.to_dict(),
        'api_key': user_config.api_key,
        'api_base': user_config.api_base or effective_config.api_base,
        'gzctf_password': '',
        'user_id': user_id,
        'has_user_config': services.storage.config.has_user_config(user_id),
        'has_server_fallback': has_server_fallback,
        'using_server_fallback': using_server_fallback,
        'effective_model': effective_config.model,
        'effective_api_base': effective_config.api_base,
        **gzctf_status,
    }
    return api_response(True, data=payload)


@config_router.post('/config')
def save_config(request: Request, payload: ConfigUpdateRequest) -> JSONResponse:
    """Persist a user-submitted API configuration.
    前端会对这里发送一份配置文件，然后现在要怎么将配置放进来？
    注意：这里会手动登入 gzctf。

    Args:
        request: Current FastAPI request used for auth and services.
        payload: Typed configuration update submitted by the caller.

    Returns:
        A normalized API response containing the saved effective config.
    """
    # Normalize and persist the submitted configuration payload.
    services = get_services(request)
    user_id = get_request_user_id(request)
    try:
        update_request = ConfigUpdateRequest.from_payload(payload.__dict__)
        candidate_config = update_request.to_payload()
        services.gzctf_service.validate_config(candidate_config)
    except (TypeError, ValueError) as exc:
        return api_response(False, message=f'配置无效: {exc}', status_code=400)
    
    # 尝试登录 gzctf，并……等一下，cookie 在哪？
    gzctf_status = services.gzctf_service.get_status(user_id, candidate_config)
    try:
        login_status = services.gzctf_service.refresh_login(user_id, candidate_config)
        gzctf_status = {**gzctf_status, **login_status}
    except requests.RequestException as exc:
        return api_response(False, message=f'GZCTF 登录失败: {exc}', status_code=400)
    except RuntimeError as exc:
        return api_response(False, message=f'GZCTF 配置失败: {exc}', status_code=500)

    config = services.config_handler.save_config(candidate_config, user_id)

    # Re-read effective config so fallback-derived values are reflected accurately.
    effective_config = services.config_handler.get_effective_config(user_id)
    has_server_fallback = services.storage.config.has_server_fallback()
    using_server_fallback = bool(
        has_server_fallback
        and not config.api_key.strip()
        and effective_config.api_key.strip()
    )
    return api_response(
        True,
        data={
            **effective_config.to_dict(),
            'api_key': config.api_key,
            'api_base': config.api_base or effective_config.api_base,
            'gzctf_password': '',
            'user_id': user_id,
            'has_user_config': True,
            'has_server_fallback': has_server_fallback,
            'using_server_fallback': using_server_fallback,
            'effective_model': effective_config.model,
            'effective_api_base': effective_config.api_base,
            **gzctf_status,
        },
        message='配置已保存',
    )


@config_router.post('/config/gzctf/team')
def fetch_gzctf_team(request: Request) -> JSONResponse:
    """Log in with the saved GZCTF settings and return the current team summary."""
    services = get_services(request)
    user_id = get_request_user_id(request)
    user_config = services.config_handler.get_user_config(user_id)
    try:
        status = services.gzctf_service.fetch_team_info(user_id, user_config)
    except (ValueError, requests.RequestException) as exc:
        return api_response(False, message=f'获取 GZCTF 队伍失败: {exc}', status_code=400)
    except RuntimeError as exc:
        return api_response(False, message=f'GZCTF 配置失败: {exc}', status_code=500)
    return api_response(True, data=status, message='GZCTF 队伍信息已更新')
