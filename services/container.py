"""Application service container for FastAPI routes."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .auth_service import AuthService
from .background_jobs import BackgroundJobManager
from .config_handler import ConfigHandler
from .knowledge_service import DynamicKnowledgeService, KnowledgeService
from .llm_client import LLMClient
from .skill_service import SkillService
from .storage import ApplicationStorage
from .tasks.manager import TaskManager
from .tools.bootstrap import ToolBootstrapService
from core.ctf_kernel import CTFWorkflowService


@dataclass
class ApplicationServices:
    """Shared service container attached to FastAPI application state."""

    storage: ApplicationStorage
    auth: AuthService
    config_handler: ConfigHandler
    task_manager: TaskManager
    workflow: CTFWorkflowService
    llm_client: LLMClient
    skill_service: SkillService
    knowledge_service: KnowledgeService
    dynamic_knowledge: DynamicKnowledgeService
    background_jobs: BackgroundJobManager
    tool_bootstrap: ToolBootstrapService


def create_services(data_dir: Path | str = '.elfctf') -> ApplicationServices:
    """Construct all backend services with shared storage.

    Args:
        data_dir: Application data directory.

    Returns:
        Fully wired application service container.
    """
    # Build storage first so every service shares the same durable root.
    storage = ApplicationStorage(data_dir)
    task_manager = TaskManager(storage.get_tasks_dir())
    config_handler = ConfigHandler(storage)
    return ApplicationServices(
        storage=storage,
        auth=AuthService(storage.get_database_path()),
        config_handler=config_handler,
        task_manager=task_manager,
        workflow=CTFWorkflowService(task_manager),
        llm_client=LLMClient(),
        skill_service=SkillService(),
        knowledge_service=KnowledgeService(task_manager),
        dynamic_knowledge=DynamicKnowledgeService(),
        background_jobs=BackgroundJobManager(),
        tool_bootstrap=ToolBootstrapService(storage.get_data_dir() / 'tool-bootstrap'),
    )
