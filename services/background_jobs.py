"""Background process manager used by cockpit API routes."""

from __future__ import annotations

import subprocess
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional


@dataclass
class BackgroundJobRecord:
    """Runtime metadata for one background process."""

    id: str
    command: str
    cwd: str
    user_id: str
    task_id: str = ''
    name: str = ''
    status: str = 'running'
    output: List[str] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    returncode: Optional[int] = None
    interactive: bool = True

    def to_dict(self) -> dict:
        """Serialize the job record for API responses."""
        return {
            'id': self.id,
            'command': self.command,
            'cwd': self.cwd,
            'user_id': self.user_id,
            'taskId': self.task_id,
            'name': self.name,
            'status': self.status,
            'created_at': self.created_at,
            'updated_at': self.updated_at,
            'returncode': self.returncode,
            'interactive': self.interactive,
        }


class BackgroundJobManager:
    """Start and monitor local background commands."""

    def __init__(self) -> None:
        """Initialize an empty in-memory process registry."""
        self._jobs: Dict[str, BackgroundJobRecord] = {}
        self._processes: Dict[str, subprocess.Popen] = {}

    def start_job(
        self,
        *,
        command: str,
        cwd: Path,
        user_id: str,
        task_id: str = '',
        name: str = '',
        stdin_text: str = '',
        interactive: bool = True,
    ) -> BackgroundJobRecord:
        """Start a shell command in the background."""
        job_id = uuid.uuid4().hex
        record = BackgroundJobRecord(
            id=job_id,
            command=command,
            cwd=str(cwd),
            user_id=user_id,
            task_id=task_id,
            name=name or command[:80],
            interactive=interactive,
        )
        process = subprocess.Popen(
            command,
            cwd=str(cwd),
            shell=True,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        self._jobs[job_id] = record
        self._processes[job_id] = process
        if stdin_text and process.stdin:
            process.stdin.write(stdin_text)
            process.stdin.flush()
        threading.Thread(target=self._pump_output, args=(job_id,), daemon=True).start()
        return record

    def _pump_output(self, job_id: str) -> None:
        """Read process output until the process exits."""
        process = self._processes[job_id]
        record = self._jobs[job_id]
        assert process.stdout is not None
        for line in process.stdout:
            record.output.append(line.rstrip('\n'))
            record.updated_at = time.time()
        record.returncode = process.wait()
        record.status = 'completed' if record.returncode == 0 else 'failed'
        record.updated_at = time.time()

    def list_jobs(self, *, user_id: str, task_id: str = '', status: str = '') -> List[BackgroundJobRecord]:
        """List jobs scoped by user and optional filters."""
        jobs = [job for job in self._jobs.values() if job.user_id == user_id]
        if task_id:
            jobs = [job for job in jobs if job.task_id == task_id]
        if status:
            jobs = [job for job in jobs if job.status == status]
        return sorted(jobs, key=lambda item: item.created_at, reverse=True)

    def read_job_output(self, job_id: str, *, user_id: str, task_id: str = '', tail_lines: int = 80) -> Optional[dict]:
        """Return job metadata and output tail."""
        record = self._jobs.get(job_id)
        if record is None or record.user_id != user_id or (task_id and record.task_id != task_id):
            return None
        tail = record.output[-max(1, tail_lines):]
        return {'job': record.to_dict(), 'output': '\n'.join(tail), 'lines': tail}

    def send_input(
        self,
        job_id: str,
        input_text: str,
        *,
        user_id: str,
        task_id: str = '',
        append_newline: bool = True,
    ) -> BackgroundJobRecord:
        """Send stdin to an interactive job."""
        record = self._jobs.get(job_id)
        if record is None or record.user_id != user_id or (task_id and record.task_id != task_id):
            raise ValueError('后台任务未找到')
        if not record.interactive:
            raise ValueError('后台任务不可交互')
        process = self._processes.get(job_id)
        if process is None or process.stdin is None or process.poll() is not None:
            raise ValueError('后台任务未运行')
        process.stdin.write(input_text + ('\n' if append_newline else ''))
        process.stdin.flush()
        record.updated_at = time.time()
        return record

    def stop_job(self, job_id: str, *, user_id: str, task_id: str = '', force: bool = False) -> BackgroundJobRecord:
        """Terminate a background job."""
        record = self._jobs.get(job_id)
        if record is None or record.user_id != user_id or (task_id and record.task_id != task_id):
            raise ValueError('后台任务未找到')
        process = self._processes.get(job_id)
        if process and process.poll() is None:
            process.kill() if force else process.terminate()
        record.status = 'stopped'
        record.updated_at = time.time()
        return record
