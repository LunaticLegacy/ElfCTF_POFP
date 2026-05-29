"""LLM token usage recording, aggregation, and persistence for CTF workflows."""

from __future__ import annotations

import threading
import time
from dataclasses import asdict
from typing import Any, Dict, List, Optional

from modules.llmfetcher import LLMFetcher
from modules.llmfetcher.llm_types import LLMOutput, TokenUsage


def _token_usage_dict(usage: TokenUsage) -> Dict[str, Any]:
    """Serialize a TokenUsage into the flat dict format used in aggregates.

    The 'cache_hit_rate' is computed from input_tokens and cached_tokens
    rather than stored as an independent counter.
    """
    d = asdict(usage)
    d["cache_hit_rate"] = usage.cache_hit_rate
    return d


def _merge_totals(totals: Dict[str, Any], usage: Dict[str, Any]) -> None:
    for key in ("input_tokens", "output_tokens", "total_tokens", "cached_tokens", "reasoning_tokens"):
        totals[key] = totals.get(key, 0) + usage.get(key, 0)


def _refresh_cache_hit_rate(totals: Dict[str, Any]) -> None:
    cached = totals.get("cached_tokens", 0) or 0
    total = totals.get("input_tokens", 0) or 0
    totals["cache_hit_rate"] = round(min(100.0, cached / max(1, total) * 100.0), 1)


def _merge_bucket(buckets: Dict[str, Dict[str, Any]], key: str, usage: Dict[str, Any]) -> None:
    bucket = buckets.setdefault(key, _empty_totals())
    _merge_totals(bucket, usage)


def _empty_totals() -> Dict[str, Any]:
    return {
        "input_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 0,
        "cached_tokens": 0,
        "reasoning_tokens": 0,
        "cache_hit_rate": 0.0,
    }


def _normalize_totals(value: object) -> Dict[str, Any]:
    """Restore a totals dict from a persisted snapshot, filling missing keys."""
    totals = _empty_totals()
    if isinstance(value, dict):
        for key in totals:
            raw = value.get(key)
            if key == "cache_hit_rate":
                if isinstance(raw, (int, float)):
                    totals[key] = round(float(raw), 1)
            elif isinstance(raw, (int, float)):
                totals[key] = int(raw)
    return totals


def _normalize_bucket_map(value: object) -> Dict[str, Dict[str, Any]]:
    if isinstance(value, dict):
        return {str(k): _normalize_totals(v) for k, v in value.items()}
    return {}


class TaskTokenUsageTracker:
    """Aggregate LLM token usage for one persisted task.

    Args:
        task_id: Task receiving the usage artifact.
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
        self._lock = threading.RLock()

        source = initial_snapshot if isinstance(initial_snapshot, dict) else {}
        self.calls: List[Dict[str, Any]] = (
            list(source.get("calls", [])) if isinstance(source.get("calls"), list) else []
        )
        self.totals = _normalize_totals(source.get("totals"))
        self.by_model = _normalize_bucket_map(source.get("by_model"))
        self.by_backend = _normalize_bucket_map(source.get("by_backend"))
        self.started_at = float(source.get("started_at", time.time()) or time.time())
        self.updated_at = float(source.get("updated_at", self.started_at) or self.started_at)
        _refresh_cache_hit_rate(self.totals)
        for bucket in self.by_model.values():
            _refresh_cache_hit_rate(bucket)
        for bucket in self.by_backend.values():
            _refresh_cache_hit_rate(bucket)

    def record(self, output: LLMOutput, *, prompt_preview: str = "") -> Dict[str, Any]:
        """Record one model response and persist the updated usage artifact.

        Args:
            output: Normalized model response — its ``usage`` field is a
                ``TokenUsage`` whose fields are already normalised by the
                LLM handler.
            prompt_preview: Short request text preview used to identify calls.

        Returns:
            The updated JSON-ready usage snapshot.
        """
        # The handler has already normalised provider-specific fields into a
        # stable ``TokenUsage``.  Serialise it once for both the call record
        # and the aggregate counters.
        call_usage = _token_usage_dict(output.usage)

        call_record: Dict[str, Any] = {
            "index": len(self.calls) + 1,
            "provider": output.provider,
            "backend": output.backend_name,
            "model": output.model,
            "prompt_preview": prompt_preview[:160],
            "usage": call_usage,
            "created_at": time.time(),
        }

        with self._lock:
            self.calls.append(call_record)
            _merge_totals(self.totals, call_usage)
            _merge_bucket(self.by_model, output.model or "unknown", call_usage)
            backend_key = f'{output.provider or "unknown"}:{output.backend_name or "unknown"}'
            _merge_bucket(self.by_backend, backend_key, call_usage)
            _refresh_cache_hit_rate(self.totals)
            for bucket in self.by_model.values():
                _refresh_cache_hit_rate(bucket)
            for bucket in self.by_backend.values():
                _refresh_cache_hit_rate(bucket)
            self.updated_at = time.time()

            snapshot = self.snapshot()
            self.task_manager.set_task_artifact(self.task_id, "token_usage", snapshot)
            return snapshot

    def snapshot(self) -> Dict[str, Any]:
        """Return the current token usage aggregate as a JSON-ready dictionary."""
        return {
            "totals": dict(self.totals),
            "by_model": {k: dict(v) for k, v in self.by_model.items()},
            "by_backend": {k: dict(v) for k, v in self.by_backend.items()},
            "calls": [dict(c) for c in self.calls],
            "call_count": len(self.calls),
            "started_at": self.started_at,
            "updated_at": self.updated_at,
        }


class UsageTrackingFetcher:
    """Wraps an LLMFetcher to record every successful fetch's token usage."""

    def __init__(self, fetcher: LLMFetcher, tracker: TaskTokenUsageTracker) -> None:
        self._fetcher = fetcher
        self._tracker = tracker

    @property
    def provider(self) -> str:
        return self._fetcher.provider

    @property
    def fallback_order(self):
        return self._fetcher.fallback_order

    async def fetch(self, *args, **kwargs) -> LLMOutput:
        output = await self._fetcher.fetch(*args, **kwargs)
        prompt_preview = (kwargs.get("msg") or (args[0] if args else "") or "")[:80]
        self._tracker.record(output, prompt_preview=prompt_preview)
        return output

    def __getattr__(self, name: str):
        return getattr(self._fetcher, name)
