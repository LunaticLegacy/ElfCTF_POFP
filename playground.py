import os
import asyncio
from modules.llmfetcher import LLMFetcher, LLMBackendConfig

async def main():
    backend = [LLMBackendConfig(
        "1",
        provider="openai",
        api_key=str(os.environ.get("DEEPSEEK_API_KEY")),
        api_url="https://api.deepseek.com",
        timeout=120.0,
        model="deepseek-v4-flash"
        )]

    fetcher = LLMFetcher(backends=backend)

    msg = await fetcher.fetch("Hello world!")

    print(msg)

asyncio.run(main())

