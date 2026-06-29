# Code Semantic Map

This file is the repository's semantic contract for agentic code changes.
Read it before modifying code. Update it after changing behavior.

## Architecture

- **What the system does**: A CTF (Capture The Flag) automation platform that uses LLM agents to analyze and solve CTF challenges. It provides a web UI (FastAPI backend + frontend), task management, skill-based routing, knowledge retrieval (RAG), GZCTF integration for challenge management and flag submission, hot-pluggable tools, MCP server integration, and background job execution.

- **Main execution path**: User creates a task via HTTP API → task manager persists config → CTFWorkflowService creates an LLM agent → agent runs in a background thread with tools (file I/O, shell, knowledge search, etc.) → agent analyzes challenge and optionally submits flag → results stored in task.

- **Major components and dependencies**:
  - `app.py` — FastAPI application factory
  - `api/` — HTTP route handlers, request schemas
  - `services/` — Business logic: auth, config, tasks, knowledge, GZCTF, background jobs, MCP, hotplug tools
  - `core/` — CTF-specific agent orchestration: workflow service, skill router, tools, prompt builder, token tracker, persistence
  - `modules/llmfetcher/` — LLM abstraction: fetchers, handlers (OpenAI, Anthropic, ONNX, OpenVINO), context management, swarm execution, thinking graph, tool registry
  - `modules/databaseman/` — Database connection pool (postgres)
  - `ctf-skills/` — Static CTF skill knowledge base (markdown files)
  - `kb/` — Knowledge base for RAG, case studies, reversing, unpacking, packers, etc.
  - `frontend/` — Single-page HTML/JS/CSS frontend (see `docs/frontend-semantic-map.md` for detailed frontend map)
  - `demo/` — Demo scripts for standalone usage

- **State**: Persistent SQLite via `auth_service`, JSON file-based task and config storage in `data_dir`.

## Modules

### `app.py`
- **Role**: FastAPI application entrypoint, CORS and static file serving, frontend asset caching disabled.
- **Exports**: `create_app(data_dir=None)`, `app` instance (global).
- **Collaborators**: Imports all API routers from `api/__init__.py`, mounts frontend static files, translates `PermissionError` into normalized auth failures.
- **Inner functions**: `handle_permission_error` returns API-envelope 401 responses for auth dependency failures; `disable_frontend_asset_cache` sets cache-control headers to no-cache.

### `api/routes/`
- **Role**: HTTP endpoint handlers per domain.
- **Files**:
  - `auth.py` — `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/tokens`, `/api/auth/tokens/current`, `/api/auth/tokens/revoke`, `/api/auth/debug_sessions`
  - `codegen.py` — `/api/codegen/config`, returns POFP-authenticated codegen config for local codetalk execution.
  - `config.py` — `/api/config/get`, `/api/config/save`, `/api/config/fetch_gzctf_team`
  - `tasks.py` — CRUD for tasks and execution control (`/api/tasks/...`). Endpoints: get list, create single, create batch, start, continue, retry, stop, delete, update, get logs, get agent status, save new input.
  - `tools.py` — Tool catalog, hotplug tool management, tool bootstrap status, upload scripts.
  - `knowledge.py` — Search, vector status, rebuild index, dynamic knowledge ingest, evolve from task, review workflow.
  - `background.py` — Background jobs: list, start, get output, send input, stop.
  - `mcp.py` — MCP server status (simple `/api/mcp/status`).
  - `user_mcp.py` — User MCP server registration, download client script, heartbeat, disconnect, delete.
  - `temp_mcp.py` — Temporary MCP server lifecycle: create, start, stop, revoke, cleanup.
  - `models.py` — Fetch available LLM models from external API.
  - `skills.py` — List and retrieve CTF skills.
  - `gzctf.py` — GZCTF automation runs: list, get, start, cancel.
- **Internal helpers** (not exported): `_resolve_task_workspace`, `_get_request_payload`, `_extract_uploaded_files`, `_extract_new_input`, `_require_llm_config`, `_build_workflow_error_response_from_result`, `_build_gzctf_runtime_config`, `_extract_module_doc`, `_extract_handler_doc`, `_extract_arguments_schema`, `_build_parameters_schema`, `_default_tools`, `_generate_client_script` (stdio/SSE variants), `_resolve_task_workspace`.

### `api/schemas.py`
- **Role**: Request and response schemas for all API endpoints. Contains simple data classes with `from_payload` factory methods and `to_dict` serializers.
- **Key types**: `AuthRequest`, `ConfigUpdateRequest`, `CreateTaskRequest`, `CreateBatchTaskRequest`, `TaskUpdateRequest`, `BackgroundJobCreateRequest`, `DynamicKnowledgeIngestRequest`, `TempMcpCreateRequest`, `UserMcpRegisterRequest`, `HotplugInstallPlanRequest`, `ApiEnvelope`, etc.
- **Module-level functions**: `_coerce_bool`, `normalize_connector_type`, `normalize_skill_list`.

### `api/dependencies.py`
- **Role**: FastAPI dependencies: `get_services` (injects `ApplicationServices`), `api_response` (envelope builder), `get_request_auth_token`, `get_request_user_id`, `get_request_token_record`, `require_auth` decorator.

### `services/__init__.py`
- **Role**: Re-exports service classes.

### `services/container.py`
- **Role**: `ApplicationServices` dataclass holding all service instances. `create_services(data_dir)` initializes storage, task manager, config handler, GZCTF service, workflow, automation, etc.

### `services/auth_service.py`
- **Role**: SQLite-based user authentication with password hashing (SHA-256 + salt), session/plugin tokens, TTL-based expiry, and token metadata for platform clients.
- **Key class**: `AuthService`. Also: `AuthError`, `AuthUser`, `AuthSession`, `AuthTokenRecord`.

### `services/storage.py`
- **Role**: File-based JSON configuration store per user, with server-side fallback config.
- **Key classes**: `JsonConfigStore`, `ApplicationStorage`.

### `services/tasks/manager.py`
- **Role**: `TaskManager` manages `CTFTask` objects in JSON files per task under `data_dir/tasks/`. Provides CRUD, runtime config prep, status updates, log appending.
- **Support types**: `UploadedTaskFile`, `CreateTaskResult`.
- **Module-level function**: `_default_external_tool_names` (returns empty list).

### `services/config_handler.py`
- **Role**: `ConfigHandler` bridges storage and API for user config.

### `services/llm_client.py`
- **Role**: `LLMClient` fetches available model lists from external API (OpenAI/Anthropic compatible) by iterating well-known URL patterns.

### `services/gzctf_service.py`
- **Role**: `GZCTFService` handles GZCTF API integration: login, challenge resolution, flag submission with RSA encryption, cookie management, game details fetching.
- **Key methods**: `submit_flag_for_task`, `refresh_login`, `ensure_authenticated_session`, `resolve_challenge`, `fetch_team_info`, `encrypt_api_data`.

### `services/knowledge_service.py`
- **Role**: `KnowledgeService` wraps the RAG `KnowledgeBase` for searching, vector status, rebuild, evolve-from-task. `DynamicKnowledgeService` stores user-authored knowledge sources in memory.

### `services/background_jobs.py`
- **Role**: `BackgroundJobManager` manages subprocess-based background jobs with optional stdin/stdout pipes.
- **Types**: `BackgroundJobRecord`.

### `services/skill_service.py`
- **Role**: `SkillService` discovers CTF skills from `ctf-skills/` directory, filters by task type.
- **Types**: `SkillRecord`, `DiscoveredSkill`.

### `services/temp_mcp.py`
- **Role**: `TempMcpManager` creates and manages temporary MCP servers (in-memory, with stored code and subprocess).
- **Types**: `TempMcpServer`.
- **Module-level function**: `get_temp_mcp_manager()` (singleton accessor).

### `services/user_mcp_servers.py`
- **Role**: `UserMcpManager` manages user-registered MCP servers (in-memory, status tracking with heartbeat).
- **Types**: `UserMcpServer`.
- **Module-level function**: `get_user_mcp_manager()` (singleton accessor).

### `services/tools/`
- **Role**: `HotplugToolManager` manages hot-pluggable external tools: scripts, Python modules. `ToolBootstrapService` generates install plans.
- **`__init__.py`**: Exports `CATEGORY_LABELS` dict, `get_tool_categories()`.
- **`bootstrap.py`**: `ToolBootstrapReport`, `ToolBootstrapService`.
- **`hotplug.py`**: `HotplugToolManager`, module-level `hotplug_manager` instance, private helper `_legacy_arguments_to_parameters`.

### `core/`
- **Role**: CTF agent orchestration layer.
  - `ctf_kernel.py` — `CTFWorkflowService` creates agents, manages threads, builds system prompts, classifies tasks, handles flag auto-submission.
  - `ctf_module/ctf_skill_router.py` — Skill discovery, classification, context building for prompt enrichment.
  - `ctf_module/ctf_tools.py` — Creates CTF-specific tools (file operations, flag extraction, etc.) using `llmfetcher` tool infrastructure.
  - `ctf_prompt.py` — Domain-specific system and user prompt builders for WEB/RE/PWN/CRYPTO/FORENSICS/MISC.
  - `ctf_tools.py` — Combined CTF + knowledge tool factories.
  - `ctf_obscura_tools.py` — Web scraping tools using `obscura` browser automation binary.
  - `ctf_token_tracker.py` — `TaskTokenUsageTracker` tracks LLM token usage per task; `UsageTrackingFetcher` wraps an LLM fetcher with tracker.
  - `ctf_agent_persistence.py` — Serialize/deserialize agent state for live persistence.
  - `ctf_io.py` — Thread-scoped stdio redirection and `TaskVerboseLogWriter`.
  - `gzctf/module/automation.py` — `GZCTFAutomationService` orchestrates automated runs: chooses challenges, creates tasks, monitors results, supports cancel.
  - `models.py` — Domain models: `RuntimeConfig`, `CTFTask`, `CTFTaskConfig`, `TaskType`, `TaskStatus`, `FileInfo`.

### `modules/llmfetcher/`
- **Role**: Universal LLM abstraction layer.
  - `llm_fetcher.py` — `LLMFetcher` dispatches to registered backend handlers with fallback and retry.
  - `handlers/base.py` — `LLMBackendHandler` base class.
  - `handlers/anthropic.py` — `AnthropicHandler` (provider name "anthropic").
  - `handlers/openai.py` — `OpenAIHandler` (provider name "openai").
  - `handlers/openai_compat.py` — `OpenAICompatibleHandler` for generic OpenAI-compatible endpoints.
  - `handlers/litellm.py` — `LiteLLMHandler`.
  - `handlers/onnxruntime.py` — `OnnxRuntimeGenAIHandler` (local inference).
  - `handlers/openvino.py` — `OpenVINOHandler`.
  - `agent.py` — `Agent` class with tool execution, context management, state machine, streaming, round compression.
  - `agent_state.py` — `AgentStateMachine` tracks task phase, facts, hypotheses, credentials using an LLM sub-agent.
  - `agent_io.py` — `AgentFileIOManager` reads/writes agent spec files from disk.
  - `llm_context.py` — `LLMContextHandler` manages context timeline, keyword/semantic indexing, compression, memory, tagging.
  - `llm_types.py` — All LLM data types: `LLMBackendConfig`, `LLMOutput`, `LLMContext`, `AgentState`, `Tool`, `ToolResultFact`, `ContextBundle`, etc.
  - `tool.py` — `ToolRegistry` for managing tool instances.
  - `tool_call_adapter.py` — Normalizes tool calls from different LLM response formats.
  - `session_store.py` — `JsonSessionStore` persists/restores agent state to JSON files.
  - `swarm/` — `ExecutionGraph`, `AgentSwarm`, `RuntimeSlotManager` for multi-agent graph workflows.
  - `thinking_graph.py` — `ThinkingGraph` for structured reasoning with typed nodes and edges.
  - `rag_module/knowledge/` — RAG knowledge base with vector (Chroma), keyword, hybrid retrieval, markdown loading, chunking, index management.
  - `streamers/` — Output streamers for real-time agent output.
  - `tools/` — Built-in tool factories: shell, file ops, CTF, knowledge, thinking graph, execution graph, context, workflow, swarm slots, obscura.
  - `prompt.py` — Prompt templates for context selection, compression, tagging, state machine, memory.
  - `utils_function.py` — Utility functions: `stable_unique_ids`, `sanitize_tags`, `normalize_context_mode`, `strip_markdown_fence`, `extract_first_json_object`, `normalize_tag`, `parse_tags_and_abstracts`.

## Types

### `api/schemas.py` — Request Schemas

| Type | Fields | Purpose |
|------|--------|---------|
| `AuthRequest` | `username`, `password` | Login/register credentials |
| `ConfigUpdateRequest` | `api_key`, `api_base`, `model`, `temperature`, `max_tokens`, `timeout`, `max_rounds`, `connector_type`, `gzctf_*`, etc. | User LLM and GZCTF configuration |
| `CreateTaskRequest` | `name`, `task_type`, `target`, `files`, `system_prompt`, `skills`, `workflow_kind`, `task_mode`, `execution_mode`, `context_mode`, `learning_*`, `external_tool_names` | Task creation specification |
| `TaskUpdateRequest` | Subset of `CreateTaskRequest` | Modify existing task config |
| `BackgroundJobCreateRequest` | `command`, `task_id`, `name`, `stdin_text`, `interactive` | Spawn subprocess job |
| `DynamicKnowledgeIngestRequest` | `title`, `content`, `source_type`, `url`, `category`, `notes`, `tags` | Ingest external knowledge |
| `TempMcpCreateRequest` | `name`, `description`, `tools`, `custom_code`, `ttl_seconds`, `max_executions`, `client_id`, `metadata` | Create ephemeral MCP server |
| `UserMcpRegisterRequest` | `name`, `description`, `transport`, `url`, `command`, `args`, `env`, `pwd` | Register persistent MCP server |
| `HotplugInstallPlanRequest` | `binaries` | Request install script for external tools |
| `ApiEnvelope` | `success`, `code`, `data`, `message` | Standard API response envelope |

### `core/models.py` — Domain Models

| Type | Fields | Purpose |
|------|--------|---------|
| `RuntimeConfig` | `api_key`, `api_base`, `model`, `temperature`, `max_tokens`, `timeout`, `max_rounds`, `connector_type`, `gzctf_*`, etc. | Runtime LLM and integration config |
| `CTFTaskConfig` | `name`, `task_type`, `target`, `files`, `system_prompt`, `skills`, `workflow_kind`, `task_mode`, `execution_mode`, `context_mode`, `learning_*` | Immutable task specification |
| `CTFTask` | `id`, `user_id`, `config`, `status`, `logs`, `result`, `error`, `workspace`, `created_at`, `updated_at`, `pending_new_input`, `artifacts` | Mutable task state with timeline |
| `FileInfo` | `name`, `size`, `path`, `client_id` | Uploaded file metadata |
| `TaskStatus` | Enum: `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `STOPPED` | Task lifecycle status |
| `TaskType` | Enum: `WEB`, `PWN`, `CRYPTO`, `RE`, `MISC` | CTF challenge categories |

### `modules/llmfetcher/llm_types.py` — LLM Data Types

| Type | Fields | Purpose |
|------|--------|---------|
| `LLMBackendConfig` | `name`, `provider`, `model`, `api_key`, `api_url`, `timeout`, `max_retries`, `extra` | Backend connection config |
| `LLMOutput` | `content`, `provider`, `backend_name`, `model`, `role`, `reasoning_content`, `tool_calls`, `stop_reason`, `usage` | Unified LLM response |
| `LLMContext` | `role`, `content`, `timeline`, `abstract_msg`, `content_reasoning`, `tool_call_info`, `tool_result_facts`, `tags` | Single context entry in agent timeline |
| `AgentState` | `version`, `revision`, `task`, `phase`, `summary`, `facts`, `hypotheses`, `artifacts`, `credentials`, `known_routes`, `failed_actions`, `next_actions`, `transitions`, `updated_at` | Agent's understanding of task progress |
| `Tool` | `name`, `description`, `parameters`, `handler` | Functional tool for agent |
| `ToolResultFact` | `tool_name`, `summary`, `facts`, `evidence`, `status`, `tool_call_id`, `tags` | Compressed tool execution result |
| `ContextBundle` | `state_text`, `pinned_ids`, `selected_ids`, `recent_ids` | Input to agent's main context builder |
| `AgentMessage` | `provider`, `role`, `content`, `reasoning_content`, `tool_blocks`, `stop_reason`, `raw_message`, `raw_response` | Single LLM response message |
| `ToolExecutionRecord` | `name`, `arguments`, `result` | Log of a tool execution |
| `ToolResultRef` | `tool_name`, `status`, `inline_result`, `artifact_path`, `bytes`, `lines`, etc. | Reference to large tool output |
| `LLMBackendError`, `LLMTimeoutError`, `LLMError` | | Exception types for LLM failures |
| `EmptyModelResponseError`, `NoToolCallError`, `MaxTurnsExceededError` | | Agent-level exception types |

### `core/ctf_skill_router.py` — Skill Types

| Type | Fields | Purpose |
|------|--------|---------|
| `CTFSkill` | `id`, `name`, `description`, `path`, `task_types`, `user_invocable` | Represents one CTF skill markdown |
| `SkillClassification` | `category`, `task_type`, `skill_ids`, `scores`, `reasons` | Result of challenge classification |

### `modules/llmfetcher/swarm/execution_graph.py` — Graph Types

| Type | Fields | Purpose |
|------|--------|---------|
| `Edge` | `source_id`, `target_id`, `label` | Directed edge in execution graph |
| `ExecutionStopState` | `soft_requested`, `hard_requested`, `reason` | Global stop signal |
| `GraphContext` | `graph`, `node_inputs`, `node_outputs`, `executed`, `metadata` | Runtime context during graph execution |
| `ExecutionNode` (base) | `node_id`, `node_type` | Abstract graph node |
| `AgentNode` | `node_id`, `agent`, `max_turns` | Node that runs an LLM agent |
| `ToolNode` | `node_id`, `tool` | Node that executes one tool |
| `RouterNode` | `node_id`, `routes`, `agent`, `default_route` | LLM-routed branch node |
| `InputNode` | `node_id` | Entry point, passes input through |
| `OutputNode` | `node_id`, `collector` | Collects and returns final output |
| `JoinNode` | `node_id`, `strategy` | Merges multiple incoming edges |

### `modules/llmfetcher/thinking_graph.py` — Thinking Graph Types

| Type | Fields | Purpose |
|------|--------|---------|
| `ThinkingNodeType` | Enum: `GOAL`, `QUESTION`, `CLAIM`, `HYPOTHESIS`, `EVIDENCE`, `PLAN`, `STEP`, `ACTION`, `OBSERVATION`, `CRITIQUE`, `DECISION`, `SUMMARY`, `MEMORY`, `ARTIFACT`, `ERROR` | Typed reasoning node |
| `ThinkingEdgeType` | Enum: `SUPPORTS`, `OPPOSES`, `LEADS_TO`, `DERIVES_FROM`, `REQUIRES`, `ANSWERS`, `REFINES`, `CONTRADICTS`, `BLOCKS`, `PRODUCES`, `OBSERVES` | Typed relationship |
| `ThinkingGraphNode` | `node_type`, `info`, `tags`, `confidence`, `payload` | Node in thinking graph |
| `ThinkingGraphEdge` | `edge_type`, `source_id`, `target_id`, `strength` | Edge in thinking graph |
| `ThinkingGraphTransactionRecord` | `transaction_id`, `operation`, `object_kind`, `object_id`, `before`, `after`, `version_before`, `version_after`, `created_by`, `timestamp`, `metadata` | Audit log entry |

### `services/tools/hotplug.py` — Hotplug Types

| Type | Fields | Purpose |
|------|--------|---------|
| `HotplugToolManager` (class) | `_storage_dir`, `_tools` (dict) | Manages external tool definitions |
| `ToolBootstrapReport` (class) | `installed`, `missing` | Tool bootstrap status |

### `services/gzctf_module/automation.py` — Automation Types

| Type | Fields | Purpose |
|------|--------|---------|
| `ChallengeRunRecord` | `challenge_id`, `title`, `category`, `status`, `task_id`, `verdict`, `error`, etc. | Per-challenge status within a run |
| `AutomationRunRecord` | `id`, `user_id`, `game_url`, `status`, `challenges`, `max_concurrent_tasks`, etc. | Overall automation campaign |
| `GZCTFAutomationService` | `_root`, `task_manager`, `workflow`, `gzctf_service`, `_lock`, `_runs`, `_threads` | Orchestrates automated challenge solving |

### `modules/llmfetcher/rag_module/knowledge/models.py` — Knowledge Types

| Type | Fields | Purpose |
|------|--------|---------|
| `KnowledgeHit` | `path`, `title`, `score`, `excerpt`, `chunk_key`, `heading_path`, `start_line`, `end_line` | Search result hit |
| `KnowledgeIndexEntry` | `path`, `title`, `fingerprint`, `excerpt`, `document_id` | Index manifest entry |
| `KnowledgeDocument` | `absolute_path`, `root_relative_path`, `repository_relative_path`, `title`, `content` | Loaded document |
| `KnowledgeChunk` | `source_path`, `source_title`, `chunk_key`, `chunk_index`, `chunk_title`, `heading_path`, `start_line`, `end_line`, `content` | Chunked document segment |
| `MarkdownBlock` | `kind`, `text`, `start_line`, `end_line`, `level`, `info` | Parsed markdown block |
| `VectorHit` | `path`, `chunk_key`, `chunk_index`, `chunk_title`, `heading_path`, `start_line`, `end_line`, `score`, `excerpt` | Vector search hit |
| `RetrievalQuery` | `query_text`, `terms`, `limit`, `task_type`, `semantic_multiplier` | Internal retrieval query |
| `ManifestMeta` | `version`, `backend`, `embedding_model`, `backend_ready`, `entry_count`, `chunk_count`, `last_error` | Vector index metadata |

### `services/background_jobs.py`, `services/auth_service.py`, etc. — Service Types

| Type | Fields | Purpose |
|------|--------|---------|
| `AuthUser` | `id`, `username`, `created_at` | User record |
| `AuthSession` | `token`, `user`, `expires_at` | Session record |
| `BackgroundJobRecord` | `id`, `command`, `cwd`, `user_id`, `task_id`, `name`, `status`, `output`, `created_at`, `updated_at`, `returncode`, `interactive` | Background job state |
| `SkillRecord` / `DiscoveredSkill` | `id`, `name`, `description`, `path`, `task_types`, `user_invocable` | Skill metadata |
| `UploadedTaskFile` | `client_id`, `name`, `size`, `content` | Task file attachment |

## Functions

### `app.py`

#### `create_app(data_dir=None)`
- **Purpose**: Create and configure FastAPI application.
- **Inputs**: `data_dir` (optional, default determined by `ApplicationStorage`).
- **Outputs**: Configured `FastAPI` instance.
- **Side effects**: Sets up CORS, mounts frontend static files, registers all API routers, installs a `PermissionError` handler that emits API-envelope 401 responses, disables frontend asset caching via inner middleware `disable_frontend_asset_cache`.
- **Called by**: The `app` global at module level evaluates `create_app()`.
- **Failure modes**: None observed.

### `api/dependencies.py`

#### `get_services(request)`
- **Purpose**: FastAPI dependency that creates per-request service container.
- **Inputs**: `request` (FastAPI `Request`).
- **Outputs**: `ApplicationServices` instance.
- **Side effects**: On first call, initializes all services via `create_services`.

#### `api_response(success, code, data=None, message=None)`
- **Purpose**: Build standardized JSON response envelope.
- **Inputs**: `success` (bool), `code` (int), `data` (optional), `message` (optional).
- **Outputs**: `JSONResponse` with status_code.
- **Side effects**: None.

#### `require_auth`
- **Purpose**: Decorator that validates auth token from `Authorization` header, sets `request.state.user_id`.
- **Side effects**: On invalid token, returns 401 response (blocking decorator, not exception-based).
- **Failure modes**: Missing or expired token → 401.

### `core/ctf_kernel.py`

#### `CTFWorkflowService.__init__(task_manager, skills_root, kb_root, gzctf_service)`
- **Purpose**: Initialize workflow service with dependencies.
- **Inputs**: task manager, skills/knowledge base root paths, GZCTF service.
- **Stored fields**: `task_manager`, `skills_root`, `kb_root`, `gzctf_service`, `_threads`, `_stop_events`, `_agents`, `_agent_lock`.

#### `CTFWorkflowService.start_ctf_analysis(task_id)`
- **Purpose**: Start a new agent thread for a task.
- **Inputs**: `task_id` (string).
- **Side effects**: Creates a thread via `_start_task`, stores it in `_threads`. Agent runs `_run_worker`.
- **Called by**: API route `start_task`.

#### `CTFWorkflowService.continue_ctf_analysis(task_id)`
- **Purpose**: Resume a stopped/paused task's agent with new input.
- **Same as start but adds `pending_new_input` to agent context.

#### `CTFWorkflowService.stop_task(task_id)`
- **Purpose**: Signal agent thread to stop.
- **Side effects**: Sets stop event, records "User stopped" log, updates task status to STOPPED.

#### `CTFWorkflowService._run_agent(task_id, runtime_config, stop_event, mode)`
- **Purpose**: Core agent execution loop:
  1. Load/create agent via `_build_agent_for_task`
  2. Build system prompt via `_base_system_prompt` + skill enrichment
  3. Run agent with `run_agent_round`
  4. Persist agent state periodically via `_persist_live_agent`
  5. On completion, detect flags and auto-submit via `_maybe_auto_submit_flag`
  6. Store final result and error in task
- **Side effects**: Writes task logs, agent state files, updates task status, submits flags.
- **Failure modes**: LLM exceptions propagated into task error.

#### `CTFWorkflowService._classify_task(task)`
- **Purpose**: Determine task type (WEB/PWN/etc.) from files and description using `classify_ctf_challenge`.
- **Side effects**: May read challenge files in workspace.

#### `CTFWorkflowService._maybe_auto_submit_flag(task, runtime_config, result)`
- **Purpose**: Extract flags from agent result and submit to GZCTF if configured.
- **Calls**: `_extract_candidate_flag`, then `GZCTFService.submit_flag_for_task`.
- **Side effects**: Records submission verdict in task artifacts.

#### `CTFWorkflowService._build_fetcher(runtime_config, provider, usage_tracker)`
- **Purpose**: Construct `LLMFetcher` with backend configuration from runtime config.
- **Outputs**: `LLMFetcher` instance, optionally wrapped in `UsageTrackingFetcher`.

### `core/ctf_skill_router.py`

#### `discover_ctf_skills(skills_root)`
- **Purpose**: Recursively find all `SKILL.md` files with frontmatter.
- **Inputs**: `skills_root` directory path.
- **Outputs**: List of `CTFSkill` objects.
- **Side effects**: Reads filesystem.

#### `classify_ctf_challenge(description, files)`
- **Purpose**: Score challenge description and filenames against known category keywords.
- **Outputs**: `SkillClassification` with `category`, `task_type`, `skill_ids`, `scores`, `reasons`.

#### `build_ctf_skill_context(skills_root, skill_ids, max_chars_per_skill)`
- **Purpose**: Read skill markdown content for given skill IDs.
- **Outputs**: Concatenated text blocks.

#### `enrich_prompt_with_ctf_skills(base_prompt, skills_root, classification)`
- **Purpose**: Append relevant skill context to system prompt.

### `core/ctf_prompt.py`

#### `build_ctf_system_prompt(workspace, task_name, task_type, target, user_prompt_supplement, attached_files)`
- **Purpose**: Build domain-specific system prompt with schema (goal, instructions, environment, rules).
- **Outputs**: String prompt.
- **Calls**: Uses `CTF_DOMAIN_SCHEMAS` from module constants.

#### `build_ctf_user_prompt(mode, additional_input)`
- **Purpose**: Build user message for start/continue/retry modes.

#### `build_ctf_compression_profile(task_type)`
- **Purpose**: Return compression profile preset for the task type.

### `modules/llmfetcher/agent.py`

#### `Agent.__init__(llm_handler, system_prompt, use_state=False, tools=None, max_concurrent_tools=3, round_compress_threshold=50, ...)`
- **Purpose**: Create agent with LLM fetcher, tools, context handler, state machine.
- **Stored fields**: `llm_handler`, `tool_registry`, `llm_context_handler`, `state_machine`, `compression_profile`, `context_mode`, `_base_system_prompt`, `tool_call_history`, `tool_call_result_history`.

#### `Agent.run_agent_round(msg, verbose_info=None, max_turns=20, ...)`
- **Purpose**: Main agent loop — iterates LLM calls and tool executions up to `max_turns` or until stopped.
- **Semantic role**: This is the core agent execution engine. Each turn: send messages → receive response → execute tool calls → compress results → continue. Supports context selection, compression, memory, streaming.
- **Side effects**: Modifies `llm_context_handler` (adds context entries, updates timeline), calls tool handlers, may invoke state machine sub-agent `_maybe_run_context_selection`.
- **Failure modes**: `NoToolCallError`, `MaxTurnsExceededError`, `EmptyModelResponseError` caught and logged.

#### `Agent._handle_tool_calls(tool_calls, verbose_info)`
- **Purpose**: Execute multiple tool calls concurrently (up to `max_concurrent_tools`).
- **Outputs**: List of `ToolResultFact` objects.
- **Side effects**: Calls `_execute_single_tool` for each.

#### `Agent.chat_once(msg, system_prompt=None, temperature=None, max_tokens=None, ..., streamer=None)`
- **Purpose**: Single LLM call with optional streaming. Returns collected response text, reasoning, and tool calls.
- **Side effects**: Adds assistant context to `llm_context_handler`.

### `modules/llmfetcher/llm_fetcher.py`

#### `LLMFetcher.fetch(msg, system_prompt=None, temperature=None, max_tokens=None, prev_messages=None, backend_name=None, tools=None)`
- **Purpose**: Send messages to LLM backend with fallback and retry.
- **Outputs**: `LLMOutput` with content, reasoning, tool calls, usage.
- **Side effects**: May call multiple backends sequentially on error.
- **Failure modes**: `LLMBackendError` after exhausting all backends.

#### `LLMFetcher.fetch_stream(msg, ...)`
- **Purpose**: Streaming variant that yields text chunks and tool call deltas.
- **Outputs**: Generator yielding strings and tool call dicts.

### `modules/llmfetcher/llm_context.py`

#### `LLMContextHandler.add_context(context, append_to_active=True, temperature=None)`
- **Purpose**: Add a context entry to timeline, index it for keyword/semantic retrieval, optionally tag it.
- **Inputs**: `context` (LLMContext), `append_to_active` (bool), `temperature` (for tagging).
- **Side effects**: Updates `context_timeline_dict`, `context_index`, `semantic_index`, `tag_to_context`.

#### `LLMContextHandler.compress_context(timeline_id_list, temperature, compression_profile)`
- **Purpose**: Use LLM to compress a set of context entries into a single compacted entry (reduces token usage).
- **Outputs**: Compaction info with new compacted context IDs.
- **Side effects**: Replaces selected entries with compacted version, updates indices.

#### `LLMContextHandler.search_context_by_keyword(keywords)`
- **Purpose**: Keyword search over context entries.
- **Outputs**: List of context IDs.

#### `LLMContextHandler.search_context_by_semantic(query, top_k, ...)`
- **Purpose**: Semantic search over context entries using embedding model and Chroma.
- **Outputs**: List of context IDs.

## Classes

### `CTFWorkflowService` (`core/ctf_kernel.py`)

| Aspect | Details |
|--------|---------|
| **Constructor** | `(task_manager, skills_root, kb_root, gzctf_service)` — all required, no defaults |
| **Stored fields** | `task_manager`, `skills_root`, `kb_root`, `gzctf_service`, `_threads` (dict), `_stop_events` (dict), `_agents` (dict), `_agent_lock` (Lock) |
| **Public methods** | `create_agent_for_task`, `discard_agent_for_task`, `get_agent_status`, `start_ctf_analysis`, `continue_ctf_analysis`, `retry_ctf_analysis`, `stop_task` |
| **Private methods** | `_start_task`, `_run_worker`, `_run_agent`, `_build_agent_for_task`, `_configure_agent_for_task`, `_classify_task`, `_build_fetcher`, `_agent_state_file`, `_persist_live_agent`, `_persist_agent_for_task`, `_load_agent_for_task`, `_publish_agent_status`, `_build_agent_status_snapshot`, `_maybe_auto_submit_flag`, `_extract_candidate_flag`, `_base_system_prompt`, `_user_prompt` |
| **Invariants** | Each task_id maps to at most one active thread. `_agents` contains agent instances for active tasks. |
| **Lifecycle** | Creation → Service instantiated once per application via `create_services`. Methods called on-demand for task lifecycle. Threads live until agent completes or is stopped. |

### `TaskManager` (`services/tasks/manager.py`)

| Aspect | Details |
|--------|---------|
| **Constructor** | `(tasks_dir)` — directory for storing task JSON files |
| **Stored fields** | `tasks_dir`, `_tasks` (dict), `_runtime_configs` (dict) |
| **Public methods** | `create_task`, `attach_uploaded_files`, `get_all_tasks`, `get_task`, `get_task_workspace`, `prepare_runtime_config`, `get_runtime_config`, `update_status`, `add_log`, `save_pending_new_input`, `set_task_artifact`, `update_task_config`, `delete_task` |
| **Invariants** | Each task is stored in `<tasks_dir>/<task_id>/task.json`. `_tasks` is a memory cache. |
| **Lifecycle** | Created once per ApplicationServices. Tasks loaded lazily from disk on access. |

### `GZCTFAutomationService` (`core/gzctf/module/automation.py`)

| Aspect | Details |
|--------|---------|
| **Constructor** | `(data_dir, task_manager, workflow, gzctf_service)` |
| **Stored fields** | `_root`, `task_manager`, `workflow`, `gzctf_service`, `_lock`, `_runs`, `_threads` |
| **Public methods** | `list_runs`, `get_run`, `start_run`, `cancel_run` |
| **Private methods** | `_run_path`, `_load_runs`, `_persist_run`, `_run_campaign`, `_set_run_status`, `_create_and_start_task_for_challenge`, `_build_task_config`, `_refresh_run_snapshot`, `_request_stop_for_active_tasks`, `_all_records_terminal`, `_dedupe_challenges`, `_challenge_identifier`, `_challenge_title`, `_challenge_category`, `_challenge_description`, `_challenge_connection_hint`, `_build_target_url`, `_enrich_challenge_payload`, `_merge_dicts`, `_extract_preferred_target`, `_target_candidate_priority`, `_extract_target_candidates`, `_extract_text_endpoints`, `_collect_attachment_specs`, `_looks_like_download_url`, `_download_attachments` |
| **Lifecycle** | Runs campaigns in background threads. Each run is persisted as JSON in `<data_dir>/runs/`. |

### `Agent` (`modules/llmfetcher/agent.py`)

| Aspect | Details |
|--------|---------|
| **Constructor** | `(llm_handler, system_prompt, use_state=False, tools=None, max_concurrent_tools=3, round_compress_threshold=50, round_compress_keep_tail=10, context_selection_interval=5, context_selection_min_active_items=30, context_selection_min_active_chars=15000, tool_result_summary_threshold_chars=3000, compression_profile=None, context_mode='full', semantic_embedding_model=None, tool=None)` |
| **Stored fields** | `_base_system_prompt`, `llm_handler`, `compression_profile`, `max_concurrent_tools`, `use_state`, `tool_registry`, `state_machine`, `llm_context_handler`, `tool_call_history`, `tool_call_result_history`, `_round_task_tags`, `context_selection_interval`, `context_selection_min_active_items`, `context_selection_min_active_chars`, `tool_result_summary_threshold_chars`, `context_mode` |
| **Public methods** | `agent_state`, `system_prompt`, `context_manager`, `update_system_prompt`, `set_system_prompt`, `add_tool`, `remove_tool`, `chat_once`, `run_agent_round` |
| **Invariants** | `llm_context_handler` maintains chronological context timeline. `state_machine` is only active if `use_state=True`. |
| **Lifecycle** | Created per task in workflow service. Lives for duration of task analysis. Persisted to disk for resume. |

### `LLMContextHandler` (`modules/llmfetcher/llm_context.py`)

| Aspect | Details |
|--------|---------|
| **Constructor** | `(llm_handler, enable_memory=False, enable_tagging=False, compression_profile=None, context_mode='full', semantic_embedding_model=None)` |
| **Stored fields** | `llm_handler`, `compression_profile`, `context_mode`, `retrieval_enabled`, `context_timeline_dict`, `active_ids`, `now_context_id`, `context_index`, `semantic_index`, `enable_memory`, `memory_list`, `tool_result_facts`, `enable_tagging`, `tag_to_context` |
| **Public methods** | `configure_context_mode`, `empty`, `clear`, `set_active_ids`, `append_active_ids`, `get_active_ids_window`, `context_len`, `add_context`, `get_now_context`, `get_now_active_context`, `transcribe_context_to_str`, `get_now_context_as_str`, `compress_context`, `search_context_by_keyword`, `create_memory`, `copy_memories`, `get_memories`, `clear_memories`, `copy_tool_result_facts`, `get_tool_result_facts`, `clear_tool_result_facts`, `export_context`, `import_context`, `compress_tool_result`, `compress_tool_result_records`, `tagify_context`, `find_context_by_tags`, `find_context_by_semantic`, `find_context_by_summary`, `find_context_by_summary_and_tags`, `expand_retrieval_hit_ids`, `expand_active_selection_ids`, `get_descendant_ids`, `find_compacted_entries_by_source_ids` |
| **Invariants** | `context_timeline_dict` maps context_id to `LLMContext`. `active_ids` is ordered list of currently active context IDs. |
| **Lifecycle** | Created once per Agent. Lives until Agent is destroyed or reset. |

### `LLMFetcher` (`modules/llmfetcher/llm_fetcher.py`)

| Aspect | Details |
|--------|---------|
| **Constructor** | `(backends, default_backend=None)` — backends is list of `LLMBackendConfig` |
| **Stored fields** | `backends`, `backend_order`, `handlers` (dict of name->handler), `default_backend` |
| **Public methods** | `list_available_backend_providers`, `backend_configs`, `fallback_order`, `default_backend_config`, `provider`, `backend_providers`, `fetch`, `fetch_stream` |
| **Lifecycle** | Created once per agent. Backend handlers created lazily on first use. |

### `ExecutionGraph` (`modules/llmfetcher/swarm/execution_graph.py`)

| Aspect | Details |
|--------|---------|
| **Constructor** | `(llm_fetcher, max_concurrency=10)` |
| **Stored fields** | `_nodes`, `_edges`, `_lock`, `_node_counter`, `_llm_fetcher`, `_tool_pool`, `_semaphore`, `_node_timeouts`, `_version`, `_stop_state`, `_active_run_tasks` |
| **Public methods** | `version`, `stop_state`, `request_soft_stop`, `request_hard_stop`, `clear_stop_requests`, `register_tool`, `unregister_tool`, `get_tool`, `tool_pool`, `add_agent_node`, `add_tool_node`, `add_router_node`, `add_input_node`, `add_output_node`, `add_join_node`, `remove_node`, `get_node`, `nodes`, `edges`, `connect`, `disconnect`, `update_agent_prompt`, `add_tool_to_agent`, `remove_tool_from_agent`, `set_node_timeout`, `run`, `snapshot`, `restore`, `checkpoint`, `resume`, `to_dict` |
| **Lifecycle** | Created once per `AgentSwarm`. Can be saved/loaded. Supports multiple runs (but only one active run at a time). |

### `AgentSwarm` (`modules/llmfetcher/swarm/swarm.py`)

| Aspect | Details |
|--------|---------|
| **Constructor** | `(llm_fetcher, name=None, spec=None, max_concurrency=10)` |
| **Stored fields** | `_llm_fetcher`, `_spec`, `_name`, `execution_graph`, `thinking_graph`, `tool_registry`, `_agents`, `_thinking_tools`, `_graph_tools`, `_run_count`, `_last_context` |
| **Public methods** | `from_existing` (classmethod), `name`, `spec`, `agents`, `tool_schemas`, `add_tool`, `add_tools`, `remove_tool`, `add_agent`, `remove_agent`, `get_agent`, `update_agent_prompt`, `add_tool_to_agent`, `remove_tool_from_agent`, `add_input`, `add_output`, `add_router`, `add_join`, `add_tool_node`, `connect`, `disconnect`, `set_timeout`, `request_soft_stop`, `request_hard_stop`, `clear_stop_requests`, `run`, `last_context`, `save`, `load`, `checkpoint`, `resume`, `to_dict` |
| **Lifecycle** | Created per swarm definition. Supports multiple runs. Can be serialized/deserialized. |

### `ThinkingGraph` (`modules/llmfetcher/thinking_graph.py`)

| Aspect | Details |
|--------|---------|
| **Constructor** | `()` — no arguments, initializes empty graph |
| **Stored fields** | `node_dict`, `edge_dict`, `_next_object_id`, `_version`, `_transaction_id`, `_transaction_log`, `_lock` |
| **Public methods** | `version`, `transaction_log`, `serialize`, `to_dict`, `from_dict`, `deserialize`, `get_full_graph`, `clear_transaction_log`, `get_transaction_log`, `validate_edge_schema`, `add_node`, `add_edge`, `modify_node`, `modify_edge`, `validate_incremental_context`, `validate_graph_integrity` |
| **Lifecycle** | Created once per swarm. Nodes and edges added incrementally. Supports export/import. |

### `GZCTFService` (`services/gzctf_service.py`)

| Aspect | Details |
|--------|---------|
| **Constructor** | `(data_dir)` |
| **Stored fields** | `_root` |
| **Public methods** | `is_configured`, `has_partial_config`, `validate_config`, `get_status`, `clear_cookie`, `get_cookie_path`, `refresh_login`, `submit_flag_for_task`, `ensure_authenticated_session`, `parse_game_url`, `fetch_public_key`, `verify_profile`, `fetch_game_details`, `resolve_challenge`, `list_challenge_candidates`, `submit_flag`, `parse_submit_id`, `poll_submission_status`, `save_cookies`, `fetch_team_info`, `extract_team_info`, `find_public_key`, `encrypt_api_data`, `classify_verdict` |
| **Lifecycle** | Created once per ApplicationServices. Cookies persisted as files in data_dir. |

### `HotplugToolManager` (`services/tools/hotplug.py`)

| Aspect | Details |
|--------|---------|
| **Constructor** | `(storage_dir)` — directory for tool definitions |
| **Stored fields** | `_storage_dir`, `_tools` (dict) |
| **Public methods** | `configure_storage_dir`, `get_all_tools`, `get_hotplug_tools`, `get_hotplug_tool_names`, `get_tool`, `add_tool`, `remove_tool`, `update_tool_code`, `reload_all`, `reload_tool`, `get_status`, `get_tool_hash`, `build_runtime_tools` |
| **Private methods** | `_definition_path`, `_hash`, `_normalize_tool`, `_resolve_path`, `_serialize`, `_build_runtime_tool`, `_build_script_handler`, `_build_python_module_handler`, `_build_command_for_script`, `_run_command` |
| **Lifecycle** | Tools loaded from filesystem on init. Managed via API. Module-level singleton `hotplug_manager`. |

## Execution Flows

### Startup Flow
1. `app.py` → `create_app()` called
2. Middleware `disable_frontend_asset_cache` registered
3. `api/__init__.py` registers all routers
4. On first API request, `api/dependencies.get_services()` calls `create_services()`
5. `create_services()` initializes:
   - `ApplicationStorage` (data directory)
   - `JsonConfigStore`
   - `TaskManager`
   - `ConfigHandler`
   - `GZCTFService`
   - `CTFWorkflowService`
   - `GZCTFAutomationService`
   - `LLMClient`, `SkillService`, `KnowledgeService`, `DynamicKnowledgeService`, `BackgroundJobManager`, `ToolBootstrapService`, `TempMcpManager`, `UserMcpManager`
6. Frontend `index.html` and static JS served from `frontend/`

### Task Creation Flow
1. User sends POST `/api/tasks` with `CreateTaskRequest` (JSON + optional multipart files)
2. `create_task` route handler extracts payload and uploaded files via `_get_request_payload` and `_extract_uploaded_files`
3. `TaskManager.create_task()` creates `CTFTask` object with config, generates UUID, creates workspace directory
4. `TaskManager.attach_uploaded_files()` stores files in task's attachments directory
5. Returns task metadata

### Task Analysis Flow
1. User sends POST `/api/tasks/{id}/start`
2. Route calls `CTFWorkflowService.start_ctf_analysis(task_id)`
3. Service spawns a daemon thread running `_run_worker`
4. `_run_worker` calls `_run_agent`:
   a. Load or create agent via `_build_agent_for_task`
   b. Classify challenge via `_classify_task`
   c. Build system prompt with skill context via `_base_system_prompt`
   d. Set up token tracker and verbose logging via `TaskTokenUsageTracker` and `TaskVerboseLogWriter`
   e. Run `Agent.run_agent_round()` with initial user prompt
   f. Agent performs LLM calls and tool executions in loop
   g. On each significant event, persist agent state via `_persist_live_agent`
   h. On completion, extract flags and auto-submit via `_maybe_auto_submit_flag`
5. Results stored in task object

### Agent Round Flow
1. `Agent.run_agent_round` receives message
2. Optionally run context selection (`_maybe_run_context_selection`) if `_should_trigger_context_selection` returns true
3. Build context bundle (`_build_main_context_bundle`): state text + recent context + selected context + current input
4. Send messages to LLM via `chat_once`
5. Process response: collect text, reasoning, tool calls via `_split_reasoning_from_stream_text`
6. Execute tool calls via `_handle_tool_calls` (concurrently up to `max_concurrent_tools`)
7. Compress large tool results via `LLMContextHandler.compress_tool_result`
8. Archive old context if threshold exceeded via `_archive_old_active_context`
9. Optionally run state machine update via `state_machine.update_from_turn`
10. Loop until max turns or stop signal

### GZCTF Automation Flow
1. User sends POST `/api/gzctf/start` with runtime config
2. `GZCTFAutomationService.start_run` spawns campaign thread
3. `_run_campaign`:
   a. Login to GZCTF, fetch game details via `_enrich_challenge_payload`
   b. Deduplicate challenges via `_dedupe_challenges`
   c. For each challenge (up to limit, respecting concurrency):
      - Build task config with target, attachments, classification via `_build_task_config`
      - Create task via `TaskManager`
      - Start task (calls `CTFWorkflowService.start_ctf_analysis`)
   d. Periodically refresh run snapshot via `_refresh_run_snapshot`: poll task statuses, record submissions
   e. On completion or cancel, stop all active tasks via `_request_stop_for_active_tasks`
4. Run status persisted to JSON file via `_persist_run`

### Error Flow
- **API level**: Exceptions in handlers caught by FastAPI error handlers, returned as JSON with appropriate status codes.
- **Task level**: If agent encounters unrecoverable error, task status set to FAILED, error message stored.
- **LLM level**: `LLMFetcher` catches exceptions per backend, falls through to next backend, then raises `LLMBackendError` if all fail.
- **Tool level**: Individual tool failures captured as `ToolResultFact` with error status; agent continues unless critical.

### Shutdown Flow
- No explicit teardown; threads are daemon so exit with process.
- In-flight tasks: stop requested via `stop_task` API which sets stop event.

## Data Flow

### Data Sources
- **User input**: HTTP request payloads (JSON form data, multipart file uploads)
- **LLM responses**: Text content, reasoning, tool calls, token usage
- **Files**: Uploaded challenge attachments stored in task workspace
- **Knowledge Base**: Local markdown files (`kb/`, `ctf-skills/`, `skills/`)
- **External APIs**: GZCTF (challenge data, flag submission), LLM provider APIs

### Data Transformations
1. **Request → Schema**: `from_payload()` factories deserialize JSON into typed data classes
2. **Schema → Task**: `CreateTaskRequest` → `CTFTaskConfig` → `CTFTask`
3. **Task → Agent**: `CTFTaskConfig` used to build system prompt, select tools, configure runtime
4. **Agent → LLM**: Agent builds message history (system prompt + context + user input) → `LLMFetcher.fetch()` serializes to backend-specific format
5. **LLM Response → Tool Calls**: `normalize_tool_calls()` converts backend-specific responses to `NormalizedToolCall`
6. **Tool Results → Context**: Raw tool output compressed via `LLMContextHandler.compress_tool_result` into `ToolResultFact`
7. **Context → Next Turn**: Context entries (including tool results) included in next LLM message history

### Data Sinks
- **Task storage**: JSON files in `data_dir/tasks/<id>/`
- **Agent state**: `agent_state.json` per task (live persistence for resume)
- **Knowledge base**: Leaf-level markdown files, Chroma vector DB index files
- **GZCTF runs**: JSON files in `data_dir/runs/`
- **User config**: JSON file per user in `data_dir/config/`
- **Auth sessions**: SQLite database at `data_dir/auth.db`
- **Logs**: Written to task records as in-memory list
- **Flag submissions**: Sent to GZCTF API, result stored in task artifacts

### Caching
- **Task manager**: In-memory dict of loaded tasks (no explicit eviction observed — inferred since tasks directory is small)
- **LLM handler instances**: Cached per backend name in `LLMFetcher.handlers`
- **Context index**: In-memory `ContextIndex` and `ContextSemanticIndex` rebuilt on import
- **Agent state**: Live persistence only (restored from disk on resume, not cached in memory beyond active agent)
- **Frontend**: Disabled asset caching on backend (via middleware)

## Side Effects

### Files Written
- Task JSON files and workspace directories
- Agent state JSON files per task
- User config JSON files
- GZCTF automation run JSON files
- Hotplug tool definitions on disk
- Auth SQLite database
- Knowledge base vector index files (Chroma)
- Log files (via `TaskVerboseLogWriter` → task logs)

### Network Calls
- LLM provider APIs (OpenAI, Anthropic, custom endpoints)
- GZCTF API (login, game fetch, challenge data, flag submission)
- MCP servers (HTTP/stdio connections)
- URL fetch for dynamic knowledge ingestion
- Model list fetch from provider APIs

### State Changes
- Task status: PENDING → RUNNING → COMPLETED/FAILED/STOPPED
- Auth sessions created/destroyed
- Agent context timeline mutated each round
- Agent state machine updates phase, facts, hypotheses, credentials
- Active task thread set/cleared in `CTFWorkflowService`
- Background job processes started/stopped

### Caches or Temporary Artifacts
- In-memory context index (not persisted)
- Agent state files (persisted for resume, cleaned on task delete)
- Temp MCP server code on disk (cleaned by cleanup endpoint)
- Chroma vector database files (persistent)

## Agent Change Protocol

- **Before editing**: Read this semantic map and the source files relevant to the requested change.
- **During editing**: Treat this map as the current behavioral contract unless source inspection proves it stale.
- **After editing**: Update changed module, function, runtime-flow, and side-effect sections in the same change.
- **If code and map disagree**: Trust observed code, then repair the map before relying on it for further edits.

## Change Sync

- **2025-07-09**: Updated CODEMAP.md from repository scan — integrated per-file symbol index from LSP (Pyright, TypeScript) for Python backend and JavaScript frontend. Added missing internal helper functions, expanded class method lists, included new API endpoint helpers (tools.py file upload parsing), and added `ContextSemanticIndex` details. Frontend JS modules (core.js, agent.js, actions.js, etc.) are now referenced but detailed in `docs/frontend-semantic-map.md`.
