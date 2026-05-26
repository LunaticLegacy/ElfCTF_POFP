import argparse
import asyncio
import os
from typing import List, Optional

from modules.llmfetcher.llm_fetcher import LLMFetcher
from modules.llmfetcher.llm_types import LLMBackendConfig, LLMContext, LLMOutput


DEFAULT_SYSTEM_PROMPT = (
    "You are a concise assistant inside a local llmfetcher playground. "
    "Answer clearly and keep formatting lightweight."
)

DEFAULT_MESSAGE = "请简单介绍一下你自己，然后给我一句适合调试流式输出的短句。"

SEEDED_HISTORY: list[LLMContext] = [
    LLMContext(role="user", content="我们现在在做 llmfetcher 的 playground 手工调试。"),
    LLMContext(role="assistant", content="收到，我会尽量输出稳定、简洁、便于观察的结果。"),
]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Manual playground for llmfetcher.fetch() and fetch_stream()."
    )
    parser.add_argument(
        "message",
        nargs="?",
        default=DEFAULT_MESSAGE,
        help="Prompt sent as the current user message.",
    )
    parser.add_argument(
        "--stream",
        action="store_true",
        help="Use fetch_stream() instead of fetch().",
    )
    parser.add_argument(
        "--reasoning",
        action="store_true",
        help="When streaming, also output reasoning chunks if the backend supports them.",
    )
    parser.add_argument(
        "--system",
        default=DEFAULT_SYSTEM_PROMPT,
        help="System prompt to send with the request.",
    )
    parser.add_argument(
        "--backend-name",
        default="deepseek-primary",
        help="Registered backend name.",
    )
    parser.add_argument(
        "--provider",
        default="openai",
        help="Provider name understood by llmfetcher handlers.",
    )
    parser.add_argument(
        "--model",
        default="deepseek-chat",
        help="Model name for the backend config.",
    )
    parser.add_argument(
        "--api-url",
        default="https://api.deepseek.com",
        help="Base URL for the backend.",
    )
    parser.add_argument(
        "--api-key-env",
        default="DEEPSEEK_API_KEY",
        help="Environment variable name that stores the API key.",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=0.4,
        help="Sampling temperature.",
    )
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=1024,
        help="Max completion tokens.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=120.0,
        help="Backend timeout in seconds.",
    )
    parser.add_argument(
        "--max-retries",
        type=int,
        default=0,
        help="Timeout retry count for the backend.",
    )
    parser.add_argument(
        "--no-history",
        action="store_true",
        help="Do not send the small seeded history window.",
    )
    parser.add_argument(
        "--request-timeout",
        type=float,
        default=None,
        help="Optional hard timeout for the whole playground request.",
    )
    return parser


def build_fetcher(args: argparse.Namespace) -> LLMFetcher:
    api_key = os.environ.get(args.api_key_env)
    if not api_key and args.provider != "openvino":
        raise RuntimeError(
            f"Environment variable {args.api_key_env!r} is not set, cannot build backend."
        )

    backend = LLMBackendConfig(
        name=args.backend_name,
        provider=args.provider,
        model=args.model,
        api_key=api_key or "",
        api_url=args.api_url,
        timeout=args.timeout,
        max_retries=args.max_retries,
    )
    return LLMFetcher(
        backends=[backend],
        default_backend=args.backend_name,
    )


def build_prev_messages(args: argparse.Namespace) -> Optional[List[LLMContext]]:
    if args.no_history:
        return None
    return list(SEEDED_HISTORY)


def print_non_stream_result(output: LLMOutput) -> None:
    print("== Response ==")
    print(output.text)

    if output.reasoning_content:
        print("\n== Reasoning ==")
        print(output.reasoning_content)

    if output.tool_calls:
        print("\n== Tool Calls ==")
        for tool_call in output.tool_calls:
            print(tool_call.to_execution_format())

    if output.usage:
        print("\n== Usage ==")
        print(output.usage)

    print("\n== Metadata ==")
    print(
        {
            "provider": output.provider,
            "backend_name": output.backend_name,
            "model": output.model,
            "role": output.role,
            "stop_reason": output.stop_reason,
        }
    )


def print_request_summary(args: argparse.Namespace) -> None:
    print("== Request Config ==")
    print(
        {
            "backend_name": args.backend_name,
            "provider": args.provider,
            "model": args.model,
            "api_url": args.api_url,
            "stream": args.stream,
            "reasoning": args.reasoning,
            "temperature": args.temperature,
            "max_tokens": args.max_tokens,
            "backend_timeout": args.timeout,
            "request_timeout": args.request_timeout,
            "history_items": 0 if args.no_history else len(SEEDED_HISTORY),
        }
    )
    print("\n== User Message ==")
    print(args.message)


async def run_non_stream(args: argparse.Namespace, fetcher: LLMFetcher) -> None:
    print("\n== Fetching ==")
    output = await fetcher.fetch(
        msg=args.message,
        system_prompt=args.system,
        temperature=args.temperature,
        max_tokens=args.max_tokens,
        prev_messages=build_prev_messages(args),
        backend_name=args.backend_name,
    )
    print_non_stream_result(output)


async def run_stream(args: argparse.Namespace, fetcher: LLMFetcher) -> None:
    print("\n== Streaming ==")
    async for chunk in fetcher.fetch_stream(
        msg=args.message,
        prev_messages=build_prev_messages(args),
        system_prompt=args.system,
        temperature=args.temperature,
        max_tokens=args.max_tokens,
        output_reasoning=args.reasoning,
        backend_name=args.backend_name,
    ):
        print(chunk, end="", flush=True)
    print()


async def main() -> None:
    args = build_parser().parse_args()
    fetcher = build_fetcher(args)
    print_request_summary(args)

    runner = run_stream(args, fetcher) if args.stream else run_non_stream(args, fetcher)

    try:
        if args.request_timeout is not None:
            await asyncio.wait_for(runner, timeout=args.request_timeout)
        else:
            await runner
    except asyncio.TimeoutError as exc:
        raise RuntimeError(
            "Playground request exceeded the configured request timeout."
        ) from exc


if __name__ == "__main__":
    asyncio.run(main())
