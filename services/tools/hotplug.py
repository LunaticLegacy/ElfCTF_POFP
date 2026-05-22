"""Filesystem-backed hotplug tool registry."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Dict, Optional


class HotplugToolManager:
    """Manage user-provided tool definitions."""

    def __init__(self, storage_dir: Path | str = '.elfctf/hotplug-tools') -> None:
        """Initialize registry storage."""
        self._storage_dir = Path(storage_dir)
        self._storage_dir.mkdir(parents=True, exist_ok=True)
        self._tools: Dict[str, dict] = {}
        self.reload_all()

    def _definition_path(self, name: str) -> Path:
        """Return JSON definition path for a tool."""
        return self._storage_dir / f'{name}.json'

    def _hash(self, tool: dict) -> str:
        """Return a stable hash for a tool definition."""
        return hashlib.sha256(json.dumps(tool, sort_keys=True, ensure_ascii=False).encode('utf-8')).hexdigest()

    def get_all_tools(self, *, include_builtin: bool = True) -> list[dict]:
        """Return all known tools."""
        return [dict(tool) for tool in self._tools.values()]

    def get_hotplug_tools(self) -> list[dict]:
        """Return externally managed tools."""
        return self.get_all_tools(include_builtin=False)

    def get_tool(self, tool_name: str) -> Optional[dict]:
        """Return one tool definition."""
        tool = self._tools.get(tool_name)
        return dict(tool) if tool else None

    def add_tool(self, tool: dict, *, source: str = 'api') -> dict:
        """Add or update a tool definition."""
        name = str(tool.get('name', '')).strip()
        if not name:
            return {'success': False, 'message': '工具名称不能为空'}
        stored = dict(tool)
        stored['source'] = source
        stored['_hash'] = self._hash(stored)
        old = self._tools.get(name, {})
        self._tools[name] = stored
        self._definition_path(name).write_text(json.dumps(stored, ensure_ascii=False, indent=2), encoding='utf-8')
        return {
            'success': True,
            'message': '工具已更新' if old else '工具已添加',
            'hash': stored['_hash'],
            'old_hash': old.get('_hash'),
            'action': 'updated' if old else 'created',
        }

    def remove_tool(self, tool_name: str) -> dict:
        """Remove a tool definition."""
        tool = self._tools.pop(tool_name, None)
        if tool is None:
            return {'success': False, 'message': '工具不存在', 'hash': None}
        self._definition_path(tool_name).unlink(missing_ok=True)
        return {'success': True, 'message': '工具已删除', 'hash': tool.get('_hash')}

    def update_tool_code(self, tool_name: str, code: str) -> dict:
        """Update inline code for a tool definition."""
        tool = self._tools.get(tool_name)
        if tool is None:
            return {'success': False, 'message': '工具不存在'}
        old_hash = tool.get('_hash')
        tool['code'] = code
        tool['_hash'] = self._hash(tool)
        self._definition_path(tool_name).write_text(json.dumps(tool, ensure_ascii=False, indent=2), encoding='utf-8')
        return {'success': True, 'message': '代码已更新', 'hash': tool['_hash'], 'old_hash': old_hash, 'action': 'updated'}

    def reload_all(self) -> dict:
        """Reload all JSON tool definitions from disk."""
        self._tools = {}
        for path in self._storage_dir.glob('*.json'):
            try:
                tool = json.loads(path.read_text(encoding='utf-8'))
            except json.JSONDecodeError:
                continue
            name = str(tool.get('name') or path.stem)
            tool.setdefault('name', name)
            tool.setdefault('_hash', self._hash(tool))
            self._tools[name] = tool
        return {'success': True, 'message': '工具已重载', 'stats': {'count': len(self._tools)}}

    def reload_tool(self, tool_name: str) -> dict:
        """Reload one tool definition."""
        path = self._definition_path(tool_name)
        if not path.is_file():
            return {'success': False, 'message': '工具不存在'}
        tool = json.loads(path.read_text(encoding='utf-8'))
        tool.setdefault('_hash', self._hash(tool))
        self._tools[tool_name] = tool
        return {'success': True, 'message': '工具已重载', 'hash': tool['_hash'], 'action': 'reloaded'}

    def get_status(self) -> dict:
        """Return registry status."""
        return {'storage_dir': str(self._storage_dir), 'count': len(self._tools)}

    def get_tool_hash(self, tool_name: str) -> Optional[str]:
        """Return current tool hash."""
        tool = self._tools.get(tool_name)
        return tool.get('_hash') if tool else None


hotplug_manager = HotplugToolManager()
