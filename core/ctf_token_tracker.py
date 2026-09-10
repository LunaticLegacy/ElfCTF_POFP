"""CTF-specific persistence adapter for llmfetcher token usage tracking."""

from __future__ import annotations

from typing import Any, Dict, Optional

from modules.llmfetcher.usage import TokenUsageTracker, UsageTrackingFetcher


class TaskTokenUsageTracker(TokenUsageTracker):
    """Persist generic LLM token usage snapshots into one CTF task artifact.

    Args:
        task_id: Task receiving the `token_usage` artifact.
        task_manager: Task manager used to persist usage snapshots.
        initial_snapshot: Optional previous usage artifact to continue from.
    """

    def __init__(
        self,
        task_id: str,
        task_manager,
        *,
        initial_snapshot: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.task_id = task_id
        self.task_manager = task_manager
        super().__init__(
            initial_snapshot=initial_snapshot,
            on_snapshot=self._persist_snapshot,
        )

    def _persist_snapshot(self, snapshot: Dict[str, Any]) -> None:
        """Write one updated usage snapshot to the task artifact store."""
        self.task_manager.set_task_artifact(self.task_id, "token_usage", snapshot)


__all__ = ["TaskTokenUsageTracker", "UsageTrackingFetcher"]
