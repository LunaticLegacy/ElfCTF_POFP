
import asyncio
from modules.llmfetcher import LLMFetcher, LLMBackendConfig

async def main():
    backend = [LLMBackendConfig(
        "1",
        provider="anthropic",
        api_key="sk-QGnxmhGzyNskaKqLonbpMgzjcmNhKAHIQINyJybricP2DsEA",
        api_url="https://newapi.20200626.xyz/v1",
        timeout=120.0,
        model="gpt-5.3-codex"
        )]

    fetcher = LLMFetcher(backends=backend)

    msg = await fetcher.fetch("Hello world!")

    print(msg)


asyncio.run(main())

