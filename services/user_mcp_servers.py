"""In-memory registry for user-hosted MCP servers."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class UserMcpServer:
    """Metadata for a user-hosted MCP server."""

    id: str
    name: str
    description: str
    owner_id: str
    transport: str = 'stdio'
    url: Optional[str] = None
    command: Optional[str] = None
    args: Optional[List[str]] = None
    env: Optional[Dict[str, str]] = None
    pwd: Optional[str] = None
    status: str = 'running'
    status_message: str = ''
    heartbeat_interval: int = 30
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        """Serialize this server for API responses."""
        return self.__dict__.copy()


class UserMcpManager:
    """Track user-hosted MCP server registrations."""

    def __init__(self) -> None:
        """Initialize an empty server registry."""
        self._servers: Dict[str, UserMcpServer] = {}

    def register_server(
        self,
        *,
        server_id: str,
        name: str,
        description: str,
        owner_id: str,
        transport: str = 'stdio',
        url: Optional[str] = None,
        command: Optional[str] = None,
        args: Optional[List[str]] = None,
        env: Optional[Dict[str, str]] = None,
        pwd: Optional[str] = None,
    ) -> UserMcpServer:
        """Register a new user-hosted server.

        Args:
            server_id: Stable server identifier supplied by the client script.
            name: Human-readable server name.
            description: Human-readable server description.
            owner_id: User id that owns the server registration.
            transport: MCP transport mode.
            url: Optional SSE endpoint for HTTP-like transports.
            command: Optional stdio command.
            args: Optional stdio command arguments.
            env: Optional stdio process environment.
            pwd: Optional stdio working directory.

        Returns:
            The registered server metadata object.
        """
        server = UserMcpServer(
            id=server_id,
            name=name,
            description=description,
            owner_id=owner_id,
            transport=transport,
            url=url,
            command=command,
            args=args,
            env=env,
            pwd=pwd,
        )
        self._servers[server.id] = server
        return server

    def get_server(self, server_id: str) -> Optional[UserMcpServer]:
        """Return one server by id."""
        return self._servers.get(server_id)

    def list_servers(self, *, owner_id: str, status: Optional[str] = None) -> List[UserMcpServer]:
        """List servers owned by a user."""
        servers = [server for server in self._servers.values() if server.owner_id == owner_id]
        if status:
            servers = [server for server in servers if server.status == status]
        return servers

    def update_heartbeat(self, server_id: str) -> bool:
        """Refresh a server heartbeat timestamp."""
        server = self._servers.get(server_id)
        if server is None:
            return False
        server.updated_at = time.time()
        return True

    def update_status(self, server_id: str, status: str, status_message: str = '') -> bool:
        """Update server status text."""
        server = self._servers.get(server_id)
        if server is None:
            return False
        server.status = status
        server.status_message = status_message
        server.updated_at = time.time()
        return True

    def unregister_server(self, server_id: str) -> bool:
        """Delete a user-hosted server record."""
        return self._servers.pop(server_id, None) is not None

    def get_status(self) -> dict:
        """Return registry status."""
        return {'total': len(self._servers), 'running': len([s for s in self._servers.values() if s.status == 'running'])}


_manager = UserMcpManager()


def get_user_mcp_manager() -> UserMcpManager:
    """Return the process-wide user MCP manager."""
    return _manager
