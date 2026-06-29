"""Platform-facing codegen configuration routes."""

from fastapi import Request
from fastapi.responses import JSONResponse

from . import codegen_router
from ..dependencies import api_response, get_request_token_record, get_services


@codegen_router.get('/codegen/config')
def get_codegen_config(request: Request) -> JSONResponse:
    """Return the authenticated user's effective local-execution codegen config.

    Args:
        request: Current FastAPI request used for auth and services.

    Returns:
        A normalized API response containing user identity, token metadata, and
        the effective local codetalk runtime configuration.
    """
    services = get_services(request)
    token_record = get_request_token_record(request)
    effective_config = services.config_handler.get_effective_config(token_record.user.username)
    user_config = services.config_handler.get_user_config(token_record.user.username)

    return api_response(
        True,
        data={
            'user': {
                'id': token_record.user.id,
                'username': token_record.user.username,
                'created_at': token_record.user.created_at,
            },
            'token': {
                'type': token_record.token_type,
                'label': token_record.label,
                'expires_at': token_record.expires_at,
                'created_at': token_record.created_at,
                'scopes': list(token_record.scopes),
            },
            'llm': {
                'provider': effective_config.connector_type,
                'api_url': effective_config.api_base,
                'api_key': effective_config.api_key,
                'model': effective_config.model,
                'timeout_seconds': effective_config.timeout,
            },
            'capabilities': {
                'local_execution': True,
                'codegen_use': 'codegen:use' in token_record.scopes or not token_record.scopes,
                'config_write': 'config:write' in token_record.scopes or not token_record.scopes,
            },
            'config_source': {
                'has_user_config': services.storage.config.has_user_config(token_record.user.username),
                'has_server_fallback': services.storage.config.has_server_fallback(),
                'using_server_fallback': bool(
                    services.storage.config.has_server_fallback()
                    and not user_config.api_key.strip()
                    and effective_config.api_key.strip()
                ),
            },
        },
    )
