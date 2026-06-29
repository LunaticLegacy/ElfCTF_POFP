"""API dataclass schemas and payload normalization helpers."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional, cast

from services.config_handler import ConfigUpdatePayload
from core.json_types import JsonValue
from core.models import (
    DEFAULT_LEARNING_MAX_CHARS_PER_SOURCE,
    DEFAULT_LEARNING_MAX_SOURCES,
    DEFAULT_LEARNING_MODE,
    DEFAULT_LEARNING_RESULTS_PER_QUERY,
    DEFAULT_LEARNING_SEARCH_ROUNDS,
    CTFTaskConfig,
    FileInfo,
    TaskType,
    normalize_context_mode,
    normalize_learning_keywords,
    normalize_learning_limits,
    normalize_learning_mode,
    normalize_tool_names,
    normalize_workflow_kind,
)
from services.tasks.manager import UploadedTaskFile


def _coerce_bool(value: Any, default: bool = False) -> bool:
    """Normalize loose JSON boolean-like values into a strict bool.

    Args:
        value: Raw payload value that may already be boolean-like.
        default: Fallback value used when the payload omits the field.

    Returns:
        A normalized boolean value suitable for config dataclasses.
    """
    # Return the default immediately for missing values so callers can keep explicit defaults.
    if value is None:
        return default

    # Preserve native booleans without reinterpretation.
    if isinstance(value, bool):
        return value

    # Interpret common string booleans emitted by browsers, forms, or older clients.
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {'1', 'true', 'yes', 'on'}:
            return True
        if normalized in {'0', 'false', 'no', 'off', ''}:
            return False

    # Fall back to Python truthiness for remaining scalar values.
    return bool(value)


@dataclass
class ApiEnvelope:
    """Represent the shared response envelope used by every API route.

    Attributes:
        success: Whether the request completed successfully.
        code: Optional machine-readable result or error code.
        data: Optional structured response payload returned to the caller.
        message: Human-readable message explaining the result.
    """

    success: bool
    code: str = ''
    data: Optional[JsonValue] = None
    message: str = ''

    def to_dict(self) -> Dict[str, JsonValue]:
        """Serialize the envelope into a JSON-ready dictionary.

        Returns:
            A dictionary containing the success flag, payload, and message.
        """
        # Build the public envelope shape expected by frontend callers.
        return cast(Dict[str, JsonValue], asdict(self))


@dataclass
class AuthRequest:
    """Normalize an authentication request body.

    Attributes:
        username: Trimmed username provided by the caller.
        password: Raw password string provided by the caller.
    """

    username: str = ''
    password: str = ''

    @classmethod
    def from_payload(cls, data: Optional[Dict[str, Any]]) -> 'AuthRequest':
        """Create an auth request from arbitrary JSON data.

        Args:
            data: Raw request body parsed from JSON.

        Returns:
            A normalized authentication request dataclass.
        """
        # Normalize nullable payload data into stable string fields.
        payload = data or {}
        return cls(
            username=str(payload.get('username', '')).strip(),
            password=str(payload.get('password', '')),
        )


@dataclass
class AuthTokenCreateRequest:
    """Normalize a platform token issuance request.

    Attributes:
        username: Username used to authenticate the token request.
        password: Plaintext password used to authenticate the token request.
        label: Optional human-readable label attached to the issued token.
        scopes: Optional requested scopes; empty means server defaults.
    """

    username: str = ''
    password: str = ''
    label: str = ''
    scopes: List[str] = None

    @classmethod
    def from_payload(cls, data: Optional[Dict[str, Any]]) -> 'AuthTokenCreateRequest':
        """Create a token issuance request from arbitrary JSON data.

        Args:
            data: Raw request body parsed from JSON.

        Returns:
            A normalized token issuance dataclass suitable for auth routes.
        """
        payload = data or {}
        raw_scopes = payload.get('scopes', [])
        scopes = raw_scopes if isinstance(raw_scopes, list) else []
        return cls(
            username=str(payload.get('username', '')).strip(),
            password=str(payload.get('password', '')),
            label=str(payload.get('label', '')).strip(),
            scopes=[str(scope).strip() for scope in scopes if str(scope).strip()],
        )


@dataclass
class ConfigUpdateRequest:
    """Represent user-submitted LLM configuration updates.

    Attributes:
        api_key: User API key, possibly empty to use server fallback.
        api_base: API base URL, possibly empty to use effective default.
        model: Model identifier requested by the user.
        temperature: Optional sampling temperature.
        max_tokens: Optional maximum response token count.
        timeout: Request timeout in seconds.
        max_rounds: Maximum workflow round count.
        max_context_chars: Character budget for context snippets.
        max_context_nodes: Maximum context node count.
        pack_keep_recent: Number of recent messages to keep uncompressed.
        context_dir: Context storage directory.
        max_context_tokens: Token budget for context packs.
        mild_offload_ratio: Ratio that triggers mild context offload.
        aggressive_compress_ratio: Ratio that triggers aggressive compression.
        emergency_compress_ratio: Ratio that triggers emergency compression.
        long_term_memory_enabled: Whether long-term memory is enabled.
        show_terminal_output: Whether agent verbose stdout/stderr should be mirrored to the server terminal.
        connector_type: Normalized LLM connector type.
    """

    api_key: str = ''
    api_base: str = ''
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

    @classmethod
    def from_payload(cls, data: Optional[Dict[str, Any]]) -> 'ConfigUpdateRequest':
        """Create a normalized configuration update request.

        Args:
            data: Raw JSON object submitted by the frontend.

        Returns:
            A dataclass with typed configuration fields.
        """
        # Normalize optional numeric values and connector aliases.
        payload = data or {}
        temp = payload.get('temperature')
        mt = payload.get('max_tokens')
        connector_type = normalize_connector_type(payload.get('connector_type', 'litellm'))

        # Normalize the terminal mirror toggle into a stable boolean field.
        show_terminal_output = _coerce_bool(payload.get('show_terminal_output'), True)
        return cls(
            api_key=str(payload.get('api_key', '')),
            api_base=str(payload.get('api_base', '')),
            model=str(payload.get('model', 'gpt-4o-mini')),
            temperature=float(temp) if temp not in (None, '') else None,
            max_tokens=int(mt) if mt not in (None, '') else None,
            timeout=float(payload.get('timeout', 60.0)),
            max_rounds=int(payload.get('max_rounds', 50)),
            max_context_chars=int(payload.get('max_context_chars', 14000)),
            max_context_nodes=int(payload.get('max_context_nodes', 6)),
            pack_keep_recent=int(payload.get('pack_keep_recent', 2)),
            context_dir=str(payload.get('context_dir', '.pofpctf/context')),
            max_context_tokens=int(payload.get('max_context_tokens', 3500)),
            mild_offload_ratio=float(payload.get('mild_offload_ratio', 0.5)),
            aggressive_compress_ratio=float(payload.get('aggressive_compress_ratio', 0.85)),
            emergency_compress_ratio=float(payload.get('emergency_compress_ratio', 0.95)),
            long_term_memory_enabled=_coerce_bool(payload.get('long_term_memory_enabled'), True),
            show_terminal_output=show_terminal_output,
            connector_type=connector_type,
            gzctf_enabled=_coerce_bool(payload.get('gzctf_enabled'), False),
            gzctf_username=str(payload.get('gzctf_username', '')).strip(),
            gzctf_password=str(payload.get('gzctf_password', '')),
            gzctf_game_url=str(payload.get('gzctf_game_url', '')).strip(),
        )

    def to_payload(self) -> ConfigUpdatePayload:
        """Convert this request into the service-layer payload.

        Returns:
            A `ConfigUpdatePayload` accepted by the configuration handler.
        """
        # Translate API field names directly into the config handler contract.
        return ConfigUpdatePayload(**asdict(self))


@dataclass
class ModelsRequest:
    """Represent a model-listing request.

    Attributes:
        api_key: API key override supplied by the caller.
        api_base: API base URL override supplied by the caller.
        connector_type: Normalized connector type.
    """

    api_key: str = ''
    api_base: str = ''
    connector_type: str = 'litellm'

    @classmethod
    def from_payload(cls, data: Optional[Dict[str, Any]]) -> 'ModelsRequest':
        """Normalize model request JSON into typed fields.

        Args:
            data: Raw request body parsed from JSON.

        Returns:
            A normalized model request dataclass.
        """
        # Normalize connector aliases before the service call.
        payload = data or {}
        return cls(
            api_key=str(payload.get('api_key', '')),
            api_base=str(payload.get('api_base', '')),
            connector_type=normalize_connector_type(payload.get('connector_type', 'litellm')),
        )


@dataclass
class ScanRequest:
    """Represent a scan creation request.

    Attributes:
        target: Target URL, host, or challenge address.
        payload: Optional scan payload text.
        modules: Selected scan module identifiers.
    """

    target: str = ''
    payload: str = ''
    modules: List[str] = None

    @classmethod
    def from_payload(cls, data: Optional[Dict[str, Any]]) -> 'ScanRequest':
        """Normalize scan request JSON into typed fields.

        Args:
            data: Raw request body parsed from JSON.

        Returns:
            A normalized scan request dataclass.
        """
        # Convert list-like module input into a stable list.
        payload = data or {}
        modules = payload.get('modules', [])
        return cls(
            target=str(payload.get('target', '')).strip(),
            payload=str(payload.get('payload', '')),
            modules=list(modules) if isinstance(modules, list) else [],
        )


@dataclass
class BackgroundJobCreateRequest:
    """Represent a request to start a background command.

    Attributes:
        command: Shell command to run.
        task_id: Optional task whose workspace should be used as cwd.
        name: Optional display name for the job.
        stdin_text: Initial stdin text to send to the process.
        interactive: Whether the process should accept later input.
    """

    command: str = ''
    task_id: str = ''
    name: str = ''
    stdin_text: str = ''
    interactive: bool = True

    @classmethod
    def from_payload(cls, data: Optional[Dict[str, Any]]) -> 'BackgroundJobCreateRequest':
        """Normalize a background job creation body.

        Args:
            data: Raw JSON object submitted by the caller.

        Returns:
            A normalized background job creation dataclass.
        """
        # Map frontend camelCase fields into service-friendly snake_case fields.
        payload = data or {}
        return cls(
            command=str(payload.get('command', '')).strip(),
            task_id=str(payload.get('taskId', '')).strip(),
            name=str(payload.get('name', '')).strip(),
            stdin_text=str(payload.get('stdinText', '')),
            interactive=bool(payload.get('interactive', True)),
        )


@dataclass
class BackgroundJobInputRequest:
    """Represent input sent to an interactive background job.

    Attributes:
        task_id: Optional task used to scope the job lookup.
        input_text: Text to write to process stdin.
        append_newline: Whether to append a trailing newline.
    """

    task_id: str = ''
    input_text: str = ''
    append_newline: bool = True

    @classmethod
    def from_payload(cls, data: Optional[Dict[str, Any]]) -> 'BackgroundJobInputRequest':
        """Normalize background input JSON into typed fields.

        Args:
            data: Raw request body parsed from JSON.

        Returns:
            A normalized background input dataclass.
        """
        # Normalize optional task scope and newline behavior.
        payload = data or {}
        return cls(
            task_id=str(payload.get('taskId', '')).strip(),
            input_text=str(payload.get('input', '')),
            append_newline=bool(payload.get('appendNewline', True)),
        )


@dataclass
class BackgroundJobStopRequest:
    """Represent a request to stop a background job.

    Attributes:
        task_id: Optional task used to scope the job lookup.
        force: Whether to forcefully terminate the process.
    """

    task_id: str = ''
    force: bool = False

    @classmethod
    def from_payload(cls, data: Optional[Dict[str, Any]]) -> 'BackgroundJobStopRequest':
        """Normalize background stop JSON into typed fields.

        Args:
            data: Raw request body parsed from JSON.

        Returns:
            A normalized stop request dataclass.
        """
        # Extract stop scope and force mode from the payload.
        payload = data or {}
        return cls(
            task_id=str(payload.get('taskId', '')).strip(),
            force=bool(payload.get('force', False)),
        )


@dataclass
class DynamicKnowledgeIngestRequest:
    """Represent direct text ingestion into dynamic knowledge.

    Attributes:
        title: Human-readable source title.
        content: Text content to ingest.
        source_type: Source kind, such as manual or webpage.
        url: Optional original URL.
        category: Knowledge category.
        notes: Optional reviewer notes.
        tags: Optional tag list.
    """

    title: str = ''
    content: str = ''
    source_type: str = 'manual'
    url: str = ''
    category: str = 'misc'
    notes: str = ''
    tags: List[Any] = None

    @classmethod
    def from_payload(cls, data: Optional[Dict[str, Any]]) -> 'DynamicKnowledgeIngestRequest':
        """Normalize dynamic knowledge ingestion JSON.

        Args:
            data: Raw request body parsed from JSON.

        Returns:
            A normalized ingestion request dataclass.
        """
        # Normalize metadata fields while preserving tag objects.
        payload = data or {}
        tags = payload.get('tags', [])
        return cls(
            title=str(payload.get('title', '')).strip(),
            content=str(payload.get('content', '')),
            source_type=str(payload.get('sourceType', 'manual')).strip().lower() or 'manual',
            url=str(payload.get('url', '')).strip(),
            category=str(payload.get('category', 'misc')).strip().lower() or 'misc',
            notes=str(payload.get('notes', '')).strip(),
            tags=tags if isinstance(tags, list) else [],
        )


@dataclass
class DynamicKnowledgeFetchRequest:
    """Represent URL fetch-and-ingest input.

    Attributes:
        url: Remote URL to fetch.
        title: Optional display title.
        category: Knowledge category.
        notes: Optional notes attached to the source.
        tags: Optional tag list.
        max_chars: Maximum fetched characters to ingest.
    """

    url: str = ''
    title: str = ''
    category: str = 'misc'
    notes: str = ''
    tags: List[Any] = None
    max_chars: int = 20000

    @classmethod
    def from_payload(cls, data: Optional[Dict[str, Any]]) -> 'DynamicKnowledgeFetchRequest':
        """Normalize URL ingestion JSON into typed fields.

        Args:
            data: Raw request body parsed from JSON.

        Returns:
            A normalized fetch request dataclass.
        """
        # Normalize URL metadata and character budget.
        payload = data or {}
        tags = payload.get('tags', [])
        return cls(
            url=str(payload.get('url', '')).strip(),
            title=str(payload.get('title', '')).strip(),
            category=str(payload.get('category', 'misc')).strip().lower() or 'misc',
            notes=str(payload.get('notes', '')).strip(),
            tags=tags if isinstance(tags, list) else [],
            max_chars=int(payload.get('maxChars', 20000)),
        )


@dataclass
class KnowledgeEvolveRequest:
    """Represent a request to evolve task output into knowledge.

    Attributes:
        task_id: Task identifier used as the knowledge source.
        mode: Evolution mode, either review or direct.
        source_mode: Source collection mode used by the service.
        review_notes: Notes attached to generated review records.
    """

    task_id: str = ''
    mode: str = 'review'
    source_mode: str = 'manual'
    review_notes: str = ''

    @classmethod
    def from_payload(cls, data: Optional[Dict[str, Any]]) -> 'KnowledgeEvolveRequest':
        """Normalize knowledge evolution JSON into typed fields.

        Args:
            data: Raw request body parsed from JSON.

        Returns:
            A normalized evolution request dataclass.
        """
        # Normalize mode flags and optional review notes.
        payload = data or {}
        return cls(
            task_id=str(payload.get('taskId', '')).strip(),
            mode=str(payload.get('mode', 'review')).strip().lower() or 'review',
            source_mode=str(payload.get('sourceMode', 'manual')).strip().lower() or 'manual',
            review_notes=str(payload.get('reviewNotes', '')).strip(),
        )


@dataclass
class ReviewDecisionRequest:
    """Represent approve/reject notes for a knowledge review.

    Attributes:
        review_notes: Human notes stored with the review decision.
    """

    review_notes: str = ''

    @classmethod
    def from_payload(cls, data: Optional[Dict[str, Any]]) -> 'ReviewDecisionRequest':
        """Normalize review decision JSON into typed fields.

        Args:
            data: Raw request body parsed from JSON.

        Returns:
            A normalized review decision dataclass.
        """
        # Extract the only mutable review-decision field.
        payload = data or {}
        return cls(review_notes=str(payload.get('reviewNotes', '')).strip())


@dataclass
class CreateTaskRequest:
    """Represent a single CTF task creation request.

    Attributes:
        name: Human-readable task name.
        task_type: Task type label accepted by `TaskType`.
        target: Target challenge address or description.
        gzctf_challenge_id: Optional explicit GZCTF challenge id for auto-submit.
        files: File metadata entries submitted by the frontend.
        system_prompt: Optional system prompt override.
        skills: Selected skill identifiers.
        selected_mcp: Selected managed MCP server identifier.
        workflow_kind: Normalized workflow kind.
        task_mode: Task interaction mode.
        execution_mode: Execution fan-out mode.
        context_mode: Immutable context assembly mode.
        learning_mode: Knowledge learning mode.
        learning_search_rounds: Search round budget.
        learning_results_per_query: Search result budget per query.
        learning_max_sources: Maximum source count.
        learning_max_chars_per_source: Character budget per source.
        learning_focus_keywords: Keywords to emphasize during learning.
        learning_exclude_keywords: Keywords to exclude during learning.
        external_tool_names: Selected hotplug tool names for this task.
    """

    name: str = ''
    task_type: str = 'RE'
    target: str = ''
    gzctf_challenge_id: str = ''
    files: List[dict] = None
    system_prompt: str = ''
    skills: List[str] = None
    selected_mcp: str = ''
    workflow_kind: str = 'solve'
    task_mode: str = 'classic'
    execution_mode: str = 'single'
    context_mode: str = 'linear'
    learning_mode: str = DEFAULT_LEARNING_MODE
    learning_search_rounds: int = DEFAULT_LEARNING_SEARCH_ROUNDS
    learning_results_per_query: int = DEFAULT_LEARNING_RESULTS_PER_QUERY
    learning_max_sources: int = DEFAULT_LEARNING_MAX_SOURCES
    learning_max_chars_per_source: int = DEFAULT_LEARNING_MAX_CHARS_PER_SOURCE
    learning_focus_keywords: List[str] = None
    learning_exclude_keywords: List[str] = None
    external_tool_names: List[str] = None

    @classmethod
    def from_payload(cls, data: Optional[Dict[str, Any]]) -> 'CreateTaskRequest':
        """Normalize a task creation object into typed fields.

        Args:
            data: Raw task object from JSON or multipart payload.

        Returns:
            A normalized task creation dataclass.
        """
        # Normalize selected skills and learning limits from mixed key styles.
        payload = data or {}
        skills = normalize_skill_list(payload.get('skills', []))
        learning_limits = normalize_learning_limits(
            payload.get('learningSearchRounds', payload.get('learning_search_rounds', DEFAULT_LEARNING_SEARCH_ROUNDS)),
            payload.get('learningResultsPerQuery', payload.get('learning_results_per_query', DEFAULT_LEARNING_RESULTS_PER_QUERY)),
            payload.get('learningMaxSources', payload.get('learning_max_sources', DEFAULT_LEARNING_MAX_SOURCES)),
            payload.get('learningMaxCharsPerSource', payload.get('learning_max_chars_per_source', DEFAULT_LEARNING_MAX_CHARS_PER_SOURCE)),
        )
        return cls(
            name=str(payload.get('name', '')),
            task_type=str(payload.get('type', 'RE')),
            target=str(payload.get('target', '')),
            gzctf_challenge_id=str(
                payload.get('gzctfChallengeId', payload.get('gzctf_challenge_id', ''))
            ).strip(),
            files=payload.get('files', []) if isinstance(payload.get('files', []), list) else [],
            system_prompt=str(payload.get('systemPrompt', '')),
            skills=skills,
            selected_mcp=str(payload.get('selectedMcp', '')),
            workflow_kind=normalize_workflow_kind(
                payload.get('workflowKind', payload.get('workflow_kind', '')),
                payload.get('type', 'RE'),
            ),
            task_mode=str(payload.get('taskMode', 'classic') or 'classic'),
            execution_mode=str(payload.get('executionMode', 'single') or 'single'),
            context_mode=normalize_context_mode(
                payload.get('contextMode', payload.get('context_mode', 'linear')),
            ),
            learning_mode=normalize_learning_mode(
                payload.get('learningMode', payload.get('learning_mode', DEFAULT_LEARNING_MODE)),
                payload.get('workflowKind', payload.get('workflow_kind', '')),
            ),
            learning_search_rounds=learning_limits['search_rounds'],
            learning_results_per_query=learning_limits['results_per_query'],
            learning_max_sources=learning_limits['max_sources'],
            learning_max_chars_per_source=learning_limits['max_chars_per_source'],
            learning_focus_keywords=normalize_learning_keywords(
                payload.get('learningFocusKeywords', payload.get('learning_focus_keywords', [])),
            ),
            learning_exclude_keywords=normalize_learning_keywords(
                payload.get('learningExcludeKeywords', payload.get('learning_exclude_keywords', [])),
            ),
            external_tool_names=normalize_tool_names(
                payload.get('externalToolNames', payload.get('external_tool_names', [])),
            ),
        )

    def to_config(self) -> CTFTaskConfig:
        """Convert this request into the task-manager configuration.

        Returns:
            A `CTFTaskConfig` instance consumed by the task manager.
        """
        # Convert uploaded file metadata into core FileInfo objects.
        files = [
            FileInfo.from_dict(file_data) if isinstance(file_data, dict) else FileInfo(name=str(file_data))
            for file_data in (self.files or [])
        ]
        return CTFTaskConfig(
            name=self.name.strip(),
            task_type=TaskType(self.task_type.upper()),
            target=self.target.strip(),
            gzctf_challenge_id=self.gzctf_challenge_id.strip(),
            files=files,
            system_prompt=self.system_prompt,
            skills=self.skills or [],
            selected_mcp=self.selected_mcp,
            workflow_kind=self.workflow_kind,
            task_mode=self.task_mode,
            execution_mode=self.execution_mode,
            context_mode=self.context_mode,
            learning_mode=self.learning_mode,
            learning_search_rounds=self.learning_search_rounds,
            learning_results_per_query=self.learning_results_per_query,
            learning_max_sources=self.learning_max_sources,
            learning_max_chars_per_source=self.learning_max_chars_per_source,
            learning_focus_keywords=self.learning_focus_keywords or [],
            learning_exclude_keywords=self.learning_exclude_keywords or [],
            external_tool_names=self.external_tool_names or [],
        )

    def resolve_uploaded_files(self, upload_index: Dict[str, UploadedTaskFile]) -> List[UploadedTaskFile]:
        """Match requested file metadata to multipart uploads.

        Args:
            upload_index: Uploaded files keyed by frontend client id.

        Returns:
            A list of uploaded file payloads referenced by this request.

        Raises:
            ValueError: If a referenced upload is missing from the request.
        """
        # Walk frontend file metadata and resolve each clientId to bytes.
        resolved: List[UploadedTaskFile] = []
        for file_data in self.files or []:
            if not isinstance(file_data, dict):
                continue
            client_id = str(file_data.get('clientId', '')).strip()
            if not client_id:
                continue
            upload = upload_index.get(client_id)
            if upload is None:
                raise ValueError(f'缺少上传文件: {file_data.get("name") or client_id}')
            resolved.append(upload)
        return resolved


@dataclass
class CreateBatchTaskRequest:
    """Represent a batch task creation request.

    Attributes:
        tasks: Normalized task creation requests.
    """

    tasks: List[CreateTaskRequest]

    @classmethod
    def from_payload(cls, data: Optional[Dict[str, Any]]) -> 'CreateBatchTaskRequest':
        """Normalize batch creation JSON into task request objects.

        Args:
            data: Raw request body parsed from JSON or multipart payload.

        Returns:
            A batch request containing normalized task objects.
        """
        # Keep only dictionary task entries and normalize them independently.
        payload = data or {}
        tasks = [
            CreateTaskRequest.from_payload(item)
            for item in payload.get('tasks', [])
            if isinstance(item, dict)
        ]
        return cls(tasks=tasks)


@dataclass
class TaskUpdateRequest:
    """Represent optional updates for an existing task.

    Attributes:
        name: Optional updated task name.
        target: Optional updated target.
        gzctf_challenge_id: Optional updated explicit GZCTF challenge id.
        system_prompt: Optional updated system prompt.
        skills: Optional normalized skill list.
        selected_mcp: Optional selected MCP server.
        workflow_kind: Optional workflow kind.
        task_mode: Optional task mode.
        execution_mode: Optional execution mode.
        learning_mode: Optional learning mode.
        learning_limits: Optional normalized learning limits dictionary.
        learning_focus_keywords: Optional normalized focus keywords.
        learning_exclude_keywords: Optional normalized exclude keywords.
        external_tool_names: Optional hotplug tool whitelist update.
    """

    name: Optional[str] = None
    target: Optional[str] = None
    gzctf_challenge_id: Optional[str] = None
    system_prompt: Optional[str] = None
    skills: Optional[List[str]] = None
    selected_mcp: Optional[str] = None
    workflow_kind: Optional[str] = None
    task_mode: Optional[str] = None
    execution_mode: Optional[str] = None
    learning_mode: Optional[str] = None
    learning_limits: Optional[Dict[str, int]] = None
    learning_focus_keywords: Optional[List[str]] = None
    learning_exclude_keywords: Optional[List[str]] = None
    external_tool_names: Optional[List[str]] = None

    @classmethod
    def from_payload(cls, data: Optional[Dict[str, Any]]) -> 'TaskUpdateRequest':
        """Normalize task update JSON into optional typed fields.

        Args:
            data: Raw request body parsed from JSON or multipart payload.

        Returns:
            A task update dataclass with absent fields left as `None`.
        """
        # Normalize optional direct fields from mixed frontend key styles.
        payload = data or {}
        workflow_kind = str(payload.get('workflowKind', payload.get('workflow_kind', ''))).strip() or None
        task_mode = str(payload.get('taskMode', '')).strip() or None
        execution_mode = str(payload.get('executionMode', '')).strip() or None
        learning_mode = str(payload.get('learningMode', payload.get('learning_mode', ''))).strip() or None

        # Normalize optional keyword filters only when callers supplied them.
        learning_focus_keywords = None
        if 'learningFocusKeywords' in payload or 'learning_focus_keywords' in payload:
            learning_focus_keywords = normalize_learning_keywords(
                payload.get('learningFocusKeywords', payload.get('learning_focus_keywords')),
            )
        learning_exclude_keywords = None
        if 'learningExcludeKeywords' in payload or 'learning_exclude_keywords' in payload:
            learning_exclude_keywords = normalize_learning_keywords(
                payload.get('learningExcludeKeywords', payload.get('learning_exclude_keywords')),
            )

        # Normalize learning limits only when at least one limit is present.
        learning_limit_keys = {
            'search_rounds': payload.get('learningSearchRounds', payload.get('learning_search_rounds')),
            'results_per_query': payload.get('learningResultsPerQuery', payload.get('learning_results_per_query')),
            'max_sources': payload.get('learningMaxSources', payload.get('learning_max_sources')),
            'max_chars_per_source': payload.get('learningMaxCharsPerSource', payload.get('learning_max_chars_per_source')),
        }
        learning_limits = None
        if any(value is not None for value in learning_limit_keys.values()):
            learning_limits = normalize_learning_limits(
                learning_limit_keys['search_rounds'],
                learning_limit_keys['results_per_query'],
                learning_limit_keys['max_sources'],
                learning_limit_keys['max_chars_per_source'],
            )

        # Convert skills into a list only when the field was submitted.
        skills = None
        if 'skills' in payload:
            skills = normalize_skill_list(payload.get('skills'))
        external_tool_names = None
        if 'externalToolNames' in payload or 'external_tool_names' in payload:
            external_tool_names = normalize_tool_names(
                payload.get('externalToolNames', payload.get('external_tool_names')),
            )
        return cls(
            name=str(payload['name']).strip() if payload.get('name') else None,
            target=str(payload['target']).strip() if payload.get('target') else None,
            gzctf_challenge_id=(
                str(payload['gzctfChallengeId']).strip()
                if payload.get('gzctfChallengeId') is not None
                else (
                    str(payload['gzctf_challenge_id']).strip()
                    if payload.get('gzctf_challenge_id') is not None
                    else None
                )
            ),
            system_prompt=str(payload['systemPrompt']).strip() if payload.get('systemPrompt') else None,
            skills=skills,
            selected_mcp=payload.get('selectedMcp') if payload.get('selectedMcp') is not None else None,
            workflow_kind=workflow_kind,
            task_mode=task_mode,
            execution_mode=execution_mode,
            learning_mode=learning_mode,
            learning_limits=learning_limits,
            learning_focus_keywords=learning_focus_keywords,
            learning_exclude_keywords=learning_exclude_keywords,
            external_tool_names=external_tool_names,
        )


@dataclass
class TempMcpCreateRequest:
    """Represent a temporary MCP server creation request.

    Attributes:
        name: Server display name.
        description: Server description.
        tools: MCP tool definitions.
        custom_code: Optional custom Python code.
        ttl_seconds: Server time-to-live in seconds.
        max_executions: Maximum allowed tool executions.
        client_id: Optional client binding.
        metadata: Optional additional metadata.
    """

    name: str = ''
    description: str = ''
    tools: List[Dict[str, Any]] = None
    custom_code: Optional[str] = None
    ttl_seconds: int = 3600
    max_executions: int = 100
    client_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

    @classmethod
    def from_payload(cls, data: Optional[Dict[str, Any]]) -> 'TempMcpCreateRequest':
        """Normalize temporary MCP server creation JSON.

        Args:
            data: Raw request body parsed from JSON.

        Returns:
            A normalized temporary MCP creation dataclass.
        """
        # Normalize required metadata and optional runtime limits.
        payload = data or {}
        tools = payload.get('tools', [])
        return cls(
            name=str(payload.get('name', '')).strip(),
            description=str(payload.get('description', '')).strip(),
            tools=tools if isinstance(tools, list) else [],
            custom_code=payload.get('custom_code'),
            ttl_seconds=int(payload.get('ttl_seconds', 3600)),
            max_executions=int(payload.get('max_executions', 100)),
            client_id=payload.get('client_id'),
            metadata=payload.get('metadata'),
        )


@dataclass
class UserMcpRegisterRequest:
    """Represent a user-hosted MCP server registration request.

    Attributes:
        name: Server display name.
        description: Server description.
        transport: MCP transport type.
        url: Optional SSE URL.
        command: Optional stdio command.
        args: Optional stdio command arguments.
        env: Optional process environment mapping.
        pwd: Optional server working directory.
        user_id: Owner identifier supplied by the client script.
    """

    name: str = ''
    description: str = '用户自托管 Server'
    transport: str = 'stdio'
    url: Optional[str] = None
    command: Optional[str] = None
    args: Optional[List[str]] = None
    env: Optional[Dict[str, str]] = None
    pwd: Optional[str] = None
    user_id: str = 'anonymous'

    @classmethod
    def from_payload(cls, data: Optional[Dict[str, Any]], server_id: str) -> 'UserMcpRegisterRequest':
        """Normalize user MCP registration JSON.

        Args:
            data: Raw request body parsed from JSON.
            server_id: Path server identifier used for default naming.

        Returns:
            A normalized user MCP registration dataclass.
        """
        # Fill script-friendly defaults when the client omits metadata.
        payload = data or {}
        return cls(
            name=str(payload.get('name', f'user-server-{server_id[:8]}')),
            description=str(payload.get('description', '用户自托管 Server')),
            transport=str(payload.get('transport', 'stdio')),
            url=payload.get('url'),
            command=payload.get('command'),
            args=payload.get('args'),
            env=payload.get('env'),
            pwd=payload.get('pwd'),
            user_id=str(payload.get('user_id', 'anonymous')),
        )


@dataclass
class HotplugInstallPlanRequest:
    """Represent requested binaries for a tool install plan.

    Attributes:
        binaries: Binary names requested by the caller.
    """

    binaries: List[str] = None

    @classmethod
    def from_payload(cls, data: Optional[Dict[str, Any]]) -> 'HotplugInstallPlanRequest':
        """Normalize install-plan JSON into a dataclass.

        Args:
            data: Raw request body parsed from JSON.

        Returns:
            A normalized install-plan request dataclass.
        """
        # Preserve list input and reject non-list values in the route layer.
        payload = data or {}
        binaries = payload.get('binaries', [])
        return cls(binaries=binaries if isinstance(binaries, list) else binaries)


def normalize_connector_type(raw_connector_type: Any) -> str:
    """Normalize connector aliases to supported backend names.

    Args:
        raw_connector_type: Connector value supplied by an API caller.

    Returns:
        A supported connector type string.
    """
    # Map legacy connector names and fall back to litellm for unknown values.
    connector_type = str(raw_connector_type or 'litellm')
    if connector_type == 'kimi_code':
        connector_type = 'litellm'
    valid_types = {'litellm', 'openai', 'anthropic'}
    if connector_type not in valid_types:
        connector_type = 'litellm'
    return connector_type


def normalize_skill_list(raw_skills: Any) -> List[str]:
    """Normalize skill identifiers from string or list input.

    Args:
        raw_skills: Skill identifiers supplied as a list or comma string.

    Returns:
        A list of trimmed skill identifiers.
    """
    # Accept both the old comma-separated shape and the newer array shape.
    if isinstance(raw_skills, str):
        return [item.strip() for item in raw_skills.split(',') if item.strip()]
    if isinstance(raw_skills, list):
        return raw_skills
    return []
