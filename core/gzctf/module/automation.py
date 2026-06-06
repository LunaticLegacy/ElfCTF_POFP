"""Run end-to-end GZCTF challenge harvesting and solve orchestration."""

from __future__ import annotations

import json
import re
import threading
import time
import uuid
from copy import deepcopy
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urljoin, urlparse

from core.ctf_module.ctf_skill_router import classify_ctf_challenge
from core.models import CTFTaskConfig, RuntimeConfig, TaskStatus, TaskType
from services.tasks.manager import UploadedTaskFile


TERMINAL_RECORD_STATUSES = {"completed", "failed", "stopped", "cancelled"}
ACTIVE_RECORD_STATUSES = {"preparing", "creating_task", "started", "running"}


def _now() -> float:
    return time.time()


def _stringify(value: Any) -> str:
    return str(value or "").strip()


def _json_clone(value: Any) -> Any:
    try:
        return json.loads(json.dumps(value, ensure_ascii=False))
    except (TypeError, ValueError):
        return deepcopy(value)


@dataclass
class ChallengeRunRecord:
    """One challenge tracked inside a GZCTF automation run."""

    challenge_id: str
    title: str
    category: str = ""
    status: str = "queued"
    task_id: str = ""
    task_status: str = ""
    verdict: str = ""
    error: str = ""
    attachment_count: int = 0
    target: str = ""
    connection_hint: str = ""
    has_remote_target: bool = False
    created_at: float = field(default_factory=_now)
    updated_at: float = field(default_factory=_now)

    def to_dict(self) -> dict:
        """Serialize this challenge run record for the API."""
        return {
            "challengeId": self.challenge_id,
            "title": self.title,
            "category": self.category,
            "status": self.status,
            "taskId": self.task_id,
            "taskStatus": self.task_status,
            "verdict": self.verdict,
            "error": self.error,
            "attachmentCount": self.attachment_count,
            "target": self.target,
            "connectionHint": self.connection_hint,
            "hasRemoteTarget": self.has_remote_target,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ChallengeRunRecord":
        """Rehydrate one challenge record from persisted JSON data."""
        return cls(
            challenge_id=_stringify(data.get("challengeId", data.get("challenge_id"))),
            title=_stringify(data.get("title")),
            category=_stringify(data.get("category")),
            status=_stringify(data.get("status")) or "queued",
            task_id=_stringify(data.get("taskId", data.get("task_id"))),
            task_status=_stringify(data.get("taskStatus", data.get("task_status"))),
            verdict=_stringify(data.get("verdict")),
            error=_stringify(data.get("error")),
            attachment_count=int(data.get("attachmentCount", data.get("attachment_count", 0)) or 0),
            target=_stringify(data.get("target")),
            connection_hint=_stringify(data.get("connectionHint", data.get("connection_hint"))),
            has_remote_target=bool(data.get("hasRemoteTarget", data.get("has_remote_target", False))),
            created_at=float(data.get("created_at", _now()) or _now()),
            updated_at=float(data.get("updated_at", _now()) or _now()),
        )


@dataclass
class AutomationRunRecord:
    """Top-level orchestration record for one auto-solve campaign."""

    id: str
    user_id: str
    game_url: str
    username: str
    status: str = "pending"
    message: str = ""
    created_at: float = field(default_factory=_now)
    updated_at: float = field(default_factory=_now)
    total_challenges: int = 0
    created_tasks: int = 0
    started_tasks: int = 0
    completed_tasks: int = 0
    accepted_flags: int = 0
    failed_tasks: int = 0
    pending_tasks: int = 0
    running_tasks: int = 0
    cancelled_tasks: int = 0
    max_concurrent_tasks: int = 3
    cancel_requested: bool = False
    challenges: List[ChallengeRunRecord] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Serialize this run record for the API."""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "gameUrl": self.game_url,
            "username": self.username,
            "status": self.status,
            "message": self.message,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "totalChallenges": self.total_challenges,
            "createdTasks": self.created_tasks,
            "startedTasks": self.started_tasks,
            "completedTasks": self.completed_tasks,
            "acceptedFlags": self.accepted_flags,
            "failedTasks": self.failed_tasks,
            "pendingTasks": self.pending_tasks,
            "runningTasks": self.running_tasks,
            "cancelledTasks": self.cancelled_tasks,
            "maxConcurrentTasks": self.max_concurrent_tasks,
            "cancelRequested": self.cancel_requested,
            "challenges": [item.to_dict() for item in self.challenges],
        }

    @classmethod
    def from_dict(cls, data: dict) -> "AutomationRunRecord":
        """Rehydrate one run record from persisted JSON data."""
        return cls(
            id=_stringify(data.get("id")),
            user_id=_stringify(data.get("user_id")),
            game_url=_stringify(data.get("gameUrl", data.get("game_url"))),
            username=_stringify(data.get("username")),
            status=_stringify(data.get("status")) or "pending",
            message=_stringify(data.get("message")),
            created_at=float(data.get("created_at", _now()) or _now()),
            updated_at=float(data.get("updated_at", _now()) or _now()),
            total_challenges=int(data.get("totalChallenges", data.get("total_challenges", 0)) or 0),
            created_tasks=int(data.get("createdTasks", data.get("created_tasks", 0)) or 0),
            started_tasks=int(data.get("startedTasks", data.get("started_tasks", 0)) or 0),
            completed_tasks=int(data.get("completedTasks", data.get("completed_tasks", 0)) or 0),
            accepted_flags=int(data.get("acceptedFlags", data.get("accepted_flags", 0)) or 0),
            failed_tasks=int(data.get("failedTasks", data.get("failed_tasks", 0)) or 0),
            pending_tasks=int(data.get("pendingTasks", data.get("pending_tasks", 0)) or 0),
            running_tasks=int(data.get("runningTasks", data.get("running_tasks", 0)) or 0),
            cancelled_tasks=int(data.get("cancelledTasks", data.get("cancelled_tasks", 0)) or 0),
            max_concurrent_tasks=int(data.get("maxConcurrentTasks", data.get("max_concurrent_tasks", 3)) or 3),
            cancel_requested=bool(data.get("cancelRequested", data.get("cancel_requested", False))),
            challenges=[
                ChallengeRunRecord.from_dict(item)
                for item in data.get("challenges", [])
                if isinstance(item, dict)
            ],
        )


class GZCTFAutomationService:
    """Harvest GZCTF challenge metadata and fan it out into solve tasks."""

    def __init__(
        self,
        data_dir: Path | str,
        *,
        task_manager: Any,
        workflow: Any,
        gzctf_service: Any,
    ) -> None:
        self._root = Path(data_dir).expanduser().resolve() / "gzctf" / "automation-runs"
        self._root.mkdir(parents=True, exist_ok=True)
        self.task_manager = task_manager
        self.workflow = workflow
        self.gzctf_service = gzctf_service
        self._lock = threading.RLock()
        self._runs: Dict[str, AutomationRunRecord] = {}
        self._threads: Dict[str, threading.Thread] = {}
        self._load_runs()

    def _run_path(self, run_id: str) -> Path:
        return self._root / f"{run_id}.json"

    def _load_runs(self) -> None:
        """Load persisted automation runs from disk at startup."""
        for path in sorted(self._root.glob("*.json")):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            run = AutomationRunRecord.from_dict(payload)
            if run.id:
                self._runs[run.id] = run

    def _persist_run(self, run: AutomationRunRecord) -> None:
        """Write one run snapshot to disk."""
        run.updated_at = _now()
        self._run_path(run.id).write_text(
            json.dumps(run.to_dict(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def list_runs(self, *, user_id: str) -> List[dict]:
        """Return all runs for one user, newest first."""
        with self._lock:
            runs = [self._refresh_run_snapshot(run) for run in self._runs.values() if run.user_id == user_id]
        runs.sort(key=lambda item: item.updated_at, reverse=True)
        return [run.to_dict() for run in runs]

    def get_run(self, run_id: str, *, user_id: str) -> Optional[dict]:
        """Return one refreshed run if it belongs to the user."""
        with self._lock:
            run = self._runs.get(run_id)
            if run is None or run.user_id != user_id:
                return None
            return self._refresh_run_snapshot(run).to_dict()

    def start_run(
        self,
        *,
        user_id: str,
        runtime_config: RuntimeConfig,
        challenge_limit: int = 0,
        max_concurrent_tasks: int = 3,
    ) -> dict:
        """Create a new automation run and launch its background scheduler."""
        self.gzctf_service.validate_config(runtime_config)
        if not self.gzctf_service.is_configured(runtime_config):
            raise ValueError("未配置 GZCTF 比赛链接、账号或密码")

        run_id = uuid.uuid4().hex
        run = AutomationRunRecord(
            id=run_id,
            user_id=user_id,
            game_url=_stringify(runtime_config.gzctf_game_url),
            username=_stringify(runtime_config.gzctf_username),
            status="queued",
            message="准备读取比赛题目",
            max_concurrent_tasks=max(1, int(max_concurrent_tasks or 1)),
        )
        with self._lock:
            self._runs[run_id] = run
            self._persist_run(run)

        thread = threading.Thread(
            target=self._run_campaign,
            args=(
                run_id,
                user_id,
                RuntimeConfig(**runtime_config.to_dict()),
                max(0, int(challenge_limit or 0)),
            ),
            daemon=True,
        )
        with self._lock:
            self._threads[run_id] = thread
        thread.start()
        return run.to_dict()

    def cancel_run(self, run_id: str, *, user_id: str) -> Optional[dict]:
        """Request cancellation for one automation run."""
        with self._lock:
            run = self._runs.get(run_id)
            if run is None or run.user_id != user_id:
                return None
            if run.status in {"completed", "failed", "cancelled"}:
                return self._refresh_run_snapshot(run).to_dict()
            run.cancel_requested = True
            if run.status != "cancelling":
                run.status = "cancelling"
                run.message = "已请求取消，停止继续派发题目并尝试停止运行中的任务"
            self._persist_run(run)
            return run.to_dict()

    def _run_campaign(
        self,
        run_id: str,
        user_id: str,
        runtime_config: RuntimeConfig,
        challenge_limit: int,
    ) -> None:
        """Fetch challenge metadata and manage a bounded launch queue."""
        run = self._runs[run_id]
        try:
            self._set_run_status(run, "running", "正在登录 GZCTF 并拉取题目列表")
            base_url, game_id = self.gzctf_service.parse_game_url(runtime_config.gzctf_game_url)
            session = self.gzctf_service.ensure_authenticated_session(user_id, runtime_config)
            details = self.gzctf_service.fetch_game_details(session, base_url, game_id)
            challenge_items = self._dedupe_challenges(self.gzctf_service.list_challenge_candidates(details))
            if challenge_limit > 0:
                challenge_items = challenge_items[:challenge_limit]

            # Materialize the whole queue first so the UI can show pending work immediately.
            run.total_challenges = len(challenge_items)
            run.challenges = [
                ChallengeRunRecord(
                    challenge_id=self._challenge_identifier(challenge),
                    title=self._challenge_title(challenge),
                    category=self._challenge_category(challenge),
                    status="pending",
                )
                for challenge in challenge_items
            ]
            run.pending_tasks = len(run.challenges)
            run.message = f"已发现 {len(challenge_items)} 道题，准备按队列派发"
            self._persist_run(run)

            challenge_by_id = {
                self._challenge_identifier(challenge): _json_clone(challenge)
                for challenge in challenge_items
                if self._challenge_identifier(challenge)
            }

            while True:
                self._refresh_run_snapshot(run)
                if run.cancel_requested:
                    self._request_stop_for_active_tasks(run)
                    if self._all_records_terminal(run):
                        run.status = "cancelled"
                        run.message = f"已取消，停止了 {run.cancelled_tasks} 道题"
                        self._persist_run(run)
                        break
                    time.sleep(1.0)
                    continue

                available_slots = max(0, run.max_concurrent_tasks - run.running_tasks)
                pending_records = [item for item in run.challenges if item.status == "pending"]
                if available_slots > 0 and pending_records:
                    for record in pending_records[:available_slots]:
                        challenge = challenge_by_id.get(record.challenge_id)
                        if challenge is None:
                            record.status = "failed"
                            record.error = "题目元数据缺失，无法创建任务"
                            record.updated_at = _now()
                            self._persist_run(run)
                            continue
                        self._create_and_start_task_for_challenge(
                            run=run,
                            record=record,
                            challenge=challenge,
                            base_url=base_url,
                            game_id=game_id,
                            session=session,
                            runtime_config=runtime_config,
                            user_id=user_id,
                        )
                    self._refresh_run_snapshot(run)

                if self._all_records_terminal(run):
                    if run.status not in {"completed", "cancelled"}:
                        run.status = "completed"
                        run.message = (
                            f"已收束 {run.completed_tasks + run.failed_tasks + run.cancelled_tasks}/"
                            f"{run.total_challenges} 道题，Accepted {run.accepted_flags}"
                        )
                        self._persist_run(run)
                    break

                if run.total_challenges == 0:
                    run.status = "completed"
                    run.message = "比赛中没有可处理的题目"
                    self._persist_run(run)
                    break

                if pending_records:
                    run.message = (
                        f"队列运行中：pending {run.pending_tasks} / running {run.running_tasks} / "
                        f"completed {run.completed_tasks}"
                    )
                    self._persist_run(run)
                time.sleep(1.0)
        except Exception as exc:
            self._set_run_status(run, "failed", f"GZCTF 自动化失败: {exc}")
        finally:
            with self._lock:
                self._threads.pop(run_id, None)
                self._persist_run(run)

    def _set_run_status(self, run: AutomationRunRecord, status: str, message: str) -> None:
        """Update one run status and persist it immediately."""
        with self._lock:
            run.status = status
            run.message = message
            self._persist_run(run)

    def _create_and_start_task_for_challenge(
        self,
        *,
        run: AutomationRunRecord,
        record: ChallengeRunRecord,
        challenge: dict,
        base_url: str,
        game_id: int,
        session: Any,
        runtime_config: RuntimeConfig,
        user_id: str,
    ) -> None:
        """Create attachments, task config, and workflow for one challenge."""
        record.updated_at = _now()
        record.status = "preparing"
        self._persist_run(run)

        # Enrich each challenge with detail/runtime payloads before deriving the target.
        enriched_challenge = self._enrich_challenge_payload(
            challenge=challenge,
            session=session,
            base_url=base_url,
            game_id=game_id,
        )
        title = self._challenge_title(enriched_challenge)
        challenge_id = self._challenge_identifier(enriched_challenge)
        attachment_specs = self._collect_attachment_specs(enriched_challenge, base_url)
        uploads = self._download_attachments(session, attachment_specs)
        record.attachment_count = len(uploads)

        fallback_target = self._build_target_url(runtime_config.gzctf_game_url, game_id, challenge_id, title)
        target = self._extract_preferred_target(enriched_challenge, base_url=base_url) or fallback_target
        connection_hint = self._challenge_connection_hint(enriched_challenge)
        record.target = target
        record.connection_hint = connection_hint
        record.has_remote_target = bool(target and target != fallback_target)
        record.status = "creating_task"
        self._persist_run(run)

        task_config = self._build_task_config(
            challenge=enriched_challenge,
            game_url=runtime_config.gzctf_game_url,
            game_id=game_id,
            attachment_names=[upload.name for upload in uploads],
        )
        task_result = self.task_manager.create_task(task_config, user_id=user_id)
        if not task_result.success or task_result.task is None:
            record.status = "failed"
            record.error = task_result.error_message or f"创建任务失败: {title}"
            record.updated_at = _now()
            self._persist_run(run)
            return

        task = task_result.task
        record.task_id = task.id
        if uploads:
            self.task_manager.attach_uploaded_files(task.id, uploads)
        self.workflow.create_agent_for_task(task)
        self.task_manager.prepare_runtime_config(task.id, runtime_config)

        if run.cancel_requested:
            record.status = "cancelled"
            record.error = "自动化运行已取消，未启动该任务"
            record.updated_at = _now()
            self._persist_run(run)
            return

        workflow_result = self.workflow.start_ctf_analysis(task.id)
        if workflow_result.success:
            record.status = "started"
        else:
            record.status = "failed"
            record.error = workflow_result.message or "启动任务失败"
        record.updated_at = _now()
        self._persist_run(run)

    def _build_task_config(
        self,
        *,
        challenge: dict,
        game_url: str,
        game_id: int,
        attachment_names: List[str],
    ) -> CTFTaskConfig:
        """Build a solver task config from a GZCTF challenge payload."""
        title = self._challenge_title(challenge)
        challenge_id = self._challenge_identifier(challenge)
        description = self._challenge_description(challenge)
        connection_hint = self._challenge_connection_hint(challenge)
        combined_text = "\n".join(
            part for part in [title, self._challenge_category(challenge), description, connection_hint] if part
        )
        classification = classify_ctf_challenge(combined_text, files=attachment_names)
        try:
            task_type = TaskType(str(classification.task_type).upper())
        except ValueError:
            task_type = TaskType.MISC

        target = self._extract_preferred_target(challenge, base_url=urlparse(game_url).scheme + "://" + urlparse(game_url).netloc)
        if not target:
            target = self._build_target_url(game_url, game_id, challenge_id, title)
        prompt_parts = [
            f"GZCTF challenge title: {title}",
            f"GZCTF challenge id: {challenge_id}",
        ]
        if description:
            prompt_parts.append("Challenge description:\n" + description)
        if connection_hint:
            prompt_parts.append("Connection / service hints:\n" + connection_hint)
        if attachment_names:
            prompt_parts.append("Downloaded attachments:\n" + "\n".join(f"- {name}" for name in attachment_names))

        return CTFTaskConfig(
            name=title,
            task_type=task_type,
            target=target,
            gzctf_challenge_id=challenge_id,
            system_prompt="\n\n".join(prompt_parts),
            workflow_kind="solve",
            task_mode="classic",
            execution_mode="single",
            context_mode="linear",
            skills=[],
        )

    def _refresh_run_snapshot(self, run: AutomationRunRecord) -> AutomationRunRecord:
        """Refresh challenge/task status counters from the live task manager."""
        created = 0
        started = 0
        completed = 0
        accepted = 0
        failed = 0
        pending = 0
        running = 0
        cancelled = 0
        for record in run.challenges:
            if record.task_id:
                created += 1
            task = self.task_manager.get_task(record.task_id, user_id=run.user_id) if record.task_id else None
            if task is not None:
                record.task_status = task.status.value
                submission = task.artifacts.get("gzctf_submission") if isinstance(task.artifacts, dict) else {}
                verdict = _stringify(submission.get("verdict")) if isinstance(submission, dict) else ""
                if verdict:
                    record.verdict = verdict
                if task.status == TaskStatus.RUNNING:
                    record.status = "running"
                elif task.status == TaskStatus.COMPLETED:
                    record.status = "completed"
                    completed += 1
                elif task.status == TaskStatus.FAILED:
                    record.status = "failed"
                    record.error = _stringify(task.error)
                    failed += 1
                elif task.status == TaskStatus.STOPPED:
                    record.status = "cancelled" if run.cancel_requested else "stopped"
                record.updated_at = _now()

            if record.verdict == "accepted":
                accepted += 1
            if record.status in {"pending", "queued", "preparing", "creating_task"}:
                pending += 1
            if record.status in {"started", "running", "completed", "failed", "stopped", "cancelled"}:
                started += 1 if record.task_id else 0
            if record.status in {"started", "running"}:
                running += 1
            elif record.status == "completed":
                completed += 1
            elif record.status == "failed":
                failed += 1
            elif record.status in {"cancelled", "stopped"}:
                cancelled += 1

        run.created_tasks = created
        run.started_tasks = started
        run.completed_tasks = completed
        run.accepted_flags = accepted
        run.failed_tasks = failed
        run.pending_tasks = pending
        run.running_tasks = running
        run.cancelled_tasks = cancelled
        if run.status in {"queued", "running", "launched", "cancelling"} and self._all_records_terminal(run):
            if run.cancel_requested:
                run.status = "cancelled"
                run.message = f"已取消，停止了 {cancelled} 道题"
            else:
                run.status = "completed"
                run.message = f"已收束 {completed + failed + cancelled}/{run.total_challenges} 道题，Accepted {accepted}"
        self._persist_run(run)
        return run

    def _request_stop_for_active_tasks(self, run: AutomationRunRecord) -> None:
        """Stop all running tasks and cancel records that were never launched."""
        for record in run.challenges:
            if record.status == "pending":
                record.status = "cancelled"
                record.error = "自动化运行已取消，未进入求解队列"
                record.updated_at = _now()
            elif record.status in {"preparing", "creating_task"} and not record.task_id:
                record.status = "cancelled"
                record.error = "自动化运行已取消，任务尚未启动"
                record.updated_at = _now()
            elif record.task_id:
                task = self.task_manager.get_task(record.task_id, user_id=run.user_id)
                if task is not None and task.status == TaskStatus.RUNNING:
                    self.workflow.stop_task(record.task_id)
        self._persist_run(run)

    def _all_records_terminal(self, run: AutomationRunRecord) -> bool:
        """Return whether every challenge record has reached a terminal state."""
        return all(record.status in TERMINAL_RECORD_STATUSES for record in run.challenges)

    def _dedupe_challenges(self, items: Iterable[dict]) -> List[dict]:
        """Remove duplicate challenge payloads based on the exposed challenge id."""
        seen: set[str] = set()
        result: List[dict] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            challenge_id = self._challenge_identifier(item)
            if not challenge_id or challenge_id in seen:
                continue
            seen.add(challenge_id)
            result.append(item)
        result.sort(key=lambda item: (self._challenge_category(item), self._challenge_title(item).lower()))
        return result

    def _challenge_identifier(self, challenge: dict) -> str:
        """Return the best-known stable GZCTF challenge identifier."""
        for key in ("id", "gameChallengeId", "challengeId"):
            value = _stringify(challenge.get(key))
            if value:
                return value
        return ""

    def _challenge_title(self, challenge: dict) -> str:
        """Return a readable challenge title."""
        for key in ("title", "name", "slug", "tag"):
            value = _stringify(challenge.get(key))
            if value:
                return value
        challenge_id = self._challenge_identifier(challenge)
        return f"challenge-{challenge_id or 'unknown'}"

    def _challenge_category(self, challenge: dict) -> str:
        """Return the category/type label exposed by the payload."""
        for key in ("category", "type", "topic", "group"):
            value = challenge.get(key)
            if isinstance(value, dict):
                for nested_key in ("name", "title", "type"):
                    nested_value = _stringify(value.get(nested_key))
                    if nested_value:
                        return nested_value
            normalized = _stringify(value)
            if normalized:
                return normalized
        return ""

    def _challenge_description(self, challenge: dict) -> str:
        """Return a cleaned, human-readable challenge statement."""
        parts: List[str] = []
        for key in ("description", "content", "body", "html", "statement"):
            value = challenge.get(key)
            if isinstance(value, str) and value.strip():
                cleaned = re.sub(r"<[^>]+>", " ", value)
                cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
                parts.append(cleaned.strip())
        return "\n\n".join(dict.fromkeys(part for part in parts if part))

    def _challenge_connection_hint(self, challenge: dict) -> str:
        """Collect readable service, container, and instance hints from nested payloads."""
        lines: List[str] = []
        seen: set[str] = set()

        def add_line(line: str) -> None:
            normalized = _stringify(line)
            if normalized and normalized not in seen:
                seen.add(normalized)
                lines.append(normalized)

        def walk(value: Any, path: str = "") -> None:
            if isinstance(value, dict):
                for key, nested in value.items():
                    key_lower = str(key).lower()
                    next_path = f"{path}.{key}" if path else str(key)
                    if key_lower in {"connection", "service", "instance", "endpoint", "container", "remote", "docker", "host", "port"}:
                        normalized = _stringify(nested)
                        if normalized:
                            add_line(f"{next_path}: {normalized}")
                    walk(nested, next_path)
            elif isinstance(value, list):
                for index, item in enumerate(value):
                    walk(item, f"{path}[{index}]")
            elif isinstance(value, str):
                candidate = value.strip()
                if re.search(r"\b(?:nc|tcp|udp|http|https|ws|wss)\b", candidate, flags=re.I):
                    add_line(f"{path or 'hint'}: {candidate}")
                elif re.search(r"\b[a-zA-Z0-9.-]+:\d{2,5}\b", candidate):
                    add_line(f"{path or 'hint'}: {candidate}")

        walk(challenge)
        return "\n".join(lines)

    def _build_target_url(self, game_url: str, game_id: int, challenge_id: str, title: str) -> str:
        """Build the fallback challenge page URL used when no remote target is visible."""
        parsed = urlparse(game_url)
        base_url = f"{parsed.scheme}://{parsed.netloc}"
        slug = re.sub(r"[^a-zA-Z0-9]+", "-", title).strip("-") or challenge_id
        return f"{base_url}/games/{game_id}/challenges#{challenge_id}-{slug}"

    def _enrich_challenge_payload(
        self,
        *,
        challenge: dict,
        session: Any,
        base_url: str,
        game_id: int,
    ) -> dict:
        """Merge a challenge card with detail/runtime payloads when available."""
        merged = _json_clone(challenge)
        challenge_id = self._challenge_identifier(merged)
        challenge_id_int = int(challenge_id) if challenge_id.isdigit() else None
        if challenge_id_int is None:
            return merged
        for path in (
            f"/api/game/{game_id}/challenges/{challenge_id_int}",
            f"/api/game/{game_id}/challenges/{challenge_id_int}/detail",
            f"/api/game/{game_id}/challenges/{challenge_id_int}/details",
            f"/api/game/{game_id}/challenges/{challenge_id_int}/instance",
            f"/api/game/{game_id}/challenges/{challenge_id_int}/container",
        ):
            try:
                response = session.get(urljoin(base_url + "/", path.lstrip("/")), timeout=20)
                if response.status_code >= 400:
                    continue
                payload = response.json() if response.content else None
            except Exception:
                continue
            if isinstance(payload, dict):
                merged = self._merge_dicts(merged, payload)
        return merged

    def _merge_dicts(self, base: dict, overlay: dict) -> dict:
        """Deep-merge two dictionaries without dropping nested challenge metadata."""
        result = _json_clone(base)
        for key, value in overlay.items():
            if isinstance(result.get(key), dict) and isinstance(value, dict):
                result[key] = self._merge_dicts(result[key], value)
            else:
                result[key] = _json_clone(value)
        return result

    def _extract_preferred_target(self, challenge: dict, *, base_url: str) -> str:
        """Return the best remote endpoint exposed by nested challenge data."""
        candidates = self._extract_target_candidates(challenge, base_url=base_url)
        if not candidates:
            return ""
        candidates.sort(key=self._target_candidate_priority)
        return candidates[0]

    def _target_candidate_priority(self, candidate: str) -> tuple[int, int]:
        """Prefer first-class URLs over host:port fallbacks when multiple targets exist."""
        normalized = _stringify(candidate).lower()
        if normalized.startswith(("https://", "http://", "wss://", "ws://")):
            return (0, len(normalized))
        if normalized.startswith("/"):
            return (1, len(normalized))
        return (2, len(normalized))

    def _extract_target_candidates(self, challenge: dict, *, base_url: str) -> List[str]:
        """Extract URLs and host:port endpoints from nested challenge payloads."""
        candidates: List[str] = []
        seen: set[str] = set()

        def add_candidate(value: str) -> None:
            normalized = _stringify(value)
            if not normalized:
                return
            if normalized.startswith("/"):
                normalized = urljoin(base_url + "/", normalized)
            if normalized not in seen:
                seen.add(normalized)
                candidates.append(normalized)

        def walk(value: Any, path: str = "") -> None:
            if isinstance(value, dict):
                for key, nested in value.items():
                    key_lower = str(key).lower()
                    next_path = f"{path}.{key}" if path else str(key)
                    if key_lower in {"url", "href", "endpoint", "remote", "host", "port", "connection", "tcp", "http", "instance", "container"}:
                        self._extract_text_endpoints(_stringify(nested), add_candidate)
                    walk(nested, next_path)
            elif isinstance(value, list):
                for item in value:
                    walk(item, path)
            elif isinstance(value, str):
                self._extract_text_endpoints(value, add_candidate)

        walk(challenge)
        return candidates

    def _extract_text_endpoints(self, text: str, add_candidate: Any) -> None:
        """Parse endpoint-like strings from one text blob."""
        candidate = _stringify(text)
        if not candidate:
            return
        for match in re.findall(r"https?://[^\s'\"<>]+|wss?://[^\s'\"<>]+", candidate):
            add_candidate(match.rstrip("),.;"))
        for match in re.findall(r"\bnc\s+([a-zA-Z0-9.-]+)\s+(\d{2,5})\b", candidate):
            add_candidate(f"{match[0]}:{match[1]}")
        for match in re.findall(r"\b([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|(?:\d{1,3}\.){3}\d{1,3}|localhost):(\d{2,5})\b", candidate):
            add_candidate(f"{match[0]}:{match[1]}")
        if candidate.startswith("/"):
            add_candidate(candidate)

    def _collect_attachment_specs(self, challenge: dict, base_url: str) -> List[dict]:
        """Collect downloadable attachment URLs from nested challenge payloads."""
        specs: List[dict] = []
        seen_urls: set[str] = set()

        def add_spec(url: str, name: str) -> None:
            normalized_url = urljoin(base_url + "/", url)
            if not normalized_url or normalized_url in seen_urls:
                return
            seen_urls.add(normalized_url)
            safe_name = _stringify(name) or Path(urlparse(normalized_url).path).name or f"attachment_{len(specs) + 1}"
            specs.append({"url": normalized_url, "name": safe_name})

        def walk(value: Any) -> None:
            if isinstance(value, dict):
                url_value = None
                for url_key in ("url", "href", "src", "downloadUrl", "download_url", "fileUrl", "file_url", "link"):
                    candidate = value.get(url_key)
                    if isinstance(candidate, str) and candidate.strip():
                        url_value = candidate.strip()
                        break
                if url_value and self._looks_like_download_url(url_value):
                    name = _stringify(value.get("name") or value.get("fileName") or value.get("filename") or value.get("title"))
                    add_spec(url_value, name)
                for item in value.values():
                    walk(item)
            elif isinstance(value, list):
                for item in value:
                    walk(item)
            elif isinstance(value, str):
                for url in re.findall(r"https?://[^\s'\"<>]+|/api/[^\s'\"<>]+|/files/[^\s'\"<>]+|/assets/[^\s'\"<>]+", value):
                    if self._looks_like_download_url(url):
                        add_spec(url, Path(urlparse(url).path).name)

        walk(challenge)
        return specs

    def _looks_like_download_url(self, url: str) -> bool:
        """Return whether one URL likely points to an attachment download."""
        lowered = url.lower()
        if any(token in lowered for token in ("/files/", "/assets/", "/download", "/attachment", "/api/edit/files")):
            return True
        filename = Path(urlparse(url).path).name.lower()
        return "." in filename and len(filename.split(".")[-1]) <= 8

    def _download_attachments(self, session: Any, specs: List[dict]) -> List[UploadedTaskFile]:
        """Best-effort download attachments for one challenge."""
        uploads: List[UploadedTaskFile] = []
        for index, spec in enumerate(specs):
            url = _stringify(spec.get("url"))
            name = _stringify(spec.get("name")) or f"attachment_{index + 1}"
            if not url:
                continue
            try:
                response = session.get(url, timeout=20)
                response.raise_for_status()
            except Exception:
                continue
            uploads.append(
                UploadedTaskFile(
                    client_id=f"gzctf_{index}",
                    name=name,
                    size=len(response.content),
                    content=response.content,
                )
            )
        return uploads
