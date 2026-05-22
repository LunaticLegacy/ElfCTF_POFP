"""User-hosted MCP server API routes implemented with FastAPI."""

from __future__ import annotations

import io
import json
import time
from typing import Any, Dict, List

from fastapi import Request
from fastapi.responses import JSONResponse, StreamingResponse

from . import tools_router
from ..dependencies import api_response, get_request_user_id
from ..schemas import UserMcpRegisterRequest
from services.temp_mcp import get_temp_mcp_manager
from services.user_mcp_servers import get_user_mcp_manager


@tools_router.get('/user-mcp')
def list_user_mcp_servers(request: Request, status: str = '') -> JSONResponse:
    """List user-hosted MCP servers owned by the current user.

    Args:
        request: Current FastAPI request used for authentication.
        status: Optional status filter from query parameters.

    Returns:
        A normalized API response containing server records and total count.
    """
    # Resolve the user and list only servers owned by that user.
    user_id = get_request_user_id(request)
    manager = get_user_mcp_manager()
    servers = manager.list_servers(owner_id=user_id, status=status or None)
    return api_response(success=True, data={'servers': [server.to_dict() for server in servers], 'total': len(servers)})


@tools_router.get('/user-mcp/status')
def get_user_mcp_status(request: Request) -> JSONResponse:
    """Return user MCP manager status.

    Args:
        request: Current FastAPI request used for authentication.

    Returns:
        A normalized API response containing manager status.
    """
    # Require a valid user before exposing manager state.
    get_request_user_id(request)
    manager = get_user_mcp_manager()
    status = manager.get_status()
    return api_response(success=True, data=status)


@tools_router.get('/user-mcp/{server_id}')
def get_user_mcp_server(request: Request, server_id: str) -> JSONResponse:
    """Return detail for one user-hosted MCP server.

    Args:
        request: Current FastAPI request used for authentication.
        server_id: Server identifier from the path.

    Returns:
        A normalized API response containing server detail or an access error.
    """
    # Fetch the server and enforce owner-only access.
    user_id = get_request_user_id(request)
    manager = get_user_mcp_manager()
    server = manager.get_server(server_id)
    if not server:
        return api_response(success=False, message='Server 不存在', status_code=404)
    if server.owner_id != user_id:
        return api_response(success=False, message='无权访问该 Server', status_code=403)
    return api_response(success=True, data=server.to_dict())


@tools_router.post('/user-mcp/{server_id}/register')
async def register_user_mcp_server(request: Request, server_id: str) -> JSONResponse:
    """Register or update a user-hosted MCP server.

    Args:
        request: Current FastAPI request containing client registration JSON.
        server_id: Server identifier from the path.

    Returns:
        A normalized API response containing registration status.
    """
    # Parse flexible client-script JSON and normalize registration fields.
    try:
        raw_data = await request.json()
    except Exception:
        raw_data = {}
    register_request = UserMcpRegisterRequest.from_payload(raw_data, server_id)
    manager = get_user_mcp_manager()

    # Refresh existing servers instead of creating duplicate records.
    existing = manager.get_server(server_id)
    if existing:
        manager.update_heartbeat(server_id)
        manager.update_status(server_id, 'running')
        return api_response(
            success=True,
            message='Server 已更新',
            data={'id': server_id, 'status': 'running', 'heartbeat_interval': existing.heartbeat_interval},
        )

    # Register a new user-hosted server record.
    try:
        server = manager.register_server(
            server_id=server_id,
            name=register_request.name,
            description=register_request.description,
            owner_id=register_request.user_id,
            transport=register_request.transport,
            url=register_request.url,
            command=register_request.command,
            args=register_request.args,
            env=register_request.env,
            pwd=register_request.pwd,
        )
    except Exception as exc:
        return api_response(success=False, message=f'注册失败：{str(exc)}', status_code=500)
    return api_response(
        success=True,
        message='Server 已注册',
        data={'id': server.id, 'status': server.status, 'heartbeat_interval': server.heartbeat_interval},
    )


@tools_router.post('/user-mcp/{server_id}/heartbeat')
async def heartbeat_user_mcp_server(request: Request, server_id: str) -> JSONResponse:
    """Update heartbeat and optional status for a user-hosted MCP server.

    Args:
        request: Current FastAPI request containing optional heartbeat JSON.
        server_id: Server identifier from the path.

    Returns:
        A normalized API response acknowledging heartbeat receipt.
    """
    # Parse permissive JSON for compatibility with older generated scripts.
    try:
        data = await request.json()
    except Exception:
        data = {}
    manager = get_user_mcp_manager()
    success = manager.update_heartbeat(server_id)
    if not success:
        return api_response(success=False, message='Server 不存在，请先注册', status_code=404)

    # Update optional working directory and status fields.
    if 'pwd' in data:
        server = manager.get_server(server_id)
        if server:
            server.pwd = data['pwd']
    if 'status' in data:
        manager.update_status(server_id, data['status'], data.get('status_message', ''))
    return api_response(success=True, data={'acknowledged': True, 'server_time': time.time()})


@tools_router.post('/user-mcp/{server_id}/disconnect')
async def disconnect_user_mcp_server(request: Request, server_id: str) -> JSONResponse:
    """Mark a user-hosted MCP server as disconnected.

    Args:
        request: Current FastAPI request containing optional disconnect reason.
        server_id: Server identifier from the path.

    Returns:
        A normalized API response describing disconnect status.
    """
    # Parse optional disconnect reason and update manager state.
    try:
        data = await request.json()
    except Exception:
        data = {}
    manager = get_user_mcp_manager()
    success = manager.update_status(server_id, 'disconnected', data.get('reason', '客户端主动断开'))
    if success:
        return api_response(success=True, message='已断开连接')
    return api_response(success=False, message='Server 不存在', status_code=404)


@tools_router.delete('/user-mcp/{server_id}')
def delete_user_mcp_server(request: Request, server_id: str) -> JSONResponse:
    """Delete a user-hosted MCP server record.

    Args:
        request: Current FastAPI request used for authentication.
        server_id: Server identifier from the path.

    Returns:
        A normalized API response describing deletion status.
    """
    # Fetch the server and enforce owner-only deletion.
    user_id = get_request_user_id(request)
    manager = get_user_mcp_manager()
    server = manager.get_server(server_id)
    if not server:
        return api_response(success=False, message='Server 不存在', status_code=404)
    if server.owner_id != user_id:
        return api_response(success=False, message='无权删除该 Server', status_code=403)

    # Remove the server record from the manager.
    success = manager.unregister_server(server_id)
    return api_response(success=True, message='Server 已删除' if success else '删除失败')


@tools_router.get('/user-mcp/{server_id}/download')
def download_user_mcp_script(
    request: Request,
    server_id: str,
    mode: str = 'stdio',
    port: str = '8080',
) -> JSONResponse:
    """Download a generated user-hosted MCP server script.

    Args:
        request: Current FastAPI request used for authentication and URL data.
        server_id: Server identifier, or `default` for a generic script.
        mode: Generated script mode, either `stdio` or `sse`.
        port: SSE port used when generating SSE scripts.

    Returns:
        A streaming Python file response containing the generated script.
    """
    # Resolve user scope and choose tool definitions for the generated script.
    user_id = get_request_user_id(request)
    temp_manager = get_temp_mcp_manager()
    temp_server = temp_manager.get_server(server_id)
    default_tools = _default_tools()
    if temp_server:
        name = temp_server.name
        description = temp_server.description
        tools = temp_server.tools
    elif server_id == 'default':
        name = 'default-mcp-server'
        description = '默认用户自托管 MCP Server'
        tools = default_tools
    else:
        name = f'user-mcp-{server_id[:8]}'
        description = '用户自托管 MCP Server'
        tools = default_tools

    # Generate script text and stream it as an attachment.
    generated_id = server_id if server_id != 'default' else f'default-{user_id}-{int(time.time())}'
    script_content = _generate_client_script(
        server_id=generated_id,
        name=name,
        description=description,
        tools=tools,
        user_id=user_id,
        mode=mode,
        port=port,
        base_url=str(request.base_url).rstrip('/'),
    )
    file_obj = io.BytesIO(script_content.encode('utf-8'))
    headers = {'Content-Disposition': f'attachment; filename="{name}_{mode}.py"'}
    return StreamingResponse(file_obj, media_type='text/x-python', headers=headers)


def _default_tools() -> List[Dict[str, Any]]:
    """Return default tool definitions for generated MCP scripts.

    Returns:
        A list of MCP tool schema dictionaries.
    """
    # Provide a small filesystem and shell toolset for default generated servers.
    return [
        {
            'name': 'execute_command',
            'description': '在本地执行命令',
            'inputSchema': {
                'type': 'object',
                'properties': {'command': {'type': 'string'}, 'timeout': {'type': 'integer', 'default': 30}},
                'required': ['command'],
            },
        },
        {
            'name': 'read_file',
            'description': '读取本地文件内容',
            'inputSchema': {
                'type': 'object',
                'properties': {'path': {'type': 'string'}},
                'required': ['path'],
            },
        },
        {
            'name': 'write_file',
            'description': '写入内容到本地文件',
            'inputSchema': {
                'type': 'object',
                'properties': {'path': {'type': 'string'}, 'content': {'type': 'string'}},
                'required': ['path', 'content'],
            },
        },
        {
            'name': 'list_directory',
            'description': '列出目录内容',
            'inputSchema': {'type': 'object', 'properties': {'path': {'type': 'string', 'default': '.'}}},
        },
    ]


def _generate_client_script(
    server_id: str,
    name: str,
    description: str,
    tools: list,
    user_id: str,
    mode: str,
    port: str,
    base_url: str,
) -> str:
    """Generate a client-side MCP server script.

    Args:
        server_id: Server id that the generated script registers under.
        name: Generated server name.
        description: Generated server description.
        tools: Tool definitions embedded into the script.
        user_id: Owner id to register with the API.
        mode: Script transport mode.
        port: SSE port for SSE mode.
        base_url: Base URL for registration and heartbeat calls.

    Returns:
        Python source code for the generated MCP server script.
    """
    # Dispatch to the transport-specific generator while sharing JSON encoding.
    tools_json = json.dumps(tools, indent=2, ensure_ascii=False)
    if mode == 'sse':
        return _generate_sse_script(server_id, name, description, tools_json, user_id, port, base_url)
    return _generate_stdio_script(server_id, name, description, tools_json, user_id, base_url)


def _generate_stdio_script(
    server_id: str,
    name: str,
    description: str,
    tools_json: str,
    user_id: str,
    base_url: str,
) -> str:
    """Generate a stdio-mode user MCP script.

    Args:
        server_id: Server id used during registration.
        name: MCP server display name.
        description: Script module docstring text.
        tools_json: JSON string containing tool definitions.
        user_id: Owner id to register with the API.
        base_url: Base URL for API callbacks.

    Returns:
        Python source code implementing a stdio MCP server.
    """
    # Build a compact standalone script that registers and serves configured tools.
    return f'''#!/usr/bin/env python3
"""{description}"""

import asyncio
import os
import signal
import subprocess
import sys
import threading
import time

import requests
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool

SERVER_ID = "{server_id}"
USER_ID = "{user_id}"
BASE_URL = "{base_url}"
HEARTBEAT_INTERVAL = 30
SERVER_PWD = os.path.dirname(os.path.abspath(__file__))
TASK_WORKSPACE = os.getenv("MCP_TASK_WORKSPACE", SERVER_PWD)
TOOLS_CONFIG = {tools_json}

server = Server(name="{name}")


@server.list_tools()
async def list_tools():
    """Return tool schemas exposed by this MCP server."""
    return [Tool(name=tool["name"], description=tool.get("description", ""), inputSchema=tool.get("inputSchema", {{}})) for tool in TOOLS_CONFIG]


@server.call_tool()
async def call_tool(name: str, arguments: dict):
    """Execute one tool call by name."""
    if name == "execute_command":
        return await _execute_command(arguments)
    if name == "read_file":
        return await _read_file(arguments)
    if name == "write_file":
        return await _write_file(arguments)
    if name == "list_directory":
        return await _list_directory(arguments)
    return {{"success": False, "text": f"未知工具：{{name}}"}}


def _resolve_workspace_path(raw_path: str) -> str:
    """Resolve paths relative to TASK_WORKSPACE."""
    raw_path = raw_path.strip() or "."
    return raw_path if os.path.isabs(raw_path) else os.path.join(TASK_WORKSPACE, raw_path)


async def _execute_command(arguments: dict) -> dict:
    """Execute a shell command in the task workspace."""
    command = arguments.get("command", "")
    timeout = arguments.get("timeout", 30)
    if not command:
        return {{"success": False, "text": "命令不能为空"}}
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=timeout, cwd=TASK_WORKSPACE)
        output = result.stdout + (("\\n" + result.stderr) if result.stderr else "")
        return {{"success": result.returncode == 0, "text": output, "returncode": result.returncode}}
    except Exception as exc:
        return {{"success": False, "text": f"命令执行失败：{{exc}}"}}


async def _read_file(arguments: dict) -> dict:
    """Read a UTF-8 text file from the workspace."""
    path = _resolve_workspace_path(arguments.get("path", ""))
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as file_obj:
            text = file_obj.read()
        return {{"success": True, "text": text, "lines": len(text.splitlines())}}
    except Exception as exc:
        return {{"success": False, "text": f"读取文件失败：{{exc}}"}}


async def _write_file(arguments: dict) -> dict:
    """Write a UTF-8 text file into the workspace."""
    path = _resolve_workspace_path(arguments.get("path", ""))
    content = arguments.get("content", "")
    try:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w", encoding="utf-8") as file_obj:
            file_obj.write(content)
        return {{"success": True, "text": f"文件已写入：{{path}}"}}
    except Exception as exc:
        return {{"success": False, "text": f"写入文件失败：{{exc}}"}}


async def _list_directory(arguments: dict) -> dict:
    """List directory entries from the workspace."""
    path = _resolve_workspace_path(arguments.get("path", "."))
    try:
        items = os.listdir(path)
        return {{"success": True, "text": "\\n".join(items), "count": len(items)}}
    except Exception as exc:
        return {{"success": False, "text": f"列出目录失败：{{exc}}"}}


class ServerRegistration:
    """Manage registration and heartbeat with the API server."""

    def __init__(self):
        """Initialize heartbeat thread state."""
        self._stop_event = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def start(self):
        """Start heartbeat registration in a background thread."""
        self._thread.start()

    def stop(self):
        """Stop heartbeat registration and notify disconnect."""
        self._stop_event.set()
        requests.post(f"{{BASE_URL}}/api/user-mcp/{{SERVER_ID}}/disconnect", json={{"reason": "Server stopped"}}, timeout=5)

    def _run(self):
        """Register once and then send periodic heartbeats."""
        requests.post(f"{{BASE_URL}}/api/user-mcp/{{SERVER_ID}}/register", json={{"name": "{name}", "description": "{description}", "transport": "stdio", "user_id": USER_ID, "pwd": SERVER_PWD}}, timeout=10)
        while not self._stop_event.wait(HEARTBEAT_INTERVAL):
            requests.post(f"{{BASE_URL}}/api/user-mcp/{{SERVER_ID}}/heartbeat", json={{"pwd": SERVER_PWD}}, timeout=10)


async def main():
    """Run the stdio MCP server until the client disconnects."""
    registration = ServerRegistration()
    registration.start()
    try:
        async with stdio_server() as streams:
            await server.run(streams[0], streams[1], server.create_initialization_options())
    finally:
        registration.stop()


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    asyncio.run(main())
'''


def _generate_sse_script(
    server_id: str,
    name: str,
    description: str,
    tools_json: str,
    user_id: str,
    port: str,
    base_url: str,
) -> str:
    """Generate an SSE-mode user MCP script.

    Args:
        server_id: Server id used during registration.
        name: MCP server display name.
        description: Script module docstring text.
        tools_json: JSON string containing tool definitions.
        user_id: Owner id to register with the API.
        port: SSE port for the generated FastAPI app.
        base_url: Base URL for API callbacks.

    Returns:
        Python source code implementing an SSE MCP server.
    """
    # Reuse the stdio tool behavior and add a small FastAPI/SSE transport wrapper.
    return f'''#!/usr/bin/env python3
"""{description}"""

import requests
import threading
import time
import uvicorn
from fastapi import FastAPI, Request
from mcp.server import Server
from mcp.server.sse import SseServerTransport
from mcp.types import Tool

SERVER_ID = "{server_id}"
USER_ID = "{user_id}"
BASE_URL = "{base_url}"
PORT = {int(port)}
TOOLS_CONFIG = {tools_json}

app = FastAPI(title="{name}")
sse = SseServerTransport("/messages/")
server = Server(name="{name}")


@server.list_tools()
async def list_tools():
    """Return tool schemas exposed by this MCP server."""
    return [Tool(name=tool["name"], description=tool.get("description", ""), inputSchema=tool.get("inputSchema", {{}})) for tool in TOOLS_CONFIG]


@app.get("/sse")
async def handle_sse(request: Request):
    """Open an SSE transport connection for MCP clients."""
    async with sse.connect_sse(request.scope, request.receive, request._send) as streams:
        await server.run(streams[0], streams[1], server.create_initialization_options())


@app.post("/messages/")
async def handle_post_message(request: Request):
    """Handle an MCP SSE POST message."""
    await sse.handle_post_message(request.scope, request.receive, request._send)


@app.get("/health")
def health_check():
    """Return simple process health metadata."""
    return {{"status": "ok", "server_id": SERVER_ID}}


def heartbeat_loop():
    """Register this server and send recurring heartbeats."""
    requests.post(f"{{BASE_URL}}/api/user-mcp/{{SERVER_ID}}/register", json={{"name": "{name}", "description": "{description}", "transport": "sse", "user_id": USER_ID, "url": f"http://localhost:{{PORT}}/sse"}}, timeout=10)
    while True:
        time.sleep(30)
        requests.post(f"{{BASE_URL}}/api/user-mcp/{{SERVER_ID}}/heartbeat", json={{"status": "running"}}, timeout=10)


if __name__ == "__main__":
    threading.Thread(target=heartbeat_loop, daemon=True).start()
    uvicorn.run(app, host="0.0.0.0", port=PORT)
'''
