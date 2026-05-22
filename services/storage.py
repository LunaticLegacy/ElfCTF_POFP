"""Filesystem-backed storage primitives for the ElfCTF backend."""

from __future__ import annotations

import json
import os
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict

from .config_handler import RuntimeConfig


class JsonConfigStore:
    """Persist runtime configuration in a small JSON file."""

    def __init__(self, path: Path) -> None:
        """Initialize the JSON config store.

        Args:
            path: File path where configuration should be stored.
        """
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._data: Dict[str, Any] = self._load()

    def _load(self) -> Dict[str, Any]:
        """Load existing JSON configuration from disk.

        Returns:
            Parsed configuration dictionary.
        """
        if not self.path.is_file():
            return {'users': {}, 'server': {}}
        try:
            return json.loads(self.path.read_text(encoding='utf-8'))
        except json.JSONDecodeError:
            return {'users': {}, 'server': {}}

    def _save(self) -> None:
        """Write current configuration data to disk."""
        self.path.write_text(json.dumps(self._data, ensure_ascii=False, indent=2), encoding='utf-8')

    def _config_from_dict(self, data: Dict[str, Any]) -> RuntimeConfig:
        """Build a runtime config from a partial dictionary."""
        merged = RuntimeConfig().to_dict()
        merged.update(data or {})
        return RuntimeConfig(**merged)

    def get_user_config(self, user_id: str) -> RuntimeConfig:
        """Return a user's stored configuration."""
        return self._config_from_dict(self._data.get('users', {}).get(user_id, {}))

    def save_user_config(self, user_id: str, config: RuntimeConfig) -> None:
        """Persist a user's runtime configuration."""
        self._data.setdefault('users', {})[user_id] = asdict(config)
        self._save()

    def get_server_config(self) -> RuntimeConfig:
        """Return server fallback configuration from file and environment."""
        data = dict(self._data.get('server', {}))
        data.setdefault('api_key', os.getenv('OPENAI_API_KEY', '') or os.getenv('DEEPSEEK_API_KEY', ''))
        data.setdefault('api_base', os.getenv('OPENAI_API_BASE', '') or os.getenv('OPENAI_BASE_URL', ''))
        data.setdefault('model', os.getenv('OPENAI_MODEL', '') or os.getenv('DEEPSEEK_MODEL', ''))
        return self._config_from_dict({key: value for key, value in data.items() if value not in (None, '')})

    def get_effective_config(self, user_id: str) -> RuntimeConfig:
        """Merge user config with server fallback for empty secret fields."""
        user_config = self.get_user_config(user_id)
        server_config = self.get_server_config()
        merged = user_config.to_dict()
        for key in ('api_key', 'api_base', 'model'):
            if not str(merged.get(key, '')).strip():
                merged[key] = getattr(server_config, key)
        return RuntimeConfig(**merged)

    def has_user_config(self, user_id: str) -> bool:
        """Return whether a user has an explicit saved config."""
        return user_id in self._data.get('users', {})

    def has_server_fallback(self) -> bool:
        """Return whether a usable server-level API key exists."""
        return bool(self.get_server_config().api_key.strip())


class ApplicationStorage:
    """Own top-level data directories and shared stores."""

    def __init__(self, data_dir: Path | str = '.elfctf') -> None:
        """Create application storage rooted at `data_dir`.

        Args:
            data_dir: Directory for database, task, and config files.
        """
        self._data_dir = Path(data_dir).expanduser().resolve()
        self._data_dir.mkdir(parents=True, exist_ok=True)
        self.config = JsonConfigStore(self._data_dir / 'config.json')

    def get_data_dir(self) -> Path:
        """Return the root application data directory."""
        return self._data_dir

    def get_tasks_dir(self) -> Path:
        """Return the directory that stores task workspaces and metadata."""
        path = self._data_dir / 'tasks'
        path.mkdir(parents=True, exist_ok=True)
        return path

    def get_database_path(self) -> Path:
        """Return the SQLite database path for authentication."""
        return self._data_dir / 'auth.sqlite3'
