"""Unit tests for thread-scoped stdout/stderr capture in the CTF workflow."""

from __future__ import annotations

import io
import sys
import threading
import unittest

from core.ctf_kernel import TaskTokenUsageTracker, TaskVerboseLogWriter, ThreadScopedStdIORedirect
from modules.llmfetcher.llm_types import LLMOutput, TokenUsage


class _RecordingTaskManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.logs: dict[str, list[str]] = {}
        self.artifacts: dict[str, dict[str, object]] = {}

    def add_log(self, task_id: str, message: str) -> None:
        with self._lock:
            self.logs.setdefault(task_id, []).append(message)

    def set_task_artifact(self, task_id: str, key: str, value: object) -> None:
        with self._lock:
            self.artifacts.setdefault(task_id, {})[key] = value


class ThreadScopedStdIORedirectTest(unittest.TestCase):
    def test_routes_stdout_and_stderr_per_thread(self) -> None:
        manager = _RecordingTaskManager()
        ready = threading.Barrier(2)
        done = threading.Barrier(2)

        def worker(task_id: str, stdout_text: str, stderr_text: str) -> None:
            writer = TaskVerboseLogWriter(task_id, manager, mirror_stream=io.StringIO())
            with ThreadScopedStdIORedirect(writer):
                ready.wait()
                print(stdout_text)
                print(stderr_text, file=sys.stderr)
                done.wait()
            writer.flush()

        thread_a = threading.Thread(target=worker, args=('task-a', 'hello from a', 'err from a'))
        thread_b = threading.Thread(target=worker, args=('task-b', 'hello from b', 'err from b'))
        thread_a.start()
        thread_b.start()
        thread_a.join()
        thread_b.join()

        self.assertEqual(manager.logs['task-a'], [
            'Agent verbose: hello from a',
            'Agent verbose: err from a',
        ])
        self.assertEqual(manager.logs['task-b'], [
            'Agent verbose: hello from b',
            'Agent verbose: err from b',
        ])


class TaskTokenUsageTrackerTest(unittest.TestCase):
    def test_records_usage_totals_groups_and_call_details(self) -> None:
        manager = _RecordingTaskManager()
        tracker = TaskTokenUsageTracker('task-a', manager)

        snapshot = tracker.record(
            LLMOutput(
                content='ok',
                provider='openai',
                backend_name='default',
                model='gpt-test',
                usage=TokenUsage(
                    input_tokens=12,
                    output_tokens=8,
                    total_tokens=20,
                    cached_tokens=3,
                    reasoning_tokens=2,
                ),
            ),
            prompt_preview='solve this task',
        )

        self.assertEqual(snapshot['totals']['input_tokens'], 12)
        self.assertEqual(snapshot['totals']['output_tokens'], 8)
        self.assertEqual(snapshot['totals']['total_tokens'], 20)
        self.assertEqual(snapshot['totals']['cached_tokens'], 3)
        self.assertEqual(snapshot['totals']['reasoning_tokens'], 2)
        self.assertEqual(snapshot['totals']['cache_hit_rate'], 25.0)
        self.assertEqual(snapshot['by_model']['gpt-test']['total_tokens'], 20)
        self.assertEqual(snapshot['by_model']['gpt-test']['cache_hit_rate'], 25.0)
        self.assertEqual(snapshot['by_backend']['openai:default']['total_tokens'], 20)
        self.assertEqual(snapshot['by_backend']['openai:default']['cache_hit_rate'], 25.0)
        self.assertEqual(snapshot['calls'][0]['prompt_preview'], 'solve this task')
        self.assertEqual(snapshot['calls'][0]['usage']['cached_tokens'], 3)
        self.assertIs(manager.artifacts['task-a']['token_usage'], snapshot)


if __name__ == '__main__':
    unittest.main()
