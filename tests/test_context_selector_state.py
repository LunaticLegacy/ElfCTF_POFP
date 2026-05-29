from __future__ import annotations

import unittest

from modules.llmfetcher.agent import Agent
from modules.llmfetcher.llm_types import LLMContext, LLMOutput


class SelectorStateFetcher:
    provider = "test"
    fallback_order = ["dummy"]

    def __init__(self) -> None:
        self.prompts: list[str] = []

    async def fetch(self, msg: str, **kwargs):  # noqa: ANN001
        self.prompts.append(msg)
        return LLMOutput(
            content='{"items": [{"id": 1, "view": "raw", "reason": "state relevant"}]}',
            provider="test",
            backend_name="selector",
            model="dummy",
        )


class ContextSelectorStateTest(unittest.IsolatedAsyncioTestCase):
    async def test_context_selector_prompt_and_retrieval_receive_agent_state(self) -> None:
        fetcher = SelectorStateFetcher()
        agent = Agent(
            llm_handler=fetcher,
            system_prompt="system",
            context_mode="graph",
            context_selection_interval=1,
            context_selection_min_active_items=1,
            context_selection_min_active_chars=0,
        )
        agent.context_manager.enable_tagging = False
        await agent.context_manager.add_context(
            LLMContext(
                role="assistant",
                content="candidate context",
                abstract_msg="candidate context summary",
            )
        )
        agent.context_manager.set_active_ids([1])
        agent.agent_state.phase = "exploitation"
        agent.agent_state.summary = "Need to reuse the discovered endpoint."
        agent.agent_state.next_actions.append("Call the known endpoint again.")

        captured_state_text: list[str | None] = []

        async def retrieve(**kwargs):  # noqa: ANN001
            captured_state_text.append(kwargs.get("agent_state_text"))
            return [1]

        agent._retrieve_context_candidates_for_task = retrieve  # type: ignore[method-assign]

        selected = await agent._maybe_run_context_selection(
            LLMContext(role="user", content="continue"),
            turn=1,
            temperature=0.0,
        )

        self.assertEqual(selected, [1])
        self.assertEqual(len(captured_state_text), 1)
        self.assertIn("Phase: exploitation", captured_state_text[0] or "")
        self.assertIn("Need to reuse the discovered endpoint.", fetcher.prompts[0])
        self.assertIn("Call the known endpoint again.", fetcher.prompts[0])


if __name__ == "__main__":
    unittest.main()
