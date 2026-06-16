import sys
from pathlib import Path
from typing import Iterable

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from modules.llmfetcher.llm_context import ContextIndex, ContextSemanticIndex
from modules.llmfetcher.llm_types import LLMContext, LLMContextCompacted, LLMInfo


def build_mock_contexts() -> list[LLMInfo]:
    """Build a small mixed history of raw and compacted demo contexts.

    Returns:
        A deterministic set of simulated chat and tool-derived context entries
        that can be indexed without requiring a live LLM session.
    """
    raw_contexts: list[LLMContext] = [
        LLMContext(
            role="user",
            content="请帮我分析这台机器的硬件能力，并判断它更接近什么档位。",
            timeline=1,
            abstract_msg="hardware analysis request",
            tags=["hardware", "analysis", "tier"],
        ),
        LLMContext(
            role="assistant",
            content="我会先看 CPU、GPU、内存和存储，再和常见游戏本/工作站做对比。",
            timeline=2,
            abstract_msg="analysis plan",
            content_reasoning="Need a profile before giving a tier comparison.",
            tags=["plan", "hardware", "comparison"],
        ),
        LLMContext(
            role="tool",
            content="lscpu: Intel Core i7-12700H, 14 cores / 20 threads; memory: 32 GiB; GPU: NVIDIA RTX 3060 Laptop GPU.",
            timeline=3,
            abstract_msg="hardware probe result",
            tool_call_info=["shell:lscpu", "shell:free -h", "shell:nvidia-smi"],
            tool_result_facts=[
                "CPU is an i7-12700H class laptop processor.",
                "Memory is 32 GiB.",
                "Discrete GPU is an RTX 3060 Laptop GPU.",
            ],
            tags=["hardware", "cpu", "gpu", "memory"],
        ),
        LLMContext(
            role="assistant",
            content="综合来看，这台机器已经明显高于入门级，适合中高负载开发、逆向和轻度本地推理。",
            timeline=4,
            abstract_msg="tier verdict",
            content_reasoning="The GPU and memory push it above typical office laptops.",
            tags=["verdict", "tier", "performance"],
        ),
        LLMContext(
            role="user",
            content="如果我再加一块更快的 NVMe，日常体验会有什么变化？",
            timeline=5,
            abstract_msg="storage follow-up",
            tags=["storage", "nvme", "experience"],
        ),
    ]

    compacted_contexts: list[LLMContextCompacted] = [
        LLMContextCompacted(
            abstract_msg="This laptop is a strong upper-midrange machine: i7-12700H, 32 GiB RAM, and RTX 3060 Laptop GPU make it suitable for development, analysis, and moderate local inference.",
            source=[raw_contexts[1], raw_contexts[2], raw_contexts[3]],
            source_timeline=[2, 3, 4],
            timeline=6,
            tags=["hardware", "tier", "summary"],
        ),
        LLMContextCompacted(
            abstract_msg="The user wants a practical performance comparison and a follow-up on how storage upgrades affect daily use.",
            source=[raw_contexts[0], raw_contexts[4]],
            source_timeline=[1, 5],
            timeline=7,
            tags=["task", "follow_up", "hardware"],
        ),
    ]

    return [*raw_contexts, *compacted_contexts]


def print_contexts(title: str, contexts: Iterable[LLMInfo]) -> None:
    """Print a compact view of indexed context entries."""
    print(title)
    for context in contexts:
        print(f"  - {context}")
    print()


def test_for_context_index() -> None:
    """Index the mock contexts and demonstrate keyword and semantic lookups."""
    index: ContextIndex = ContextIndex()
    index_sem: ContextSemanticIndex = ContextSemanticIndex(
        embedding_model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    )

    contexts = build_mock_contexts()
    for context in contexts:
        index.index_context(context)
        index_sem.index_context(context)

    print_contexts("Indexed contexts:", contexts)

    print("Raw ids:", sorted(index.raw_ids))
    print("Compacted ids:", sorted(index.compacted_ids))
    print("Text postings keys (sample):", sorted(list(index.text_postings.keys()))[:20])
    print("Normalized text by id:")
    for context_id in sorted(index.normalized_text_by_id):
        print(f"  {context_id}: {index.normalized_text_by_id[context_id]}")
    print()

    keyword_query = "gpu"
    semantic_query = "哪台机器更适合本地推理和开发"

    print(f'Keyword candidates for "{keyword_query}":', sorted(index.candidate_text_ids(keyword_query)))
    print('Keyword candidates for "nvme":', sorted(index.candidate_text_ids("nvme")))
    print(f'Tag candidates for ["hardware", "tier"]:', sorted(index.candidate_tag_ids(["hardware", "tier"])))
    print(
        f'Semantic ids for "{semantic_query}":',
        index_sem.search(semantic_query, top_k=5, include_raw=True, include_compacted=True),
    )
    print()

    keyword_hits = index.candidate_text_ids("hardware analysis")
    if keyword_hits:
        print("Keyword hit documents:")
        for context_id in sorted(keyword_hits):
            print(f"  - {context_id}: {index.normalized_text_by_id.get(context_id, '')}")
        print()


if __name__ == "__main__":
    test_for_context_index()
