from __future__ import annotations

import unittest

from modules.llmfetcher.llm_context import LLMContextHandler
from modules.llmfetcher.llm_types import LLMContext, LLMOutput, ToolExecutionRecord


class SemanticContextFetcher:
    fallback_order = ["semantic-test"]

    async def fetch(self, msg: str, **kwargs):  # noqa: ANN001
        system_prompt = str(kwargs.get("system_prompt", ""))
        if "Tool result:" in system_prompt or "Tool name:" in system_prompt:
            return LLMOutput(
                content='{"summary":"tool summary","facts":["alpha target discovered"],"status":"success","tags":["alpha_target"]}',
                provider="test",
                backend_name="semantic",
                model="dummy",
            )
        return LLMOutput(
            content="compressed summary",
            provider="test",
            backend_name="semantic",
            model="dummy",
        )


class LLMFetcherContextSemanticTest(unittest.IsolatedAsyncioTestCase):
    async def test_export_import_preserves_reasoning_tool_facts_and_compacted_sources(self) -> None:
        fetcher = SemanticContextFetcher()
        handler = LLMContextHandler(
            llm_handler=fetcher,
            enable_memory=True,
            enable_tagging=False,
            context_mode="graph",
        )

        await handler.add_context(
            LLMContext(
                role="assistant",
                content="Visible answer",
                content_reasoning="Use the discovered endpoint.",
                tool_result_facts=["endpoint=/api/x"],
            )
        )
        await handler.compress_context([1])
        await handler.compress_tool_result(
            ToolExecutionRecord(
                name="fetch",
                arguments={"path": "/api/x"},
                result="raw alpha output",
            ),
            tool_call_id="call-1",
        )

        snapshot = handler.export_context()
        restored = LLMContextHandler(
            llm_handler=fetcher,
            enable_memory=True,
            enable_tagging=False,
            context_mode="linear",
        )
        restored.import_context(snapshot)

        self.assertEqual(restored.context_mode, "graph")
        self.assertEqual(restored.active_ids, [2])
        self.assertEqual(restored.now_context_id, 3)

        restored_raw = restored.context_timeline_dict[1]
        self.assertIsInstance(restored_raw, LLMContext)
        self.assertEqual(restored_raw.content_reasoning, "Use the discovered endpoint.")
        self.assertEqual(restored_raw.tool_result_facts, ["endpoint=/api/x"])

        restored_compacted = restored.context_timeline_dict[2]
        self.assertEqual(restored_compacted.source_timeline, [1])
        self.assertEqual(restored.get_descendant_ids(2), {1})
        self.assertEqual(len(restored.tool_result_facts), 1)
        self.assertEqual(restored.tool_result_facts[0].tool_name, "fetch")
        self.assertEqual(restored.tool_result_facts[0].summary, "tool summary")

        exported = snapshot.to_dict()
        self.assertIn("contexts", exported)
        self.assertIn("tool_result_facts", exported)

    async def test_semantic_search_uses_tool_result_facts_and_reasoning_text(self) -> None:
        fetcher = SemanticContextFetcher()
        handler = LLMContextHandler(
            llm_handler=fetcher,
            enable_memory=True,
            enable_tagging=False,
            context_mode="graph",
        )

        await handler.add_context(
            LLMContext(
                role="assistant",
                content="",
                content_reasoning="",
                tool_result_facts=["alpha target discovered by tool"],
            )
        )
        await handler.add_context(
            LLMContext(
                role="assistant",
                content="completely unrelated note",
            )
        )

        hits = await handler.find_context_by_summary(
            "alpha target",
            blur=True,
            include_raw=True,
            include_compacted=True,
        )

        self.assertIsNotNone(hits)
        assert hits is not None
        self.assertEqual(hits[0].timeline, 1)

        keyword_hits = await handler.search_context_by_keyword("alpha target")
        self.assertIsNotNone(keyword_hits)
        assert keyword_hits is not None
        self.assertEqual(keyword_hits.items[0].timeline, 1)


if __name__ == "__main__":
    unittest.main()
