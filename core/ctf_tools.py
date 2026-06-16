"""Compatibility wrappers for CTF and knowledge-base tool factories.

This module keeps the `core` import surface stable while delegating the actual
tool implementations to the current `modules.llmfetcher` package layout.
"""

from __future__ import annotations

from pathlib import Path

from modules.llmfetcher.rag_module.knowledge import KnowledgeBase
from modules.llmfetcher.tool import Tool
from modules.llmfetcher.tools import (
    create_ctf_tools as _create_ctf_tools,
    create_rag_knowledge_tools as _create_rag_knowledge_tools,
    create_workspace_knowledge_tools as _create_workspace_knowledge_tools,
)


def create_ctf_tools(
    workspace_root: str | Path,
    *,
    max_read_bytes: int = 200_000,
    default_flag_pattern: str = r"(?i)\b(?:flag|ctf|elfctf)\{[^}\s]{1,200}\}",
) -> list[Tool]:
    """Create workspace-scoped CTF tools.

    Args:
        workspace_root: Workspace root that bounds filesystem operations.
        max_read_bytes: Maximum bytes returned by read-style tools.
        default_flag_pattern: Regex used by the flag extraction tool.

    Returns:
        Tool objects for CTF workspace interaction.
    """
    return _create_ctf_tools(
        workspace_root,
        max_read_bytes=max_read_bytes,
        default_flag_pattern=default_flag_pattern,
    )


def create_workspace_knowledge_tools(knowledge_base: KnowledgeBase | None = None) -> list[Tool]:
    """Create workspace knowledge-base tools.

    Args:
        knowledge_base: Knowledge base instance used for search/read tools.

    Returns:
        Tool objects for workspace-scoped knowledge retrieval.
    """
    return _create_workspace_knowledge_tools(knowledge_base)


def create_rag_knowledge_tools(knowledge_base: KnowledgeBase | None = None) -> list[Tool]:
    """Create RAG knowledge-base tools.

    Args:
        knowledge_base: Knowledge base instance used for search/read tools.

    Returns:
        Tool objects for RAG knowledge retrieval.
    """
    return _create_rag_knowledge_tools(knowledge_base)


def create_knowledge_tools(knowledge_base: KnowledgeBase | None = None) -> list[Tool]:
    """Backward-compatible alias for the RAG knowledge tools."""
    return create_rag_knowledge_tools(knowledge_base)
