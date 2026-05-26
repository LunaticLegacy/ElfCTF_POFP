"""Unit tests for thread-scoped stdout/stderr capture in the CTF workflow."""

from __future__ import annotations

import io
import sys
import threading
import unittest

from core.ctf_kernel import _TaskVerboseLogWriter, _ThreadScopedStdIORedirect


class _RecordingTaskManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.logs: dict[str, list[str]] = {}

    def add_log(self, task_id: str, message: str) -> None:
        with self._lock:
            self.logs.setdefault(task_id, []).append(message)


class ThreadScopedStdIORedirectTest(unittest.TestCase):
    def test_routes_stdout_and_stderr_per_thread(self) -> None:
        manager = _RecordingTaskManager()
        ready = threading.Barrier(2)
        done = threading.Barrier(2)

        def worker(task_id: str, stdout_text: str, stderr_text: str) -> None:
            writer = _TaskVerboseLogWriter(task_id, manager, mirror_stream=io.StringIO())
            with _ThreadScopedStdIORedirect(writer):
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


if __name__ == '__main__':
    unittest.main()
