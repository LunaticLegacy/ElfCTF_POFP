"""Thread-scoped stdout/stderr routing and verbose log capture for CTF workflows."""

from __future__ import annotations

import threading
import sys
from typing import Dict, List, Optional


class ThreadLocalStreamRouter:
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


class ThreadScopedStdIORedirect:
    """Install one global stdout/stderr router and bind it per thread."""

    _lock = threading.RLock()
    _active_contexts = 0
    _stdout_router: ThreadLocalStreamRouter | None = None
    _stderr_router: ThreadLocalStreamRouter | None = None
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
            cls._stdout_router = ThreadLocalStreamRouter(cls._original_stdout)
            cls._stderr_router = ThreadLocalStreamRouter(cls._original_stderr)
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


class TaskVerboseLogWriter:
    """Writes verbose agent output into the task log and optionally an external stream."""

    def __init__(
        self,
        task_id: str,
        task_manager,
        mirror_stream=None,
    ) -> None:
        self._buffer: List[str] = []
        self._task_id = task_id
        self._task_manager = task_manager
        self._mirror = mirror_stream

    def write(self, text: str) -> None:
        if not text:
            return
        # Buffer lines so we flush full log lines, not character-by-character.
        self._buffer.append(text)
        if text.endswith('\n'):
            self.flush()
        if self._mirror:
            self._mirror.write(text)
            self._mirror.flush()

    def flush(self) -> None:
        if not self._buffer:
            return
        line = ''.join(self._buffer).rstrip('\n')
        self._buffer.clear()
        if line:
            self._task_manager.add_log(self._task_id, f'Agent verbose: {line}')

    @property
    def encoding(self):
        return getattr(self._mirror, 'encoding', 'utf-8') if self._mirror else 'utf-8'
