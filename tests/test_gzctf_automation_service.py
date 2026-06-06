"""Unit tests for the GZCTF automation orchestration helpers."""

from __future__ import annotations

import tempfile
import unittest

from core.gzctf.module.automation import (
    AutomationRunRecord,
    ChallengeRunRecord,
    GZCTFAutomationService,
)
from core.models import TaskStatus


class _FakeTaskManager:
    def __init__(self) -> None:
        self.tasks = {}

    def get_task(self, task_id: str, *, user_id: str | None = None):
        return self.tasks.get(task_id)


class _FakeWorkflow:
    def __init__(self) -> None:
        self.stopped_task_ids: list[str] = []

    def stop_task(self, task_id: str):
        self.stopped_task_ids.append(task_id)


class _FakeGZCTFService:
    def validate_config(self, runtime_config) -> None:
        return None

    def is_configured(self, runtime_config) -> bool:
        return True


class _FakeTask:
    def __init__(self, status: TaskStatus, *, verdict: str = "", error: str = "") -> None:
        self.status = status
        self.error = error
        self.artifacts = {"gzctf_submission": {"verdict": verdict}} if verdict else {}


class GZCTFAutomationServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.service = GZCTFAutomationService(
            self.temp_dir.name,
            task_manager=_FakeTaskManager(),
            workflow=_FakeWorkflow(),
            gzctf_service=_FakeGZCTFService(),
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_collect_attachment_specs_reads_nested_file_links_and_markdown_urls(self) -> None:
        challenge = {
            "title": "Warmup",
            "files": [
                {"name": "task.zip", "url": "/files/task.zip"},
            ],
            "description": "下载附件 https://gz.example.com/assets/readme.txt 继续分析。",
        }
        specs = self.service._collect_attachment_specs(challenge, "https://gz.example.com")
        self.assertEqual(
            specs,
            [
                {"url": "https://gz.example.com/files/task.zip", "name": "task.zip"},
                {"url": "https://gz.example.com/assets/readme.txt", "name": "readme.txt"},
            ],
        )

    def test_build_task_config_infers_type_and_populates_target(self) -> None:
        challenge = {
            "id": 17,
            "title": "rsa starter",
            "description": "Break the RSA ciphertext and recover the flag.",
            "category": "crypto",
        }
        config = self.service._build_task_config(
            challenge=challenge,
            game_url="https://gz.example.com/games/33/challenges#",
            game_id=33,
            attachment_names=["cipher.txt"],
        )
        self.assertEqual(config.task_type.value, "CRYPTO")
        self.assertEqual(config.gzctf_challenge_id, "17")
        self.assertIn("/games/33/challenges#17-rsa-starter", config.target)
        self.assertIn("Downloaded attachments", config.system_prompt)

    def test_extract_preferred_target_prefers_nested_instance_endpoint(self) -> None:
        challenge = {
            "id": 29,
            "title": "shell service",
            "instance": {
                "remote": "nc chall.gzctf.local 31337",
                "httpEntry": "https://gz.example.com/container/29",
            },
            "container": {
                "service": {
                    "host": "1.2.3.4",
                    "port": "2222",
                },
            },
        }
        target = self.service._extract_preferred_target(challenge, base_url="https://gz.example.com")
        self.assertEqual(target, "https://gz.example.com/container/29")
        connection_hint = self.service._challenge_connection_hint(challenge)
        self.assertIn("instance.remote", connection_hint)
        self.assertIn("container.service.host", connection_hint)

    def test_request_stop_for_active_tasks_cancels_pending_and_stops_running(self) -> None:
        self.service.task_manager.tasks["task-running"] = _FakeTask(TaskStatus.RUNNING)
        run_record = AutomationRunRecord(
            id="run-1",
            user_id="user-1",
            game_url="https://gz.example.com/games/33/challenges#",
            username="alice",
            cancel_requested=True,
        )
        run_record.challenges = [
            ChallengeRunRecord(
                challenge_id="1",
                title="pending",
                status="pending",
            ),
            ChallengeRunRecord(
                challenge_id="2",
                title="running",
                status="running",
                task_id="task-running",
            ),
        ]

        self.service._request_stop_for_active_tasks(run_record)

        self.assertEqual(run_record.challenges[0].status, "cancelled")
        self.assertIn("task-running", self.service.workflow.stopped_task_ids)

    def test_cancel_run_marks_status_and_preserves_concurrency_limit(self) -> None:
        run_record = AutomationRunRecord(
            id="run-2",
            user_id="user-2",
            game_url="https://gz.example.com/games/33/challenges#",
            username="alice",
            status="running",
            max_concurrent_tasks=4,
        )
        self.service._runs[run_record.id] = run_record
        cancelled = self.service.cancel_run(run_record.id, user_id="user-2")
        self.assertIsNotNone(cancelled)
        self.assertTrue(cancelled["cancelRequested"])
        self.assertEqual(cancelled["status"], "cancelling")
        self.assertEqual(cancelled["maxConcurrentTasks"], 4)


if __name__ == "__main__":
    unittest.main()
