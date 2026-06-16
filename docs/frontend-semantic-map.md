# Frontend Semantic Map

## Index

| Symbol | Kind | Module | Summary |
| --- | --- | --- | --- |
| `frontend/index.html` | document | `frontend` | Defines the single-page UI shell, modal DOM, inline event bindings, and deferred script order. |
| `core.API_BASE` | constant | `frontend/js/core.js` | Builds the API root from `window.location.origin`. |
| `core.apiRequest` | function | `frontend/js/core.js` | Sends JSON API requests with auth headers and normalized response handling. |
| `core.multipartApiRequest` | function | `frontend/js/core.js` | Sends multipart requests with auth headers and upload progress callbacks. |
| `core.setAuthenticatedUser` | function | `frontend/js/core.js` | Stores the active auth token and username, then resets user-scoped UI state. |
| `core.bootstrapAuthState` | function | `frontend/js/core.js` | Checks whether the locally stored token is still usable. |
| `core.loadSkills` | function | `frontend/js/core.js` | Loads CTF skill metadata for task forms. |
| `core.getInputValue` | function | `frontend/js/core.js` | Safely reads an input value by DOM id with fallback support. |
| `core.setInputValue` | function | `frontend/js/core.js` | Safely writes a value into an optional form control. |
| `core.formatDateTime` | function | `frontend/js/core.js` | Formats date-like values, including epoch seconds, for UI display. |
| `ui.closeModal` | function | `frontend/js/ui.js` | Closes and resets the create-task modal. |
| `ui.getLearningConfig` | function | `frontend/js/ui.js` | Reads learning workflow options from create/edit task controls. |
| `ui.getSwarmSubagentConfig` | function | `frontend/js/ui.js` | Reads swarm subagent count options from create/edit task controls. |
| `ui.syncTaskWorkflowControls` | function | `frontend/js/ui.js` | Shows, hides, and defaults workflow-specific task form controls. |
| `ui.openEditTaskModal` | function | `frontend/js/ui.js` | Hydrates and opens the edit-task modal from the latest task snapshot. |
| `ui.openNewTaskModal` | function | `frontend/js/ui.js` | Opens the create-task modal and initializes form controls. |
| `actions.onSaveConfigClick` | function | `frontend/js/actions.js` | Saves the active user's LLM runtime configuration. |
| `actions.onCreateTaskClick` | function | `frontend/js/actions.js` | Builds a task create payload and submits single or batch task creation. |
| `actions.fetchModels` | function | `frontend/js/actions.js` | Fetches model options, restores the visible select UI on success, and falls back to human-readable labels when the backend omits `name`. |
| `actions.createSingleTaskRequest` | function | `frontend/js/actions.js` | Sends one task create request as multipart form data. |
| `actions.createTasksInBatch` | function | `frontend/js/actions.js` | Expands batch task definitions and submits them to the batch API. |
| `actions.onTaskStartById` | function | `frontend/js/actions.js` | Starts a persisted task directly and surfaces backend error codes and hints when the launch fails. |
| `actions.onEditTaskClick` | function | `frontend/js/actions.js` | Sends edited task metadata, workflow settings, and external hotplug tool selections to the backend. |
| `actions.onTaskDeleteClick` | function | `frontend/js/actions.js` | Deletes a task by id, closes the active detail modal when needed, and refreshes the task list after the backend confirms deletion. |
| `tasks.refreshTasks` | function | `frontend/js/tasks.js` | Fetches task snapshots and renders or queues the update. |
| `tasks.renderTasks` | function | `frontend/js/tasks.js` | Renders the task grid from sorted task data. |
| `tasks.renderTaskCardSummaryBlocks` | function | `frontend/js/tasks.js` | Renders compact block summaries inside task-list cards. |
| `tasks.renderTaskDetailModalForTask` | function | `frontend/js/tasks.js` | Renders the detail modal for one task while preserving useful local state. |
| `tasks.normalizeTaskAgentStatus` | function | `frontend/js/tasks.js` | Normalizes backend `artifacts.agent_status` into AgentState, context, tool-summary, persistence, and metric data for the task detail modal. |
| `tasks.normalizeTaskTokenUsage` | function | `frontend/js/tasks.js` | Normalizes backend `artifacts.token_usage` into totals, grouped counters, and call records for the task detail modal. |
| `tasks.renderTaskTokenUsagePage` | function | `frontend/js/tasks.js` | Renders the task detail Token 用量 tab with totals, model/backend groups, and per-call raw usage. |
| `tasks.renderTaskAgentStateSection` | function | `frontend/js/tasks.js` | Renders the Agent State panel inside the task detail modal, including compressed tool summaries. |
| `tasks.normalizeTaskProgressValue` | function | `frontend/js/tasks.js` | Normalizes backend progress values for safe percentage display. |
| `tasks.formatTaskFilesLabel` | function | `frontend/js/tasks.js` | Builds de-duplicated file labels for task detail surfaces. |
| `tasks.formatTaskSkillsHtml` | function | `frontend/js/tasks.js` | Builds sanitized skill chips or the default skill label. |
| `tasks.getTaskStatusKey` | function | `frontend/js/tasks.js` | Normalizes backend and legacy task lifecycle statuses for UI logic. |
| `tasks.normalizeTaskThinkingGraph` | function | `frontend/js/tasks.js` | Converts backend thinking graph artifacts into frontend render data. |
| `tasks.renderThinkingGraphVisual` | function | `frontend/js/tasks.js` | Renders the full SVG thinking graph. |
| `tasks.renderTaskActionGraph` | function | `frontend/js/tasks.js` | Renders the action graph derived from autonomous workflow state. |
| `tasks.renderMarkdown` | function | `frontend/js/tasks.js` | Converts a restricted Markdown subset into sanitized HTML. |
| `cockpit.openCockpitModal` | function | `frontend/js/cockpit.js` | Opens the background-job cockpit and refreshes job/task lists. |
| `cockpit.startCockpitJob` | function | `frontend/js/cockpit.js` | Starts an interactive background command through the API. |
| `cockpit.refreshKnowledgeList` | function | `frontend/js/cockpit.js` | Loads knowledge review items for the active review tab. |
| `bootstrap.loadCurrentUserState` | function | `frontend/js/bootstrap.js` | Loads config, model list, skills, and task snapshots after auth. |
| `tools.openToolsModal` | function | `frontend/js/tools.js` | Opens the tool manager modal and renders tool inventories. |
| `mcp.openMCPModal` | function | `frontend/js/mcp.js` | Opens the local/hosted MCP configuration modal. |
| `user_mcp.openUserMCPModal` | function | `frontend/js/user_mcp.js` | Opens the user-hosted MCP management modal. |
| `plugins.openPluginModal` | function | `frontend/js/plugins.js` | Opens the plugin manager modal and loads plugin state. |

## Architecture

The frontend is a plain JavaScript single-page interface served from `frontend/index.html`.

Loaded by the current page with cache-busting query strings:

1. `frontend/js/core.js`
2. `frontend/js/ui.js`
3. `frontend/js/cockpit.js`
4. `frontend/js/actions.js`
5. `frontend/js/tasks.js`
6. `frontend/js/bootstrap.js`

Additional standalone frontend modules exist for optional or legacy modal surfaces:

- `frontend/js/tools.js`: tool and hotplug-tool management.
- `frontend/js/mcp.js`: local MCP server configuration.
- `frontend/js/user_mcp.js`: user-hosted and temporary MCP script management.
- `frontend/js/plugins.js`: plugin manager UI.
- `frontend/js/agent.js`: older monolithic agent UI logic. It overlaps with `core.js`, `ui.js`, `actions.js`, and `tasks.js`; it is not loaded by the current `index.html`.

The loaded runtime uses shared globals rather than ES modules. Cross-file calls therefore depend on script order and globally named functions.

Task synchronization is pull-based, not push-based: `startTaskRefresh()` sets a 2-second polling interval, and user actions also call `refreshTasks()` after mutations. There is no WebSocket or SSE channel for task state updates in the current frontend.

## Global State

| State | Owner | Meaning | Mutated By |
| --- | --- | --- | --- |
| `uploadedTaskFiles` | `core.js` / task creation | Files selected for the create-task form. | `handleTaskFileSelect`, `removeTaskFile`, `closeModal`, `syncTaskWorkflowControls`. |
| `taskCreateMode` | `core.js` / task creation | Create modal mode: `single` or `batch`. | `setTaskCreateMode`, `closeModal`. |
| `batchTaskFileAssignments` | `core.js` / batch creation | Mapping from batch task key to selected uploaded file keys. | Batch planner helpers in `actions.js`; reset by `closeModal`. |
| `currentAuthToken` | `core.js` / auth | Bearer token used for API requests. | `setAuthenticatedUser`, `clearAuthenticatedUser`, `bootstrapAuthState`. |
| `currentUsername` | `core.js` / auth | Normalized username for UI and localStorage scoping. | `setAuthenticatedUser`, `clearAuthenticatedUser`. |
| `currentUserConfigState` | `core.js` / config | Effective API/model configuration and server fallback status. | `loadCurrentUserState`, `onSaveConfigClick`, auth reset paths. |
| `availableSkills` | `core.js` / task forms | Skill list returned from `/api/skills`. | `loadSkills`. |
| `latestTaskPayload` | `core.js` / task snapshots | Last task list returned by `/api/tasks`. | `fetchLatestTasksSnapshot`, `setAuthenticatedUser`, `loadCurrentUserState`. |
| `queuedTaskPayload` | `core.js` / refresh pause | Deferred task snapshot while the user is interacting with task cards. | `fetchLatestTasksSnapshot`, `queueOrRenderTasks`, `resumeTaskRefresh`. |
| `expandedTaskIds` | `core.js` / task cards | Tracks expanded inline task detail cards. | `toggleTaskDetails`, task rendering helpers. |
| `taskDetailOutputPageState` | `core.js` / task detail | Active LLM output page per task. | Output pager helpers in `tasks.js`. |
| `taskDetailTabState` | `core.js` / task detail | Active detail tab per task. | `resolveTaskDetailTab`, `setTaskDetailTab`. |
| `taskThinkingGraphPageState` | `core.js` / thinking graph | Active thinking graph page per task. | Thinking graph paging helpers in `tasks.js`. |
| `taskThinkingGraphZoomState` | `core.js` / thinking graph | SVG thinking graph zoom per task. | `resolveTaskThinkingGraphZoom`, `setTaskThinkingGraphZoom`, `adjustTaskThinkingGraphZoom`. |
| `taskThinkingGraphPanState` | `core.js` / thinking graph | SVG thinking graph pan offset per task. | Pan helpers in `tasks.js`. |
| `activeTaskDetailId` | `core.js` / modals | Currently open task detail modal id. | `openTaskDetailModal`, `closeTaskDetailModal`. |
| `activeThinkingGraphModalTaskId` | `core.js` / modals | Currently open thinking graph modal task id. | `openThinkingGraphModal`, `closeThinkingGraphModal`. |
| `activeSwarmRunModalTaskId` / `activeSwarmRunModalRunId` | `core.js` / modals | Currently open swarm run modal identity. | `openSwarmRunModal`, `closeSwarmRunModal`. |
| `cockpitJobs` | `cockpit.js` | Cached background-job list. | `refreshCockpitJobs`, `upsertCockpitJob`. |
| `knowledgeItems` | `cockpit.js` | Cached knowledge review list for active tab. | `refreshKnowledgeList`. |
| `pluginList` | `plugins.js` | Cached plugin list. | `loadPluginList`. |
| `cachedTools` / `cachedCategories` / `cachedHotplugTools` | `tools.js` | Tool manager caches. | Fetch and hotplug operations in `tools.js`. |

## Modules

### `frontend/index.html`

- Responsibility: Provide the SPA shell, task list, create/edit/detail modals, config modal, auth modal, cockpit modal, and knowledge modal.
- Public entry points: Inline `onclick`, `onchange`, and `oninput` handlers call globally defined functions.
- Calls: `openCockpitModal`, `openKnowledgeModal`, `openAuthModal`, `logout`, `toggleTheme`, `openNewTaskModal`, `openConfigModal`, `refreshTasksWithButton`, `onTaskSortChange`, `toggleTaskSortDirection`, `onConnectorTypeChange`, `toggleApiKeyVisibility`, `fetchModels`, `toggleManualModelInput`, `onSaveConfigClick`, `submitAuth`, `toggleAuthMode`, `setTaskCreateMode`, `refreshBatchTaskPlanner`, `onTaskTypeChange`, `handleTaskFileSelect`, `applyFilesToAllBatchTasks`, `clearAllBatchTaskFiles`, `onTaskModeChange`, `onTaskExecutionModeChange`, `onTaskSwarmSubagentAutoCountChange`, `onTaskSwarmSubagentConfigInputChange`, `onCreateTaskClick`, `refreshActiveTaskDetailModal`, `closeTaskDetailModal`, `closeLogPanelModal`, `exportActiveThinkingGraphResult`, `refreshActiveThinkingGraphModal`, `refreshActiveSwarmRunModal`, `closeEditTaskModal`, `onEditTaskClick`, `refreshCockpitJobs`, `startCockpitJob`, `sendCockpitInput`, `stopCockpitJob`, `switchKnowledgeTab`, `approveKnowledgeReview`, `rejectKnowledgeReview`, `refreshKnowledgeList`.
- Called by: Browser document loader and user interactions.
- Inheritance: None.

### `frontend/js/core.js`

- Responsibility: Own shared runtime state, auth session management, common API helpers, model/config input helpers, skill loading, and date formatting.
- Side effects: Reads/writes `localStorage`, mutates global state, updates DOM, opens auth/config modals, and performs network requests.
- Key callees: `apiRequest`, `multipartApiRequest`, `loadCurrentUserState`, `refreshTasks`, `renderTasks`, `updateTaskStats`, `fetchModels`, `addLog`.
- Called by: `bootstrap.js`, `actions.js`, `tasks.js`, `cockpit.js`, optional tool/MCP/plugin modules, and inline HTML handlers.

#### `core.apiRequest`

- Signature: `apiRequest(url, options = {})`
- Parameters:
  - `url`: Absolute or relative API URL to fetch.
  - `options`: Fetch options plus the custom `skipAuthRedirect` flag.
- Returns: A normalized object with `success`, `data`, and `message` fields when possible.
- Side effects: Adds auth and JSON headers, may clear auth state and open the auth modal on `401`.
- Calls: `applyAuthHeaders`, `clearAuthenticatedUser`, `openAuthModal`.
- Called by: Config, task, cockpit, auth, and knowledge workflows.

#### `core.multipartApiRequest`

- Signature: `multipartApiRequest(url, { formData, onProgress, skipAuthRedirect = false } = {})`
- Parameters:
  - `url`: API endpoint URL.
  - `formData`: `FormData` payload containing JSON payload and files.
  - `onProgress`: Optional upload progress callback receiving a progress event.
  - `skipAuthRedirect`: Whether to suppress auth modal handling on unauthorized responses.
- Returns: Parsed API envelope.
- Side effects: Creates and sends an `XMLHttpRequest`, attaches auth headers, reports upload progress.
- Calls: `applyAuthHeaders`, `clearAuthenticatedUser`, `openAuthModal`.
- Called by: `actions.createSingleTaskRequest`, `actions.createBatchTaskRequest`.

#### `core.setAuthenticatedUser`

- Signature: `setAuthenticatedUser(token, username)`
- Parameters:
  - `token`: Bearer token returned by auth endpoints.
  - `username`: Raw username to normalize for display and storage keys.
- Returns: `undefined`.
- Side effects: Updates auth globals, writes/removes `localStorage`, clears task/detail/graph UI state, hides open task modals, updates auth UI.
- Calls: `normalizeUsername`, `updateUserContextUi`.
- Called by: `submitAuth`, `clearAuthenticatedUser`, `bootstrapAuthState`.

#### `core.getInputValue`

- Signature: `getInputValue(id, fallback = '')`
- Parameters:
  - `id`: DOM element id.
  - `fallback`: Value returned when the element is absent or value is nullish.
- Returns: String input value or fallback.
- Side effects: None.
- Calls: DOM `document.getElementById`.
- Called by: `actions.onCreateTaskClick`, `actions.onEditTaskClick`, `ui.onTaskTypeChange`.

#### `core.setInputValue`

- Signature: `setInputValue(id, value)`
- Parameters:
  - `id`: DOM element id for the target input, textarea, or select.
  - `value`: Value assigned to the element when it exists.
- Returns: Boolean indicating whether a matching element was found and updated.
- Side effects: Mutates the target form control value when present.
- Calls: DOM `document.getElementById`.
- Called by: `ui.closeModal`, `ui.openNewTaskModal`, `ui.openEditTaskModal`, `bootstrap.loadCurrentUserState`, `core.logout`.

#### `core.formatDateTime`

- Signature: `formatDateTime(value)`
- Parameters:
  - `value`: Timestamp string, epoch seconds, epoch milliseconds, or another date-like value.
- Returns: Chinese-locale timestamp text, `未知时间` for empty input, or the original value string when parsing fails.
- Side effects: None.
- Calls: `Date`, `toLocaleString`.
- Called by: task list cards, task detail metadata, knowledge/cockpit time labels, and feedback timestamps.

#### `tasks.normalizeTaskAgentStatus`

- Signature: `normalizeTaskAgentStatus(rawValue, fallbackContext)`
- Parameters:
  - `rawValue`: Backend `artifacts.agent_status` payload.
  - `fallbackContext`: Legacy `artifacts.context_snapshot` used when the new status payload is absent.
- Returns: Normalized Agent status object containing `state`, `context`, compressed tool summaries, active ids, context length, tool count, persistence path, and timestamps.
- Side effects: None.
- Calls: `normalizeTaskContextSnapshot`.
- Called by: `buildTaskDetailData`.

#### `tasks.renderTaskAgentStateSection`

- Signature: `renderTaskAgentStateSection(agentStatus)`
- Parameters:
  - `agentStatus`: Normalized status from `normalizeTaskAgentStatus`.
- Returns: HTML for the Agent State section, including facts, hypotheses, next actions, failed actions, do-not-repeat entries, known routes, artifacts, tool summaries, and persistence metadata.
- Side effects: None.
- Calls: `escapeHtml`, `formatDateTime`.
- Called by: `renderTaskDetailModal`.

### `frontend/js/ui.js`

- Responsibility: Manage theme, page navigation, modal visibility, create/edit task form state, learning settings, swarm settings, file upload display, and skill selectors.
- Side effects: Mutates DOM, reads selected files, resets global task creation state.
- Key callees: `getLearningConfig`, `applyLearningConfig`, `getSwarmSubagentConfig`, `applySwarmSubagentConfig`, `syncTaskWorkflowControls`, `populateSkillsSelect`, `refreshBatchTaskPlanner`, `updateUploadedFilesDisplay`.
- Called by: Inline HTML handlers, `bootstrap.js`, `actions.js`, and `tasks.js`.

#### `ui.closeModal`

- Signature: `closeModal()`
- Parameters: None.
- Returns: `undefined`.
- Side effects: Closes the create-task modal, clears task fields, resets learning/swarm controls, empties upload and batch assignment state, refreshes derived UI.
- Calls: `applySwarmSubagentConfig`, `applyLearningConfig`, `setTaskCreateMode`, `onTaskTypeChange`, `onTaskModeChange`, `onTaskExecutionModeChange`, `resetTaskCreateProgress`, `updateUploadedFilesDisplay`, `refreshBatchTaskPlanner`.
- Called by: `actions.onCreateTaskClick`, create modal cancel button, modal backdrop click handler.

#### `ui.syncTaskWorkflowControls`

- Signature: `syncTaskWorkflowControls(prefix, taskType = '')`
- Parameters:
  - `prefix`: Control id prefix, usually `task` for create or `editTask` for edit.
  - `taskType`: Task type selected by the user or loaded from a task.
- Returns: `undefined`.
- Side effects: Shows/hides learning, upload, batch, target, execution, and swarm controls; may clear uploaded files for knowledge tasks.
- Calls: `isKnowledgeTaskType`, `syncSwarmSubagentConfigUI`, `updateUploadedFilesDisplay`, `refreshBatchTaskPlanner`, `getLearningConfig`, `updateTaskModeDescription`.
- Called by: `onTaskTypeChange`, `openEditTaskModal`, task mode/execution handlers.

#### `ui.openEditTaskModal`

- Signature: `openEditTaskModal(taskId)`
- Parameters:
  - `taskId`: Task id to find in `latestTaskPayload`.
- Returns: Promise resolving after skills are loaded and the modal is shown.
- Side effects: Hydrates edit form controls, applies learning/swarm config, loads skill options, and restores the editable external hotplug tool selection before opening the modal.
- Calls: `loadSkills`, `populateSkillsSelect`, `applyLearningConfig`, `applySwarmSubagentConfig`, `syncTaskWorkflowControls`, `onEditTaskModeChange`, `onEditTaskExecutionModeChange`.
- Called by: Edit buttons rendered from `tasks.renderTaskActionButtons`.

### `frontend/js/actions.js`

- Responsibility: Handle user actions that mutate backend state: config save, task create/update/delete/start/continue/retry/stop, batch creation, and task new-input persistence.
- Side effects: Performs network requests, mutates local task snapshot state, updates progress UI, closes modals, logs user-visible status.
- Key callees: `apiRequest`, `multipartApiRequest`, `getLearningConfig`, `getSwarmSubagentConfig`, `getSelectedSkills`, `applyTaskUpdateLocally`, `refreshTasks`, `closeModal`, `closeEditTaskModal`.
- Called by: Inline HTML handlers and task card/detail action buttons.

#### `actions.onCreateTaskClick`

- Signature: `onCreateTaskClick()`
- Parameters: None; reads create-task form controls from DOM.
- Returns: Promise resolving after task creation attempt and UI cleanup.
- Side effects: Disables submit button, updates progress, uploads files, closes modal on success, refreshes task list, logs result.
- Calls: `ensureAuthenticated`, `getInputValue`, `getLearningConfig`, `getSwarmSubagentConfig`, `getSelectedSkills`, `createTasksInBatch`, `createSingleTaskRequest`, `closeModal`, `refreshTasks`, `addLog`, `resetTaskCreateProgress`.
- Called by: `frontend/index.html` create task button.

#### `actions.fetchModels`

- Signature: `fetchModels()`
- Parameters: None; reads API key, API base, connector type, and current model controls from DOM.
- Returns: Promise resolving after the model list request and UI update.
- Side effects: Requests `/api/models`, repopulates the model select, and returns the UI to select mode so fetched options stay visible.
- Calls: `ensureAuthenticated`, `getInputValue`, `getConfiguredModelValue`, `apiRequest`, `toggleManualModelInput`, `addLog`.
- Called by: `frontend/index.html` model fetch button and `bootstrap.loadCurrentUserState`.
- Notes: The frontend now falls back to `name`, `display_name`, or `id` when the backend model list omits a human-readable label.

#### `actions.createTasksInBatch`

- Signature: `createTasksInBatch({ namePrefix, type, workflowKind, target, systemPrompt, taskMode, executionMode, learningConfig, swarmSubagentConfig, files, skills, selectedMcp })`
- Parameters:
  - `namePrefix`: Default prefix for generated task names.
  - `type`: Task type shared by batch entries.
  - `workflowKind`: Backend workflow label, usually `solve` or `learn`.
  - `target`: Fallback target for entries without explicit target.
  - `systemPrompt`: Prompt override shared by entries.
  - `taskMode`: Agent orchestration mode.
  - `executionMode`: `single` or `swarm`.
  - `learningConfig`: Normalized learning workflow settings.
  - `swarmSubagentConfig`: Normalized swarm subagent settings.
  - `files`: Uploaded file records available for assignment.
  - `skills`: Selected skill names.
  - `selectedMcp`: Legacy parameter; currently unused by the public task API.
- Returns: Promise resolving to batch create result metadata.
- Side effects: Shows alerts/logs and uploads multipart batch payload.
- Calls: `parseBatchTaskDefinitions`, `normalizeBatchTaskAssignments`, `getBatchAssignedFiles`, `createBatchTaskRequest`, `addLog`.
- Called by: `onCreateTaskClick`.

#### `actions.onEditTaskClick`

- Signature: `onEditTaskClick()`
- Parameters: None; reads edit-task form controls from DOM.
- Returns: Promise resolving after update attempt.
- Side effects: Disables save button, sends PUT request, updates local task snapshot including external hotplug tool names, closes modal, refreshes list.
- Calls: `getInputValue`, `getLearningConfig`, `getSwarmSubagentConfig`, `getSelectedSkills`, `getSelectedValues`, `apiRequest`, `applyTaskUpdateLocally`, `closeEditTaskModal`, `refreshTasks`, `addLog`.
- Called by: `frontend/index.html` edit modal save button.

### `frontend/js/tasks.js`

- Responsibility: Render task cards, task detail modals, logs, output pages, thinking graphs, action graphs, swarm run details, Markdown, refresh timers, and local task snapshot updates.
- Side effects: Mutates task-list/detail DOM, downloads text exports, manages refresh intervals, tracks active modal state and graph interaction state.
- Important workflow groups:
  - List refresh: `fetchLatestTasksSnapshot`, `refreshTasks`, `refreshTasksWithButton`, `queueOrRenderTasks`, `renderTasks`.
  - Detail modal: `openTaskDetailModal`, `renderTaskDetailModalForTask`, `buildTaskDetailData`, `renderTaskDetails`, `renderTaskDetailModal`, `normalizeTaskTokenUsage`, `renderTaskTokenUsagePage`.
  - Log panels: `openLogPanelModal`, `renderLogPanelContent`, `refreshOpenLogPanelModal`.
  - Thinking graph state: `normalizeTaskThinkingGraph`, `resolveTaskThinkingGraphPage`, `setTaskThinkingGraphPage`, `resolveTaskThinkingGraphZoom`, `setTaskThinkingGraphPan`, `openThinkingGraphModal`.
  - Thinking graph rendering: `buildThinkingGraphVisualModel`, `renderThinkingGraphVisualCompact`, `renderThinkingGraphVisual`, `renderThinkingGraphVisualNodeDetail`.
  - Action graph rendering: `normalizeTaskActionRuntime`, `getActionGraphStageInfo`, `buildTaskActionGraphData`, `renderTaskActionGraphNode`, `renderTaskActionGraph`.
  - Exports: `buildTaskThinkingResultMarkdown`, `exportTaskThinkingResult`, `buildTaskVerboseText`, `exportTaskVerboseLogs`, `exportActiveThinkingGraphResult`.
  - Markdown: `renderMarkdown`, `renderInlineMarkdown`, `isMarkdownTableCandidate`, `splitMarkdownTableRow`, `escapeHtml`.
- Called by: `bootstrap.js`, `actions.js`, inline task/detail buttons, and refresh timer callbacks.

#### `tasks.refreshTasks`

- Signature: `refreshTasks()`
- Parameters: None.
- Returns: Promise resolving after task snapshot fetch and render/queue.
- Side effects: Updates `latestTaskPayload`, task stats, and task grid unless refresh is paused.
- Calls: `fetchLatestTasksSnapshot`, `queueOrRenderTasks`.
- Called by: `bootstrap.loadCurrentUserState`, `actions.onCreateTaskClick`, `actions.onEditTaskClick`, `startTaskRefresh`.

#### `tasks.startTaskRefresh`

- Signature: `startTaskRefresh()`
- Parameters: None.
- Returns: `undefined`.
- Side effects: Clears any existing interval and starts a 2-second polling loop that calls `refreshTasks()`.
- Calls: `stopTaskRefresh`, `setInterval`, `refreshTasks`.
- Called by: `bootstrap.js`, auth success paths, and startup logic.
- Notes: Because task updates are polled rather than pushed, the UI only reflects backend status changes after the next refresh tick or after an explicit action-triggered refresh.

#### `tasks.renderTasks`

- Signature: `renderTasks(tasks)`
- Parameters:
  - `tasks`: Array of backend task objects.
- Returns: `undefined`.
- Side effects: Replaces task grid HTML and updates rendered snapshot tracking.
- Calls: `sortTasks`, `buildTaskDetailData`, `renderTaskCardSummaryBlocks`, `renderTaskActionButtons`, `escapeHtml`.
- Called by: `queueOrRenderTasks`, `onTaskSortChange`, `toggleTaskSortDirection`, empty/auth reset paths.

#### `tasks.renderTaskCardSummaryBlocks`

- Signature: `renderTaskCardSummaryBlocks(task, detailData, display = {})`
- Parameters:
  - `task`: Backend task snapshot used to derive current status, target, execution mode, and progress.
  - `detailData`: Derived task detail data produced by `buildTaskDetailData`.
  - `display`: Precomputed card display values, currently file and target labels.
- Returns: HTML string containing object, latest progress, and execution summary blocks.
- Side effects: None.
- Calls: `isLearningWorkflowTask`, `escapeHtml`.
- Called by: `renderTasks`.

#### `tasks.buildTaskDetailData`

- Signature: `buildTaskDetailData(task)`
- Parameters:
  - `task`: Backend task object.
- Returns: Derived detail object containing logs, output collections, workflow artifacts, thinking graph, swarm runs, token usage, normalized progress, and display labels.
- Side effects: None expected; reads task shape and artifacts.
- Calls: `collectFormalOutputs`, `normalizeTaskProgressValue`, `formatTaskFilesLabel`, `formatTaskSkillsHtml`, `normalizeTaskThinkingGraph`, `normalizeTaskSwarmRuns`, `normalizeTaskAutonomousWorkflow`, `normalizeTaskTokenUsage`, `resolveTaskFocus`, `normalizeTaskActionRuntime`, `getTaskTypeLabel`, `getTaskEffectiveSolverEngine`.
- Called by: `renderTasks`, `renderTaskDetailModalForTask`, `renderLogPanelContent`, export helpers.
- Notes: This code still assumes a nested `task.artifacts` payload for workflow state, while the backend task snapshot currently returns a flatter structure (`pendingNewInput`, `workspace`, `result`, `error`, etc.) directly on the task object. Those fields are therefore only partially populated unless the frontend maps them.
- Notes: The visible `Agent Verbose` section is derived from `task.logs` via `splitEngineeringLogs()`; the frontend does not receive a separate backend verbose stream.
- Notes: After the backend now mirrors agent stdout/stderr into task logs, this section can show actual live agent trace lines on the next polling refresh.

#### `tasks.normalizeTaskTokenUsage`

- Signature: `normalizeTaskTokenUsage(rawValue)`
- Parameters:
  - `rawValue`: Backend `task.artifacts.token_usage` payload.
- Returns: Stable token usage model with `totals`, `byModel`, `byBackend`, `calls`, `callCount`, `startedAt`, and `updatedAt`.
- Side effects: None.
- Calls: `normalizeFiniteNumber`, `Object.entries`, `Array.map`, `Array.sort`.
- Called by: `buildTaskDetailData`.
- Notes: Accepts both `input_tokens/output_tokens` and `prompt_tokens/completion_tokens` aliases, preserves raw per-call usage for inspection, and derives `cacheHitRate` from backend data or cached/input tokens when the backend omits it.

#### `tasks.renderTaskTokenUsagePage`

- Signature: `renderTaskTokenUsagePage(task, tokenUsage)`
- Parameters:
  - `task`: Backend task snapshot used for tab context.
  - `tokenUsage`: Normalized token usage model.
- Returns: HTML string for the Token 用量 tab.
- Side effects: None while building the string; generated `<details>` elements expand/collapse in the browser.
- Calls: `formatTokenCount`, `renderThinkingGraphMetric`, `renderTaskTokenUsageGroup`, `escapeHtml`, `formatDateTime`.
- Called by: `renderTaskDetailModal`.

#### `tasks.syncLogEntries`

- Signature: `syncLogEntries(container, newLogs, emptyText = '暂无日志')`
- Parameters:
  - `container`: Log list DOM container inside the task detail or log-panel modal.
  - `newLogs`: Latest tool or verbose log array derived from the task snapshot.
  - `emptyText`: Empty-state label rendered when no logs remain.
- Returns: None.
- Side effects: Mutates the container DOM to append new entries, replace stale entries after retry/reset shrinkage, or render the empty state when logs are cleared.
- Calls: `escapeHtml`, `document.createElement`.
- Called by: `updateProgressPage`, `refreshOpenLogPanelModal`.

#### `tasks.normalizeTaskProgressValue`

- Signature: `normalizeTaskProgressValue(value)`
- Parameters:
  - `value`: Raw progress field from a backend task snapshot.
- Returns: Integer percentage clamped between `0` and `100`.
- Side effects: None.
- Calls: `Number`, `Math.max`, `Math.min`, `Math.round`.
- Called by: `buildTaskDetailData`.

#### `tasks.formatTaskFilesLabel`

- Signature: `formatTaskFilesLabel(files)`
- Parameters:
  - `files`: Array of backend file records attached to the task.
- Returns: Unique comma-separated file names or `无`.
- Side effects: None.
- Calls: `Set`.
- Called by: `buildTaskDetailData`.

#### `tasks.formatTaskSkillsHtml`

- Signature: `formatTaskSkillsHtml(skills)`
- Parameters:
  - `skills`: Array of skill identifiers attached to the task.
- Returns: Sanitized skill-chip HTML or a muted default label.
- Side effects: None.
- Calls: `escapeHtml`, `Set`.
- Called by: `buildTaskDetailData`.

#### `tasks.getTaskStatusKey`

- Signature: `getTaskStatusKey(task)`
- Parameters:
  - `task`: Backend task snapshot with a lifecycle `status`.
- Returns: UI status key: `idle`, `running`, `done`, `error`, or `canceled`.
- Side effects: None.
- Calls: String normalization.
- Called by: `renderTasks`, `updateTaskStats`, `updateProgressPage`, `renderTaskDetailModal`, `renderTaskActionButtons`.
- Notes: Maps backend `pending/completed/failed/stopped` to legacy frontend `idle/done/error/canceled` so action buttons render correctly.

#### `tasks.normalizeTaskThinkingGraph`

- Signature: `normalizeTaskThinkingGraph(rawValue, artifacts = {})`
- Parameters:
  - `rawValue`: Thinking graph value from task artifacts or backend fields.
  - `artifacts`: Full artifact object used as fallback source.
- Returns: Normalized graph object with hypotheses, evidence, branches, executions, orchestration, and stage metadata.
- Side effects: None.
- Calls: Data normalization helpers local to `tasks.js`.
- Called by: `buildTaskDetailData`.

#### `tasks.renderThinkingGraphVisual`

- Signature: `renderThinkingGraphVisual(thinkingGraph, options = {})`
- Parameters:
  - `thinkingGraph`: Normalized graph model.
  - `options`: Render options such as compact/full mode and task id.
- Returns: SVG/HTML string for the thinking graph visualization.
- Side effects: None while building the string; event handlers embedded in generated markup mutate selection/pan state when used.
- Calls: `buildThinkingGraphVisualModel`, `renderThinkingGraphVisualCompact`, `getThinkingGraphNodeVisual`, `getThinkingGraphEdgeVisual`, `wrapThinkingGraphLabel`, `formatThinkingGraphConfidence`.
- Called by: `renderTaskDetails`, `renderThinkingGraphModalForTask`.

### `frontend/js/cockpit.js`

- Responsibility: Manage the background-job cockpit and knowledge review modal.
- Side effects: Performs API requests, mutates cockpit/knowledge caches, updates modal DOM, sends input to background jobs, approves or rejects knowledge reviews.
- Key callees: `apiRequest`, `addLog`, `escapeHtml`, `renderKnowledgeMarkdown`.
- Called by: `index.html` buttons and `switchPage`.

#### `cockpit.startCockpitJob`

- Signature: `startCockpitJob()`
- Parameters: None; reads command, name, and task context from DOM.
- Returns: Promise resolving after the job is started and detail is loaded.
- Side effects: Sends `POST /api/background-jobs`, clears command input, refreshes job list, opens job detail.
- Calls: `apiRequest`, `addLog`, `refreshCockpitJobs`, `loadCockpitJobDetail`.
- Called by: Cockpit modal start button.

#### `cockpit.refreshKnowledgeList`

- Signature: `refreshKnowledgeList()`
- Parameters: None; reads `activeKnowledgeTab`.
- Returns: Promise resolving after knowledge list rendering.
- Side effects: Updates `knowledgeItems`, renders list, reloads active item detail if selected.
- Calls: `apiRequest`, `renderKnowledgeList`, `loadKnowledgeDetail`.
- Called by: `openKnowledgeModal`, `switchKnowledgeTab`, approve/reject refresh paths.

### `frontend/js/bootstrap.js`

- Responsibility: Initialize theme, auth/config state, skills, task snapshots, refresh timers, and global error logging when the DOM is ready.
- Side effects: Mutates config controls, starts task refresh interval, attaches pointer/drag/blur listeners, registers global error handler.
- Key callees: `initTheme`, `bootstrapAuthState`, `loadCurrentUserState`, `loadSkills`, `refreshTasks`, `startTaskRefresh`, `pauseTaskRefresh`, `resumeTaskRefresh`.

#### `bootstrap.loadCurrentUserState`

- Signature: `loadCurrentUserState({ forceRefreshTasks = false } = {})`
- Parameters:
  - `forceRefreshTasks`: Whether to fetch/render tasks after loading or resetting config.
- Returns: Promise resolving when config/model/task hydration is finished.
- Side effects: Reads config from `/api/config`, populates config inputs, fetches model list when usable, updates fallback state, optionally refreshes tasks.
- Calls: `apiRequest`, `updateUserContextUi`, `onConnectorTypeChange`, `hasUsableApiConfig`, `fetchModels`, `setConfiguredModelValue`, `getUserStorageKey`, `refreshTasks`, `renderTasks`, `updateTaskStats`, `addLog`.
- Called by: `DOMContentLoaded` bootstrap and `submitAuth`.

### `frontend/js/tools.js`

- Responsibility: Show available agent tools, categories, hotplug tool status, upload Python scripts, and manage dynamic tool definitions.
- Side effects: Performs direct `fetch` requests with auth headers, mutates caches, injects modal DOM when missing, reads uploaded script files, updates toast/result UI.
- Key functions: `showToast`, `fetchTools`, `fetchToolCategories`, `fetchToolDetail`, `fetchHotplugTools`, `addHotplugTool`, `removeHotplugTool`, `updateToolCode`, `reloadAllHotplugTools`, `checkToolHash`, `fetchHotplugStatus`, `refreshToolsCache`, `openToolsModal`, `renderToolsList`, `openHotplugManager`, `extractPythonDoc`, `handleScriptFileSelect`, `submitScriptUpload`, `renderHotplugList`.
- Calls: `applyAuthHeaders`, `openAuthModal`, `showToast`, backend `/api/tools/*` endpoints.
- Called by: Optional tool manager UI, if its script and modal entry points are loaded.

### `frontend/js/mcp.js`

- Responsibility: Manage local MCP server configurations in `localStorage` and render local plus hosted MCP server lists.
- Side effects: Reads/writes `localStorage`, performs hosted MCP API requests, mutates MCP modal DOM, opens/closes MCP forms.
- Key functions: `getMCPServers`, `saveMCPServers`, `addMCPServer`, `updateMCPServer`, `deleteMCPServer`, `toggleMCPServer`, `openMCPModal`, `renderMCPServerList`, `onMCPServerToggle`, `onMCPServerDelete`, `onMCPServerEdit`, `showMCPAddForm`, `hideMCPAddForm`, `onMCPServerSave`, `loadMCPSampleConfig`, `exportMCPConfig`, `importMCPConfig`.
- Calls: `addLog`, hosted MCP endpoints under `/api/user-mcp`.
- Called by: `actions.onMcpClick` and optional MCP modal buttons when `mcp.js` is loaded.

### `frontend/js/user_mcp.js`

- Responsibility: Manage user-hosted MCP server records and temporary MCP script generation/download flows.
- Side effects: Performs `/api/user-mcp` and `/api/temp-mcp` requests, downloads generated Python scripts, mutates tool-field form DOM.
- Key functions: `openUserMCPModal`, `renderUserMCPServerList`, `renderTempMCPServerList`, `downloadUserMCPScript`, `downloadDefaultMCPScript`, `openCreateTempMCPModal`, `addToolField`, `addPresetTool`, `submitCreateTempMCP`, `refreshUserMCPServerStatus`, `deleteUserMCPServer`, `switchUserMCPTab`.
- Calls: `formatTime`, `escapeHtml`, backend user/temp MCP endpoints.
- Called by: Optional hosted MCP modal controls when `user_mcp.js` is loaded.

### `frontend/js/plugins.js`

- Responsibility: Render plugin state, plugin commands, and plugin enable/disable/reload actions.
- Side effects: Performs `/api/plugins/*` requests, mutates plugin modal DOM, shows toast messages.
- Key functions: `openPluginModal`, `closePluginModal`, `loadPluginList`, `loadPluginCommands`, `renderPluginList`, `renderPluginCommands`, `enablePlugin`, `disablePlugin`, `reloadPlugin`, `switchPluginTab`, `getStateLabel`, `showToast`.
- Calls: Plugin backend endpoints and local `escapeHtml`.
- Called by: Optional plugin modal controls when `plugins.js` is loaded.

### `frontend/js/agent.js`

- Responsibility: Legacy monolithic frontend logic that duplicates auth/API/task/modal/Markdown behavior now split across the loaded modules.
- Side effects: If loaded together with the split modules, it can redefine global functions such as `apiRequest`, `toggleTheme`, `openNewTaskModal`, `onCreateTaskClick`, `renderTasks`, and `addLog`.
- Current status: Not included by `frontend/index.html`; treat as legacy reference or remove only after checking external pages.
- Calls/Called by: None in the current `index.html` load graph.

## Classes And Inheritance

No JavaScript classes are declared in the frontend files inspected here. There is no class inheritance or subclass relationship in the current frontend code. Behavior is organized through global functions, shared objects, arrays, maps, sets, and DOM event handlers.

## Call Graph

| Caller | Calls | Notes |
| --- | --- | --- |
| `DOMContentLoaded` in `bootstrap.js` | `initTheme`, `addLog`, `updateUserContextUi`, `onTaskTypeChange`, `onTaskModeChange`, `onEditTaskModeChange`, `onTaskExecutionModeChange`, `onEditTaskExecutionModeChange`, `bootstrapAuthState`, `loadCurrentUserState`, `loadSkills`, `refreshTasks`, `renderTasks`, `updateTaskStats`, `startTaskRefresh` | Main startup path. |
| `submitAuth` | `apiRequest`, `setAuthenticatedUser`, `closeAuthModal`, `addLog`, `loadCurrentUserState`, `startTaskRefresh` | Login/register path after user submits credentials. |
| `loadCurrentUserState` | `apiRequest`, `updateUserContextUi`, `onConnectorTypeChange`, `hasUsableApiConfig`, `fetchModels`, `setConfiguredModelValue`, `refreshTasks` | Loads user config and optional task list. |
| `onSaveConfigClick` | `ensureAuthenticated`, `getConfiguredModelValue`, `isKimiCodingApiBase`, `toggleManualModelInput`, `apiRequest`, `updateUserContextUi`, `closeConfigModal`, `addLog` | Saves LLM config. |
| `openNewTaskModal` | `loadSkills`, `populateSkillsSelect`, `applyLearningConfig`, `applySwarmSubagentConfig`, `syncTaskWorkflowControls`, `setTaskCreateMode`, `refreshBatchTaskPlanner` | Opens create-task modal. |
| `onTaskTypeChange` | `getInputValue`, `syncTaskWorkflowControls`, `refreshBatchTaskPlanner` | Adapts create-task form to selected type. |
| `onCreateTaskClick` | `ensureAuthenticated`, `getInputValue`, `getLearningConfig`, `getSwarmSubagentConfig`, `getSelectedSkills`, `createTasksInBatch`, `createSingleTaskRequest`, `closeModal`, `refreshTasks`, `addLog` | Creates one or many tasks. |
| `createSingleTaskRequest` | `buildTaskMultipartFormData`, `serializeTaskFile`, `multipartApiRequest` | Uploads single task payload and files. |
| `createBatchTaskRequest` | `buildTaskMultipartFormData`, `collectUniqueTaskFiles`, `serializeTaskFile`, `multipartApiRequest` | Uploads batch payload and de-duplicated files. |
| `onEditTaskClick` | `getInputValue`, `getLearningConfig`, `getSwarmSubagentConfig`, `getSelectedSkills`, `getSelectedValues`, `apiRequest`, `applyTaskUpdateLocally`, `closeEditTaskModal`, `refreshTasks`, `addLog` | Saves task edits, including external hotplug tool selections. |
| `onTaskStartById` | `apiRequest`, `applyTaskUpdateLocally`, `startTaskRefresh`, `addLog` | Starts a task without opening the config modal gate and logs backend reason codes on failure. |
| `onTaskContinueById` | `apiRequest`, `applyTaskUpdateLocally`, `startTaskRefresh`, `addLog` | Continues a task. |
| `onTaskRetryById` | `apiRequest`, `applyTaskUpdateLocally`, `startTaskRefresh`, `addLog` | Retries a task after confirmation. |
| `onTaskStopById` | `apiRequest`, `applyTaskUpdateLocally`, `addLog` | Stops a running task. |
| `refreshTasksWithButton` | `withRefreshButtonState`, `fetchLatestTasksSnapshot`, `queueOrRenderTasks`, `refreshOpenTaskDetailModal`, `refreshOpenLogPanelModal`, `refreshOpenThinkingGraphModal`, `refreshOpenSwarmRunModal` | Full manual refresh path. |
| `renderTaskDetailModalForTask` | `buildTaskDetailData`, `renderTaskDetailModal`, `renderTaskDetails`, `restoreTaskDetailScrollState` | Detail modal render path. |
| `buildTaskDetailData` | `collectFormalOutputs`, `normalizeTaskThinkingGraph`, `normalizeTaskSwarmRuns`, `normalizeTaskAutonomousWorkflow`, `resolveTaskFocus`, `normalizeTaskActionRuntime` | Converts raw task payload into display model. |
| `renderTaskActionGraph` | `buildTaskActionGraphData`, `renderTaskActionGraphNode`, `renderMarkdown`, `escapeHtml` | Action graph render path. |
| `renderThinkingGraphVisual` | `buildThinkingGraphVisualModel`, `renderThinkingGraphVisualCompact`, `getThinkingGraphNodeVisual`, `getThinkingGraphEdgeVisual`, `wrapThinkingGraphLabel` | Thinking graph SVG render path. |
| `openCockpitModal` | `ensureAuthenticated`, `refreshCockpitJobs`, `refreshCockpitTaskOptions` | Opens background-job cockpit. |
| `startCockpitJob` | `apiRequest`, `addLog`, `refreshCockpitJobs`, `loadCockpitJobDetail` | Starts an interactive shell/background command. |
| `openKnowledgeModal` | `ensureAuthenticated`, `refreshKnowledgeList` | Opens knowledge review modal. |
| `approveKnowledgeReview` / `rejectKnowledgeReview` | `apiRequest`, `addLog`, `refreshKnowledgeList`, `loadKnowledgeDetail` | Knowledge review mutation paths. |

## API Endpoints Used By Frontend

| Endpoint | Caller(s) | Purpose |
| --- | --- | --- |
| `POST /api/auth/register` | `submitAuth` | Register and login user. |
| `POST /api/auth/login` | `submitAuth` | Login user. |
| `GET /api/auth/me` | `bootstrapAuthState` | Validate local token and load user identity. |
| `GET /api/config` | `loadCurrentUserState` | Load active user's LLM config. |
| `POST /api/config` | `onSaveConfigClick` | Save active user's LLM config. |
| `POST /api/models` | `fetchModels` | Fetch model list from configured provider. |
| `GET /api/skills` | `loadSkills` | Load selectable skill metadata. |
| `GET /api/tasks` | `fetchLatestTasksSnapshot` | Load task snapshots. |
| `POST /api/tasks` | `createSingleTaskRequest` | Create one task with optional files. |
| `POST /api/tasks/batch` | `createBatchTaskRequest` | Create multiple tasks with optional shared files. |
| `PUT /api/tasks/{task_id}` | `onEditTaskClick` | Update task metadata/config, including external hotplug tool selection. |
| `DELETE /api/tasks/{task_id}` | `onTaskDeleteClick` | Delete a task. |
| `POST /api/tasks/{task_id}/start` | `onTaskStartById` | Start task execution directly and return a machine-readable error code on failure. |
| `POST /api/tasks/{task_id}/continue` | `onTaskContinueById` | Continue task execution. |
| `POST /api/tasks/{task_id}/retry` | `onTaskRetryById` | Retry task execution. |
| `POST /api/tasks/{task_id}/stop` | `onTaskStopById` | Stop task execution. |
| `POST /api/tasks/{task_id}/new-input` | `onTaskSaveNewInput` | Save pending user input for continuation. |
| `GET /api/background-jobs` | `refreshCockpitJobs` | List background jobs. |
| `POST /api/background-jobs` | `startCockpitJob` | Start a background job. |
| `GET /api/background-jobs/{job_id}` | `loadCockpitJobDetail` | Load job status and streams. |
| `POST /api/background-jobs/{job_id}/input` | `sendCockpitInput` | Send stdin to an interactive job. |
| `POST /api/background-jobs/{job_id}/stop` | `stopCockpitJob` | Stop or force-stop a job. |
| `GET /api/knowledge/reviews` | `refreshKnowledgeList` | List knowledge review records. |
| `GET /api/knowledge/reviews/{review_id}` | `loadKnowledgeDetail` | Load one knowledge review. |
| `POST /api/knowledge/reviews/{review_id}/approve` | `approveKnowledgeReview` | Approve a knowledge item. |
| `POST /api/knowledge/reviews/{review_id}/reject` | `rejectKnowledgeReview` | Reject a knowledge item. |
| `/api/tools/*` | `tools.js` | Tool inventory and hotplug tool management. |
| `/api/user-mcp/*` | `mcp.js`, `user_mcp.js` | User-hosted MCP records and script downloads. |
| `/api/temp-mcp/*` | `user_mcp.js` | Temporary MCP script creation/download. |
| `/api/plugins/*` | `plugins.js` | Plugin list, commands, enable/disable/reload. |

## Notes For Future Edits

- Keep `core.js` loaded before modules that call `API_BASE`, auth helpers, or request helpers.
- Keep `tasks.js` loaded before code paths that render or locally patch task snapshots after initial startup. The current `DOMContentLoaded` callback runs after all deferred scripts load, so this is safe.
- Avoid reintroducing create-task fields that are not present in `index.html`; use `getInputValue`, `setInputValue`, or optional DOM reads for controls that can be absent.
- Keep the script cache-busting version in `index.html` fresh when frontend runtime behavior changes and the browser might reuse old assets.
- Do not load `agent.js` beside the split modules unless duplicate global functions are reconciled first.
- The public task API no longer exposes solver selection; frontend create/edit flows should not read or send solver fields.
