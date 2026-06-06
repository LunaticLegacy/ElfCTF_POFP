# Semantic Map

## Index

| Symbol | Kind | Module | Summary |
| --- | --- | --- | --- |
| `app.create_app` | function | `app` | Build the FastAPI application and attach the service container. |
| `core.json_types` | module | `core.json_types` | Define shared recursive JSON-compatible aliases for API and service payloads. |
| `core.ctf_kernel._TaskTokenUsageTracker` | class | `core.ctf_kernel` | Aggregate per-task LLM token usage into totals, grouping buckets, and detailed call records. |
| `core.ctf_kernel._UsageTrackingFetcher` | class | `core.ctf_kernel` | Wrap a task fetcher and record successful non-streaming `LLMOutput.usage` payloads. |
| `core.ctf_kernel.CTFWorkflowService` | class | `core.ctf_kernel` | Own per-task Agent lifecycles, persist Agent state/context, and orchestrate CTF solve, continue, retry, and stop workflows. |
| `core.gzctf.module.GZCTFAutomationService` | class | `core.gzctf.module.automation` | Log into one GZCTF game, enumerate challenge cards, create per-challenge solve tasks, attach downloaded files, and launch the existing workflow automatically. |
| `core.models.RuntimeConfig` | class | `core.models` | Store effective LLM runtime settings used by services and the CTF core. |
| `core.models.CTFTask` | class | `core.models` | Represent persisted task state, logs, workspace, result, and editable config. |
| `services.container.create_services` | function | `services.container` | Wire storage, auth, task, workflow, knowledge, tool, and background services. |
| `services.tasks.manager.TaskManager` | class | `services.tasks.manager` | Persist task metadata and manage task workspaces and attachment files. |
| `services.auth_service.AuthService` | class | `services.auth_service` | Manage local users, password hashing, login, logout, and bearer sessions. |
| `services.config_handler.ConfigHandler` | class | `services.config_handler` | Resolve and persist user LLM configuration. |
| `services.gzctf_service.GZCTFService` | class | `services.gzctf_service` | Authenticate to GZCTF, persist cookies, fetch game metadata, match challenges, and submit flags. |
| `services.storage.ApplicationStorage` | class | `services.storage` | Own application data directories and config store. |
| `services.background_jobs.BackgroundJobManager` | class | `services.background_jobs` | Start, stream, interact with, and stop background shell jobs. |
| `services.knowledge_service.KnowledgeService` | class | `services.knowledge_service` | Search local knowledge and manage knowledge review records. |
| `services.knowledge_service.DynamicKnowledgeService` | class | `services.knowledge_service` | Store user-ingested text and fetched URL knowledge sources. |
| `services.skill_service.SkillService` | class | `services.skill_service` | Discover local CTF skills for API consumption. |
| `services.llm_client.LLMClient` | class | `services.llm_client` | Fetch model lists from OpenAI-compatible providers, probing provider-specific model endpoints and surfacing provider HTTP errors. |
| `services.temp_mcp.TempMcpManager` | class | `services.temp_mcp` | Create, start, stop, revoke, and clean up temporary MCP server scripts. |
| `services.user_mcp_servers.UserMcpManager` | class | `services.user_mcp_servers` | Track user-hosted MCP server registrations and heartbeats. |
| `services.tools.hotplug.HotplugToolManager` | class | `services.tools.hotplug` | Store, reload, and adapt hotplug tool manifests into executable `Tool` objects, with optional per-task whitelists. |
| `services.tools.bootstrap.ToolBootstrapService` | class | `services.tools.bootstrap` | Report installed helper binaries and generate install scripts. |

## Architecture

The backend is split into three layers:

- `api`: FastAPI routes, request schemas, auth-token extraction, and response envelopes.
- `services`: application services that own persistence, background processes, user config, auth, task storage, skills, knowledge, and tool registries.
- `core`: domain-level CTF solving logic, including runtime models and the LLM Agent workflow kernel.

`app.create_app` composes the layers by creating `services.container.ApplicationServices`, attaching it to `app.state.pofp_services`, and mounting `api.api_router`.

## Modules

### `app`

- Responsibility: FastAPI application composition.
- Important state: `app.state.pofp_services`.
- External dependencies: FastAPI, CORS middleware, optional static frontend directory.

### `api.dependencies`

- Responsibility: Resolve shared services from FastAPI state and create API response envelopes.
- Calls: `services.container.ApplicationServices`, `api.schemas.ApiEnvelope`.
- Called by: all route modules.

### `api.schemas`

- Responsibility: Normalize HTTP payloads into dataclasses consumed by services.
- Response schema: `ApiEnvelope` is the shared dataclass response envelope; its `data` field is now typed as recursive `JsonValue | None` instead of an unconstrained object.
- Task create requests carry the per-task external hotplug tool whitelist, and task update requests now accept the same field so users can revise the selected hotplug tools after creation.
- Calls: `core.json_types.JsonValue`, `core.models` normalization helpers, `services.config_handler.ConfigUpdatePayload`, `services.tasks.manager.UploadedTaskFile`.
- Called by: API route handlers.

### `core.json_types`

- Responsibility: Provide explicit aliases for JSON-serializable scalar, array, object, and value shapes shared across API and service boundaries.
- Exports:
  - `JsonScalar`: JSON primitive values.
  - `JsonValue`: Recursive JSON value union.
  - `JsonObject`: Mapping from string keys to JSON values.
  - `JsonArray`: List of JSON values.
- Side effects: None.
- Called by: `api.schemas`, `api.dependencies`, `core.ctf_kernel`, `modules.llmfetcher.llm_types`, and RAG status/model helpers.

### `api.routes.__init__`

- Responsibility: Re-export the parent package router objects so every route module binds to the same `APIRouter` instances.
- Calls: `api.auth_router`, `api.config_router`, `api.models_router`, `api.tasks_router`, `api.scan_router`, `api.mcp_router`, `api.tools_router`, `api.skills_router`, `api.knowledge_router`, `api.background_router`.
- Called by: route modules during import time.

### `api.routes.models`

- Responsibility: Resolve effective API credentials and proxy model-list requests to the LLM client.
- Calls: `get_services`, `get_request_user_id`, `ModelsRequest.from_payload`, `services.config_handler.get_effective_config`, `services.llm_client.fetch_models`, `api_response`.
- Called by: `/api/models` POST requests from the frontend settings panel.

### `api.routes.tasks`

- Responsibility: Create, update, start, stop, delete, and inspect tasks for the authenticated user.
- Calls: `get_services`, `get_request_user_id`, `api_response`, `services.task_manager`, `services.workflow`, `CreateTaskRequest`, `CreateBatchTaskRequest`, `TaskUpdateRequest`.
- Called by: `/api/tasks` list/create/update/start/stop/delete/logs/agent-status/detail endpoints and frontend task controls.
- Agent lifecycle: task list and status reads refresh `artifacts.agent_status`; task creation routes call `workflow.create_agent_for_task` after attachments are stored; delete calls `workflow.discard_agent_for_task` before removing task files.
- Task updates now include `external_tool_names`, which is persisted on the task config and exposed back to the edit form.

### `api.routes.gzctf`

- Responsibility: Start, inspect, and cancel GZCTF batch automation runs for the authenticated user.
- Calls: `get_services`, `get_request_user_id`, `api_response`, `services.gzctf_automation`, `services.config_handler.get_effective_config`.
- Called by: `/api/gzctf/automation/start`, `/api/gzctf/automation/runs`, `/api/gzctf/automation/runs/{run_id}`, and `/api/gzctf/automation/runs/{run_id}/cancel` from the tasks page modal.

### `core.ctf_kernel`

- Responsibility: Run CTF-solving workflows independently of HTTP.
- Response/result schema: `WorkflowResult.details` uses `JsonObject | None` for structured API-safe metadata.
- External dependencies: `modules.llmfetcher.Agent`, `LLMFetcher`, CTF tools, Obscura tools, shell tools, local CTF skill router, and knowledge base.
- Runtime artifacts: publishes `agent_status`, `context_snapshot`, `pending_new_input`, `workspace_dir`, and live `token_usage` snapshots for task detail views.
- Called by: `services.container.create_services` through the `workflow` field.

### `services.container`

- Responsibility: Construct the runtime service graph.
- Calls: `ApplicationStorage`, `AuthService`, `ConfigHandler`, `TaskManager`, `CTFWorkflowService`, `LLMClient`, `SkillService`, `KnowledgeService`, `DynamicKnowledgeService`, `BackgroundJobManager`, `ToolBootstrapService`.
- Called by: `app.create_app`.
- Storage wiring now also configures the hotplug registry root at `<data_dir>/hotplug-tools` before any task or workflow services are reused.
- The container now also wires `gzctf_automation`, which reuses the shared `task_manager`, `workflow`, and `gzctf_service`.

### `core.gzctf.module.automation`

- Responsibility: Turn a single GZCTF game URL plus credentials into a persisted automation run that fans out many ordinary solve tasks.
- Key behaviors:
  - logs into GZCTF through `services.gzctf_service`
  - flattens and de-duplicates challenge cards from game details
  - materializes a pending queue and only launches up to `max_concurrent_tasks` at once
  - accepts cancellation requests, stops further queue dispatch, and attempts to stop running tasks through `workflow.stop_task`
  - infers task type with `classify_ctf_challenge`
  - enriches challenge cards with detail and instance endpoints so target-machine data can become the task `target`
  - downloads best-effort attachments into the created task workspace
  - prepares the saved runtime config and launches `services.workflow.start_ctf_analysis` per challenge
  - tracks task status and auto-submit verdicts back into one run record for the frontend modal

### `services.llm_client`

- Responsibility: Fetch available model metadata from OpenAI-compatible providers for the settings UI.
- Calls: `urllib.request.urlopen`, `urllib.error.HTTPError`, `urllib.error.URLError`, `urllib.parse.urlparse`.
- Called by: `api.routes.models.get_models`.

## Classes

### `core.ctf_kernel._TaskTokenUsageTracker`

- Responsibility: Normalize and aggregate token usage returned by task-scoped LLM calls.
- Constructor parameters:
  - `task_id`: Persisted task identifier receiving the `token_usage` artifact.
  - `task_manager`: Persistence service used to write task artifacts.
  - `initial_snapshot`: Optional previous artifact used when continuing a task.
- Instance state: `totals`, `by_model`, `by_backend`, `calls`, `started_at`, `updated_at`.
- Derived fields: recomputes `cache_hit_rate` for totals, model buckets, backend buckets, and per-call usage records using `cached_tokens / input_tokens * 100`.
- Side effects: `record(...)` mutates aggregate counters and persists `task.artifacts.token_usage`.
- Calls: `TaskManager.set_task_artifact`.
- Called by: `_UsageTrackingFetcher.fetch`, `CTFWorkflowService._run_agent`.

### `core.ctf_kernel._UsageTrackingFetcher`

- Responsibility: Decorate a concrete `LLMFetcher` so successful non-streaming calls update per-task token usage.
- Constructor parameters:
  - `fetcher`: Real runtime fetcher that calls the provider.
  - `tracker`: Per-task token usage tracker.
- Instance state: wrapped fetcher and tracker.
- Side effects: Persists token usage after each successful `fetch`.
- Calls: `LLMFetcher.fetch`, `_TaskTokenUsageTracker.record`.
- Called by: `CTFWorkflowService._build_fetcher`.

### `core.ctf_kernel.CTFWorkflowService`

- Responsibility: Manage task workflow lifecycle, hold one durable LLM Agent per task, and launch solving in a background thread.
- Constructor parameters:
  - `task_manager`: Service object used to read/write task state and workspaces.
  - `skills_root`: Local `ctf-skills` directory used for prompt enrichment.
  - `kb_root`: Local `kb` directory used for knowledge tools.
- Instance state:
  - `_threads`: Running task worker threads keyed by task id.
  - `_stop_events`: Cooperative stop events keyed by task id.
  - `_agents`: Live task Agents keyed by task id.
  - `_agent_lock`: Re-entrant lock guarding live Agent registry changes.
- Behavior pattern: Create or load one Agent for each task, publish `artifacts.agent_status`, validate runtime config, mark task running, spawn a worker, refresh the Agent with current tools/prompts and a tracked fetcher, run with cooperative stop and flag detection, then persist completed, failed, stopped, and token-usage state.
- Tool refresh now pulls built-in shell/CTF/knowledge tools plus only the hotplug runtime tools selected by the task config from manifests under the active data directory.
- Base classes: `None`.
- Known subclasses: `None observed`.

#### `core.ctf_kernel.CTFWorkflowService.start_ctf_analysis`

- Signature: `start_ctf_analysis(self, task_id: str) -> WorkflowResult`
- Purpose: Start a solve workflow for a task.
- Parameters:
  - `task_id`: Persisted task identifier.
- Returns: `WorkflowResult` with start status.
- Side effects: Starts a background worker thread and updates task status/logs.
- Calls: `_start_task`.
- Called by: `api.routes.tasks.start_task`.

#### `core.ctf_kernel.CTFWorkflowService.create_agent_for_task`

- Signature: `create_agent_for_task(self, task: CTFTask) -> Agent`
- Purpose: Ensure a task has a live Agent whose lifecycle matches the task lifecycle.
- Parameters:
  - `task`: Persisted task whose workspace/config seed the Agent.
- Returns: Live `Agent`.
- Side effects: Loads `agent_state.json` when present, otherwise creates and persists a new Agent, then publishes `context_snapshot` and `agent_status` artifacts.
- Calls: `_load_agent_for_task`, `_build_agent_for_task`, `_persist_agent_for_task`, `_publish_agent_status`.
- Called by: task creation routes, `_configure_agent_for_task`, `get_agent_status`.

#### `core.ctf_kernel.CTFWorkflowService.get_agent_status`

- Signature: `get_agent_status(self, task_id: str) -> dict | None`
- Purpose: Return the current live-or-persisted Agent state for frontend rendering.
- Parameters:
  - `task_id`: Persisted task identifier.
- Returns: JSON-ready status payload or `None` if the task is missing.
- Side effects: May lazily create or load the task Agent.
- Calls: `TaskManager.get_task`, `create_agent_for_task`, `_build_agent_status_snapshot`.
- Called by: `api.routes.tasks.get_task_agent_status`.

#### `core.ctf_kernel.CTFWorkflowService.continue_ctf_analysis`

- Signature: `continue_ctf_analysis(self, task_id: str) -> WorkflowResult`
- Purpose: Continue a task using saved pending input.
- Parameters:
  - `task_id`: Persisted task identifier.
- Returns: `WorkflowResult`.
- Side effects: Starts a background worker thread and updates task status/logs.
- Calls: `_start_task`.
- Called by: `api.routes.tasks.continue_task`.

#### `core.ctf_kernel.CTFWorkflowService.retry_ctf_analysis`

- Signature: `retry_ctf_analysis(self, task_id: str) -> WorkflowResult`
- Purpose: Clear task logs/result/error and rerun from scratch.
- Parameters:
  - `task_id`: Persisted task identifier.
- Returns: `WorkflowResult`.
- Side effects: Mutates task state and starts a background worker.
- Calls: `TaskManager.get_task`, `TaskManager.update_status`, `_start_task`.
- Called by: `api.routes.tasks.retry_task`.

#### `core.ctf_kernel.CTFWorkflowService.start_scan`

- Signature: `start_scan(self, task_id: str, target: str, modules: list[str]) -> WorkflowResult`
- Purpose: Convert scan options into pending input and start a scan workflow.
- Parameters:
  - `task_id`: Persisted task identifier.
  - `target`: Scan target.
  - `modules`: Selected scan module names.
- Returns: `WorkflowResult`.
- Side effects: Updates task pending input and starts a worker.
- Calls: `_start_task`.
- Called by: `api.routes.scan.start_scan`.

#### `core.ctf_kernel.CTFWorkflowService.stop_task`

- Signature: `stop_task(self, task_id: str) -> WorkflowResult`
- Purpose: Request cooperative cancellation for a running workflow.
- Parameters:
  - `task_id`: Persisted task identifier.
- Returns: `WorkflowResult`.
- Side effects: Sets a stop event, appends logs, and marks task stopped when the task is actually running; otherwise returns a `task_not_running` error.
- Calls: `TaskManager.get_task`, `TaskManager.add_log`, `TaskManager.update_status`.
- Called by: `api.routes.tasks.stop_task`.

#### `core.ctf_kernel.CTFWorkflowService._run_agent`

- Signature: `_run_agent(self, task_id: str, runtime_config: RuntimeConfig, stop_event: threading.Event, mode: str) -> None`
- Purpose: Reconfigure the task's durable Agent with current prompt, tools, and fetcher, then execute the solving round.
- Parameters:
  - `task_id`: Persisted task identifier.
  - `runtime_config`: Effective LLM runtime configuration.
  - `stop_event`: Cooperative cancellation flag.
  - `mode`: Workflow mode label.
- Returns: `None`.
- Side effects: Reads task files, initializes LLM clients, seeds and updates `token_usage`, calls LLM backend, writes logs/result/status, writes `agent_state.json`, refreshes `context_snapshot` and `agent_status`, and stops early on cooperative cancellation or flag detection.
- Calls: `_TaskTokenUsageTracker`, `_configure_agent_for_task`, `_persist_agent_for_task`, `_build_agent_context_snapshot`, `_build_agent_status_snapshot`, `Agent.run_agent_round`.
- Called by: `_run_worker`.

#### `core.ctf_kernel.CTFWorkflowService._serialize_agent`

- Signature: `_serialize_agent(self, agent: Agent) -> dict`
- Purpose: Convert the Agent state-machine snapshot, active ids, memories, and context timeline entries into JSON-safe persistence.
- Parameters:
  - `agent`: Live Agent to serialize.
- Returns: JSON-ready payload written to `agent_state.json`.
- Side effects: None.
- Calls: `asdict`, `Agent.context_manager`.
- Called by: `_persist_agent_for_task`.

#### `core.ctf_kernel.CTFWorkflowService._restore_agent`

- Signature: `_restore_agent(self, agent: Agent, payload: dict) -> None`
- Purpose: Hydrate the Agent state-machine snapshot and context timeline from persisted JSON.
- Parameters:
  - `agent`: Newly constructed Agent to hydrate.
  - `payload`: Decoded `agent_state.json`.
- Returns: `None`.
- Side effects: Clears and repopulates the Agent context manager, active ids, memory list, and indexes.
- Calls: `LLMContext`, `LLMContextCompacted`, `ContextIndex.index_context`.
- Called by: `_load_agent_for_task`.

#### `core.ctf_kernel.CTFWorkflowService._backfill_agent_state_from_context`

- Signature: `_backfill_agent_state_from_context(self, agent: Agent) -> None`
- Purpose: Populate empty AgentState facts from recent raw or compacted context entries for tasks created before the dedicated state-machine manager existed.
- Parameters:
  - `agent`: Agent whose state may need display-time backfill.
- Returns: `None`.
- Side effects: Mutates `agent.agent_state.facts` when it is empty.
- Calls: `Agent.context_manager`.
- Called by: `_build_agent_status_snapshot`.

### `services.tasks.manager.TaskManager`

- Responsibility: Persist task metadata and workspaces.
- Base classes: `None`.
- Known subclasses: `None observed`.
- Behavior pattern: Keep an in-memory task dictionary synchronized to per-task `task.json` files.

#### `services.tasks.manager.TaskManager.create_task`

- Signature: `create_task(self, config: CTFTaskConfig, *, user_id: str) -> CreateTaskResult`
- Purpose: Create task id, workspace, task metadata, and initial log.
- Parameters:
  - `config`: Normalized task configuration.
  - `user_id`: Owner id.
- Returns: `CreateTaskResult`.
- Side effects: Creates directories and writes `task.json`.
- Calls: `CTFTask.add_log`, `_persist_task`.
- Called by: `api.routes.tasks.create_task`, `api.routes.tasks.create_tasks_batch`, `create_scan_task`.

#### `services.tasks.manager.TaskManager.attach_uploaded_files`

- Signature: `attach_uploaded_files(self, task_id: str, uploads: Iterable[UploadedTaskFile]) -> CTFTask | None`
- Purpose: Store multipart upload bytes in the task workspace and update file metadata.
- Parameters:
  - `task_id`: Target task id.
  - `uploads`: Uploaded file byte records.
- Returns: Updated task or `None`.
- Side effects: Writes files and task metadata.
- Calls: `safe_filename`, `CTFTask.add_log`, `_persist_task`.
- Called by: task creation routes.

#### `services.tasks.manager.TaskManager.delete_task`

- Signature: `delete_task(self, task_id: str, *, user_id: Optional[str] = None) -> bool`
- Purpose: Remove a task's in-memory record, runtime config, and workspace directory.
- Parameters:
  - `task_id`: Task identifier to delete.
  - `user_id`: Optional owner scope used to verify authorization.
- Returns: `True` when the task existed and was removed.
- Side effects: Removes the in-memory task entry, clears cached runtime config, and deletes the task directory on disk.
- Failure modes: Returns `False` when the task does not exist or is not owned by the caller.
- Called by: `api.routes.tasks.delete_task`.

#### `services.tasks.manager.TaskManager.update_task_config`

- Signature: `update_task_config(self, task_id: str, *, user_id: Optional[str] = None, **updates: TaskConfigUpdateValue) -> CTFTask | None`
- Purpose: Patch editable fields on a task configuration.
- Parameters:
  - `task_id`: Task identifier to update.
  - `user_id`: Optional owner scope used to verify authorization.
  - `updates`: Optional string, integer, or string-list task configuration values.
- Returns: Updated task, or `None` when the task does not exist or is outside the owner scope.
- Side effects: Mutates task config, appends a task log entry, and persists task metadata.
- Called by: `api.routes.tasks.update_task`.

### `services.tools.hotplug.HotplugToolManager`

- Responsibility: Persist hotplug tool manifests, normalize legacy argument hints into JSON-schema-style `parameters`, and adapt manifests into executable `Tool` wrappers for the Agent tool registry.
- Base classes: `None`.
- Known subclasses: `None observed`.
- Behavior pattern: Keep a filesystem-backed manifest map keyed by tool name, reload it from `<data_dir>/hotplug-tools`, and expose both catalog records and runtime `Tool` objects. Python modules can be imported directly when a manifest declares `runtime.kind=python_module`; CLI-style tools are executed through Python subprocesses.

#### `services.tools.hotplug.HotplugToolManager.configure_storage_dir`

- Signature: `configure_storage_dir(self, storage_dir: Path | str) -> None`
- Purpose: Point the manager at the current application data directory before loading manifests.
- Parameters:
  - `storage_dir`: Hotplug manifest root.
- Returns: `None`.
- Side effects: Recreates the storage directory if needed and reloads manifests from disk.

#### `services.tools.hotplug.HotplugToolManager.build_runtime_tools`

- Signature: `build_runtime_tools(self, *, default_cwd: Path | str | None = None, tool_names: list[str] | None = None) -> list[Tool]`
- Purpose: Convert stored manifests into executable `Tool` objects that can be registered on an `Agent`.
- Parameters:
  - `default_cwd`: Optional working directory used by CLI-style tool wrappers.
  - `tool_names`: Optional whitelist of tool names. `None` keeps all tools; an empty list yields no external tools.
- Returns: Executable `Tool` objects for any manifest with supported runtime metadata.
- Side effects: None beyond building async handlers that may later spawn subprocesses or import Python modules.

#### `services.user_mcp_servers.UserMcpManager.register_server`

- Signature: `register_server(self, *, server_id: str, name: str, description: str, owner_id: str, transport: str = 'stdio', url: str | None = None, command: str | None = None, args: list[str] | None = None, env: dict[str, str] | None = None, pwd: str | None = None) -> UserMcpServer`
- Purpose: Register a user-hosted MCP server with explicit fields instead of a loosely typed keyword payload.
- Parameters:
  - `server_id`: Stable id supplied by the client script.
  - `name`: Display name.
  - `description`: Display description.
  - `owner_id`: User id that owns the server.
  - `transport`: MCP transport mode.
  - `url`, `command`, `args`, `env`, `pwd`: Optional transport-specific connection settings.
- Returns: Registered server metadata.
- Side effects: Mutates the in-memory user MCP registry.
- Called by: `api.routes.user_mcp.register_user_mcp_server`.

#### `modules.llmfetcher.llm_types.LLMToolCall`

- Signature: `LLMToolCall(name: str, arguments: JsonObject = ..., call_id: str | None = None, source: str | None = None)`
- Purpose: Represent a backend-neutral tool call emitted by an LLM.
- Parameters:
  - `name`: Tool name to execute.
  - `arguments`: JSON object passed to the tool.
  - `call_id`: Optional provider call identifier.
  - `source`: Optional backend/source label.
- Returns: Dataclass instance; `to_execution_format()` returns a JSON-compatible execution payload.
- Side effects: None.

## Functions

### `services.llm_client.LLMClient.fetch_models`

- Signature: `fetch_models(self, api_key: str, api_base: str, connector_type: str = 'litellm') -> dict[str, Any]`
- Purpose: Query the provider model endpoint and normalize the response into `id`/`name`/`display_name`/`object` records.
- Parameters:
  - `api_key`: Bearer token used to authorize the request.
  - `api_base`: Provider base URL, normalized into a candidate list of provider-specific and OpenAI-style model endpoints.
  - `connector_type`: Connector family selected by the UI; used to prefer provider-specific endpoint ordering.
- Returns: Status dictionary with `success`, `data`, and `message`.
- Side effects: Performs an outbound HTTP request.
- Failure modes: Returns `success=False` for HTTP errors, network errors, or JSON decode failures, including provider response text when available.
- Calls: `_iter_model_list_urls`.

### `services.llm_client.LLMClient._iter_model_list_urls`

- Signature: `_iter_model_list_urls(self, api_base: str, connector_type: str) -> list[str]`
- Purpose: Convert a provider base URL into a prioritized set of candidate model-list URLs.
- Parameters:
  - `api_base`: Raw provider base URL.
-  - `connector_type`: Connector family used to prefer provider-native or OpenAI-style paths.
- Returns: Candidate URLs with provider-native and OpenAI-style endpoints ordered by expected compatibility.
- Side effects: None.
- Calls: `urllib.parse.urlparse`.

### `app.create_app`

- Signature: `create_app(data_dir: str | Path = '.elfctf') -> FastAPI`
- Purpose: Compose the FastAPI app, service container, API router, CORS, and static frontend.
- Parameters:
  - `data_dir`: Persistence root for services.
- Returns: Configured FastAPI application.
- Side effects: Creates service storage directories and app state.
- Calls: `services.create_services`, `api.api_router`.
- Called by: module-level `app`.

### `services.container.create_services`

- Signature: `create_services(data_dir: Path | str = '.elfctf') -> ApplicationServices`
- Purpose: Wire application storage and all backend services.
- Parameters:
  - `data_dir`: Persistence root.
- Returns: `ApplicationServices`.
- Side effects: Creates storage directories and SQLite schema through service constructors.
- Calls: `ApplicationStorage`, `TaskManager`, `ConfigHandler`, `AuthService`, `CTFWorkflowService`, `KnowledgeService`, `ToolBootstrapService`.
- Called by: `app.create_app`.

## Call Graph

| Caller | Calls | Notes |
| --- | --- | --- |
| `app.create_app` | `services.container.create_services` | Application composition. |
| `api.dependencies.get_services` | `request.app.state.pofp_services` | API-to-service bridge. |
| `api.routes.tasks.start_task` | `services.workflow.start_ctf_analysis` | Starts solving. |
| `api.routes.tasks.continue_task` | `services.workflow.continue_ctf_analysis` | Continues solving. |
| `api.routes.tasks.retry_task` | `services.workflow.retry_ctf_analysis` | Retries solving. |
| `api.routes.scan.start_scan` | `services.workflow.start_scan` | Starts scan workflow. |
| `api.routes.tasks.delete_task` | `services.task_manager.delete_task`, `services.workflow.stop_task` | Stops running tasks if needed and then removes task state. |
| `core.ctf_kernel.CTFWorkflowService._configure_agent_for_task` | `services.tools.hotplug.hotplug_manager.build_runtime_tools` | Registers hotplug manifest tools onto the task Agent. |
| `core.ctf_kernel.CTFWorkflowService._run_agent` | `modules.llmfetcher.Agent.run_agent_round` | Executes the LLM Agent loop with cooperative stop and flag detection. |
| `core.ctf_kernel.CTFWorkflowService._run_agent` | `modules.llmfetcher.ctf_module.ctf_skill_router.enrich_prompt_with_ctf_skills` | Loads relevant CTF skills into the prompt. |

## Inheritance Graph

| Class | Bases | Known Subclasses | Notes |
| --- | --- | --- | --- |
| `core.ctf_kernel.CTFWorkflowService` | `None` | `None observed` | Domain workflow kernel. |
| `services.tasks.manager.TaskManager` | `None` | `None observed` | Filesystem-backed task store. |
| `services.auth_service.AuthService` | `None` | `None observed` | SQLite auth service. |
| `services.background_jobs.BackgroundJobManager` | `None` | `None observed` | In-memory process registry. |
| `services.temp_mcp.TempMcpManager` | `None` | `None observed` | In-memory temp MCP registry. |
| `services.user_mcp_servers.UserMcpManager` | `None` | `None observed` | In-memory user MCP registry. |

## Side Effects

| Symbol | Side Effect | Resource |
| --- | --- | --- |
| `app.create_app` | Creates service container and mounts static files | FastAPI app state |
| `services.storage.ApplicationStorage.__init__` | Creates data directory | `.elfctf` |
| `services.tools.hotplug.HotplugToolManager.configure_storage_dir` | Creates hotplug manifest directory | `<data_dir>/hotplug-tools` |
| `services.auth_service.AuthService.__init__` | Creates SQLite schema | `.elfctf/auth.sqlite3` |
| `services.tasks.manager.TaskManager.create_task` | Creates task workspace and metadata | `.elfctf/tasks/<task_id>` |
| `services.tasks.manager.TaskManager.attach_uploaded_files` | Writes uploaded files | task workspace |
| `core.ctf_kernel.CTFWorkflowService._start_task` | Starts worker thread | process memory |
| `core.ctf_kernel.CTFWorkflowService._run_agent` | Calls LLM API and task tools | configured provider and task workspace |
| `services.background_jobs.BackgroundJobManager.start_job` | Starts shell process | local subprocess |
| `services.temp_mcp.TempMcpManager.create_server` | Writes generated Python script | `.elfctf/temp-mcp` |

## Open Questions

- `fastapi` is listed in `requirements.txt` but is not installed in the current interpreter, so runtime app import could not be verified without installing dependencies.
- Dynamic MCP and hotplug registries are intentionally lightweight in-memory/file-backed implementations; durable multi-process coordination is not implemented yet.
- `core.ctf_kernel` currently uses the existing `modules.llmfetcher` Agent loop directly; future swarm fan-out can be added behind the same core service boundary.
