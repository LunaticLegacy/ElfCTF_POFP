"""Shared FastAPI dependencies and response helpers."""

from __future__ import annotations

from functools import wraps
from typing import Callable, Optional

from fastapi import Request
from fastapi.responses import JSONResponse

from core.json_types import JsonValue
from .schemas import ApiEnvelope
from services.container import ApplicationServices


def get_services(request: Request) -> ApplicationServices:
    """Return the shared application service container from FastAPI state.

    Args:
        request: Current FastAPI request containing the application state.

    Returns:
        The configured `ApplicationServices` instance.

    Raises:
        RuntimeError: If the FastAPI app has not been given services.
    """
    # Resolve services from either the preferred state key or a Flask-compat key.
    services = getattr(request.app.state, 'pofp_services', None)
    if services is None:
        services = getattr(request.app.state, 'services', None)
    if services is None:
        raise RuntimeError('Application services are not configured')
    return services


def api_response(
    success: bool,
    *,
    code: str = '',
    data: Optional[JsonValue] = None,
    message: str = '',
    status_code: int = 200,
) -> JSONResponse:
    """Create a normalized FastAPI JSON response.

    Args:
        success: Whether the route completed successfully.
        code: Optional machine-readable result or error code.
        data: Optional structured payload returned to the caller.
        message: Human-readable result message.
        status_code: HTTP status code to send.

    Returns:
        A FastAPI `JSONResponse` containing the shared envelope shape.
    """
    # Serialize the common API envelope into an explicit JSON response.
    payload = ApiEnvelope(success=success, code=code, data=data, message=message)
    return JSONResponse(content=payload.to_dict(), status_code=status_code)


def get_request_auth_token(request: Request) -> str:
    """Resolve the auth token from the current request headers.

    Args:
        request: Current FastAPI request with headers.

    Returns:
        A bearer token or X-Auth-Token value, or an empty string when absent.
    """
    # Prefer Authorization: Bearer while preserving X-Auth-Token compatibility.
    authorization = request.headers.get('Authorization', '').strip()
    if authorization.lower().startswith('bearer '):
        return authorization[7:].strip()
    return request.headers.get('X-Auth-Token', '').strip()


def get_request_user_id(request: Request) -> str:
    """Resolve the authenticated username from a request.

    Args:
        request: Current FastAPI request with auth headers and app state.

    Returns:
        The authenticated username.

    Raises:
        PermissionError: If the token is missing, invalid, or expired.
    """
    # Look up the user through the auth service and expose only the username.
    services = get_services(request)
    token = get_request_auth_token(request)
    user = services.auth.get_user_by_token(token)
    if user is None:
        raise PermissionError('未登录或登录状态已失效')
    return user.username


def require_auth_dependency(request: Request) -> str:
    """FastAPI dependency that requires a valid authenticated user.

    Args:
        request: Current FastAPI request with auth headers.

    Returns:
        The authenticated username for downstream route handlers.

    Raises:
        PermissionError: If authentication fails.
    """
    # Delegate token validation to the shared request-user resolver.
    return get_request_user_id(request)


def require_auth(f: Callable) -> Callable:
    """Provide a compatibility decorator for legacy direct function wrapping.

    Args:
        f: Route handler or helper function to wrap.

    Returns:
        A wrapper that forwards all arguments to the original function.
    """
    # Keep imports that still reference require_auth working during migration.
    @wraps(f)
    def decorated(*args, **kwargs):
        """Forward a decorated call without changing its behavior.

        Args:
            *args: Positional arguments passed to the wrapped function.
            **kwargs: Keyword arguments passed to the wrapped function.

        Returns:
            The original function result.
        """
        # Preserve old decorator syntax while FastAPI dependencies handle auth.
        return f(*args, **kwargs)

    return decorated
