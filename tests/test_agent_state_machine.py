from __future__ import annotations

import json
import unittest

from modules.llmfetcher.agent import AGENT_STATE_MACHINE_SYSTEM_PROMPT, Agent
from modules.llmfetcher.prompt import TOOL_RESULT_FACT_PROMPT
from modules.llmfetcher.llm_types import LLMBackendConfig, LLMOutput, LLMToolCall, Tool


class StateAwareFetcher:
    provider = 'test'
    fallback_order = ['dummy']

    def __init__(self) -> None:
        self.main_calls = 0
        self.state_calls = []
        self.tool_fact_calls = []

    async def fetch(self, msg: str, **kwargs):
        if kwargs.get('system_prompt') == AGENT_STATE_MACHINE_SYSTEM_PROMPT:
            payload = json.loads(msg)
            self.state_calls.append(payload)
            tool_result_facts = payload['event'].get('tool_result_facts', [])
            observed_facts = ['state subagent saw the tool result']
            for item in tool_result_facts:
                if isinstance(item, dict):
                    observed_facts.extend(str(fact) for fact in item.get('facts', []) if str(fact).strip())
            return LLMOutput(
                content=json.dumps(
                    {
                        'phase': 'reasoning',
                        'summary': 'state manager observed the turn',
                        'facts': observed_facts,
                        'next_actions': ['inspect the next concrete artifact'],
                        'transition': 'state subagent accepted turn event',
                    }
                ),
                provider='test',
                backend_name='state',
                model='dummy',
            )

        system_prompt = kwargs.get('system_prompt', '')
        if isinstance(system_prompt, str) and system_prompt.startswith(TOOL_RESULT_FACT_PROMPT.splitlines()[0]):
            self.tool_fact_calls.append(system_prompt)
            return LLMOutput(
                content=json.dumps(
                    {
                        'summary': 'the echo tool returned the expected value',
                        'facts': ['echo returned seen abc'],
                        'tags': ['echo_result'],
                        'status': 'success',
                    }
                ),
                provider='test',
                backend_name='toolfact',
                model='dummy',
            )

        self.main_calls += 1
        if self.main_calls == 1:
            return LLMOutput(
                content='I will inspect with a tool.',
                provider='test',
                backend_name='main',
                model='dummy',
                reasoning_content='I am thinking about the tool result.',
                tool_calls=[LLMToolCall(name='echo', arguments={'value': 'abc'})],
            )
        return LLMOutput(
            content='Finished.',
            provider='test',
            backend_name='main',
            model='dummy',
        )


class AgentStateMachineTest(unittest.IsolatedAsyncioTestCase):
    async def test_agent_state_updates_are_delegated_to_state_subagent(self) -> None:
        async def echo(value: str = '') -> str:
            return f'seen {value}'

        fetcher = StateAwareFetcher()
        agent = Agent(
            llm_handler=fetcher,
            system_prompt='main agent prompt',
            tools=[
                Tool(
                    name='echo',
                    description='Echo a value.',
                    parameters={'type': 'object', 'properties': {'value': {'type': 'string'}}},
                    handler=echo,
                )
            ],
        )

        result = await agent.run_agent_round('solve task', max_turns=3)

        self.assertEqual(result, 'Finished.')
        self.assertGreaterEqual(len(fetcher.state_calls), 1)
        self.assertEqual(agent.agent_state.phase, 'reasoning')
        self.assertIn('state subagent saw the tool result', agent.agent_state.facts)
        self.assertNotIn('result', fetcher.state_calls[0]['event']['tool_records'][0])
        self.assertEqual(fetcher.state_calls[0]['event']['tool_result_facts'][0]['tool_name'], 'echo')
        self.assertNotIn('evidence', fetcher.state_calls[0]['event']['tool_result_facts'][0])
        assistant_contexts = [
            entry
            for entry in agent.llm_context_handler.context_timeline_dict.values()
            if getattr(entry, 'role', None) == 'assistant'
        ]
        self.assertTrue(any(getattr(entry, 'content_reasoning', None) == 'I am thinking about the tool result.' for entry in assistant_contexts))

    async def test_tool_results_are_compressed_into_facts_in_graph_mode(self) -> None:
        async def echo(value: str = '') -> str:
            return f'seen {value}'

        fetcher = StateAwareFetcher()
        agent = Agent(
            llm_handler=fetcher,
            system_prompt='main agent prompt',
            tools=[
                Tool(
                    name='echo',
                    description='Echo a value.',
                    parameters={'type': 'object', 'properties': {'value': {'type': 'string'}}},
                    handler=echo,
                )
            ],
            context_mode='graph',
        )

        result = await agent.run_agent_round('solve task', max_turns=3)

        self.assertEqual(result, 'Finished.')
        self.assertEqual(len(fetcher.tool_fact_calls), 1)
        self.assertEqual(len(agent.llm_context_handler.tool_result_facts), 1)
        self.assertEqual(agent.llm_context_handler.tool_result_facts[0].summary, 'the echo tool returned the expected value')
        self.assertIn('echo returned seen abc', agent.agent_state.facts)
        tool_contexts = [
            entry
            for entry in agent.llm_context_handler.context_timeline_dict.values()
            if getattr(entry, 'role', None) == 'tool'
        ]
        self.assertTrue(tool_contexts)
        self.assertTrue(all(entry.content != 'seen abc' for entry in tool_contexts))
        self.assertTrue(all(getattr(entry, 'tool_result_facts', None) for entry in tool_contexts))


class StreamReasoningFetcher:
    provider = 'test'
    fallback_order = ['dummy']

    def __init__(self) -> None:
        self.state_calls = []
        self.default_backend_config = LLMBackendConfig(
            name='stream',
            provider='test',
            model='dummy',
        )

    async def fetch(self, msg: str, **kwargs):
        if kwargs.get('system_prompt') == AGENT_STATE_MACHINE_SYSTEM_PROMPT:
            self.state_calls.append(json.loads(msg))
            return LLMOutput(
                content=json.dumps(
                    {
                        'phase': 'answering',
                        'summary': 'state updated after streaming turn',
                        'facts': ['streamed reasoning was captured'],
                        'transition': 'state subagent accepted streamed turn',
                    }
                ),
                provider='test',
                backend_name='state',
                model='dummy',
            )
        return LLMOutput(
            content='Final streamed answer.',
            provider='test',
            backend_name='main',
            model='dummy',
        )

    async def fetch_stream(self, msg: str, **kwargs):
        yield '<think>\nstream reasoning\n</think>\n'
        yield 'Final streamed answer.'


class AgentStreamReasoningTest(unittest.IsolatedAsyncioTestCase):
    async def test_stream_reasoning_is_split_into_context_reasoning(self) -> None:
        fetcher = StreamReasoningFetcher()
        agent = Agent(
            llm_handler=fetcher,
            system_prompt='main agent prompt',
        )

        collected: list[str] = []
        result = await agent.run_agent_round(
            'stream test',
            max_turns=1,
            streamer=collected.append,
        )

        self.assertEqual(result, 'Final streamed answer.')
        assistant_contexts = [
            entry
            for entry in agent.llm_context_handler.context_timeline_dict.values()
            if getattr(entry, 'role', None) == 'assistant'
        ]
        self.assertTrue(any(getattr(entry, 'content_reasoning', None) == 'stream reasoning' for entry in assistant_contexts))
        self.assertTrue(any('Final streamed answer.' in chunk for chunk in collected))


if __name__ == '__main__':
    unittest.main()
