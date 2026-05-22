"""Managed MCP API routes implemented with FastAPI."""

from fastapi import Request
from fastapi.responses import JSONResponse

from . import mcp_router
from ..dependencies import api_response, get_services


@mcp_router.get('/mcp/status')
def mcp_status(request: Request) -> JSONResponse:
    """Return a minimal managed MCP API status payload.

    Args:
        request: Current FastAPI request used to validate service availability.

    Returns:
        A normalized API response indicating that the MCP router is mounted.
    """
    # Touch the service container so misconfigured apps fail loudly.
    get_services(request)
    return api_response(True, data={'available': True})
