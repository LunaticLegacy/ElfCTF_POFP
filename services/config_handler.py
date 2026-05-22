"""Persistent LLM runtime configuration handling."""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

from core.models import RuntimeConfig


ConfigUpdatePayload = RuntimeConfig


class ConfigHandler:
    """Store and resolve per-user LLM configuration."""

    def __init__(self, storage: Any) -> None:
        """Create a config handler backed by application storage.

        Args:
            storage: `ApplicationStorage` instance with a config store.
        """
        self._storage = storage

    def get_user_config(self, user_id: str) -> RuntimeConfig:
        """Return the saved config for a user or an empty editable config.

        Args:
            user_id: Authenticated user id.

        Returns:
            User-specific runtime configuration.
        """
        return self._storage.config.get_user_config(user_id)

    def get_effective_config(self, user_id: str) -> RuntimeConfig:
        """Return user config merged with server fallback values.

        Args:
            user_id: Authenticated user id.

        Returns:
            Runtime configuration ready for execution.
        """
        return self._storage.config.get_effective_config(user_id)

    def save_config(self, payload: ConfigUpdatePayload, user_id: str) -> RuntimeConfig:
        """Persist a user runtime configuration.

        Args:
            payload: Normalized API update payload.
            user_id: Authenticated user id.

        Returns:
            The saved user configuration.
        """
        # Store a copy so later caller mutation cannot affect persisted state.
        config = RuntimeConfig(**payload.to_dict()) if hasattr(payload, 'to_dict') else RuntimeConfig(**asdict(payload))
        self._storage.config.save_user_config(user_id, config)
        return config
