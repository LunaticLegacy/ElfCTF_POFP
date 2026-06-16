"""Command-line demo for the local chunk-based RAG system.

This script demonstrates the main retrieval flow:
1. Load the local knowledge base
2. Run a freeform chunk-level search
3. Optionally build a task-oriented prompt context

Examples:
    python demo/rag_demo.py "UPX unpacking"
    python demo/rag_demo.py "anti-debug" --task-type RE --task-name "sample challenge"
    python demo/rag_demo.py "windows pe triage" --rebuild
    python demo/rag_demo.py "UPX" --show-chunk
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from textwrap import indent


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from modules.llmfetcher.rag_module.knowledge_base import KnowledgeBase


def build_parser() -> argparse.ArgumentParser:
    """Build the CLI parser for the RAG demo."""
    parser = argparse.ArgumentParser(description="Chunk-based RAG demo for the local knowledge base.")
    parser.add_argument(
        "query",
        nargs="*",
        default=["UPX", "unpacking"],
        help="Freeform search query words. Multiple words are joined with spaces.",
    )
    parser.add_argument(
        "--kb-root",
        default=str(PROJECT_ROOT / "kb"),
        help="Knowledge base root directory. Defaults to the repository kb/ folder.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=5,
        help="Maximum number of chunk hits to display.",
    )
    parser.add_argument(
        "--rebuild",
        action="store_true",
        help="Force a vector-index rebuild before searching.",
    )
    parser.add_argument(
        "--task-name",
        default="",
        help="Optional task name for task-aware retrieval.",
    )
    parser.add_argument(
        "--task-type",
        default="RE",
        help="Optional task type for task-aware retrieval.",
    )
    parser.add_argument(
        "--target",
        default="",
        help="Optional task target used by the task retrieval policy.",
    )
    parser.add_argument(
        "--file-descriptions",
        default="",
        help="Optional attached-file summary used by the task retrieval policy.",
    )
    parser.add_argument(
        "--show-context",
        action="store_true",
        help="Also render the task-context string built from the top hits.",
    )
    parser.add_argument(
        "--show-chunk",
        action="store_true",
        help="Also print the raw chunk content for each hit.",
    )
    parser.add_argument(
        "--chunk-chars",
        type=int,
        default=1600,
        help="Maximum chunk characters to print when --show-chunk is enabled.",
    )
    return parser


def render_hit(index: int, hit) -> str:
    """Render one chunk-level hit into a readable block."""
    chunk_label = f"chunk {hit.chunk_index + 1}"
    heading_label = f" / {hit.chunk_title}" if hit.chunk_title else ""
    heading_path = f" [{hit.heading_path}]" if hit.heading_path else ""
    span = f"lines {hit.start_line}-{hit.end_line}" if hit.start_line and hit.end_line else "lines unknown"
    lines = [
        f"{index}. {hit.title}{heading_label}",
        f"   path: {hit.path}",
        f"   chunk: {chunk_label}{heading_path}",
        f"   span: {span}",
        f"   score: {hit.score:.2f} (keyword {hit.keyword_score:.2f}, vector {hit.vector_score:.2f})",
        f"   excerpt: {hit.excerpt or '(empty)'}",
    ]
    return "\n".join(lines)


def render_chunk_text(text: str, *, max_chars: int) -> str:
    """Render a chunk body with optional truncation."""
    if max_chars <= 0:
        return ""
    if len(text) <= max_chars:
        return text
    return f"{text[:max_chars].rstrip()}\n\n[truncated at {max_chars} chars]"


def main() -> None:
    """Run the demo from the command line."""
    args = build_parser().parse_args()
    query = " ".join(str(part).strip() for part in args.query if str(part).strip()) or "UPX unpacking"
    kb = KnowledgeBase(Path(args.kb_root))

    print("=" * 72)
    print("Chunk RAG Demo")
    print("=" * 72)
    print(f"knowledge root: {kb.root}")
    print(f"available: {kb.available()}")
    print(f"vector status: {kb.vector_status()}")

    if args.rebuild:
        print("\nRebuilding vector index...")
        kb.rebuild_vector_index()

    print("\nFreeform search")
    print("-" * 72)
    hits = kb.search(query, limit=args.limit)
    print(f"query: {query}")
    print(f"hits: {len(hits)}")
    if hits:
        for index, hit in enumerate(hits, start=1):
            print(render_hit(index, hit))
            if args.show_chunk:
                chunk_text = kb.get_chunk_text_from_hit(hit)
                if chunk_text is None:
                    print("   chunk body: (not found)")
                else:
                    print("   chunk body:")
                    print(indent(render_chunk_text(chunk_text, max_chars=args.chunk_chars), "     "))
            print()
    else:
        print("No hits found.")

    task_name = args.task_name.strip()
    if task_name or args.task_type.strip() or args.target.strip() or args.file_descriptions.strip():
        context = kb.build_task_context(
            task_name=task_name or query,
            task_type=args.task_type,
            target=args.target,
            file_descriptions=args.file_descriptions,
            limit=min(args.limit, 3),
        )
        print(indent(context, "  "))
    elif args.show_context:
        context = kb.build_task_context(
            task_name=query,
            task_type="RE",
            target="",
            file_descriptions="",
            limit=min(args.limit, 3),
        )
        print(indent(context, "  "))


if __name__ == "__main__":
    main()
