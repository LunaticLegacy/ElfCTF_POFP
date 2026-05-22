"""Tool bootstrap planning service."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from shutil import which
from typing import List, Optional


@dataclass
class ToolBootstrapReport:
    """Installed and missing CTF helper binary summary."""

    installed: List[str] = field(default_factory=list)
    missing: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Serialize the report for API responses."""
        return {'installed': self.installed, 'missing': self.missing}


class ToolBootstrapService:
    """Generate local tool installation status and shell plans."""

    DEFAULT_BINARIES = ['file', 'strings', 'binwalk', 'exiftool', 'radare2', 'gdb', 'python3', 'nc']

    def __init__(self, output_dir: Path | str) -> None:
        """Initialize output directory for generated plans."""
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def build_report(self, *, user_id: str) -> ToolBootstrapReport:
        """Return installed/missing status for common CTF binaries."""
        installed = [binary for binary in self.DEFAULT_BINARIES if which(binary)]
        missing = [binary for binary in self.DEFAULT_BINARIES if binary not in installed]
        return ToolBootstrapReport(installed=installed, missing=missing)

    def write_install_plan(self, user_id: str, *, binaries: Optional[List[str]] = None) -> dict:
        """Write a conservative apt-based install script."""
        requested = binaries or self.DEFAULT_BINARIES
        safe_names = [str(item).strip() for item in requested if str(item).strip()]
        script = '#!/usr/bin/env bash\nset -euo pipefail\nsudo apt-get update\nsudo apt-get install -y ' + ' '.join(safe_names) + '\n'
        path = self.output_dir / f'{user_id}_install_tools.sh'
        path.write_text(script, encoding='utf-8')
        return {'path': str(path), 'binaries': safe_names, 'script': script}
