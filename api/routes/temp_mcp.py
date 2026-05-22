"""Temporary MCP server distribution API routes implemented with FastAPI."""

from pathlib import Path

from fastapi import Request
from fastapi.responses import FileResponse, JSONResponse

from . import tools_router
from ..dependencies import api_response, get_request_user_id
from ..schemas import TempMcpCreateRequest
from services.temp_mcp import get_temp_mcp_manager


@tools_router.get('/temp-mcp')
def list_temp_mcp_servers(request: Request, client_id: str = '') -> JSONResponse:
    """List active temporary MCP servers.

    Args:
        request: Current FastAPI request used to validate the user scope.
        client_id: Optional client identifier used to filter servers.

    Returns:
        A normalized API response containing server rows and counts.
    """
    # Require authentication and collect manager status.
    get_request_user_id(request)
    manager = get_temp_mcp_manager()
    servers = manager.list_servers(client_id=client_id or None)
    status = manager.get_status()
    return api_response(
        success=True,
        data={
            'servers': [server.to_dict() for server in servers],
            'total': status['total_servers'],
            'active': status['active_servers'],
        },
    )


@tools_router.post('/temp-mcp')
def create_temp_mcp_server(request: Request, payload: TempMcpCreateRequest) -> JSONResponse:
    """Create a new temporary MCP server package.

    Args:
        request: Current FastAPI request used to validate the user scope.
        payload: Server metadata, tools, limits, and optional custom code.

    Returns:
        A normalized API response containing temporary server metadata.
    """
    # Require authentication and validate required creation fields.
    get_request_user_id(request)
    create_request = TempMcpCreateRequest.from_payload(payload.__dict__)
    if not create_request.name:
        return api_response(success=False, message='缺少必填字段：name', status_code=400)
    if not create_request.description:
        return api_response(success=False, message='缺少必填字段：description', status_code=400)
    if not create_request.tools:
        return api_response(success=False, message='缺少必填字段：tools', status_code=400)

    # Create the temporary server through the manager.
    manager = get_temp_mcp_manager()
    try:
        server = manager.create_server(
            name=create_request.name,
            description=create_request.description,
            tools=create_request.tools,
            custom_code=create_request.custom_code,
            ttl_seconds=create_request.ttl_seconds,
            max_executions=create_request.max_executions,
            client_id=create_request.client_id,
            metadata=create_request.metadata,
        )
    except Exception as exc:
        return api_response(success=False, message=f'创建失败：{str(exc)}', status_code=500)

    # Return URLs needed by clients to download or start the server.
    return api_response(
        success=True,
        message='临时服务器已创建',
        data={
            'id': server.id,
            'name': server.name,
            'description': server.description,
            'expires_at': server.expires_at,
            'time_to_live': server.to_dict()['time_to_live'],
            'remaining_executions': server.remaining_executions,
            'download_url': f'/api/temp-mcp/{server.id}/download',
            'start_url': f'/api/temp-mcp/{server.id}/start',
        },
    )


@tools_router.get('/temp-mcp/status')
def get_temp_mcp_status(request: Request) -> JSONResponse:
    """Return temporary MCP manager status.

    Args:
        request: Current FastAPI request used to validate the user scope.

    Returns:
        A normalized API response containing manager status.
    """
    # Require authentication and return manager state.
    get_request_user_id(request)
    manager = get_temp_mcp_manager()
    status = manager.get_status()
    return api_response(success=True, data=status)


@tools_router.get('/temp-mcp/{server_id}')
def get_temp_mcp_server(request: Request, server_id: str) -> JSONResponse:
    """Return one temporary MCP server.

    Args:
        request: Current FastAPI request used to validate the user scope.
        server_id: Temporary server identifier from the path.

    Returns:
        A normalized API response containing server detail.
    """
    # Require authentication and fetch the server record.
    get_request_user_id(request)
    manager = get_temp_mcp_manager()
    server = manager.get_server(server_id)
    if not server:
        return api_response(success=False, message='服务器不存在或已过期', status_code=404)
    return api_response(success=True, data=server.to_dict())


@tools_router.get('/temp-mcp/{server_id}/download')
def download_temp_mcp_server(request: Request, server_id: str) -> JSONResponse:
    """Download the generated temporary MCP server Python file.

    Args:
        request: Current FastAPI request used to validate the user scope.
        server_id: Temporary server identifier from the path.

    Returns:
        A file response for the generated Python code or a normalized error.
    """
    # Require authentication and verify the generated code file exists.
    get_request_user_id(request)
    manager = get_temp_mcp_manager()
    server = manager.get_server(server_id)
    if not server:
        return api_response(success=False, message='服务器不存在或已过期', status_code=404)
    code_path = server.metadata.get('code_path')
    if not code_path or not Path(code_path).exists():
        return api_response(success=False, message='代码文件不存在', status_code=404)

    # Stream the generated Python source as a downloadable file.
    return FileResponse(
        code_path,
        media_type='text/x-python',
        filename=f'{server.name}.py',
    )


@tools_router.post('/temp-mcp/{server_id}/start')
def start_temp_mcp_server(request: Request, server_id: str) -> JSONResponse:
    """Start a temporary MCP server process.

    Args:
        request: Current FastAPI request used to validate the user scope.
        server_id: Temporary server identifier from the path.

    Returns:
        A normalized API response containing process metadata.
    """
    # Require authentication and request process startup from the manager.
    get_request_user_id(request)
    manager = get_temp_mcp_manager()
    try:
        process = manager.start_server_process(server_id)
        server = manager.get_server(server_id)
        return api_response(
            success=True,
            message='服务器进程已启动',
            data={
                'pid': process.pid,
                'stdio': True,
                'command': f'python {server.metadata["code_path"]}' if server else '',
            },
        )
    except Exception as exc:
        return api_response(success=False, message=f'启动失败：{str(exc)}', status_code=500)


@tools_router.post('/temp-mcp/{server_id}/stop')
def stop_temp_mcp_server(request: Request, server_id: str) -> JSONResponse:
    """Stop a temporary MCP server process.

    Args:
        request: Current FastAPI request used to validate the user scope.
        server_id: Temporary server identifier from the path.

    Returns:
        A normalized API response describing stop success.
    """
    # Require authentication and stop the running process if present.
    get_request_user_id(request)
    manager = get_temp_mcp_manager()
    success = manager.stop_server_process(server_id)
    if success:
        return api_response(success=True, message='服务器进程已停止')
    return api_response(success=False, message='未找到运行中的进程或停止失败', status_code=400)


@tools_router.post('/temp-mcp/{server_id}/revoke')
def revoke_temp_mcp_server(request: Request, server_id: str) -> JSONResponse:
    """Revoke a temporary MCP server.

    Args:
        request: Current FastAPI request used to validate the user scope.
        server_id: Temporary server identifier from the path.

    Returns:
        A normalized API response describing revoke success.
    """
    # Require authentication and mark the server as revoked.
    get_request_user_id(request)
    manager = get_temp_mcp_manager()
    success = manager.revoke_server(server_id)
    if success:
        return api_response(success=True, message='服务器已撤销')
    return api_response(success=False, message='服务器不存在', status_code=404)


@tools_router.post('/temp-mcp/cleanup')
def cleanup_temp_mcp_servers(request: Request) -> JSONResponse:
    """Clean up expired temporary MCP servers.

    Args:
        request: Current FastAPI request used to validate the user scope.

    Returns:
        A normalized API response containing cleanup counts.
    """
    # Require authentication and run the manager cleanup routine.
    get_request_user_id(request)
    manager = get_temp_mcp_manager()
    before_count = len(manager._servers)
    manager._cleanup_expired_servers()
    after_count = len(manager._servers)
    removed_count = before_count - after_count
    return api_response(
        success=True,
        message=f'清理完成，移除 {removed_count} 个过期服务器',
        data={'removed_count': removed_count, 'remaining_count': after_count},
    )
