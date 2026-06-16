"""Compatibility wrappers for CTF module tool factories."""

from __future__ import annotations

from pathlib import Path

from modules.llmfetcher.ctf_module.ctf_tools import create_ctf_tools as _create_ctf_tools
from modules.llmfetcher.tool import Tool


def create_ctf_tools(
    workspace_root: str | Path,
    *,
    max_read_bytes: int = 200_000,
    default_flag_pattern: str = r"(?i)\b(?:flag|ctf|elfctf)\{[^}\s]{1,200}\}",
) -> list[Tool]:
    """Create the CTF workspace tools used by the core workflow layer."""
    return _create_ctf_tools(
        workspace_root,
        max_read_bytes=max_read_bytes,
        default_flag_pattern=default_flag_pattern,
    )
