# Semantic Map

## Index

| Symbol | Kind | Module | Summary |
| --- | --- | --- | --- |
| `app.create_app` | function | `app` | Build the FastAPI application and attach the service container. |
| `core.json_types` | module | `core.json_types` | Define shared recursive JSON-compatible aliases for API and service payloads. |
| `core.ctf_kernel.CTFWorkflowService` | class | `core.ctf_kernel` | Orchestrate LLM Agent execution for CTF solve, continue, retry, stop, and scan workflows with cooperative cancellation and flag-driven early completion. |
| `core.models.RuntimeConfig` | class | `core.models` | Store effective LLM runtime settings used by services and the CTF core. |
| `core.models.CTFTask` | class | `core.models` | Represent persisted task state, logs, workspace, result, and editable config. |
| `services.container.create_services` | function | `services.container` | Wire storage, auth, task, workflow, knowledge, tool, and background services. |
| `services.tasks.manager.TaskManager` | class | `services.tasks.manager` | Persist task metadata and manage task workspaces and attachment files. |
| `services.auth_service.AuthService` | class | `services.auth_service` | Manage local users, password hashing, login, logout, and bearer sessions. |
| `services.config_handler.ConfigHandler` | class | `services.config_handler` | Resolve and persist user LLM configuration. |
| `services.storage.ApplicationStorage` | class | `services.storage` | Own application data directories and config store. |
| `services.background_jobs.BackgroundJobManager` | class | `services.background_jobs` | Start, stream, interact with, and stop background shell jobs. |
| `services.knowledge_service.KnowledgeService` | class | `services.knowledge_service` | Search local knowledge and manage knowledge review records. |
| `services.knowledge_service.DynamicKnowledgeService` | class | `services.knowledge_service` | Store user-ingested text and fetched URL knowledge sources. |
| `services.skill_service.SkillService` | class | `services.skill_service` | Discover local CTF skills for API consumption. |
| `services.llm_client.LLMClient` | class | `services.llm_client` | Fetch model lists from OpenAI-compatible providers, probing provider-specific model endpoints and surfacing provider HTTP errors. |
| `services.temp_mcp.TempMcpManager` | class | `services.temp_mcp` | Create, start, stop, revoke, and clean up temporary MCP server scripts. |
| `services.user_mcp_servers.UserMcpManager` | class | `services.user_mcp_servers` | Track user-hosted MCP server registrations and heartbeats. |
| `services.tools.hotplug.HotplugToolManager` | class | `services.tools.hotplug` | Store and reload dynamic hotplug tool definitions. |
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
- Task create/update requests now carry workflow, learning, skill, and attachment fields only; solver selection is no longer part of the public API contract.
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
- Called by: `/api/tasks` list/create/update/start/stop/delete/logs/detail endpoints and frontend task controls.

### `core.ctf_kernel`

- Responsibility: Run CTF-solving workflows independently of HTTP.
- Response/result schema: `WorkflowResult.details` uses `JsonObject | None` for structured API-safe metadata.
- External dependencies: `modules.llmfetcher.Agent`, `LLMFetcher`, CTF tools, Obscura tools, shell tools, local CTF skill router, and knowledge base.
- Called by: `services.container.create_services` through the `workflow` field.

### `services.container`

- Responsibility: Construct the runtime service graph.
- Calls: `ApplicationStorage`, `AuthService`, `ConfigHandler`, `TaskManager`, `CTFWorkflowService`, `LLMClient`, `SkillService`, `KnowledgeService`, `DynamicKnowledgeService`, `BackgroundJobManager`, `ToolBootstrapService`.
- Called by: `app.create_app`.

### `services.llm_client`

- Responsibility: Fetch available model metadata from OpenAI-compatible providers for the settings UI.
- Calls: `urllib.request.urlopen`, `urllib.error.HTTPError`, `urllib.error.URLError`, `urllib.parse.urlparse`.
- Called by: `api.routes.models.get_models`.

## Classes

### `core.ctf_kernel.CTFWorkflowService`

- Responsibility: Manage task workflow lifecycle and launch LLM Agent solving in a background thread.
- Constructor parameters:
  - `task_manager`: Service object used to read/write task state and workspaces.
  - `skills_root`: Local `ctf-skills` directory used for prompt enrichment.
  - `kb_root`: Local `kb` directory used for knowledge tools.
- Instance state:
  - `_threads`: Running task worker threads keyed by task id.
  - `_stop_events`: Cooperative stop events keyed by task id.
- Behavior pattern: Validate task/config, mark task running, spawn a worker, build scoped tools and prompts, run the agent with cooperative stop and flag detection, then persist completed, failed, or stopped state.
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
- Purpose: Build prompt, tools, fetcher, and Agent, then execute the solving round.
- Parameters:
  - `task_id`: Persisted task identifier.
  - `runtime_config`: Effective LLM runtime configuration.
  - `stop_event`: Cooperative cancellation flag.
  - `mode`: Workflow mode label.
- Returns: `None`.
- Side effects: Reads task files, initializes LLM clients, calls LLM backend, writes logs/result/status, and stops early on cooperative cancellation or flag detection.
- Calls: `classify_ctf_challenge`, `enrich_prompt_with_ctf_skills`, `create_shell_tools`, `create_ctf_tools`, `create_obscura_tools`, `create_knowledge_tools`, `LLMFetcher`, `Agent.run_agent_round`.
- Called by: `_run_worker`.

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
