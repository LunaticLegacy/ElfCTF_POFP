"""CTF skill discovery service."""

from __future__ import annotations

from pathlib import Path
from dataclasses import dataclass
from typing import List, Optional, Protocol

from modules.llmfetcher.ctf_module.ctf_skill_router import discover_ctf_skills


@dataclass
class SkillRecord:
    """API-facing CTF skill metadata."""

    id: str
    name: str
    description: str
    path: str
    task_types: List[str]
    user_invocable: bool = False

    def to_dict(self) -> dict:
        """Serialize this skill record."""
        return self.__dict__.copy()


class DiscoveredSkill(Protocol):
    """Shape returned by the CTF skill discovery router."""

    id: str
    name: str
    description: str
    path: Path
    task_types: List[str]
    user_invocable: bool


class SkillService:
    """Expose local CTF skill metadata to API routes."""

    def __init__(self, skills_root: Path | str = 'ctf-skills') -> None:
        """Create a skill service for a local skills directory."""
        self.skills_root = Path(skills_root)

    def get_all_skills(self) -> List[SkillRecord]:
        """Return all discovered CTF skills."""
        return [self._skill_to_record(skill) for skill in discover_ctf_skills(self.skills_root)]

    def get_skills_for_task_type(self, task_type: str) -> List[SkillRecord]:
        """Return skills whose task type matches the requested category."""
        normalized = str(task_type).strip().upper()
        return [skill for skill in self.get_all_skills() if normalized in skill.task_types]

    def get_skill(self, skill_id: str) -> Optional[dict]:
        """Return one skill by id."""
        for skill in self.get_all_skills():
            if skill['id'] == skill_id:
                return skill
        return None

    def _skill_to_record(self, skill: DiscoveredSkill) -> SkillRecord:
        """Serialize a discovered skill dataclass."""
        return SkillRecord(
            id=skill.id,
            name=skill.name,
            description=skill.description,
            path=str(skill.path),
            task_types=list(skill.task_types),
            user_invocable=bool(skill.user_invocable),
        )
