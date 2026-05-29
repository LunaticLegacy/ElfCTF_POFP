import sys
import os
from pathlib import Path

# Add project root to Python path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

import asyncio
from re import I

from modules.llmfetcher import (
   Agent, LLMFetcher, AgentSwarm, create_shell_tools,
)
from core.ctf_tools import create_ctf_tools, create_knowledge_tools
from core.ctf_obscura_tools import create_obscura_tools

from core.ctf_module import (
    classify_ctf_challenge, enrich_prompt_with_ctf_skills
)


SYS_PROMPT: str = f"""
You are a CTF reverse-engineering agent. Your task is to solve RE challenges by building verified executable models, not by guessing strings.

Your target is located in: `{Path.cwd()}/workspace`.

You must follow a strict reverse-engineering loop:

observe -> hypothesize -> model -> verify -> debug -> iterate -> solve

You are working on a spreadsheet-based RE challenge. Treat the spreadsheet as a program. Treat formulas as code. Treat cells as state. Treat repeated formulas, self-references, ROW, INDEX, IF, IFS, CHOOSE, SWITCH, BITAND, BITOR, BITXOR, BITLSHIFT, BITRSHIFT, HEX2DEC, CHAR, and volatile recalculation behavior as possible virtual-machine semantics.

After solving, save the flag into `flag.txt` in your workspace.

IMPORTANT: When you need knowledge about RE techniques or strategies:
1. First use `search_knowledge` to find relevant documents by query
2. Then use `read_knowledge_full` with the path from search results to get complete content
3. Use this knowledge to guide your reverse engineering approach
"""

DEMAND: str = """
Solve the attached CTF challenge.
"""

async def main():
    workspace_root = Path.cwd() / "workspace"
    skills_root = Path.cwd() / "ctf-skills"
    
    # Initialize knowledge base
    kb = KnowledgeBase()
    print(f"Knowledge base available: {kb.available()}")
    
    classification = classify_ctf_challenge(
        DEMAND,
        files=["challenge.xlsx"],
    )
    system_prompt = enrich_prompt_with_ctf_skills(
        SYS_PROMPT,
        skills_root,
        classification,
    )
    print(
        "CTF skill routing: "
        f"{classification.category} -> {classification.task_type}; "
        f"loaded {', '.join(classification.skill_ids)}"
    )

    fetcher = LLMFetcher(
        api_url="https://api.deepseek.com", 
        api_key=os.getenv("DEEPSEEK_API_KEY"),
        model="deepseek-v4-flash",
        timeout=180.0
    )

    shell_tools = create_shell_tools()
    ctf_tools = create_ctf_tools(workspace_root)
    obscura_tools = create_obscura_tools()
    knowledge_tools = create_knowledge_tools(kb)  # Add knowledge tools

    tools = shell_tools + ctf_tools + obscura_tools + knowledge_tools

    ctfswarm: AgentSwarm = AgentSwarm(
        fetcher,
        max_concurrency=8
    )

    agent = Agent(
        llm_handler=fetcher,
        system_prompt=system_prompt,
        tools=tools,
        provider="openai",
    )

    # 上下文管理使用示例
    # ------------------------------------------------------------------
    
    # 检查上下文数量
    print(f"Initial context count: {agent.get_context_count()}")
    
    # 执行一些对话
    msg = await agent.run_agent_round(
        DEMAND, 
        verbose_info=True,
        max_context_size=262144,
        max_turns=9999999
    )
    
    print(f"\nAfter first call, context count: {agent.get_context_count()}")
    
    # 对话历史
    history = await agent.get_conversation_history()
    print(f"History: {history}")
    
    # 格式化摘要
    summary = await agent.get_conversation_summary()
    print(f"\nConversation Summary:\n{summary}")
    
    # 检查：从重要对话创建记忆
    if agent.get_context_count() > 0:
        memory = await agent.create_memory([0])  # Summarize first conversation
        if memory:
            print(f"\nCreated memory: {memory}")
    
    # 查看所有记忆
    memories = agent.get_memories()
    print(f"\nTotal memories: {len(memories)}")
    
    # Optional: 手动压缩
    if agent.get_context_count() > 10:
        compressed = await agent.compress_history()
        print(f"Compression result: {compressed}")
        print(f"Context count after compression: {agent.get_context_count()}")
    
    # Optional: 清除记忆
    # agent.clear_memories()

    print()

if __name__ == "__main__":
    asyncio.run(main())
    pass
