import asyncio

import sys
from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from modules.llmfetcher import LLMFetcher, LLMBackendConfig, Agent
from modules.llmfetcher.streamers import ThinkColorStreamer
from modules.llmfetcher.tools import create_builtin_tools, create_shell_tools, create_ctf_tools, create_obscura_tools, create_rag_knowledge_tools


PROMPT = """
You are the local PC's worker and working in restricted directory. Once user asked you to do something, find the best tool to do it.
If you find your work is completed, reply a message WITHOUT tool call to finish this.
"""

async def main():
    config = LLMBackendConfig(
        "deepseek",
        "openai",
        "deepseek-v4-flash",
        api_key="sk-735b21f18f784c91a05904821b8c0f27",
        api_url="https://api.deepseek.com",
        timeout=120.0,
        max_retries=3
    )

    fetcher = LLMFetcher(backends=[config])
    streamer = ThinkColorStreamer()
    tools = create_builtin_tools() \
        + create_shell_tools(sandbox_cwd="/home/luna/Documents/codes/python/ElfCTF_POFP/sandbox") \
        + create_obscura_tools() \
        + create_rag_knowledge_tools(knowledge_base="/home/luna/Documents/codes/python/ElfCTF_POFP/sandbox/rag") 

    agent = Agent(
        fetcher, 
        system_prompt=PROMPT, 
        tools=tools, 
        context_mode="graph",
        context_selection_interval=3,
    )

    await agent.run_agent_round(
        msg="Give me an analysis about my hardware ability and compare my PC with other PCs to find its tier.",
        streamer=streamer,
        max_turns=30,
        # verbose_info=True
    )
    
    print()


if __name__ == "__main__":
    asyncio.run(main())
