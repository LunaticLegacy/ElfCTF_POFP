"""Filesystem-backed CTF task manager."""

from __future__ import annotations

import json
import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, TypeAlias

from core.models import (
    CTFTask,
    CTFTaskConfig,
    FileInfo,
    RuntimeConfig,
    TaskStatus,
    TaskType,
    normalize_context_mode,
    normalize_tool_names,
    safe_filename,
)


TaskConfigUpdateValue: TypeAlias = str | int | List[str] | None


def _default_external_tool_names() -> List[str]:
    """Return the current registry's hotplug tool names when available."""
    try:
        from services.tools.hotplug import hotplug_manager
    except Exception:
        return []
    return hotplug_manager.get_hotplug_tool_names()


@dataclass
class UploadedTaskFile:
    """Uploaded file bytes waiting to be attached to a task."""

    client_id: str
    name: str
    size: int
    content: bytes


@dataclass
class CreateTaskResult:
    """Result returned by task creation helpers."""

    success: bool
    task: Optional[CTFTask] = None
    error_message: str = ''


class TaskManager:
    """Create, persist, update, and query CTF tasks.
    该类需要保证全局单例。
    TODO: 考虑将每一个任务实例都用一个 agent 实例。
    """

    def __init__(self, tasks_dir: Path | str) -> None:
        """Initialize a task manager.

        Args:
            tasks_dir: Directory that stores task metadata and workspaces.
        """
        self.tasks_dir = Path(tasks_dir).expanduser().resolve()
        self.tasks_dir.mkdir(parents=True, exist_ok=True)
        self._tasks: Dict[str, CTFTask] = {}
        self._runtime_configs: Dict[str, RuntimeConfig] = {}    # 保存运行时状态信息……？等一下，这个东西现在的语义不对。设置需要是全局单例。
        self._load_tasks()

    def _task_file(self, task_id: str) -> Path:
        """Return the metadata path for a task id."""
        return self.tasks_dir / task_id / 'task.json'

    def _load_tasks(self) -> None:
        """Load task metadata from disk into memory."""
        for metadata_path in sorted(self.tasks_dir.glob('*/task.json')):
            try:
                task = self._task_from_dict(json.loads(metadata_path.read_text(encoding='utf-8')))
            except Exception:
                continue
            self._tasks[task.id] = task

    def _task_from_dict(self, data: dict) -> CTFTask:
        """Reconstruct a task dataclass from persisted JSON."""
        # Rebuild the editable task configuration from persisted scalar fields.
        config = CTFTaskConfig(
            name=str(data.get('name', '')),
            task_type=TaskType(str(data.get('task_type', data.get('type', 'RE'))).upper()),
            target=str(data.get('target', '')),
            gzctf_challenge_id=str(data.get('gzctfChallengeId', data.get('gzctf_challenge_id', ''))).strip(),
            files=[FileInfo.from_dict(item) for item in data.get('files', []) if isinstance(item, dict)],
            system_prompt=str(data.get('systemPrompt', data.get('system_prompt', ''))),
            skills=list(data.get('skills', [])),
            selected_mcp=str(data.get('selectedMcp', data.get('selected_mcp', ''))),
            workflow_kind=str(data.get('workflowKind', data.get('workflow_kind', 'solve'))),
            task_mode=str(data.get('taskMode', data.get('task_mode', 'classic'))),
            execution_mode=str(data.get('executionMode', data.get('execution_mode', 'single'))),
            context_mode=normalize_context_mode(data.get('contextMode', data.get('context_mode', 'linear'))),
            learning_mode=str(data.get('learningMode', data.get('learning_mode', 'off'))),
            learning_search_rounds=int(data.get('learningSearchRounds', data.get('learning_search_rounds', 2))),
            learning_results_per_query=int(data.get('learningResultsPerQuery', data.get('learning_results_per_query', 5))),
            learning_max_sources=int(data.get('learningMaxSources', data.get('learning_max_sources', 8))),
            learning_max_chars_per_source=int(data.get('learningMaxCharsPerSource', data.get('learning_max_chars_per_source', 12000))),
            learning_focus_keywords=list(data.get('learningFocusKeywords', data.get('learning_focus_keywords', []))),
            learning_exclude_keywords=list(data.get('learningExcludeKeywords', data.get('learning_exclude_keywords', []))),
            external_tool_names=normalize_tool_names(
                data.get('externalToolNames', data.get('external_tool_names', _default_external_tool_names())),
            ),
        )

        # Normalize persisted runtime artifacts so frontend detail views can consume them.
        artifacts = data.get('artifacts', {})
        normalized_artifacts = artifacts if isinstance(artifacts, dict) else {}

        # Rebuild the persisted task snapshot including logs, result fields, and artifacts.
        return CTFTask(
            id=str(data['id']),
            user_id=str(data.get('user_id', 'default')),
            config=config,
            status=TaskStatus(str(data.get('status', TaskStatus.PENDING.value))),
            logs=list(data.get('logs', [])),
            result=str(data.get('result', '')),
            error=str(data.get('error', '')),
            workspace=str(data.get('workspace', '')),
            created_at=float(data.get('created_at', 0) or 0),
            updated_at=float(data.get('updated_at', 0) or 0),
            pending_new_input=str(data.get('pendingNewInput', data.get('pending_new_input', ''))),
            artifacts=normalized_artifacts,
        )

    def _persist_task(self, task: CTFTask) -> None:
        """Persist one task to its metadata file."""
        # Ensure the task directory exists before writing metadata.
        task_dir = self.tasks_dir / task.id
        task_dir.mkdir(parents=True, exist_ok=True)

        # Write the full task snapshot so backend and frontend share one source of truth.
        self._task_file(task.id).write_text(json.dumps(task.to_dict(), ensure_ascii=False, indent=2), encoding='utf-8')

    def create_task(self, config: CTFTaskConfig, *, user_id: str) -> CreateTaskResult:
        """Create and persist a task.

        Args:
            config: Normalized CTF task configuration.
            user_id: Owner id for API scoping.

        Returns:
            Creation result with task or error message.
        """
        if not config.name.strip():
            return CreateTaskResult(False, error_message='任务名称不能为空')
        config.context_mode = normalize_context_mode(config.context_mode)
        config.external_tool_names = normalize_tool_names(config.external_tool_names)
        task_id = uuid.uuid4().hex
        workspace = self.tasks_dir / task_id / 'workspace'
        workspace.mkdir(parents=True, exist_ok=True)
        task = CTFTask(id=task_id, user_id=user_id, config=config, workspace=str(workspace))
        task.add_log('任务已创建')
        self._tasks[task_id] = task
        self._persist_task(task)
        return CreateTaskResult(True, task=task)

    def attach_uploaded_files(self, task_id: str, uploads: Iterable[UploadedTaskFile]) -> Optional[CTFTask]:
        """Attach uploaded files to a task workspace.

        Args:
            task_id: Task receiving uploads.
            uploads: Uploaded file records with bytes.

        Returns:
            Updated task, or `None` if not found.
        """
        task = self._tasks.get(task_id)
        if task is None:
            return None
        attachments_dir = Path(task.workspace)
        attachments_dir.mkdir(parents=True, exist_ok=True)
        files = list(task.config.files)
        for upload in uploads:
            name = safe_filename(upload.name)
            destination = attachments_dir / name
            destination.write_bytes(upload.content)
            files.append(FileInfo(name=name, size=upload.size, path=str(destination), client_id=upload.client_id))
            task.add_log(f'已上传附件: {name}')
        task.config.files = files
        self._persist_task(task)
        return task

    def get_all_tasks(self, *, user_id: Optional[str] = None) -> List[CTFTask]:
        """Return all tasks, optionally scoped by user."""
        tasks = list(self._tasks.values())
        if user_id is not None:
            tasks = [task for task in tasks if task.user_id == user_id]
        return sorted(tasks, key=lambda item: item.created_at, reverse=True)

    def get_task(self, task_id: str, *, user_id: Optional[str] = None) -> Optional[CTFTask]:
        """Return one task by id and optional owner."""
        task = self._tasks.get(task_id)
        if task is None or (user_id is not None and task.user_id != user_id):
            return None
        return task

    def get_task_workspace(self, task: CTFTask) -> Path:
        """Return a task workspace path."""
        path = Path(task.workspace)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def prepare_runtime_config(self, task_id: str, runtime_config: RuntimeConfig) -> None:
        """Store runtime config for the next workflow execution."""
        self._runtime_configs[task_id] = runtime_config

    def get_runtime_config(self, task_id: str) -> Optional[RuntimeConfig]:
        """
        Return prepared runtime config for a task.
        Args:
            task_id: 输入的任务 id。

        Returns:
            运行时设置，可能会返回，也可能不返回——如果没有对应任务。
        """
        return self._runtime_configs.get(task_id)

    def update_status(self, task_id: str, status: TaskStatus, *, error: str = '', result: str = '') -> Optional[CTFTask]:
        """Update task status and optional result fields."""
        task = self._tasks.get(task_id)
        if task is None:
            return None
        task.status = status
        if error:
            task.error = error
        if result:
            task.result = result
        task.touch()
        self._persist_task(task)
        return task

    def add_log(self, task_id: str, message: str) -> None:
        """Append a task log line and persist the task."""
        task = self._tasks.get(task_id)
        if task is None:
            return
        task.add_log(message)
        self._persist_task(task)

    def save_pending_new_input(self, task_id: str, new_input: str) -> Optional[CTFTask]:
        """Save additional user input for a future workflow step."""
        # Resolve the task before mutating continuation input state.
        task = self._tasks.get(task_id)
        if task is None:
            return None

        # Persist the pending input into the primary task field and mirrored artifact.
        task.pending_new_input = new_input
        task.set_artifact('pending_new_input', new_input)
        task.add_log('已保存新的用户输入' if new_input else '已清空新的用户输入')

        # Flush the updated input state to disk so the next refresh sees it.
        self._persist_task(task)
        return task

    def set_task_artifact(
        self,
        task_id: str,
        key: str,
        value: object,
        *,
        user_id: Optional[str] = None,
    ) -> Optional[CTFTask]:
        """Persist one named runtime artifact on a task.

        Args:
            task_id: Task receiving the artifact update.
            key: Artifact namespace stored under `task.artifacts`.
            value: JSON-serializable artifact payload.
            user_id: Optional owner guard for scoped updates.

        Returns:
            Updated task when found, otherwise `None`.
        """
        # Resolve the task under optional ownership checks before mutating artifacts.
        task = self.get_task(task_id, user_id=user_id)
        if task is None:
            return None

        # Apply the artifact update to the task in-memory snapshot.
        task.set_artifact(key, value)

        # Persist the artifact mutation immediately for frontend polling consumers.
        self._persist_task(task)
        return task

    def update_task_config(
        self,
        task_id: str,
        *,
        user_id: Optional[str] = None,
        **updates: TaskConfigUpdateValue,
    ) -> Optional[CTFTask]:
        """Patch editable configuration fields on a task."""
        task = self.get_task(task_id, user_id=user_id)
        if task is None:
            return None
        mapping = {
            'name': 'name',
            'target': 'target',
            'gzctf_challenge_id': 'gzctf_challenge_id',
            'system_prompt': 'system_prompt',
            'skills': 'skills',
            'selected_mcp': 'selected_mcp',
            'workflow_kind': 'workflow_kind',
            'task_mode': 'task_mode',
            'execution_mode': 'execution_mode',
            'context_mode': 'context_mode',
            'learning_mode': 'learning_mode',
            'learning_search_rounds': 'learning_search_rounds',
            'learning_results_per_query': 'learning_results_per_query',
            'learning_max_sources': 'learning_max_sources',
            'learning_max_chars_per_source': 'learning_max_chars_per_source',
            'learning_focus_keywords': 'learning_focus_keywords',
            'learning_exclude_keywords': 'learning_exclude_keywords',
            'external_tool_names': 'external_tool_names',
        }
        for key, attr in mapping.items():
            value = updates.get(key)
            if value is not None:
                if attr == 'external_tool_names':
                    setattr(task.config, attr, normalize_tool_names(value))
                elif attr == 'context_mode':
                    setattr(task.config, attr, normalize_context_mode(value))
                else:
                    setattr(task.config, attr, value)
        task.add_log('任务配置已更新')
        self._persist_task(task)
        return task

    def delete_task(self, task_id: str, *, user_id: Optional[str] = None) -> bool:
        """Delete task metadata and workspace from disk."""
        task = self.get_task(task_id, user_id=user_id)
        if task is None:
            return False
        self._tasks.pop(task_id, None)
        self._runtime_configs.pop(task_id, None)
        shutil.rmtree(self.tasks_dir / task_id, ignore_errors=True)
        return True
