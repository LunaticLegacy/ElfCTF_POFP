from __future__ import annotations

import unittest

from modules.llmfetcher.handlers.anthropic import AnthropicHandler
from modules.llmfetcher.handlers.openai_compat import OpenAICompatibleHandler
from modules.llmfetcher.tool_call_adapter import parse_xml_tool_calls


class _OpenAICompatibleHandlerStub(OpenAICompatibleHandler):
    def create_completion(self, *args, **kwargs):  # pragma: no cover - not used in this test
        raise NotImplementedError


class _AnthropicHandlerStub(AnthropicHandler):
    def create_completion(self, *args, **kwargs):  # pragma: no cover - not used in this test
        raise NotImplementedError


class StreamToolCallParsingTest(unittest.TestCase):
    def test_openai_stream_emits_parseable_tool_call_block(self) -> None:
        handler = _OpenAICompatibleHandlerStub.__new__(_OpenAICompatibleHandlerStub)

        chunks = [
            {"choices": [{"delta": {"content": "I will use a tool."}}]},
            {
                "choices": [
                    {
                        "delta": {
                            "tool_calls": [
                                {
                                    "index": 0,
                                    "id": "call_123",
                                    "function": {
                                        "name": "echo",
                                        "arguments": '{"value":"ab',
                                    },
                                }
                            ]
                        }
                    }
                ]
            },
            {
                "choices": [
                    {
                        "delta": {
                            "tool_calls": [
                                {
                                    "index": 0,
                                    "function": {
                                        "arguments": 'c"}',
                                    },
                                }
                            ]
                        }
                    }
                ]
            },
        ]

        rendered = "".join(handler.iter_stream_text(chunks, output_reasoning=False))
        calls = parse_xml_tool_calls(rendered)

        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0].tool_name, "echo")
        self.assertEqual(calls[0].call_id, "call_123")
        self.assertEqual(calls[0].arguments, {"value": "abc"})

    def test_anthropic_stream_emits_parseable_tool_call_block(self) -> None:
        handler = _AnthropicHandlerStub.__new__(_AnthropicHandlerStub)

        chunks = [
            {
                "type": "content_block_start",
                "index": 0,
                "content_block": {
                    "type": "text",
                    "text": "I will use a tool.",
                },
            },
            {
                "type": "content_block_start",
                "index": 1,
                "content_block": {
                    "type": "tool_use",
                    "id": "toolu_123",
                    "name": "echo",
                    "input": {},
                },
            },
            {
                "type": "content_block_delta",
                "index": 1,
                "delta": {
                    "type": "input_json_delta",
                    "partial_json": '{"value":"ab',
                },
            },
            {
                "type": "content_block_delta",
                "index": 1,
                "delta": {
                    "type": "input_json_delta",
                    "partial_json": 'c"}',
                },
            },
        ]

        rendered = "".join(handler.iter_stream_text(chunks, output_reasoning=False))
        calls = parse_xml_tool_calls(rendered)

        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0].tool_name, "echo")
        self.assertEqual(calls[0].call_id, "toolu_123")
        self.assertEqual(calls[0].arguments, {"value": "abc"})


if __name__ == "__main__":
    unittest.main()
