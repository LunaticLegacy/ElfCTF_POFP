from __future__ import annotations

import json
import unittest

from modules.llmfetcher.agent import AGENT_STATE_MACHINE_SYSTEM_PROMPT, Agent
from modules.llmfetcher.llm_types import LLMOutput, LLMToolCall, Tool


class StateAwareFetcher:
    provider = 'test'
    fallback_order = ['dummy']

    def __init__(self) -> None:
        self.main_calls = 0
        self.state_calls = []

    async def fetch(self, msg: str, **kwargs):
        if kwargs.get('system_prompt') == AGENT_STATE_MACHINE_SYSTEM_PROMPT:
            self.state_calls.append(json.loads(msg))
            return LLMOutput(
                content=json.dumps(
                    {
                        'phase': 'reasoning',
                        'summary': 'state manager observed the turn',
                        'facts': ['state subagent saw the tool result'],
                        'next_actions': ['inspect the next concrete artifact'],
                        'transition': 'state subagent accepted turn event',
                    }
                ),
                provider='test',
                backend_name='state',
                model='dummy',
            )

        self.main_calls += 1
        if self.main_calls == 1:
            return LLMOutput(
                content='I will inspect with a tool.',
                provider='test',
                backend_name='main',
                model='dummy',
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
        self.assertEqual(fetcher.state_calls[0]['event']['tool_records'][0]['result'], 'seen abc')


if __name__ == '__main__':
    unittest.main()
