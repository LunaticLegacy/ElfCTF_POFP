"""Core task and runtime models used by the ElfCTF API backend."""

from __future__ import annotations

import time
from dataclasses import asdict, dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional


DEFAULT_LEARNING_MODE = 'off'
DEFAULT_LEARNING_SEARCH_ROUNDS = 2
DEFAULT_LEARNING_RESULTS_PER_QUERY = 5
DEFAULT_LEARNING_MAX_SOURCES = 8
DEFAULT_LEARNING_MAX_CHARS_PER_SOURCE = 12000
DEFAULT_CONTEXT_MODE = 'linear'


@dataclass
class RuntimeConfig:
    """Effective runtime configuration for LLM-backed workflows.

    Attributes:
        api_key: API key used by LLM connectors.
        api_base: OpenAI-compatible API base URL.
        model: Model identifier used by the solver.
        temperature: Optional sampling temperature.
        max_tokens: Optional response token budget.
        timeout: LLM request timeout in seconds.
        max_rounds: Maximum agent turn count per workflow run.
        max_context_chars: Maximum context size passed to the agent.
        max_context_nodes: Maximum context nodes retained by UI-era config.
        pack_keep_recent: Number of recent messages kept during compression.
        context_dir: Directory for context persistence.
        max_context_tokens: Token budget for context packs.
        mild_offload_ratio: Threshold for mild context offload.
        aggressive_compress_ratio: Threshold for aggressive compression.
        emergency_compress_ratio: Threshold for emergency compression.
        long_term_memory_enabled: Whether long-term memory should be used.
        show_terminal_output: Whether agent verbose stdout/stderr should be mirrored to the server terminal.
        connector_type: Connector family selected by the user.
    """

    api_key: str = ''
    api_base: str = 'https://api.openai.com/v1'
    model: str = 'gpt-4o-mini'
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    timeout: float = 60.0
    max_rounds: int = 50
    max_context_chars: int = 14000
    max_context_nodes: int = 6
    pack_keep_recent: int = 2
    context_dir: str = '.pofpctf/context'
    max_context_tokens: int = 3500
    mild_offload_ratio: float = 0.5
    aggressive_compress_ratio: float = 0.85
    emergency_compress_ratio: float = 0.95
    long_term_memory_enabled: bool = True
    show_terminal_output: bool = True
    connector_type: str = 'litellm'
    gzctf_enabled: bool = False
    gzctf_username: str = ''
    gzctf_password: str = ''
    gzctf_game_url: str = ''

    def to_dict(self) -> Dict[str, Any]:
        """Serialize this config into API-visible fields.

        Returns:
            A JSON-ready dictionary of runtime configuration fields.
        """
        return asdict(self)


class TaskType(str, Enum):
    """Supported CTF task categories accepted by the task API."""

    WEB = 'WEB'
    PWN = 'PWN'
    CRYPTO = 'CRYPTO'
    RE = 'RE'
    MISC = 'MISC'


class TaskStatus(str, Enum):
    """Lifecycle states for a persisted CTF task."""

    PENDING = 'pending'
    RUNNING = 'running'
    COMPLETED = 'completed'
    FAILED = 'failed'
    STOPPED = 'stopped'


@dataclass
class FileInfo:
    """Metadata for a task attachment submitted by the frontend.

    Attributes:
        name: Display filename.
        size: Optional byte count supplied by the client.
        path: Optional persisted path after upload.
        client_id: Frontend upload field identifier used for multipart matching.
    """

    name: str
    size: int = 0
    path: str = ''
    client_id: str = ''

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'FileInfo':
        """Create file metadata from a loose frontend dictionary.

        Args:
            data: Raw file metadata object.

        Returns:
            A normalized `FileInfo` instance.
        """
        # Preserve both camelCase and snake_case client identifiers.
        return cls(
            name=str(data.get('name', '')).strip(),
            size=int(data.get('size', 0) or 0),
            path=str(data.get('path', '')).strip(),
            client_id=str(data.get('clientId', data.get('client_id', ''))).strip(),
        )

    def to_dict(self) -> Dict[str, Any]:
        """Serialize file metadata for API responses.

        Returns:
            A JSON-ready file metadata dictionary.
        """
        # Emit camelCase compatibility while keeping stored path visible.
        payload = asdict(self)
        payload['clientId'] = self.client_id
        return payload


@dataclass
class CTFTaskConfig:
    """User-editable CTF task configuration.

    Attributes:
        name: Human-readable task name.
        task_type: CTF category used for skill routing.
        target: Target URL, host, local challenge description, or remote address.
        gzctf_challenge_id: Explicit GZCTF challenge id used for auto-submit.
        files: Attached challenge file metadata.
        system_prompt: Optional user-provided prompt supplement.
        skills: Explicit CTF skill ids selected by the user.
        selected_mcp: Optional managed or user MCP server id.
        workflow_kind: Workflow type, such as solve or scan.
        task_mode: Interaction mode selected by the UI.
        execution_mode: Single-agent or fan-out execution preference.
        context_mode: Immutable context assembly mode selected at task creation.
        learning_mode: Knowledge learning behavior.
        learning_search_rounds: Search rounds for learning mode.
        learning_results_per_query: Search result count for learning mode.
        learning_max_sources: Maximum learning source count.
        learning_max_chars_per_source: Per-source character budget.
    learning_focus_keywords: Keywords to emphasize during learning.
    learning_exclude_keywords: Keywords to avoid during learning.
    external_tool_names: Per-task hotplug tool whitelist loaded from the shared registry.
    """

    name: str
    task_type: TaskType
    target: str = ''
    gzctf_challenge_id: str = ''
    files: List[FileInfo] = field(default_factory=list)
    system_prompt: str = ''
    skills: List[str] = field(default_factory=list)
    selected_mcp: str = ''
    workflow_kind: str = 'solve'
    task_mode: str = 'classic'
    execution_mode: str = 'single'
    context_mode: str = DEFAULT_CONTEXT_MODE
    learning_mode: str = DEFAULT_LEARNING_MODE
    learning_search_rounds: int = DEFAULT_LEARNING_SEARCH_ROUNDS
    learning_results_per_query: int = DEFAULT_LEARNING_RESULTS_PER_QUERY
    learning_max_sources: int = DEFAULT_LEARNING_MAX_SOURCES
    learning_max_chars_per_source: int = DEFAULT_LEARNING_MAX_CHARS_PER_SOURCE
    learning_focus_keywords: List[str] = field(default_factory=list)
    learning_exclude_keywords: List[str] = field(default_factory=list)
    external_tool_names: List[str] = field(default_factory=list)


@dataclass
class CTFTask:
    """Persisted task record and live execution snapshot.

    Attributes:
        id: Stable task identifier.
        user_id: Owner id used for API scoping.
        config: User-editable task configuration.
        status: Current lifecycle status.
        logs: Ordered human-readable execution log lines.
        result: Final agent output.
        error: Last failure message, if any.
        workspace: Filesystem workspace assigned to this task.
        created_at: Unix timestamp for creation.
        updated_at: Unix timestamp for last mutation.
        pending_new_input: Extra user input saved for continuation.
        artifacts: Structured task-side runtime artifacts exposed to the frontend.
    """

    id: str
    user_id: str
    config: CTFTaskConfig
    status: TaskStatus = TaskStatus.PENDING
    logs: List[str] = field(default_factory=list)
    result: str = ''
    error: str = ''
    workspace: str = ''
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    pending_new_input: str = ''
    artifacts: Dict[str, Any] = field(default_factory=dict)

    def touch(self) -> None:
        """Refresh the mutation timestamp for this task."""
        # Update the mutable timestamp every time task-visible state changes.
        self.updated_at = time.time()

    def add_log(self, message: str) -> None:
        """Append a timestamped log line to this task.

        Args:
            message: Human-readable event text.
        """
        # Store compact local timestamps so the UI can stream useful progress.
        timestamp = time.strftime('%Y-%m-%d %H:%M:%S')
        self.logs.append(f'[{timestamp}] {message}')

        # Keep the task freshness marker aligned with the appended log line.
        self.touch()

    def set_artifact(self, key: str, value: Any) -> None:
        """Set one named runtime artifact and refresh task timestamps.

        Args:
            key: Artifact namespace stored under `task.artifacts`.
            value: JSON-serializable payload exposed to the frontend.
        """
        # Ensure the artifact dictionary exists before writing into it.
        if not isinstance(self.artifacts, dict):
            self.artifacts = {}

        # Update the named artifact entry with the newest runtime snapshot.
        self.artifacts[key] = value

        # Mark the task as updated after mutating artifact state.
        self.touch()

    def to_dict(self) -> Dict[str, Any]:
        """Serialize this task for API responses.

        Returns:
            A JSON-ready dictionary with both compact config fields and details.
        """
        # Flatten common config fields because the frontend reads them directly.
        config = self.config

        # Normalize artifacts into a predictable dictionary for task detail panels.
        artifacts = self.artifacts if isinstance(self.artifacts, dict) else {}

        return {
            'id': self.id,
            'user_id': self.user_id,
            'name': config.name,
            'type': config.task_type.value,
            'task_type': config.task_type.value,
            'target': config.target,
            'gzctfChallengeId': config.gzctf_challenge_id,
            'files': [file_info.to_dict() for file_info in config.files],
            'systemPrompt': config.system_prompt,
            'skills': list(config.skills),
            'selectedMcp': config.selected_mcp,
            'workflowKind': config.workflow_kind,
            'taskMode': config.task_mode,
            'executionMode': config.execution_mode,
            'contextMode': config.context_mode,
            'learningMode': config.learning_mode,
            'learningSearchRounds': config.learning_search_rounds,
            'learningResultsPerQuery': config.learning_results_per_query,
            'learningMaxSources': config.learning_max_sources,
            'learningMaxCharsPerSource': config.learning_max_chars_per_source,
            'learningFocusKeywords': list(config.learning_focus_keywords),
            'learningExcludeKeywords': list(config.learning_exclude_keywords),
            'externalToolNames': list(config.external_tool_names),
            'external_tool_names': list(config.external_tool_names),
            'status': self.status.value,
            'logs': list(self.logs),
            'result': self.result,
            'error': self.error,
            'workspace': self.workspace,
            'created_at': self.created_at,
            'updated_at': self.updated_at,
            'pendingNewInput': self.pending_new_input,
            'artifacts': artifacts,
        }


def normalize_learning_keywords(raw_keywords: Any) -> List[str]:
    """Normalize learning keyword input from strings or arrays.

    Args:
        raw_keywords: Comma-separated string or list-like keyword value.

    Returns:
        A deduplicated list of non-empty keyword strings.
    """
    # Accept both text fields and richer frontend arrays.
    if isinstance(raw_keywords, str):
        items = raw_keywords.split(',')
    elif isinstance(raw_keywords, list):
        items = raw_keywords
    else:
        items = []
    normalized: List[str] = []
    for item in items:
        keyword = str(item).strip()
        if keyword and keyword not in normalized:
            normalized.append(keyword)
    return normalized


def normalize_tool_names(raw_tool_names: Any) -> List[str]:
    """Normalize external tool name selections.

    Args:
        raw_tool_names: List-like or comma-separated tool name input.

    Returns:
        A deduplicated list of non-empty tool names.
    """
    if isinstance(raw_tool_names, str):
        items = raw_tool_names.split(',')
    elif isinstance(raw_tool_names, list):
        items = raw_tool_names
    else:
        items = []
    normalized: List[str] = []
    for item in items:
        tool_name = str(item).strip()
        if tool_name and tool_name not in normalized:
            normalized.append(tool_name)
    return normalized


def normalize_context_mode(raw_mode: Any) -> str:
    """Normalize task context assembly mode names.

    Args:
        raw_mode: User-supplied context mode.

    Returns:
        Either `linear` for traditional chronological context or `graph` for
        the experimental retrieval/selection context path.
    """
    mode = str(raw_mode or '').strip().lower()
    if mode in {'graph', 'graph_context', 'graph-context', 'experimental', 'experimental_graph'}:
        return 'graph'
    if mode in {'linear', 'linear_context', 'linear-context', 'classic'}:
        return 'linear'
    return DEFAULT_CONTEXT_MODE


def normalize_learning_limits(
    search_rounds: Any,
    results_per_query: Any,
    max_sources: Any,
    max_chars_per_source: Any,
) -> Dict[str, int]:
    """Normalize and clamp learning search limit fields.

    Args:
        search_rounds: Requested search round count.
        results_per_query: Requested result count per query.
        max_sources: Requested total source count.
        max_chars_per_source: Requested character budget per source.

    Returns:
        Dictionary containing safe integer limits.
    """
    # Clamp values to avoid accidental runaway context growth.
    def as_int(value: Any, default: int, low: int, high: int) -> int:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            parsed = default
        return max(low, min(high, parsed))

    return {
        'search_rounds': as_int(search_rounds, DEFAULT_LEARNING_SEARCH_ROUNDS, 0, 10),
        'results_per_query': as_int(results_per_query, DEFAULT_LEARNING_RESULTS_PER_QUERY, 1, 20),
        'max_sources': as_int(max_sources, DEFAULT_LEARNING_MAX_SOURCES, 1, 50),
        'max_chars_per_source': as_int(max_chars_per_source, DEFAULT_LEARNING_MAX_CHARS_PER_SOURCE, 1000, 100000),
    }


def normalize_learning_mode(raw_mode: Any, workflow_kind: Any = '') -> str:
    """Normalize knowledge-learning mode names.

    Args:
        raw_mode: User-supplied mode.
        workflow_kind: Current workflow kind, used to default learning flows.

    Returns:
        One of `off`, `review`, `direct`, or `auto`.
    """
    # Keep conservative defaults for solve flows while accepting explicit modes.
    mode = str(raw_mode or '').strip().lower()
    valid = {'off', 'review', 'direct', 'auto'}
    if mode in valid:
        return mode
    return 'review' if str(workflow_kind).strip().lower() == 'learn' else DEFAULT_LEARNING_MODE


def normalize_workflow_kind(raw_kind: Any, task_type: Any = '') -> str:
    """Normalize workflow kind labels used by the UI.

    Args:
        raw_kind: User-supplied workflow kind.
        task_type: Task type fallback context.

    Returns:
        A stable workflow kind string.
    """
    # Keep the current broad route set small and predictable.
    kind = str(raw_kind or '').strip().lower()
    if kind in {'solve', 'scan', 'learn', 'writeup'}:
        return kind
    return 'scan' if str(task_type).upper() == 'WEB-SCAN' else 'solve'


def safe_filename(name: str) -> str:
    """Return a filesystem-safe filename fragment.

    Args:
        name: Raw filename or title.

    Returns:
        Sanitized filename text that is never empty.
    """
    # Preserve extensions while replacing path separators and control characters.
    cleaned = ''.join(ch if ch.isalnum() or ch in {'.', '-', '_'} else '_' for ch in Path(name).name)
    return cleaned or 'attachment.bin'
