"""Filesystem-backed hotplug tool registry and runtime adapter."""

from __future__ import annotations

import asyncio
import hashlib
import importlib.util
import inspect
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional

from modules.llmfetcher.llm_types import Tool


def _legacy_arguments_to_parameters(arguments_schema: Dict[str, str]) -> Dict[str, Any]:
    """Convert a legacy argument-description map into a JSON schema."""
    properties = {
        name: {
            'type': 'string',
            'description': description,
        }
        for name, description in arguments_schema.items()
    }
    return {
        'type': 'object',
        'properties': properties,
        'required': [],
        'additionalProperties': True,
    }


class HotplugToolManager:
    """Manage persisted hotplug tool definitions and runtime wrappers."""

    def __init__(self, storage_dir: Path | str = '.elfctf/hotplug-tools') -> None:
        """Initialize registry storage and load persisted manifests."""
        self._storage_dir = Path(storage_dir)
        self._storage_dir.mkdir(parents=True, exist_ok=True)
        self._tools: Dict[str, dict] = {}
        self.reload_all()

    def configure_storage_dir(self, storage_dir: Path | str) -> None:
        """Point the registry at a new storage directory and reload it."""
        self._storage_dir = Path(storage_dir)
        self._storage_dir.mkdir(parents=True, exist_ok=True)
        self.reload_all()

    def _definition_path(self, name: str) -> Path:
        """Return JSON definition path for a tool."""
        return self._storage_dir / f'{name}.json'

    def _hash(self, tool: dict) -> str:
        """Return a stable hash for a tool definition."""
        return hashlib.sha256(json.dumps(tool, sort_keys=True, ensure_ascii=False).encode('utf-8')).hexdigest()

    def _normalize_tool(self, tool: dict, *, source: Optional[str] = None) -> dict:
        """Normalize a persisted tool record into the current schema."""
        normalized = dict(tool)
        normalized['name'] = str(normalized.get('name', '')).strip()
        normalized['description'] = str(normalized.get('description', '')).strip()
        normalized['category'] = str(normalized.get('category', 'utility')).strip() or 'utility'
        normalized['dangerous'] = bool(normalized.get('dangerous', False))
        normalized['source'] = source or str(normalized.get('source', 'api'))

        parameters = normalized.get('parameters')
        if not isinstance(parameters, dict) or not parameters:
            legacy_arguments = normalized.get('arguments_schema')
            if isinstance(legacy_arguments, dict) and legacy_arguments:
                parameters = _legacy_arguments_to_parameters(legacy_arguments)
            else:
                parameters = {
                    'type': 'object',
                    'properties': {},
                    'additionalProperties': True,
                }
        normalized['parameters'] = parameters
        normalized['arguments_schema'] = normalized.get('arguments_schema') or {
            key: value.get('description', '')
            for key, value in parameters.get('properties', {}).items()
            if isinstance(value, dict)
        }

        runtime = normalized.get('runtime')
        if isinstance(runtime, dict):
            normalized['runtime'] = runtime
        else:
            normalized.pop('runtime', None)

        return normalized

    def _resolve_path(self, path: str | None, *, fallback_dir: Optional[Path] = None) -> Optional[Path]:
        """Resolve one path against the storage directory."""
        if not path:
            return None
        resolved = Path(path)
        if not resolved.is_absolute():
            base = fallback_dir or self._storage_dir
            resolved = base / resolved
        return resolved.resolve()

    def _serialize(self, tool: dict) -> dict:
        """Return a stored copy with a stable hash."""
        stored = self._normalize_tool(tool, source=str(tool.get('source', 'api')))
        stored['_hash'] = self._hash(stored)
        return stored

    def get_all_tools(self, *, include_builtin: bool = True) -> list[dict]:
        """Return all known tools."""
        return [dict(tool) for tool in self._tools.values()]

    def get_hotplug_tools(self) -> list[dict]:
        """Return externally managed tools."""
        return self.get_all_tools(include_builtin=False)

    def get_hotplug_tool_names(self) -> list[str]:
        """Return the names of all externally managed tools."""
        return [str(tool.get('name', '')).strip() for tool in self.get_hotplug_tools() if str(tool.get('name', '')).strip()]

    def get_tool(self, tool_name: str) -> Optional[dict]:
        """Return one tool definition."""
        tool = self._tools.get(tool_name)
        return dict(tool) if tool else None

    def add_tool(self, tool: dict, *, source: str = 'api') -> dict:
        """Add or update a tool definition."""
        name = str(tool.get('name', '')).strip()
        if not name:
            return {'success': False, 'message': '工具名称不能为空'}

        stored = self._serialize({**tool, 'name': name, 'source': source})
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
        for path in sorted(self._storage_dir.glob('*.json')):
            try:
                tool = json.loads(path.read_text(encoding='utf-8'))
            except json.JSONDecodeError:
                continue
            name = str(tool.get('name') or path.stem).strip()
            if not name:
                continue
            tool.setdefault('name', name)
            tool = self._serialize(tool)
            self._tools[name] = tool
        return {'success': True, 'message': '工具已重载', 'stats': {'count': len(self._tools)}}

    def reload_tool(self, tool_name: str) -> dict:
        """Reload one tool definition."""
        path = self._definition_path(tool_name)
        if not path.is_file():
            return {'success': False, 'message': '工具不存在'}
        tool = json.loads(path.read_text(encoding='utf-8'))
        tool.setdefault('name', tool_name)
        tool = self._serialize(tool)
        self._tools[tool_name] = tool
        return {'success': True, 'message': '工具已重载', 'hash': tool['_hash'], 'action': 'reloaded'}

    def get_status(self) -> dict:
        """Return registry status."""
        return {'storage_dir': str(self._storage_dir), 'count': len(self._tools)}

    def get_tool_hash(self, tool_name: str) -> Optional[str]:
        """Return current tool hash."""
        tool = self._tools.get(tool_name)
        return tool.get('_hash') if tool else None

    def build_runtime_tools(self, *, default_cwd: Path | str | None = None, tool_names: Optional[list[str]] = None) -> list[Tool]:
        """Convert stored tool definitions into executable Tool objects.

        Args:
            default_cwd: Workspace used as the default command working directory.
            tool_names: Optional whitelist of tool names to include.
        """
        runtime_tools: list[Tool] = []
        cwd = Path(default_cwd) if default_cwd is not None else None
        selected_names = None if tool_names is None else {
            str(name).strip() for name in tool_names if str(name).strip()
        }
        for tool in self._tools.values():
            tool_name = str(tool.get('name', '')).strip()
            if selected_names is not None and tool_name not in selected_names:
                continue
            runtime = self._build_runtime_tool(tool, default_cwd=cwd)
            if runtime is not None:
                runtime_tools.append(runtime)
        return runtime_tools

    def _build_runtime_tool(self, tool: dict, *, default_cwd: Optional[Path] = None) -> Optional[Tool]:
        """Build one executable Tool from a stored tool definition."""
        runtime = tool.get('runtime') if isinstance(tool.get('runtime'), dict) else {}
        tool_name = str(tool.get('name', '')).strip()
        if not tool_name:
            return None

        parameters = tool.get('parameters')
        if not isinstance(parameters, dict) or not parameters:
            parameters = _legacy_arguments_to_parameters(tool.get('arguments_schema') or {})

        runtime_kind = str(runtime.get('kind') or '').strip().lower()
        entrypoint = str(runtime.get('entrypoint') or runtime_kind or '').strip().lower()
        if entrypoint == 'handler' and runtime_kind in {'python_module', 'module'}:
            entrypoint = 'python_module'
        if not entrypoint and tool.get('code_path'):
            entrypoint = 'python_module'

        handler: Optional[Any] = None
        if entrypoint in {'python_module', 'module'}:
            handler = self._build_python_module_handler(tool, default_cwd=default_cwd)
        elif entrypoint in {'python_script', 'script', 'ctf_toolkit_file', 'ctf_toolkit_stego', 'upx_section_fixer', 'vmpunpacker'}:
            handler = self._build_script_handler(tool, entrypoint=entrypoint, default_cwd=default_cwd)
        else:
            # Unknown runtime metadata means the tool can still be listed, but
            # it is not safely executable by the Agent loop.
            handler = None

        if handler is None:
            return None

        return Tool(
            name=tool_name,
            description=str(tool.get('description', '')).strip() or tool_name,
            parameters=parameters,
            handler=handler,
        )

    def _build_script_handler(self, tool: dict, *, entrypoint: str, default_cwd: Optional[Path]) -> Any:
        """Create an async handler that shells out to a local Python script."""
        runtime = tool.get('runtime') if isinstance(tool.get('runtime'), dict) else {}
        script_path = self._resolve_path(
            runtime.get('script') or tool.get('code_path'),
            fallback_dir=self._storage_dir,
        )
        if script_path is None or not script_path.is_file():
            async def _missing_script(**kwargs: Any) -> str:
                return f"Error: script not found for tool '{tool.get('name', '')}'"

            return _missing_script

        async def _run_script(**kwargs: Any) -> str:
            command, cwd = self._build_command_for_script(tool, script_path, kwargs, default_cwd=default_cwd, entrypoint=entrypoint)
            return await self._run_command(command, cwd=cwd)

        return _run_script

    def _build_python_module_handler(self, tool: dict, *, default_cwd: Optional[Path]) -> Any:
        """Import a Python module and call its handler function."""
        module_path = self._resolve_path(tool.get('code_path'), fallback_dir=self._storage_dir)
        if module_path is None or not module_path.is_file():
            async def _missing_module(**kwargs: Any) -> str:
                return f"Error: module not found for tool '{tool.get('name', '')}'"

            return _missing_module

        async def _invoke_module(**kwargs: Any) -> Any:
            module_name = f"hotplug_{module_path.stem}_{abs(hash(str(module_path))) & 0xFFFFFFFF:x}"
            spec = importlib.util.spec_from_file_location(module_name, module_path)
            if spec is None or spec.loader is None:
                return f"Error: unable to load module '{module_path}'"
            module = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = module
            try:
                spec.loader.exec_module(module)
            except Exception as exc:
                return f"Error: failed to import '{module_path.name}': {exc}"

            handler = getattr(module, 'handler', None)
            if not callable(handler):
                return f"Error: tool module '{module_path.name}' does not define handler()"

            try:
                signature = inspect.signature(handler)
                if len(signature.parameters) == 1 and not any(
                    param.kind == inspect.Parameter.VAR_KEYWORD
                    for param in signature.parameters.values()
                ):
                    return handler(kwargs)
                return handler(**kwargs)
            except TypeError:
                return handler(kwargs)

        return _invoke_module

    def _build_command_for_script(
        self,
        tool: dict,
        script_path: Path,
        kwargs: Dict[str, Any],
        *,
        default_cwd: Optional[Path],
        entrypoint: str,
    ) -> tuple[list[str], Path | None]:
        """Translate a runtime tool call into a Python subprocess command."""
        cwd = default_cwd or script_path.parent
        if entrypoint == 'ctf_toolkit_file':
            command = [sys.executable, str(script_path), 'file']
            file_path = kwargs.get('file') or kwargs.get('target_file')
            if not file_path:
                raise ValueError("missing required argument 'file'")
            command.extend(['-f', str(file_path)])
            output = kwargs.get('output')
            if output:
                command.extend(['-o', str(output)])
            if kwargs.get('type'):
                command.append('--type')
            if kwargs.get('strings'):
                command.append('--strings')
            if kwargs.get('foremost'):
                command.append('--foremost')
            return command, cwd

        if entrypoint == 'ctf_toolkit_stego':
            command = [sys.executable, str(script_path), 'stego']
            file_path = kwargs.get('file') or kwargs.get('image_path')
            if not file_path:
                raise ValueError("missing required argument 'file'")
            command.extend(['-f', str(file_path)])
            output = kwargs.get('output')
            if output:
                command.extend(['-o', str(output)])
            if kwargs.get('lsb'):
                command.append('--lsb')
            if kwargs.get('zsteg'):
                command.append('--zsteg')
            if kwargs.get('exif'):
                command.append('--exif')
            if kwargs.get('stegdetect'):
                command.append('--stegdetect')
            if kwargs.get('all'):
                command.append('--all')
            return command, cwd

        if entrypoint == 'upx_section_fixer':
            input_path = kwargs.get('input_path')
            if not input_path:
                raise ValueError("missing required argument 'input_path'")
            command = [sys.executable, str(script_path), str(input_path)]
            output_path = kwargs.get('output_path')
            if output_path:
                command.append(str(output_path))
            return command, cwd

        if entrypoint == 'vmpunpacker':
            packed_file = kwargs.get('packed_file')
            unpacked_file = kwargs.get('unpacked_file')
            if not packed_file or not unpacked_file:
                raise ValueError("missing required arguments 'packed_file' and 'unpacked_file'")
            return [sys.executable, str(script_path), str(packed_file), str(unpacked_file)], cwd

        # Default script mode allows future manifests to provide their own
        # arguments through a custom command list in the runtime metadata.
        if isinstance(tool.get('runtime'), dict) and isinstance(tool['runtime'].get('command'), list):
            command = [sys.executable if part == '{python}' else str(part) for part in tool['runtime']['command']]
            return command, cwd

        raise ValueError(f"unsupported script entrypoint: {entrypoint}")

    async def _run_command(self, command: list[str], *, cwd: Path | None = None) -> str:
        """Run a subprocess command and format stdout/stderr for the Agent."""
        env = {
            key: value
            for key, value in os.environ.items()
            if key not in {'SSH_AUTH_SOCK', 'GPG_AGENT_INFO'}
        }
        env['PYTHONUNBUFFERED'] = '1'
        proc = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(cwd) if cwd is not None else None,
            env=env,
        )
        stdout_data, stderr_data = await proc.communicate()
        stdout_text = stdout_data.decode('utf-8', errors='replace') if stdout_data else ''
        stderr_text = stderr_data.decode('utf-8', errors='replace') if stderr_data else ''

        parts: list[str] = []
        if stdout_text:
            parts.append('[stdout]\n' + stdout_text)
        if stderr_text:
            parts.append('[stderr]\n' + stderr_text)
        if proc.returncode != 0:
            parts.append(f'[exit code] {proc.returncode}')
        return '\n'.join(parts) if parts else '(no output)'


hotplug_manager = HotplugToolManager()
