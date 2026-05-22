"""Authentication API routes implemented with FastAPI."""

import sqlite3

from fastapi import Request
from fastapi.responses import JSONResponse

from . import auth_router
from ..dependencies import api_response, get_request_auth_token, get_services
from ..schemas import AuthRequest
from services.auth_service import AuthError


@auth_router.post('/auth/register')
def register(request: Request, payload: AuthRequest) -> JSONResponse:
    """Create a new local account and return an authenticated session.

    Args:
        request: Current FastAPI request used to access application services.
        payload: Username and password submitted by the caller.

    Returns:
        A normalized API response containing the new session and user metadata.
    """
    # Register the user and immediately create a login session.
    services = get_services(request)
    normalized_payload = AuthRequest.from_payload(payload.__dict__)
    try:
        user = services.auth.register(normalized_payload.username, normalized_payload.password)
        session = services.auth.login(normalized_payload.username, normalized_payload.password)
    except AuthError as exc:
        return api_response(False, message=str(exc), status_code=400)

    # Shape the auth response using the shared frontend contract.
    return api_response(
        True,
        data={
            'token': session.token,
            'user': {
                'id': user.id,
                'username': user.username,
                'created_at': user.created_at,
            },
            'has_users': True,
        },
        message='注册成功',
    )


@auth_router.post('/auth/login')
def login(request: Request, payload: AuthRequest) -> JSONResponse:
    """Authenticate credentials and create a session token.

    Args:
        request: Current FastAPI request used to access application services.
        payload: Username and password submitted by the caller.

    Returns:
        A normalized API response containing session data or an auth error.
    """
    # Validate credentials through the auth service.
    services = get_services(request)
    normalized_payload = AuthRequest.from_payload(payload.__dict__)
    try:
        session = services.auth.login(normalized_payload.username, normalized_payload.password)
    except AuthError as exc:
        return api_response(False, message=str(exc), status_code=401)

    # Return the user summary and token expiration for the frontend session.
    return api_response(
        True,
        data={
            'token': session.token,
            'user': {
                'id': session.user.id,
                'username': session.user.username,
                'created_at': session.user.created_at,
            },
            'expires_at': session.expires_at,
            'has_users': True,
        },
        message='登录成功',
    )


@auth_router.post('/auth/logout')
def logout(request: Request) -> JSONResponse:
    """Invalidate the current bearer or X-Auth-Token session.

    Args:
        request: Current FastAPI request containing authentication headers.

    Returns:
        A normalized API response confirming logout completion.
    """
    # Resolve the token from headers and invalidate it if present.
    services = get_services(request)
    token = get_request_auth_token(request)
    services.auth.logout(token)
    return api_response(True, message='已退出登录')


@auth_router.get('/auth/me')
def me(request: Request) -> JSONResponse:
    """Return the authenticated user for the current request.

    Args:
        request: Current FastAPI request containing authentication headers.

    Returns:
        A normalized API response describing authentication state.
    """
    # Look up the current user and report unauthenticated state explicitly.
    services = get_services(request)
    token = get_request_auth_token(request)
    user = services.auth.get_user_by_token(token)
    if user is None:
        return api_response(
            False,
            data={'authenticated': False, 'has_users': services.auth.has_users()},
            message='未登录',
            status_code=401,
        )

    # Return the compact user identity consumed by the frontend.
    return api_response(
        True,
        data={
            'authenticated': True,
            'has_users': True,
            'user': {
                'id': user.id,
                'username': user.username,
                'created_at': user.created_at,
            },
        },
    )


@auth_router.get('/auth/debug/sessions')
def debug_sessions(request: Request) -> JSONResponse:
    """List active sessions for debugging authentication state.

    Args:
        request: Current FastAPI request used to access application services.

    Returns:
        A normalized API response containing redacted session rows.
    """
    # Query the auth database directly because the endpoint is diagnostic.
    services = get_services(request)
    conn = sqlite3.connect(services.auth.database_path)
    conn.row_factory = sqlite3.Row
    try:
        cursor = conn.execute(
            'SELECT s.token, s.expires_at, s.created_at, u.username '
            'FROM sessions s JOIN users u ON u.id = s.user_id'
        )
        rows = cursor.fetchall()
        return api_response(
            True,
            data={
                'sessions': [
                    {
                        'token': row['token'][:20] + '...',
                        'username': row['username'],
                        'expires_at': row['expires_at'],
                        'created_at': row['created_at'],
                    }
                    for row in rows
                ],
                'count': len(rows),
            },
        )
    finally:
        # Always close the SQLite connection after collecting diagnostics.
        conn.close()
