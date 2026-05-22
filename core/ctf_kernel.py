"""CTF workflow orchestration backed by the local LLM agent framework."""

from __future__ import annotations

import asyncio
import contextlib
import re
import sys
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional, Literal


from core.json_types import JsonObject
from modules.llmfetcher import Agent, LLMFetcher, create_ctf_tools, create_obscura_tools, create_shell_tools
from modules.llmfetcher.ctf_module.ctf_skill_router import classify_ctf_challenge, enrich_prompt_with_ctf_skills
from modules.llmfetcher.ctf_module.ctf_tools import DEFAULT_FLAG_PATTERN
from modules.llmfetcher.tools.ctf_tools import create_knowledge_tools
from modules.rag.knowledge_base import KnowledgeBase

from .models import CTFTask, TaskStatus
from .models import RuntimeConfig


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
        if not text:
            return 0
        if self.mirror_stream is not None:
            self.mirror_stream.write(text)
        self._buffer += text
        while '\n' in self._buffer:
            line, self._buffer = self._buffer.split('\n', 1)
            self._emit_line(line)
        return len(text)

    def flush(self) -> None:
        """Flush any buffered partial line into the task log."""
        if self._buffer.strip():
            self._emit_line(self._buffer)
        self._buffer = ''
        if self.mirror_stream is not None:
            self.mirror_stream.flush()

    def _emit_line(self, line: str) -> None:
        """Persist one captured stdout/stderr line as a task log entry.

        Args:
            line: One logical line extracted from the captured stream.
        """
        normalized = str(line).rstrip('\r')
        if not normalized.strip():
            return
        self.task_manager.add_log(self.task_id, f'{self.prefix}: {normalized}')


def _contains_flag(text: str, pattern: str = DEFAULT_FLAG_PATTERN) -> bool:
    """Return whether a piece of text looks like a captured CTF flag."""
    return bool(text and re.search(pattern, text))


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


def _resolve_agent_tool_provider(backend_provider: str) -> str:
    """Return the tool schema provider used by the agent loop.

    LiteLLM exposes OpenAI-compatible tool calls in this project, so the
    agent should serialize tools in OpenAI format even when the backend
    request itself is routed through LiteLLM.
    """
    if backend_provider == 'anthropic':
        return 'anthropic'
    return 'openai'


class CTFWorkflowService:
    """Start, continue, retry, and stop LLM-backed CTF task workflows."""

    def __init__(
        self, 
        task_manager: TaskManager, 
        *, 
        skills_root: Path | str = 'ctf-skills', 
        kb_root: Path | str = 'kb'
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

        self._threads: Dict[str, threading.Thread] = {}     # 线程
        self._stop_events: Dict[str, threading.Event] = {}  # 停止事件列表

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
        try:
            asyncio.run(self._run_agent(task_id, runtime_config, stop_event, mode))
        except Exception as exc:
            self.task_manager.add_log(task_id, f'任务失败: {exc}')
            self.task_manager.update_status(task_id, TaskStatus.FAILED, error=str(exc))
        finally:
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
        这块代码将是工人代码。

        Args:
            task_id: Task identifier.
            runtime_config: Effective LLM configuration.
            stop_event: Cooperative cancellation signal.
            mode: Start mode label used in prompts.

        Side effects:
            Mirrors the agent's stdout/stderr into the task log stream so the
            frontend can display live verbose output on the next refresh tick.
        """
        task = self.task_manager.get_task(task_id)  # 先拉任务的名，如果没有任务则退出。
        if task is None:
            return
        if stop_event.is_set():
            self.task_manager.update_status(task_id, TaskStatus.STOPPED)
            return

        # Build a CTF-aware prompt from task metadata, attached files, and selected skills.
        workspace = Path(task.workspace)
        workspace.mkdir(parents=True, exist_ok=True)
        file_names = [file_info.name for file_info in task.config.files]
        classification = classify_ctf_challenge(
            f'{task.config.name}\n{task.config.target}\n{task.config.system_prompt}',
            files=file_names,
        )
        selected_skill_ids = tuple(task.config.skills) if task.config.skills else classification.skill_ids
        classification = type(classification)(
            category=classification.category,
            task_type=classification.task_type,
            skill_ids=selected_skill_ids,
            scores=classification.scores,
            reasons=classification.reasons,
        )
        system_prompt = enrich_prompt_with_ctf_skills(
            self._base_system_prompt(task, workspace),
            self.skills_root,
            classification,
        )

        # Construct tools scoped to the task workspace plus optional knowledge search.
        knowledge_base = KnowledgeBase(self.kb_root) if self.kb_root.exists() else None
        provider = _resolve_backend_provider(runtime_config.connector_type)
        tool_provider = _resolve_agent_tool_provider(provider)
        tools = (   # 创建工具，包括 shell ctf，还有知识库
            create_shell_tools(sandbox_cwd=str(workspace))
            + create_ctf_tools(workspace)
            # + create_obscura_tools()  # obscura - 但一些用户的电脑里可能没有 obscura，这东西是一个无头浏览器，在 github 里可以找到。
            + create_knowledge_tools(knowledge_base)
        )

        # 拉取模型使用的。
        fetcher = LLMFetcher(
            api_url=runtime_config.api_base or None,
            api_key=runtime_config.api_key,
            model=runtime_config.model,
            provider=provider,
            timeout=runtime_config.timeout,
        )
        agent = Agent(
            llm_handler=fetcher,
            system_prompt=system_prompt,
            tools=tools,
            provider=tool_provider,
            max_concurrent_tools=4,
        )
        prompt = self._user_prompt(task, mode)
        self.task_manager.add_log(task_id, f'已加载技能: {", ".join(classification.skill_ids)}')
        self.task_manager.add_log(
            task_id,
            f'LLM provider: {provider} · tool provider: {tool_provider} · connector: {runtime_config.connector_type}',
        )
        verbose_writer = _TaskVerboseLogWriter(task_id, self.task_manager, mirror_stream=sys.__stdout__)
        with contextlib.redirect_stdout(verbose_writer), contextlib.redirect_stderr(verbose_writer):
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
                flag_pattern=DEFAULT_FLAG_PATTERN,
            )
        verbose_writer.flush()
        if stop_event.is_set():
            self.task_manager.update_status(task_id, TaskStatus.STOPPED)
            return
        if _contains_flag(result):
            self.task_manager.add_log(task_id, '检测到 flag，任务已结束')
        self.task_manager.add_log(task_id, 'Agent workflow 已完成')
        self.task_manager.update_status(task_id, TaskStatus.COMPLETED, result=result)

    def _base_system_prompt(self, task: CTFTask, workspace: Path) -> str:
        """Build the base system prompt for a CTF solving agent."""
        return f"""You are ElfCTF's autonomous CTF solving agent.

Work only inside this task workspace: {workspace}

Solve the challenge by following observe -> hypothesize -> test -> verify -> report.
Prefer concrete tool evidence over guessing. Write helper scripts into the workspace when useful.
When you find a flag, save it to flag.txt and include it in the final answer.

Task name: {task.config.name}
Task type: {task.config.task_type.value}
Target: {task.config.target or '(none)'}
User prompt supplement:
{task.config.system_prompt or '(none)'}
"""

    def _user_prompt(self, task: CTFTask, mode: str) -> str:
        """Build the user prompt sent to the agent for this workflow run."""
        file_lines = '\n'.join(f'- {file_info.name}: {file_info.path}' for file_info in task.config.files) or '- no files attached'
        extra = f'\nAdditional user input:\n{task.pending_new_input}' if task.pending_new_input else ''
        return f"""Mode: {mode}

Solve this CTF task.

Attached files:
{file_lines}

Target:
{task.config.target or '(none)'}
{extra}
"""
