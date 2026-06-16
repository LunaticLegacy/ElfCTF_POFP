from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from core.ctf_agent_persistence import build_agent_status_snapshot, restore_agent, serialize_agent
from modules.llmfetcher.agent import AgentState
from modules.llmfetcher.llm_context import LLMContext, LLMContextCompacted
from modules.llmfetcher.llm_types import ToolResultFact


class _FakeContextHandler:
    def __init__(self) -> None:
        self.context_mode = 'graph'
        self.retrieval_enabled = True
        self.enable_tagging = False
        self.enable_memory = True
        self.now_context_id = 4
        self.context_timeline_dict = {
            1: LLMContext(
                role='assistant',
                content='visible answer',
                timeline=1,
                content_reasoning='reasoning layer',
                tool_call_info=['{"tool": "echo"}'],
                tool_result_facts=['summary fact one', 'summary fact two'],
                tags=['assistant'],
            ),
            2: LLMContextCompacted(
                timeline=2,
                abstract_msg='compacted summary',
                source=[],
                source_timeline=[1],
                tags=['summary'],
            ),
        }
        self._active_ids = [1, 2]
        self._memories: list[str] = []
        self.memory_list = self._memories
        self._tool_result_facts = [
            ToolResultFact(
                tool_name='echo',
                summary='tool returned a concise summary',
                facts=['fact a', 'fact b'],
                evidence='raw evidence should stay out of the UI snapshot',
                status='success',
                tool_call_id='call-1',
                tags=['echo_result'],
            )
        ]
        self.context_index = SimpleNamespace(index_context=lambda *args, **kwargs: None)
        self.tag_to_context = None

    def clear(self) -> None:
        self.context_timeline_dict.clear()
        self._active_ids = []
        self.now_context_id = 1

    def get_active_ids_window(self) -> list[int]:
        return list(self._active_ids)

    def set_active_ids(self, context_ids: list[int]) -> list[int]:
        self._active_ids = list(context_ids)
        return list(self._active_ids)

    def copy_memories(self) -> list[str]:
        return list(self._memories)

    def get_tool_result_facts(self):
        return tuple(self._tool_result_facts)

    def context_len(self) -> int:
        return 128


class _FakeToolRegistry:
    def __init__(self) -> None:
        self.tools = [object()]


class _FakeAgent:
    def __init__(self) -> None:
        self.context_manager = _FakeContextHandler()
        self.agent_state = AgentState(task='demo')
        self.context_mode = 'graph'
        self.provider = 'test'
        self.tool_registry = _FakeToolRegistry()
        self.memory_list = []

    def _render_agent_state(self) -> str:
        return 'state text'


class AgentPersistenceSnapshotTest(unittest.TestCase):
    def test_status_snapshot_exposes_compact_tool_summaries(self) -> None:
        agent = _FakeAgent()
        with tempfile.TemporaryDirectory() as tmpdir:
            snapshot = build_agent_status_snapshot(agent, Path(tmpdir) / 'agent_state.json')

        self.assertIn('tool_result_facts', snapshot)
        self.assertEqual(snapshot['tool_result_facts'][0]['summary'], 'tool returned a concise summary')
        self.assertNotIn('evidence', snapshot['tool_result_facts'][0])
        self.assertEqual(snapshot['context']['uncompacted'][0]['content_reasoning'], 'reasoning layer')
        self.assertEqual(snapshot['context']['uncompacted'][0]['tool_result_facts'], ['summary fact one', 'summary fact two'])
        self.assertEqual(snapshot['stats']['tool_result_fact_count'], 1)

    def test_serialize_and_restore_preserve_reasoning_and_tool_summaries(self) -> None:
        agent = _FakeAgent()
        payload = serialize_agent(agent)

        restored = _FakeAgent()
        restored.context_manager.clear()
        restore_agent(restored, payload)

        restored_entry = restored.context_manager.context_timeline_dict[1]
        self.assertEqual(restored_entry.content_reasoning, 'reasoning layer')
        self.assertEqual(restored_entry.tool_result_facts, ['summary fact one', 'summary fact two'])
        self.assertEqual(payload['tool_result_facts'][0]['summary'], 'tool returned a concise summary')


if __name__ == '__main__':
    unittest.main()
