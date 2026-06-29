"""FastAPI application entrypoint for ElfCTF."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api import api_router
from api.dependencies import api_response
from services import create_services

def create_app(data_dir: str | Path = '.elfctf') -> FastAPI:
    """Create and configure the ElfCTF FastAPI application.

    Args:
        data_dir: Filesystem directory used by service-layer persistence.

    Returns:
        Configured FastAPI application with API routes and shared services.
    """
    # Keep HTTP composition in the API entrypoint and attach services through app state.
    app = FastAPI(title='ElfCTF', version='0.1.0')
    app.state.pofp_services = create_services(data_dir)
    app.state.services = app.state.pofp_services

    @app.exception_handler(PermissionError)
    async def handle_permission_error(_request, exc: PermissionError):
        """Translate auth-layer permission failures into normalized 401 responses.

        Args:
            _request: Incoming request handled by FastAPI.
            exc: Permission error raised by auth dependencies.

        Returns:
            Shared API envelope describing the authentication failure.
        """
        return api_response(False, message=str(exc) or '未登录或登录状态已失效', status_code=401)

    # Allow local frontend development while keeping the backend self-contained.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=['*'],
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
    )
    app.include_router(api_router)

    @app.middleware('http')
    async def disable_frontend_asset_cache(request, call_next):
        """Prevent stale frontend assets from hiding local JavaScript fixes.

        Args:
            request: Incoming HTTP request handled by FastAPI.
            call_next: Next ASGI handler in the middleware chain.

        Returns:
            Response with cache disabled for checked-in frontend assets.
        """
        # During local development the UI changes quickly, so avoid browser reuse of old JS/CSS.
        response = await call_next(request)
        if request.url.path.startswith(('/js/', '/css/')):
            response.headers['Cache-Control'] = 'no-store'
        return response

    # Serve the checked-in frontend when present.
    frontend_dir = Path(__file__).parent / 'frontend'
    if frontend_dir.is_dir():
        app.mount('/', StaticFiles(directory=str(frontend_dir), html=True), name='frontend')
    return app


app = create_app()
