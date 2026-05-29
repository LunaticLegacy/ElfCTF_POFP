"""Agent serialization, persistence, and frontend snapshot helpers."""

from __future__ import annotations

import json
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, List, Optional

from modules.llmfetcher import Agent
from modules.llmfetcher.agent import AgentState
from modules.llmfetcher.llm_context import LLMContext, LLMContextCompacted
from modules.llmfetcher.llm_types import LLMInfo


def agent_state_file(tasks_dir: Path, task_id: str) -> Path:
    """Return the durable Agent state JSON path for one task."""
    return tasks_dir / task_id / 'agent_state.json'


def serialize_agent(agent: Agent) -> Dict[str, Any]:
    """Serialize an Agent's stable state without runtime-only tool callables."""
    context_handler = agent.context_manager
    entries = []
    for context_id, entry in sorted(context_handler.context_timeline_dict.items()):
        if isinstance(entry, LLMContext):
            entries.append({
                'kind': 'raw',
                'id': context_id,
                'timeline': entry.timeline,
                'role': entry.role,
                'content': entry.content,
                'tool_call_info': list(entry.tool_call_info or []),
                'tags': list(entry.tags or []),
            })
            continue
        if isinstance(entry, LLMContextCompacted):
            entries.append({
                'kind': 'compacted',
                'id': context_id,
                'timeline': entry.timeline,
                'abstract_msg': entry.abstract_msg,
                'source_ids': [source.timeline for source in entry.source],
                'source_timeline': list(entry.source_timeline),
                'tags': list(entry.tags or []),
            })
    return {
        'version': 1,
        'saved_at': time.time(),
        'context_mode': agent.context_mode,
        'agent_state': asdict(agent.agent_state),
        'context': {
            'context_mode': context_handler.context_mode,
            'now_context_id': context_handler.now_context_id,
            'active_ids': context_handler.get_active_ids_window(),
            'entries': entries,
            'memories': context_handler.copy_memories() or [],
        },
    }


def restore_agent(agent: Agent, payload: Dict[str, Any]) -> None:
    """Restore serialized Agent state into an already constructed Agent."""
    state_payload = payload.get('agent_state', {})
    if isinstance(state_payload, dict):
        valid_fields = AgentState.__dataclass_fields__.keys()
        restored_state = AgentState(**{key: state_payload.get(key) for key in valid_fields if key in state_payload})
        for list_field in ('facts', 'hypotheses', 'failed_actions', 'do_not_repeat', 'next_actions', 'transitions'):
            if not isinstance(getattr(restored_state, list_field), list):
                setattr(restored_state, list_field, [])
        if not isinstance(restored_state.artifacts, dict):
            restored_state.artifacts = {}
        if not isinstance(restored_state.credentials, list):
            restored_state.credentials = []
        if not isinstance(restored_state.known_routes, dict):
            restored_state.known_routes = {}
        if not isinstance(restored_state.summary, str):
            restored_state.summary = ''
        agent.agent_state = restored_state

    context_payload = payload.get('context', {})
    if not isinstance(context_payload, dict):
        return
    handler = agent.context_manager
    handler.clear()
    pending_compacted = []
    for item in context_payload.get('entries', []):
        if not isinstance(item, dict):
            continue
        if item.get('kind') == 'raw':
            entry = LLMContext(
                role=str(item.get('role') or 'assistant'),
                content=str(item.get('content') or ''),
                timeline=int(item.get('timeline') or item.get('id') or 0),
                tool_call_info=[str(value) for value in item.get('tool_call_info', [])] if isinstance(item.get('tool_call_info'), list) else [],
                tags=[str(value) for value in item.get('tags', [])] if isinstance(item.get('tags'), list) else [],
            )
            if entry.timeline > 0:
                handler.context_timeline_dict[entry.timeline] = entry
                if handler.retrieval_enabled:
                    handler.context_index.index_context(
                        entry,
                        tag_to_context=handler.tag_to_context if handler.enable_tagging else None,
                    )
        elif item.get('kind') == 'compacted':
            pending_compacted.append(item)

    for item in pending_compacted:
        try:
            timeline = int(item.get('timeline') or item.get('id') or 0)
        except (TypeError, ValueError):
            continue
        source_ids = [int(value) for value in item.get('source_ids', []) if str(value).strip().isdigit()]
        sources: list[LLMInfo] = [
            handler.context_timeline_dict[source_id]
            for source_id in source_ids
            if source_id in handler.context_timeline_dict
        ]
        source_timeline = [int(value) for value in item.get('source_timeline', []) if str(value).strip().isdigit()]
        entry = LLMContextCompacted(
            timeline=timeline,
            abstract_msg=str(item.get('abstract_msg') or ''),
            source=sources,
            source_timeline=source_timeline,
            tags=[str(value) for value in item.get('tags', [])] if isinstance(item.get('tags'), list) else [],
        )
        if entry.timeline > 0:
            handler.context_timeline_dict[entry.timeline] = entry
            if handler.retrieval_enabled:
                handler.context_index.index_context(
                    entry,
                    tag_to_context=handler.tag_to_context if handler.enable_tagging else None,
                )

    handler.now_context_id = int(context_payload.get('now_context_id') or (max(handler.context_timeline_dict.keys(), default=0) + 1))
    handler.set_active_ids([int(value) for value in context_payload.get('active_ids', []) if str(value).strip().isdigit()])
    if handler.enable_memory and isinstance(handler.memory_list, list):
        handler.memory_list[:] = [str(value) for value in context_payload.get('memories', [])]


def persist_agent(state_file: Path, agent: Agent) -> None:
    """Write one Agent's durable state to disk as JSON."""
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text(
        json.dumps(serialize_agent(agent), ensure_ascii=False, indent=2),
        encoding='utf-8',
    )


def load_agent(state_file: Path, agent: Agent) -> bool:
    """Load agent state from disk. Returns True when a payload was applied."""
    if not state_file.is_file():
        return False
    try:
        payload = json.loads(state_file.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return False
    restore_agent(agent, payload)
    return True


def build_agent_context_snapshot(agent: Agent) -> Dict[str, Any]:
    """Build a frontend-facing snapshot of the current Agent context state."""
    context_handler = agent.context_manager

    uncompacted_entries = []
    compacted_entries = []
    active_ids = set(context_handler.get_active_ids_window())
    for context_id, entry in sorted(context_handler.context_timeline_dict.items()):
        if isinstance(entry, LLMContext):
            uncompacted_entries.append({
                'id': context_id,
                'timeline': entry.timeline,
                'active': context_id in active_ids,
                'role': entry.role,
                'content': entry.content,
                'tool_call_info': list(entry.tool_call_info or []),
                'tags': list(entry.tags or []),
            })
            continue
        if isinstance(entry, LLMContextCompacted):
            compacted_entries.append({
                'id': context_id,
                'timeline': entry.timeline,
                'active': context_id in active_ids,
                'abstract_msg': entry.abstract_msg,
                'source_timeline': list(entry.source_timeline),
                'source_count': len(entry.source),
                'tags': list(entry.tags or []),
            })

    memories = context_handler.copy_memories() or []
    memory_entries = [
        {'id': index, 'content': memory}
        for index, memory in enumerate(memories)
    ]

    return {
        'context_mode': context_handler.context_mode,
        'uncompacted': uncompacted_entries,
        'compacted': compacted_entries,
        'memories': memory_entries,
        'stats': {
            'uncompacted_count': len(uncompacted_entries),
            'compacted_count': len(compacted_entries),
            'memory_count': len(memory_entries),
        },
    }


def build_agent_status_snapshot(agent: Agent, state_file: Path) -> Dict[str, Any]:
    """Build the frontend-facing Agent state payload."""
    backfill_agent_state_from_context(agent)
    context_snapshot = build_agent_context_snapshot(agent)
    context_handler = agent.context_manager
    return {
        'state': asdict(agent.agent_state),
        'state_text': agent._render_agent_state(),
        'context': context_snapshot,
        'active_ids': context_handler.get_active_ids_window(),
        'context_length': context_handler.context_len(),
        'context_mode': agent.context_mode,
        'retrieval_enabled': context_handler.retrieval_enabled,
        'next_context_id': context_handler.now_context_id,
        'tool_count': len(agent.tool_registry.tools),
        'persisted': state_file.is_file(),
        'state_file': str(state_file),
        'updated_at': time.time(),
        'stats': {
            **context_snapshot.get('stats', {}),
            'active_count': len(context_handler.get_active_ids_window()),
            'context_length': context_handler.context_len(),
        },
    }


def backfill_agent_state_from_context(agent: Agent) -> None:
    """Populate empty AgentState facts from existing context for older tasks."""
    if agent.agent_state.facts:
        return
    context_handler = agent.context_manager
    for _, entry in sorted(context_handler.context_timeline_dict.items())[-8:]:
        if isinstance(entry, LLMContextCompacted):
            text = entry.abstract_msg
        elif isinstance(entry, LLMContext):
            text = entry.content or " ".join(entry.tool_call_info or [])
        else:
            continue
        summary = " ".join(str(text or "").split())
        if not summary:
            continue
        if len(summary) > 240:
            summary = f"{summary[:237]}..."
        agent.agent_state.facts.append(summary)
    agent.agent_state.facts = agent.agent_state.facts[-24:]
