"""CTF workflow orchestration backed by the local LLM agent framework."""

from __future__ import annotations

import asyncio
import json
import re
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional, Literal

from core.json_types import JsonObject
from modules.llmfetcher import Agent, LLMFetcher, create_ctf_tools, create_obscura_tools, create_shell_tools
from modules.llmfetcher.llm_types import LLMBackendConfig, LLMOutput
from modules.llmfetcher.tools.ctf_tools import create_knowledge_tools
from modules.llmfetcher.ctf_module.ctf_skill_router import classify_ctf_challenge, enrich_prompt_with_ctf_skills
from services.tools.hotplug import hotplug_manager
from modules.rag.knowledge_base import KnowledgeBase

from .models import CTFTask, TaskStatus, RuntimeConfig
from .ctf_prompt import build_ctf_compression_profile, build_ctf_system_prompt, build_ctf_user_prompt

# Backward-compatible re-exports for existing importers.
# These symbols originally lived in this module and were extracted
# into separate files in the core/ package.
from .ctf_io import ThreadLocalStreamRouter, ThreadScopedStdIORedirect, TaskVerboseLogWriter  # noqa: F401
from .ctf_token_tracker import TaskTokenUsageTracker, UsageTrackingFetcher  # noqa: F401
from .ctf_agent_persistence import (  # noqa: F401
    serialize_agent, restore_agent, persist_agent, load_agent,
    build_agent_context_snapshot, build_agent_status_snapshot,
    backfill_agent_state_from_context, agent_state_file,
)

FLAG_PATTERN = re.compile(r"(?i)\b(?:flag|ctf|elfctf)\{[^}\s]{1,200}\}")


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


def _resolve_backend_provider(connector_type: str) -> str:
    """Map user-facing connector labels to LLMFetcher provider identifiers."""
    connector_lower = connector_type.strip().lower()
    if connector_lower in ('openai', 'gpt'):
        return 'openai'
    if connector_lower in ('anthropic', 'claude'):
        return 'anthropic'
    if connector_lower in ('openvino',):
        return 'openvino'
    return connector_type


class CTFWorkflowService:
    """Start, continue, retry, and stop LLM-backed CTF task workflows."""

    def __init__(
        self,
        task_manager,
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
        self.task_manager = task_manager
        self.skills_root = Path(skills_root)
        self.kb_root = Path(kb_root)
        self.gzctf_service = gzctf_service

        self._threads: Dict[str, threading.Thread] = {}
        self._stop_events: Dict[str, threading.Event] = {}
        self._agents: Dict[str, Agent] = {}
        self._agent_lock = threading.RLock()

    # ------------------------------------------------------------------
    # Agent lifecycle
    # ------------------------------------------------------------------

    def create_agent_for_task(self, task: CTFTask) -> Agent:
        """Create or load the durable Agent assigned to one task.

        The task quest is baked into the system prompt so the user message
        can be a simple start signal.
        """
        with self._agent_lock:
            agent: Optional[Agent] = self._agents.get(task.id)
            if agent is not None:
                self._publish_agent_status(task.id, agent)
                return agent

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

    # ------------------------------------------------------------------
    # Workflow lifecycle
    # ------------------------------------------------------------------

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
        mode: Literal["start", "retry", "continue"],
    ) -> WorkflowResult:
        """Validate task state and launch a background worker."""
        task = self.task_manager.get_task(task_id)
        if task is None:
            return WorkflowResult(False, code='task_not_found', message='任务未找到')
        if task.status == TaskStatus.RUNNING:
            return WorkflowResult(False, code='task_running', message='任务已在运行中')

        runtime_config = self.task_manager.get_runtime_config(task_id)
        if runtime_config is None:
            return WorkflowResult(
                False,
                code='missing_runtime_config',
                message='任务缺少运行配置',
                details={'hint': '请先在设置中保存可用的 API 配置后再开始任务。'},
            )

        stop_event = threading.Event()
        self._stop_events[task_id] = stop_event
        self.task_manager.update_status(task_id, TaskStatus.RUNNING)
        self.task_manager.add_log(task_id, f'启动 CTF workflow: {mode}')
        thread = threading.Thread(
            target=self._run_worker,
            args=(task_id, runtime_config, stop_event, mode),
            daemon=True,
        )
        self._threads[task_id] = thread
        thread.start()
        return WorkflowResult(True, code='task_started', message='任务已启动')

    def _run_worker(
        self,
        task_id: str,
        runtime_config: RuntimeConfig,
        stop_event: threading.Event,
        mode: Literal["start", "retry", "continue"],
    ) -> None:
        """Run a task workflow inside a private event loop."""
        try:
            asyncio.run(self._run_agent(task_id, runtime_config, stop_event, mode))
        except Exception as exc:
            self._persist_live_agent(task_id)
            self.task_manager.add_log(task_id, f'任务失败: {exc}')
            self.task_manager.update_status(task_id, TaskStatus.FAILED, error=str(exc))
        finally:
            self._persist_live_agent(task_id)
            self._threads.pop(task_id, None)
            self._stop_events.pop(task_id, None)

    async def _run_agent(
        self,
        task_id: str,
        runtime_config: RuntimeConfig,
        stop_event: threading.Event,
        mode: Literal["start", "retry", "continue"],
    ) -> None:
        """Build and execute the LLM agent for one task."""
        task = self.task_manager.get_task(task_id)
        if task is None:
            return
        if stop_event.is_set():
            self.task_manager.update_status(task_id, TaskStatus.STOPPED)
            return

        initial_usage = (
            task.artifacts.get('token_usage')
            if mode == 'continue' and isinstance(task.artifacts, dict)
            else None
        )
        usage_tracker = TaskTokenUsageTracker(
            task_id,
            self.task_manager,
            initial_snapshot=initial_usage if isinstance(initial_usage, dict) else None,
        )
        self.task_manager.set_task_artifact(task_id, 'token_usage', usage_tracker.snapshot())

        workspace = Path(task.workspace)
        workspace.mkdir(parents=True, exist_ok=True)
        classification = self._configure_agent_for_task(task, runtime_config, usage_tracker=usage_tracker)
        agent = self.create_agent_for_task(task)
        prompt = self._user_prompt(task, mode)

        self.task_manager.set_task_artifact(task_id, 'workspace_dir', str(workspace))
        self.task_manager.set_task_artifact(task_id, 'pending_new_input', task.pending_new_input)
        self.task_manager.set_task_artifact(task_id, 'context_snapshot', build_agent_context_snapshot(agent))
        self.task_manager.set_task_artifact(task_id, 'agent_status', self._build_agent_status_snapshot(task_id, agent))

        self.task_manager.add_log(task_id, f'已加载技能: {", ".join(classification.skill_ids)}')
        self.task_manager.add_log(
            task_id,
            f'LLM provider: {_resolve_backend_provider(runtime_config.connector_type)} · connector: {runtime_config.connector_type}',
        )

        mirror_stream = sys.__stdout__ if runtime_config.show_terminal_output else None
        verbose_writer = TaskVerboseLogWriter(task_id, self.task_manager, mirror_stream=mirror_stream)
        with ThreadScopedStdIORedirect(verbose_writer):
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

        self._persist_agent_for_task(task_id, agent)
        self.task_manager.set_task_artifact(task_id, 'context_snapshot', build_agent_context_snapshot(agent))
        self.task_manager.set_task_artifact(task_id, 'agent_status', self._build_agent_status_snapshot(task_id, agent))
        self.task_manager.set_task_artifact(task_id, 'pending_new_input', task.pending_new_input)
        self.task_manager.set_task_artifact(task_id, 'token_usage', usage_tracker.snapshot())

        if stop_event.is_set():
            self.task_manager.update_status(task_id, TaskStatus.STOPPED)
            return

        self._maybe_auto_submit_flag(task, runtime_config, result)
        self.task_manager.add_log(task_id, 'Agent workflow 已完成')
        self.task_manager.update_status(task_id, TaskStatus.COMPLETED, result=result)

    # ------------------------------------------------------------------
    # Agent building and configuration
    # ------------------------------------------------------------------

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

    def _configure_agent_for_task(
        self,
        task: CTFTask,
        runtime_config: RuntimeConfig,
        *,
        usage_tracker: Optional[TaskTokenUsageTracker] = None,
    ):
        """Refresh the task Agent with current runtime config, prompt, tools, and usage tracking."""
        agent = self.create_agent_for_task(task)
        workspace = Path(task.workspace)
        workspace.mkdir(parents=True, exist_ok=True)

        provider = _resolve_backend_provider(runtime_config.connector_type)
        fetcher = self._build_fetcher(runtime_config, provider, usage_tracker=usage_tracker)
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
        if hasattr(agent, 'state_machine'):
            agent.state_machine.llm_handler = fetcher
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

    def _build_fetcher(
        self,
        runtime_config: RuntimeConfig,
        provider: str,
        *,
        usage_tracker: Optional[TaskTokenUsageTracker] = None,
    ):
        """Build the LLM fetcher used by an Agent for current runtime settings."""
        fetcher_config = LLMBackendConfig(
            name="default",
            api_url=runtime_config.api_base or None,
            api_key=runtime_config.api_key,
            model=runtime_config.model,
            provider=provider,
            timeout=runtime_config.timeout,
        )
        fetcher = LLMFetcher(backends=[fetcher_config])
        if usage_tracker is not None:
            return UsageTrackingFetcher(fetcher, usage_tracker)
        return fetcher

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------

    def _agent_state_file(self, task_id: str) -> Path:
        return agent_state_file(self.task_manager.tasks_dir, task_id)

    def _persist_live_agent(self, task_id: str) -> None:
        with self._agent_lock:
            agent = self._agents.get(task_id)
        if agent is not None:
            self._persist_agent_for_task(task_id, agent)
            self._publish_agent_status(task_id, agent)

    def _persist_agent_for_task(self, task_id: str, agent: Agent) -> None:
        persist_agent(self._agent_state_file(task_id), agent)

    def _load_agent_for_task(self, task: CTFTask) -> Optional[Agent]:
        state_file = self._agent_state_file(task.id)
        if not state_file.is_file():
            return None
        agent = self._build_agent_for_task(task, RuntimeConfig())
        return agent if load_agent(state_file, agent) else None

    def _publish_agent_status(self, task_id: str, agent: Agent) -> None:
        self.task_manager.set_task_artifact(task_id, 'context_snapshot', build_agent_context_snapshot(agent))
        self.task_manager.set_task_artifact(task_id, 'agent_status', self._build_agent_status_snapshot(task_id, agent))

    def _build_agent_status_snapshot(self, task_id: str, agent: Agent) -> Dict[str, Any]:
        return build_agent_status_snapshot(agent, self._agent_state_file(task_id))

    # ------------------------------------------------------------------
    # Flag auto-submission
    # ------------------------------------------------------------------

    def _maybe_auto_submit_flag(self, task: CTFTask, runtime_config: RuntimeConfig, result: str) -> None:
        """Submit a solved flag to GZCTF when the user configured that workflow."""
        if self.gzctf_service is None or not self.gzctf_service.is_configured(runtime_config):
            return

        flag = self._extract_candidate_flag(task, result)
        if not flag:
            self.task_manager.add_log(task.id, '未检测到可自动提交的 Flag，跳过 GZCTF 自动提交')
            return

        self.task_manager.add_log(task.id, '检测到候选 Flag，开始尝试 GZCTF 自动提交')
        try:
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
        """Prefer flag.txt, then fall back to agent output and logs."""
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

    # ------------------------------------------------------------------
    # Prompt builders
    # ------------------------------------------------------------------

    def _base_system_prompt(self, task: CTFTask, workspace: Path) -> str:
        """Build the base system prompt for a CTF solving agent.

        The quest details are baked into the system prompt level so the user
        message only needs to be a simple start signal.
        """
        file_lines = '\n'.join(f'- {f.name}: {f.path}' for f in task.config.files) if task.config.files else ''
        return build_ctf_system_prompt(
            workspace=str(workspace),
            task_name=task.config.name,
            task_type=task.config.task_type.value,
            target=task.config.target,
            user_prompt_supplement=task.config.system_prompt,
            attached_files=file_lines,
        )

    def _user_prompt(self, task: CTFTask, mode: str) -> str:
        """Build the user prompt sent to the agent for this workflow run.

        The quest details live in the system prompt.  The user message is
        deliberately minimal so the agent starts working immediately.
        """
        return build_ctf_user_prompt(
            mode=mode,
            additional_input=task.pending_new_input,
        )
