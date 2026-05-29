"""CTF workflow orchestration backed by the local LLM agent framework."""

from __future__ import annotations

import asyncio
import json
import re
import sys
import threading
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, Optional, Literal


from core.json_types import JsonObject
from modules.llmfetcher import Agent, LLMFetcher, create_ctf_tools, create_obscura_tools, create_shell_tools
from modules.llmfetcher.agent import AgentState
from modules.llmfetcher.ctf_module.ctf_skill_router import classify_ctf_challenge, enrich_prompt_with_ctf_skills
from modules.llmfetcher.llm_context import LLMContext, LLMContextCompacted
from modules.llmfetcher.llm_types import LLMBackendConfig, LLMInfo
from modules.llmfetcher.tools.ctf_tools import create_knowledge_tools
from services.tools.hotplug import hotplug_manager
from modules.rag.knowledge_base import KnowledgeBase

from .models import CTFTask, TaskStatus
from .models import RuntimeConfig
from .ctf_prompt import (
    build_ctf_compression_profile,
    build_ctf_system_prompt,
    build_ctf_user_prompt,
)

FLAG_PATTERN = re.compile(r"(?i)\b(?:flag|ctf|elfctf)\{[^}\s]{1,200}\}")


class _ThreadLocalStreamRouter:
    """Route writes to a thread-registered stream when one is active.

    Writes from threads without an active registration fall back to the
    original process stream so unrelated output continues to work normally.
    """

    def __init__(self, fallback_stream) -> None:
        self._fallback_stream = fallback_stream
        self._lock = threading.RLock()
        self._writers: dict[int, list[object]] = {}

    def register(self, writer) -> None:
        """Push one thread-local writer for the current thread."""
        thread_id = threading.get_ident()
        with self._lock:
            stack = self._writers.setdefault(thread_id, [])
            stack.append(writer)

    def unregister(self) -> None:
        """Pop the current thread-local writer if one exists."""
        thread_id = threading.get_ident()
        with self._lock:
            stack = self._writers.get(thread_id)
            if not stack:
                return
            stack.pop()
            if not stack:
                self._writers.pop(thread_id, None)

    def _current_stream(self):
        thread_id = threading.get_ident()
        with self._lock:
            stack = self._writers.get(thread_id)
            if stack:
                return stack[-1]
        return self._fallback_stream

    def write(self, text: str) -> int:
        return self._current_stream().write(text)

    def flush(self) -> None:
        self._current_stream().flush()

    def isatty(self) -> bool:
        return bool(getattr(self._current_stream(), 'isatty', lambda: False)())

    def writable(self) -> bool:
        return bool(getattr(self._current_stream(), 'writable', lambda: True)())

    @property
    def encoding(self):
        return getattr(self._fallback_stream, 'encoding', None)

    @property
    def errors(self):
        return getattr(self._fallback_stream, 'errors', None)

    def fileno(self) -> int:
        return self._fallback_stream.fileno()

    def __getattr__(self, name: str):
        return getattr(self._fallback_stream, name)


class _ThreadScopedStdIORedirect:
    """Install one global stdout/stderr router and bind it per thread."""

    _lock = threading.RLock()
    _active_contexts = 0
    _stdout_router: _ThreadLocalStreamRouter | None = None
    _stderr_router: _ThreadLocalStreamRouter | None = None
    _original_stdout = None
    _original_stderr = None

    def __init__(self, stdout_writer, stderr_writer=None) -> None:
        self.stdout_writer = stdout_writer
        self.stderr_writer = stderr_writer or stdout_writer

    @classmethod
    def _ensure_installed(cls) -> None:
        if cls._active_contexts == 0:
            cls._original_stdout = sys.stdout
            cls._original_stderr = sys.stderr
            cls._stdout_router = _ThreadLocalStreamRouter(cls._original_stdout)
            cls._stderr_router = _ThreadLocalStreamRouter(cls._original_stderr)
            sys.stdout = cls._stdout_router
            sys.stderr = cls._stderr_router
        cls._active_contexts += 1

    @classmethod
    def _maybe_restore(cls) -> None:
        cls._active_contexts = max(0, cls._active_contexts - 1)
        if cls._active_contexts == 0:
            if cls._original_stdout is not None:
                sys.stdout = cls._original_stdout
            if cls._original_stderr is not None:
                sys.stderr = cls._original_stderr
            cls._stdout_router = None
            cls._stderr_router = None
            cls._original_stdout = None
            cls._original_stderr = None

    def __enter__(self):
        with self._lock:
            self._ensure_installed()
            assert self._stdout_router is not None
            assert self._stderr_router is not None
            self._stdout_router.register(self.stdout_writer)
            self._stderr_router.register(self.stderr_writer)
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        with self._lock:
            if self._stdout_router is not None:
                self._stdout_router.unregister()
            if self._stderr_router is not None:
                self._stderr_router.unregister()
            self._maybe_restore()


@dataclass
class WorkflowResult:
    """Route-friendly workflow operation result.

    Attributes:
        success: Whether the workflow operation completed successfully.
        code: Machine-readable result or failure code for the API layer.
        message: Human-readable status text.
        details: Optional structured metadata such as fix hints.
    """

    success: bool
    code: str = ''
    message: str = ''
    details: JsonObject | None = None


class _TaskVerboseLogWriter:
    """Mirror agent stdout/stderr into the task log stream.

    Args:
        task_id: Task identifier receiving the verbose trace.
        task_manager: Task manager used to persist log lines.
        prefix: Optional log prefix injected ahead of each captured line.
        mirror_stream: Optional text stream that should still receive the raw text.
    """

    def __init__(
        self,
        task_id: str,
        task_manager: "TaskManager",
        *,
        prefix: str = 'Agent verbose',
        mirror_stream=None,
    ) -> None:
        self.task_id = task_id
        self.task_manager = task_manager
        self.prefix = prefix
        self.mirror_stream = mirror_stream
        self._buffer = ''

    def write(self, text: str) -> int:
        """Buffer and forward a chunk written by `print()` or stderr output.

        Args:
            text: Raw text chunk written to stdout or stderr.

        Returns:
            Number of characters consumed from the input chunk.
        """
        # Ignore empty chunks so the log stream stays free from no-op writes.
        if not text:
            return 0

        # Mirror raw text into the server terminal only when a mirror stream is configured.
        if self.mirror_stream is not None:
            self.mirror_stream.write(text)

        # Reassemble partial writes into complete lines before persisting them as task logs.
        self._buffer += text
        while '\n' in self._buffer:
            line, self._buffer = self._buffer.split('\n', 1)
            self._emit_line(line)
        return len(text)

    def flush(self) -> None:
        """Flush any buffered partial line into the task log."""
        # Persist the final buffered fragment so the tail of the verbose stream is not lost.
        if self._buffer.strip():
            self._emit_line(self._buffer)
        self._buffer = ''

        # Flush the underlying mirror stream so terminal output stays in sync with task logs.
        if self.mirror_stream is not None:
            self.mirror_stream.flush()

    def _emit_line(self, line: str) -> None:
        """Persist one captured stdout/stderr line as a task log entry.

        Args:
            line: One logical line extracted from the captured stream.
        """
        # Drop empty lines after normalization to avoid noisy blank task logs.
        normalized = str(line).rstrip('\r')
        if not normalized.strip():
            return

        # Prefix and persist the verbose line into the task log timeline.
        self.task_manager.add_log(self.task_id, f'{self.prefix}: {normalized}')

def _resolve_backend_provider(connector_type: str) -> str:
    """Map a saved connector type to the LLM backend provider.

    Args:
        connector_type: Normalized connector type saved in runtime config.

    Returns:
        Provider name understood by `modules.llmfetcher.LLMFetcher`.
    """
    normalized = str(connector_type or '').strip().lower()
    if normalized == 'anthropic':
        return 'anthropic'
    if normalized == 'litellm':
        return 'litellm'
    return 'openai'



class CTFWorkflowService:
    """Start, continue, retry, and stop LLM-backed CTF task workflows."""

    def __init__(
        self, 
        task_manager: "TaskManager", 
        *, 
        skills_root: Path | str = 'ctf-skills', 
        kb_root: Path | str = 'kb',
        gzctf_service: Any = None,
    ) -> None:
        """Create a workflow service.

        Args:
            task_manager: Task manager used for state and workspaces.
            skills_root: Local CTF skill repository root.
            kb_root: Local knowledge-base root.
        """
        self.task_manager = task_manager    # 任务管理器
        self.skills_root = Path(skills_root)    # skill 目录
        self.kb_root = Path(kb_root)    # 知识库根目录
        self.gzctf_service = gzctf_service

        self._threads: Dict[str, threading.Thread] = {}     # 线程
        self._stop_events: Dict[str, threading.Event] = {}  # 停止事件列表
        self._agents: Dict[str, Agent] = {}
        self._agent_lock = threading.RLock()

    def create_agent_for_task(self, task: CTFTask) -> Agent:
        """
        Create or load the durable Agent assigned to one task.
        对目标任务创建 Agent 实例。如果已有……
        TODO: 光看这里的语义看不出来什么东西，还要继续向后看。
        
        Args:
            task: 目标任务信息。
        """
        with self._agent_lock:
            # 上锁，并尝试加载。
            agent: Optional[Agent] = self._agents.get(task.id)  # 获取 agent
            if agent is not None:   # 如果当前字典内有 agent 实例
                self._publish_agent_status(task.id, agent)
                return agent
            
            # 如果没有 agent 实例
            agent = self._load_agent_for_task(task)
            if agent is None:
                agent = self._build_agent_for_task(task, RuntimeConfig())
                self._persist_agent_for_task(task.id, agent)
            self._agents[task.id] = agent
            self._publish_agent_status(task.id, agent)
            return agent

    def discard_agent_for_task(self, task_id: str) -> None:
        """Drop the live Agent reference when a task is deleted."""
        with self._agent_lock:
            self._agents.pop(task_id, None)

    def get_agent_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Return the current live-or-persisted Agent status for a task."""
        task = self.task_manager.get_task(task_id)
        if task is None:
            return None
        agent = self.create_agent_for_task(task)
        return self._build_agent_status_snapshot(task_id, agent)

    def start_ctf_analysis(self, task_id: str) -> WorkflowResult:
        """Start solving a CTF task in a background thread."""
        return self._start_task(task_id, mode='start')

    def continue_ctf_analysis(self, task_id: str) -> WorkflowResult:
        """Continue a CTF task using saved context and new input."""
        return self._start_task(task_id, mode='continue')

    def retry_ctf_analysis(self, task_id: str) -> WorkflowResult:
        """Retry a CTF task from scratch."""
        task = self.task_manager.get_task(task_id)
        if task is None:
            return WorkflowResult(False, code='task_not_found', message='任务未找到')
        task.logs.clear()
        task.result = ''
        task.error = ''
        with self._agent_lock:
            self._agents[task_id] = self._build_agent_for_task(task, RuntimeConfig())
            self._persist_agent_for_task(task_id, self._agents[task_id])
            self._publish_agent_status(task_id, self._agents[task_id])
        self.task_manager.update_status(task_id, TaskStatus.PENDING)
        return self._start_task(task_id, mode='retry')

    def stop_task(self, task_id: str) -> WorkflowResult:
        """Request cancellation for a running task."""
        task = self.task_manager.get_task(task_id)
        if task is None:
            return WorkflowResult(False, code='task_not_found', message='任务未找到')
        if task.status != TaskStatus.RUNNING:
            return WorkflowResult(False, code='task_not_running', message='任务未在运行中，无法停止')
        event = self._stop_events.get(task_id)
        if event:
            event.set()
        self.task_manager.add_log(task_id, '已请求停止任务')
        self.task_manager.update_status(task_id, TaskStatus.STOPPED)
        return WorkflowResult(True, code='task_stopped', message='任务已停止')

    def _start_task(
        self, 
        task_id: str, 
        *, 
        mode: Literal["start", "retry", "continue"]
    ) -> WorkflowResult:
        """Validate task state and launch a background worker."""
        task = self.task_manager.get_task(task_id)
        if task is None:
            return WorkflowResult(False, code='task_not_found', message='任务未找到')
        if task.status == TaskStatus.RUNNING:
            return WorkflowResult(False, code='task_running', message='任务已在运行中')

        # 获取运行时配置信息，从任务管理器内获取。
        runtime_config = self.task_manager.get_runtime_config(task_id)
        if runtime_config is None:
            return WorkflowResult(
                False,
                code='missing_runtime_config',
                message='任务缺少运行配置',
                details={'hint': '请先在设置中保存可用的 API 配置后再开始任务。'},
            )   # 获取不到

        # Create one stop event per run and let the worker own final status.
        # 开一个新线程？
        stop_event = threading.Event()
        self._stop_events[task_id] = stop_event
        self.task_manager.update_status(task_id, TaskStatus.RUNNING)
        self.task_manager.add_log(task_id, f'启动 CTF workflow: {mode}')
        thread = threading.Thread(target=self._run_worker, args=(task_id, runtime_config, stop_event, mode), daemon=True)
        self._threads[task_id] = thread
        thread.start()
        return WorkflowResult(True, code='task_started', message='任务已启动')

    def _run_worker(
        self, 
        task_id: str, 
        runtime_config: RuntimeConfig, 
        stop_event: threading.Event, 
        mode: Literal["start", "retry", "continue"]
    ) -> None:
        """
        Run a task workflow inside a private event loop.
        目测该内容是启动任务用的，其底层使用的是协程。
        """
        # Run the agent workflow inside an isolated event loop for this background thread.
        try:
            asyncio.run(self._run_agent(task_id, runtime_config, stop_event, mode))
        except Exception as exc:
            # Record the failure in task logs and task status so polling UIs can surface the error.
            self._persist_live_agent(task_id)
            self.task_manager.add_log(task_id, f'任务失败: {exc}')
            self.task_manager.update_status(task_id, TaskStatus.FAILED, error=str(exc))
        finally:
            self._persist_live_agent(task_id)
            # Always release thread-local bookkeeping after the worker exits.
            self._threads.pop(task_id, None)
            self._stop_events.pop(task_id, None)

    async def _run_agent(
        self, 
        task_id: str, 
        runtime_config: RuntimeConfig, 
        stop_event: threading.Event, 
        mode: Literal["start", "retry", "continue"]
    ) -> None:
        """Build and execute the LLM agent for one task.
        这是工人代码，代码将在这里运行。

        Args:
            task_id: Task identifier.
            runtime_config: Effective LLM configuration.
            stop_event: Cooperative cancellation signal.
            mode: Start mode label used in prompts.

        Side effects:
            Mirrors the agent's stdout/stderr into the task log stream so the
            frontend can display live verbose output on the next refresh tick.
        """
        # Resolve the task and exit early if it disappeared or was already stopped.
        task = self.task_manager.get_task(task_id)  # 先拉任务的名，如果没有任务则退出。
        if task is None:
            return
        if stop_event.is_set():
            self.task_manager.update_status(task_id, TaskStatus.STOPPED)
            return

        workspace = Path(task.workspace)
        workspace.mkdir(parents=True, exist_ok=True)
        classification = self._configure_agent_for_task(task, runtime_config)
        agent = self.create_agent_for_task(task)
        prompt = self._user_prompt(task, mode)

        # Seed task artifacts that the frontend can show even before the run finishes.
        self.task_manager.set_task_artifact(task_id, 'workspace_dir', str(workspace))
        self.task_manager.set_task_artifact(task_id, 'pending_new_input', task.pending_new_input)
        self.task_manager.set_task_artifact(task_id, 'context_snapshot', self._build_agent_context_snapshot(agent))
        self.task_manager.set_task_artifact(task_id, 'agent_status', self._build_agent_status_snapshot(task_id, agent))

        # Emit the standard run metadata into the human-readable task log stream.
        self.task_manager.add_log(task_id, f'已加载技能: {", ".join(classification.skill_ids)}')
        self.task_manager.add_log(
            task_id,
            f'LLM provider: {_resolve_backend_provider(runtime_config.connector_type)} · connector: {runtime_config.connector_type}',
        )

        # Build the optional terminal mirror stream from runtime config without affecting task-log capture.
        mirror_stream = sys.__stdout__ if runtime_config.show_terminal_output else None

        # Execute the agent while always capturing verbose output into task logs.
        verbose_writer = _TaskVerboseLogWriter(task_id, self.task_manager, mirror_stream=mirror_stream)
        with _ThreadScopedStdIORedirect(verbose_writer):
            # 这里是模型的主线，在该函数内执行 agent 执行轮。
            # 注意：runtime_configure.temperature 可能没有从前端被正确传入。
            result = await agent.run_agent_round(
                prompt,
                verbose_info=True,
                max_turns=max(1, runtime_config.max_rounds),
                max_context_size=max(4096, runtime_config.max_context_chars),
                temperature=runtime_config.temperature if runtime_config.temperature is not None else 0.4,
                max_tokens=runtime_config.max_tokens if runtime_config.max_tokens is not None else 4096,
                stop_callback=stop_event.is_set,
            )
        verbose_writer.flush()

        # Refresh persisted context artifacts after the agent loop has produced final state.
        self._persist_agent_for_task(task_id, agent)
        self.task_manager.set_task_artifact(task_id, 'context_snapshot', self._build_agent_context_snapshot(agent))
        self.task_manager.set_task_artifact(task_id, 'agent_status', self._build_agent_status_snapshot(task_id, agent))
        self.task_manager.set_task_artifact(task_id, 'pending_new_input', task.pending_new_input)

        # Finalize task lifecycle based on stop state and detected terminal result.
        if stop_event.is_set():
            self.task_manager.update_status(task_id, TaskStatus.STOPPED)
            return

        self._maybe_auto_submit_flag(task, runtime_config, result)
        self.task_manager.add_log(task_id, 'Agent workflow 已完成')
        self.task_manager.update_status(task_id, TaskStatus.COMPLETED, result=result)

    def _build_agent_for_task(self, task: CTFTask, runtime_config: RuntimeConfig) -> Agent:
        """Construct the durable Agent object for one task."""
        provider = _resolve_backend_provider(runtime_config.connector_type)
        fetcher = self._build_fetcher(runtime_config, provider)
        workspace = Path(task.workspace)
        compression_profile = build_ctf_compression_profile(task.config.task_type.value)
        agent = Agent(
            llm_handler=fetcher,
            system_prompt=self._base_system_prompt(task, workspace),
            tools=[],
            max_concurrent_tools=4,
            compression_profile=compression_profile,
            context_mode='graph' if task.config.context_mode == 'graph' else 'linear',
        )
        agent.agent_state.task = task.config.name or task.id
        return agent

    def _configure_agent_for_task(self, task: CTFTask, runtime_config: RuntimeConfig):
        """Refresh the task Agent with current runtime config, prompt, and tools."""
        agent = self.create_agent_for_task(task)
        workspace = Path(task.workspace)
        workspace.mkdir(parents=True, exist_ok=True)

        provider = _resolve_backend_provider(runtime_config.connector_type)
        fetcher = self._build_fetcher(runtime_config, provider)
        classification = self._classify_task(task)
        system_prompt = enrich_prompt_with_ctf_skills(
            self._base_system_prompt(task, workspace),
            self.skills_root,
            classification,
        )
        knowledge_base = KnowledgeBase(self.kb_root) if self.kb_root.exists() else None
        selected_external_tool_names = [
            str(name).strip()
            for name in (task.config.external_tool_names or [])
            if str(name).strip()
        ]
        available_external_tool_names = set(hotplug_manager.get_hotplug_tool_names())
        missing_external_tool_names = [
            name for name in selected_external_tool_names
            if name not in available_external_tool_names
        ]
        tools = (
            create_shell_tools(sandbox_cwd=str(workspace))
            + create_ctf_tools(workspace)
            + create_knowledge_tools(knowledge_base)
            + hotplug_manager.build_runtime_tools(
                default_cwd=workspace,
                tool_names=task.config.external_tool_names,
            )
        )

        agent.llm_handler = fetcher
        agent.llm_context_handler.llm_handler = fetcher
        agent.update_system_prompt(system_prompt)
        agent.context_mode = 'graph' if task.config.context_mode == 'graph' else 'linear'
        agent.llm_context_handler.configure_context_mode(
            agent.context_mode,
            enable_tagging=agent.context_mode == 'graph',
        )
        agent.llm_context_handler.compression_profile = build_ctf_compression_profile(task.config.task_type.value)
        agent.tool_registry = agent.tool_registry.__class__()
        agent._register_builtin_tools()
        for tool in tools:
            agent.add_tool(tool)
        if missing_external_tool_names:
            self.task_manager.add_log(
                task.id,
                f'外置工具未找到: {", ".join(missing_external_tool_names)}',
            )
        if not agent.agent_state.task:
            agent.agent_state.task = task.config.name or task.id
        self._publish_agent_status(task.id, agent)
        return classification

    def _classify_task(self, task: CTFTask):
        """Classify one task and honor explicit skill choices."""
        file_names = [file_info.name for file_info in task.config.files]
        classification = classify_ctf_challenge(
            f'{task.config.name}\n{task.config.target}\n{task.config.system_prompt}',
            files=file_names,
        )
        selected_skill_ids = tuple(task.config.skills) if task.config.skills else classification.skill_ids
        return type(classification)(
            category=classification.category,
            task_type=classification.task_type,
            skill_ids=selected_skill_ids,
            scores=classification.scores,
            reasons=classification.reasons,
        )

    def _build_fetcher(self, runtime_config: RuntimeConfig, provider: str) -> LLMFetcher:
        """Build the LLM fetcher used by an Agent for current runtime settings."""
        fetcher_config = LLMBackendConfig(
            name="default",
            api_url=runtime_config.api_base or None,
            api_key=runtime_config.api_key,
            model=runtime_config.model,
            provider=provider,
            timeout=runtime_config.timeout,
        )
        return LLMFetcher(backends=[fetcher_config])

    def _agent_state_file(self, task_id: str) -> Path:
        """Return the durable Agent state JSON path for one task."""
        return self.task_manager.tasks_dir / task_id / 'agent_state.json'

    def _persist_live_agent(self, task_id: str) -> None:
        """Persist and publish a live Agent if it exists."""
        with self._agent_lock:
            agent = self._agents.get(task_id)
        if agent is not None:
            self._persist_agent_for_task(task_id, agent)
            self._publish_agent_status(task_id, agent)

    def _persist_agent_for_task(self, task_id: str, agent: Agent) -> None:
        """Write one Agent's durable state to disk as JSON."""
        state_file = self._agent_state_file(task_id)
        state_file.parent.mkdir(parents=True, exist_ok=True)
        state_file.write_text(
            json.dumps(self._serialize_agent(agent), ensure_ascii=False, indent=2),
            encoding='utf-8',
        )

    def _load_agent_for_task(self, task: CTFTask) -> Optional[Agent]:
        """Load a task Agent from disk when a persisted state exists."""
        state_file = self._agent_state_file(task.id)
        if not state_file.is_file():
            return None
        try:
            payload = json.loads(state_file.read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError):
            return None

        agent = self._build_agent_for_task(task, RuntimeConfig())
        self._restore_agent(agent, payload)
        return agent

    def _publish_agent_status(self, task_id: str, agent: Agent) -> None:
        """
        Expose live Agent status through task artifacts for frontend polling.
        Args:
            task_id: 任务 ID，通常是一组类似哈希的东西。
            agent: Agent 实例。
        """
        self.task_manager.set_task_artifact(task_id, 'context_snapshot', self._build_agent_context_snapshot(agent))
        self.task_manager.set_task_artifact(task_id, 'agent_status', self._build_agent_status_snapshot(task_id, agent))

    def _serialize_agent(
        self, 
        agent: Agent
    ) -> Dict[str, Any]:    # ← 布什戈门，怎么又用 Any？
        """
        Serialize an Agent's stable state without runtime-only tool callables.
        Args:
            agent: 等待序列化的 Agent 实例。
        """
        context_handler = agent.context_manager
        entries = []
        for context_id, entry in sorted(context_handler.context_timeline_dict.items()):
            if isinstance(entry, LLMContext):
                entries.append({
                    'kind': 'raw',
                    'id': context_id,
                    'timeline': entry.timeline,
                    'role': entry.role,
                    'content': entry.content,
                    'tool_call_info': list(entry.tool_call_info or []),
                    'tags': list(entry.tags or []),
                })
                continue
            if isinstance(entry, LLMContextCompacted):
                entries.append({
                    'kind': 'compacted',
                    'id': context_id,
                    'timeline': entry.timeline,
                    'abstract_msg': entry.abstract_msg,
                    'source_ids': [source.timeline for source in entry.source],
                    'source_timeline': list(entry.source_timeline),
                    'tags': list(entry.tags or []),
                })
        return {
            'version': 1,
            'saved_at': time.time(),
            'context_mode': agent.context_mode,
            'agent_state': asdict(agent.agent_state),
            'context': {
                'context_mode': context_handler.context_mode,
                'now_context_id': context_handler.now_context_id,
                'active_ids': context_handler.get_active_ids_window(),
                'entries': entries,
                'memories': context_handler.copy_memories() or [],
            },
        }

    def _restore_agent(self, agent: Agent, payload: Dict[str, Any]) -> None:
        """Restore serialized Agent state into an already constructed Agent."""
        state_payload = payload.get('agent_state', {})
        if isinstance(state_payload, dict):
            valid_fields = AgentState.__dataclass_fields__.keys()
            restored_state = AgentState(**{key: state_payload.get(key) for key in valid_fields if key in state_payload})
            for list_field in ('facts', 'hypotheses', 'failed_actions', 'do_not_repeat', 'next_actions'):
                if not isinstance(getattr(restored_state, list_field), list):
                    setattr(restored_state, list_field, [])
            if not isinstance(restored_state.artifacts, dict):
                restored_state.artifacts = {}
            if not isinstance(restored_state.credentials, list):
                restored_state.credentials = []
            if not isinstance(restored_state.known_routes, dict):
                restored_state.known_routes = {}
            agent.agent_state = restored_state

        context_payload = payload.get('context', {})
        if not isinstance(context_payload, dict):
            return
        handler = agent.context_manager
        handler.clear()
        pending_compacted = []
        for item in context_payload.get('entries', []):
            if not isinstance(item, dict):
                continue
            if item.get('kind') == 'raw':
                entry = LLMContext(
                    role=str(item.get('role') or 'assistant'),
                    content=str(item.get('content') or ''),
                    timeline=int(item.get('timeline') or item.get('id') or 0),
                    tool_call_info=[str(value) for value in item.get('tool_call_info', [])] if isinstance(item.get('tool_call_info'), list) else [],
                    tags=[str(value) for value in item.get('tags', [])] if isinstance(item.get('tags'), list) else [],
                )
                if entry.timeline > 0:
                    handler.context_timeline_dict[entry.timeline] = entry
                    if handler.retrieval_enabled:
                        handler.context_index.index_context(
                            entry,
                            tag_to_context=handler.tag_to_context if handler.enable_tagging else None,
                        )
            elif item.get('kind') == 'compacted':
                pending_compacted.append(item)

        for item in pending_compacted:
            try:
                timeline = int(item.get('timeline') or item.get('id') or 0)
            except (TypeError, ValueError):
                continue
            source_ids = [int(value) for value in item.get('source_ids', []) if str(value).strip().isdigit()]
            sources: list[LLMInfo] = [
                handler.context_timeline_dict[source_id]
                for source_id in source_ids
                if source_id in handler.context_timeline_dict
            ]
            source_timeline = [int(value) for value in item.get('source_timeline', []) if str(value).strip().isdigit()]
            entry = LLMContextCompacted(
                timeline=timeline,
                abstract_msg=str(item.get('abstract_msg') or ''),
                source=sources,
                source_timeline=source_timeline,
                tags=[str(value) for value in item.get('tags', [])] if isinstance(item.get('tags'), list) else [],
            )
            if entry.timeline > 0:
                handler.context_timeline_dict[entry.timeline] = entry
                if handler.retrieval_enabled:
                    handler.context_index.index_context(
                        entry,
                        tag_to_context=handler.tag_to_context if handler.enable_tagging else None,
                    )

        handler.now_context_id = int(context_payload.get('now_context_id') or (max(handler.context_timeline_dict.keys(), default=0) + 1))
        handler.set_active_ids([int(value) for value in context_payload.get('active_ids', []) if str(value).strip().isdigit()])
        if handler.enable_memory and isinstance(handler.memory_list, list):
            handler.memory_list[:] = [str(value) for value in context_payload.get('memories', [])]

    def _maybe_auto_submit_flag(self, task: CTFTask, runtime_config: RuntimeConfig, result: str) -> None:
        """
        Submit a solved flag to GZCTF when the user configured that workflow.
        Otherwise, do nothing.
        这个 flag 提交器的语义正确，是我需要的。

        Args:
            task: The task to submit the flag for.
            runtime_config: The runtime configuration for the task.
            result: The agent workflow result.
        """
        if self.gzctf_service is None or not self.gzctf_service.is_configured(runtime_config):
            return
        
        # 获取 flag
        flag = self._extract_candidate_flag(task, result)
        if not flag:
            self.task_manager.add_log(task.id, '未检测到可自动提交的 Flag，跳过 GZCTF 自动提交')
            return

        self.task_manager.add_log(task.id, '检测到候选 Flag，开始尝试 GZCTF 自动提交')
        try:
            # 提交 flag，并获取提交结果
            # todo: 如果 flag 不正确，则告知系统“这是个错误的 flag”并继续执行。
            submission = self.gzctf_service.submit_flag_for_task(
                user_id=task.user_id,
                config=runtime_config,
                task_name=task.config.name,
                task_target=task.config.target,
                gzctf_challenge_id=task.config.gzctf_challenge_id,
                flag=flag,
            )
            self.task_manager.set_task_artifact(task.id, 'gzctf_submission', submission)
            if not submission.get('attempted'):
                reason = submission.get('reason', 'unknown')
                self.task_manager.add_log(task.id, f'GZCTF 自动提交未执行: {reason}')
                return
            verdict = submission.get('verdict', 'unknown')
            challenge_name = submission.get('challenge_name', task.config.name)
            self.task_manager.add_log(task.id, f'GZCTF 自动提交完成: {challenge_name} -> {verdict}')
        except Exception as exc:
            self.task_manager.set_task_artifact(task.id, 'gzctf_submission', {
                'attempted': True,
                'accepted': False,
                'verdict': 'error',
                'message': str(exc),
            })
            self.task_manager.add_log(task.id, f'GZCTF 自动提交失败: {exc}')

    def _extract_candidate_flag(self, task: CTFTask, result: str) -> str:
        """
        Prefer `flag.txt`, then fall back to agent output and logs.
        
        Args:
            task: Task to extract flag from.
            result: Agent output to extract flag from.
        """
        workspace = Path(task.workspace)
        flag_path = workspace / 'flag.txt'
        if flag_path.is_file():
            flag_text = flag_path.read_text(encoding='utf-8', errors='ignore').strip()
            if flag_text:
                return flag_text.splitlines()[0].strip()

        for source in (result, '\n'.join(task.logs[-50:])):
            match = FLAG_PATTERN.search(str(source or ''))
            if match:
                return match.group(0)
        return ''

    def _build_agent_context_snapshot(self, agent: Agent) -> Dict[str, Any]:
        """Build a frontend-facing snapshot of the current Agent context state.

        Args:
            agent: Running Agent whose context and memories should be exposed.

        Returns:
            JSON-serializable payload grouped into uncompacted, compacted, and memory sections.
        """
        # Read the live context manager once so all derived sections share the same snapshot moment.
        context_handler = agent.context_manager

        # Split the unified timeline store into raw and compacted sections for frontend rendering.
        uncompacted_entries = []
        compacted_entries = []
        active_ids = set(context_handler.get_active_ids_window())
        for context_id, entry in sorted(context_handler.context_timeline_dict.items()):
            if isinstance(entry, LLMContext):
                uncompacted_entries.append({
                    'id': context_id,
                    'timeline': entry.timeline,
                    'active': context_id in active_ids,
                    'role': entry.role,
                    'content': entry.content,
                    'tool_call_info': list(entry.tool_call_info or []),
                    'tags': list(entry.tags or []),
                })
                continue

            if isinstance(entry, LLMContextCompacted):
                compacted_entries.append({
                    'id': context_id,
                    'timeline': entry.timeline,
                    'active': context_id in active_ids,
                    'abstract_msg': entry.abstract_msg,
                    'source_timeline': list(entry.source_timeline),
                    'source_count': len(entry.source),
                    'tags': list(entry.tags or []),
                })

        # Copy persistent memory summaries from the context handler so the snapshot is detached.
        memories = context_handler.copy_memories() or []
        memory_entries = [
            {'id': index, 'content': memory}
            for index, memory in enumerate(memories)
        ]

        # Return both raw sections and small counters so the frontend can render summary chips.
        return {
            'context_mode': context_handler.context_mode,
            'uncompacted': uncompacted_entries,
            'compacted': compacted_entries,
            'memories': memory_entries,
            'stats': {
                'uncompacted_count': len(uncompacted_entries),
                'compacted_count': len(compacted_entries),
                'memory_count': len(memory_entries),
            },
        }

    def _build_agent_status_snapshot(self, task_id: str, agent: Agent) -> Dict[str, Any]:
        """Build the frontend-facing Agent state payload for one task."""
        self._backfill_agent_state_from_context(agent)
        context_snapshot = self._build_agent_context_snapshot(agent)
        state_file = self._agent_state_file(task_id)
        context_handler = agent.context_manager
        return {
            'task_id': task_id,
            'state': asdict(agent.agent_state),
            'state_text': agent._render_agent_state(),
            'context': context_snapshot,
            'active_ids': context_handler.get_active_ids_window(),
            'context_length': context_handler.context_len(),
            'context_mode': agent.context_mode,
            'retrieval_enabled': context_handler.retrieval_enabled,
            'next_context_id': context_handler.now_context_id,
            'tool_count': len(agent.tool_registry.tools),
            'persisted': state_file.is_file(),
            'state_file': str(state_file),
            'updated_at': time.time(),
            'stats': {
                **context_snapshot.get('stats', {}),
                'active_count': len(context_handler.get_active_ids_window()),
                'context_length': context_handler.context_len(),
            },
        }

    def _backfill_agent_state_from_context(self, agent: Agent) -> None:
        """Populate empty AgentState facts from existing context for older tasks."""
        if agent.agent_state.facts:
            return
        context_handler = agent.context_manager
        for _, entry in sorted(context_handler.context_timeline_dict.items())[-8:]:
            if isinstance(entry, LLMContextCompacted):
                text = entry.abstract_msg
            elif isinstance(entry, LLMContext):
                text = entry.content or " ".join(entry.tool_call_info or [])
            else:
                continue
            summary = " ".join(str(text or "").split())
            if not summary:
                continue
            if len(summary) > 240:
                summary = f"{summary[:237]}..."
            agent.agent_state.facts.append(summary)
        agent.agent_state.facts = agent.agent_state.facts[-24:]

    def _base_system_prompt(self, task: CTFTask, workspace: Path) -> str:
        """Build the base system prompt for a CTF solving agent."""
        return build_ctf_system_prompt(
            workspace=str(workspace),
            task_name=task.config.name,
            task_type=task.config.task_type.value,
            target=task.config.target,
            user_prompt_supplement=task.config.system_prompt,
        )

    def _user_prompt(self, task: CTFTask, mode: str) -> str:
        """Build the user prompt sent to the agent for this workflow run."""
        file_lines = '\n'.join(f'- {file_info.name}: {file_info.path}' for file_info in task.config.files) or '- no files attached'
        return build_ctf_user_prompt(
            mode=mode,
            attached_files=file_lines,
            target=task.config.target,
            additional_input=task.pending_new_input,
        )
