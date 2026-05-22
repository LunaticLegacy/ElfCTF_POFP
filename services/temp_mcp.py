"""Temporary MCP server package manager."""

from __future__ import annotations

import subprocess
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional


@dataclass
class TempMcpServer:
    """Metadata for a generated temporary MCP server."""

    id: str
    name: str
    description: str
    tools: List[Dict[str, Any]]
    expires_at: float
    remaining_executions: int
    client_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    revoked: bool = False

    def to_dict(self) -> dict:
        """Serialize server metadata for API responses."""
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'tools': self.tools,
            'expires_at': self.expires_at,
            'time_to_live': max(0, int(self.expires_at - time.time())),
            'remaining_executions': self.remaining_executions,
            'client_id': self.client_id,
            'metadata': self.metadata,
            'revoked': self.revoked,
        }


class TempMcpManager:
    """Create and track temporary generated MCP server scripts."""

    def __init__(self, storage_dir: Path | str = '.elfctf/temp-mcp') -> None:
        """Initialize storage and process registries."""
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self._servers: Dict[str, TempMcpServer] = {}
        self._processes: Dict[str, subprocess.Popen] = {}

    def create_server(
        self,
        *,
        name: str,
        description: str,
        tools: List[Dict[str, Any]],
        custom_code: Optional[str] = None,
        ttl_seconds: int = 3600,
        max_executions: int = 100,
        client_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> TempMcpServer:
        """Create a temporary server record and source file."""
        server_id = uuid.uuid4().hex
        code = custom_code or self._default_code(name, description, tools)
        code_path = self.storage_dir / f'{server_id}.py'
        code_path.write_text(code, encoding='utf-8')
        merged_metadata = dict(metadata or {})
        merged_metadata['code_path'] = str(code_path)
        server = TempMcpServer(
            id=server_id,
            name=name,
            description=description,
            tools=tools,
            expires_at=time.time() + max(60, int(ttl_seconds)),
            remaining_executions=max(1, int(max_executions)),
            client_id=client_id,
            metadata=merged_metadata,
        )
        self._servers[server_id] = server
        return server

    def _default_code(self, name: str, description: str, tools: List[Dict[str, Any]]) -> str:
        """Generate placeholder Python source for a temp MCP server."""
        return (
            '#!/usr/bin/env python3\n'
            f'"""{description}"""\n\n'
            'import json\n\n'
            f'SERVER_NAME = {name!r}\n'
            f'TOOLS = {tools!r}\n\n'
            'if __name__ == "__main__":\n'
            '    print(json.dumps({"name": SERVER_NAME, "tools": TOOLS}, ensure_ascii=False))\n'
        )

    def _cleanup_expired_servers(self) -> None:
        """Remove expired or revoked servers and stop their processes."""
        now = time.time()
        for server_id, server in list(self._servers.items()):
            if server.revoked or server.expires_at <= now:
                self.stop_server_process(server_id)
                self._servers.pop(server_id, None)

    def list_servers(self, *, client_id: Optional[str] = None) -> List[TempMcpServer]:
        """List non-expired temporary servers."""
        self._cleanup_expired_servers()
        servers = list(self._servers.values())
        if client_id:
            servers = [server for server in servers if server.client_id == client_id]
        return servers

    def get_server(self, server_id: str) -> Optional[TempMcpServer]:
        """Return one active server."""
        self._cleanup_expired_servers()
        return self._servers.get(server_id)

    def get_status(self) -> dict:
        """Return manager counts."""
        self._cleanup_expired_servers()
        return {'total_servers': len(self._servers), 'active_servers': len(self._servers)}

    def start_server_process(self, server_id: str) -> subprocess.Popen:
        """Start a generated server script with Python."""
        server = self.get_server(server_id)
        if server is None:
            raise ValueError('服务器不存在或已过期')
        code_path = server.metadata.get('code_path')
        process = subprocess.Popen(['python', str(code_path)], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        self._processes[server_id] = process
        return process

    def stop_server_process(self, server_id: str) -> bool:
        """Stop a generated server process."""
        process = self._processes.pop(server_id, None)
        if process is None:
            return False
        if process.poll() is None:
            process.terminate()
        return True

    def revoke_server(self, server_id: str) -> bool:
        """Mark a server revoked and stop it."""
        server = self._servers.get(server_id)
        if server is None:
            return False
        server.revoked = True
        self.stop_server_process(server_id)
        return True


_manager = TempMcpManager()


def get_temp_mcp_manager() -> TempMcpManager:
    """Return the process-wide temporary MCP manager."""
    return _manager
