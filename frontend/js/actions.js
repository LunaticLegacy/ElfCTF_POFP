// 🎮 控制面板按钮事件
// ═══════════════════════════════════════════════════════════════

async function onStartClick() {
  if (!ensureAuthenticated()) return;
  
  if (!hasUsableApiConfig()) {
    addLog('err', '❌ 当前用户没有可用的 API 配置，请先保存用户 API，或配置服务器兜底 API');
    openConfigModal();
    return;
  }
  
  addLog('info', '▶ 请通过任务管理创建并启动任务');
}

function onClearLogClick() {
  addLog('sys', '日志已清空');
}

function onMcpClick() {
  openMCPModal();
}

function onExportLogClick() {
  addLog('warn', '⚠️ 日志导出请通过任务详情面板操作');
}

async function fetchModels() {
  if (!ensureAuthenticated()) return;
  const apiKey = getInputValue('apiKey').trim();
  const apiBase = getInputValue('apiBase').trim();
  const connectorType = document.getElementById('connectorType')?.value || 'litellm';
  const fetchBtn = document.getElementById('fetchModelsBtn');
  const modelMeta = document.getElementById('modelMeta');
  const currentModel = getConfiguredModelValue();
  
  if (!apiKey && !currentUserConfigState.has_server_fallback) {
    addLog('warn', '⚠️ 请先输入 API 密钥，或为服务器配置兜底 API');
    if (modelMeta) modelMeta.textContent = '缺少可用的 API 配置，无法读取模型列表';
    return;
  }
  
  addLog('info', `正在获取模型列表 (${connectorType})...`);
  if (fetchBtn) {
    fetchBtn.disabled = true;
    fetchBtn.textContent = '读取中...';
  }
  if (modelMeta) modelMeta.textContent = '正在同步模型列表...';
  
  const result = await apiRequest(`${API_BASE}/models`, {
    method: 'POST',
    body: JSON.stringify({ api_key: apiKey, api_base: apiBase, connector_type: connectorType })
  });
  
  if (result.success && result.data) {
    const modelSelect = document.getElementById('modelSelect');
    modelSelect.innerHTML = '<option value="">选择模型</option>';
    
    result.data.forEach(model => {
      const option = document.createElement('option');
      const modelId = String(model?.id || model?.name || model?.display_name || '').trim();
      const modelLabel = String(model?.name || model?.display_name || model?.id || modelId || '').trim();
      option.value = modelId || modelLabel;
      option.textContent = modelLabel || modelId || '未命名模型';
      modelSelect.appendChild(option);
    });

    // 获取成功后默认回到下拉选择模式，避免上一次手动输入状态把列表藏住。
    toggleManualModelInput(false, false);

    if (currentModel && Array.from(modelSelect.options).some(option => option.value === currentModel)) {
      modelSelect.value = currentModel;
    }

    if (modelMeta) modelMeta.textContent = `已载入 ${result.data.length} 个模型`;
    addLog('ok', `✓ 获取到 ${result.data.length} 个模型`);
  } else {
    if (modelMeta) modelMeta.textContent = result.message || '模型列表读取失败';
    addLog('err', `获取模型失败: ${result.message}`);
  }

  if (fetchBtn) {
    fetchBtn.disabled = false;
    fetchBtn.textContent = '获取模型';
  }
}

function isKimiCodingApiBase(apiBase) {
  try {
    const value = String(apiBase || '').trim();
    if (!value) return false;
    const url = new URL(value);
    return url.hostname === 'api.kimi.com' && url.pathname.startsWith('/coding');
  } catch (_) {
    return false;
  }
}

/**
 * Persist the current runtime configuration edited in the config modal.
 *
 * @param {HTMLElement | null | undefined} triggerBtn - Button that triggered the save action.
 * @returns {Promise<void>} Resolves after the save request and UI updates finish.
 */
async function onSaveConfigClick(triggerBtn) {
  // Abort early when the user is unauthenticated or the trigger button is unavailable.
  if (!ensureAuthenticated()) return;
  const btn = triggerBtn || event?.target;
  if (!btn) return;
  const originalText = btn.textContent;
  
  // Read the current form state so validation and persistence use one consistent snapshot.
  const apiKey = getInputValue('apiKey');
  const apiBase = getInputValue('apiBase');
  const model = getConfiguredModelValue();
  const connectorType = document.getElementById('connectorType')?.value || 'litellm';
  const temperatureRaw = getInputValue('temperatureInput');
  const maxTokensRaw = getInputValue('maxTokensInput');
  const timeout = Number(getInputValue('timeoutInput', '60'));
  const maxRounds = Number(getInputValue('maxRoundsInput', '50'));
  const maxContextChars = Number(getInputValue('maxContextCharsInput', '14000'));
  const showTerminalOutput = Boolean(document.getElementById('showTerminalOutputToggle')?.checked);
  const gzctfUsername = getInputValue('gzctfUsername').trim();
  const gzctfPassword = getInputValue('gzctfPassword');
  const gzctfGameUrl = getInputValue('gzctfGameUrl').trim();
  const temperature = temperatureRaw.trim() === '' ? null : Number(temperatureRaw);
  const maxTokens = maxTokensRaw.trim() === '' ? null : Number(maxTokensRaw);

  // Reject malformed numeric fields before sending a partially invalid config to the backend.
  if (
    [temperature, maxTokens, timeout, maxRounds, maxContextChars].some(value => value !== null && Number.isNaN(value))
    || Number.isNaN(timeout) || Number.isNaN(maxRounds) || Number.isNaN(maxContextChars)
  ) {
    addLog('err', '⚙️ 配置保存失败: 存在无效数字');
    return;
  }

  // Enforce model-related prerequisites that the backend depends on for a usable config.
  if (!model) {
    addLog('err', '⚙️ 配置保存失败: 请选择模型或手动输入模型');
    return;
  }

  if (isKimiCodingApiBase(apiBase) && model.trim().toLowerCase().startsWith('gpt-')) {
    toggleManualModelInput(true, false);
    addLog('err', '⚙️ 配置保存失败: Kimi Code API 地址不能搭配 GPT 模型，请手动输入实际的 Kimi 模型名');
    return;
  }

  const result = await apiRequest(`${API_BASE}/config`, {
    method: 'POST',
    body: JSON.stringify({
      api_key: apiKey,
      api_base: apiBase,
      model,
      connector_type: connectorType,
      temperature,
      max_tokens: maxTokens,
      timeout,
      max_rounds: maxRounds,
      max_context_chars: maxContextChars,
      show_terminal_output: showTerminalOutput,
      gzctf_username: gzctfUsername,
      gzctf_password: gzctfPassword,
      gzctf_game_url: gzctfGameUrl
    })
  });
  
  // Persist successful config state into local UI caches and close the modal.
  if (result.success) {
    localStorage.setItem(getUserStorageKey('ctf_api_key'), apiKey);
    localStorage.setItem(getUserStorageKey('ctf_api_base'), apiBase);
    localStorage.setItem(getUserStorageKey('ctf_connector_type'), connectorType);
    localStorage.setItem(getUserStorageKey('ctf_show_terminal_output'), String(showTerminalOutput));
    currentUserConfigState = {
      ...currentUserConfigState,
      has_server_fallback: Boolean(result.data?.has_server_fallback),
      using_server_fallback: Boolean(result.data?.using_server_fallback),
      effective_model: result.data?.effective_model || model || currentUserConfigState.effective_model,
      effective_api_base: result.data?.effective_api_base || apiBase || currentUserConfigState.effective_api_base,
      effective_connector_type: result.data?.connector_type || connectorType || 'litellm',
      gzctf_status_message: result.data?.gzctf_status_message || '',
      gzctf_has_cookie: Boolean(result.data?.gzctf_has_cookie),
      gzctf_team: result.data?.gzctf_team || null,
    };
    updateUserContextUi();
    updateGzctfStatusUi(result.data || {});
    btn.textContent = '✓ 已保存';
    btn.style.background = 'var(--dot)';
    
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = '';
    }, 1500);
    
    addLog('ok', '⚙️ 配置已成功保存');
    closeConfigModal();
  } else {
    // Surface backend validation failures without mutating the local cached config state.
    addLog('err', `⚙️ 配置保存失败: ${result.message}`);
  }
}

async function onFetchGzctfTeamClick(triggerBtn) {
  if (!ensureAuthenticated()) return;
  const btn = triggerBtn || event?.target;
  if (!btn) return;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '获取中...';

  try {
    const result = await apiRequest(`${API_BASE}/config/gzctf/team`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (!result.success) {
      addLog('err', `GZCTF 队伍获取失败: ${result.message}`);
      return;
    }
    currentUserConfigState = {
      ...currentUserConfigState,
      gzctf_status_message: result.data?.gzctf_status_message || '',
      gzctf_has_cookie: Boolean(result.data?.gzctf_has_cookie),
      gzctf_team: result.data?.gzctf_team || null,
    };
    updateGzctfStatusUi(result.data || {});
    addLog('ok', '已更新 GZCTF 队伍信息');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// ═══════════════════════════════════════════════════════════════
// 📋 任务卡片管理
// ═══════════════════════════════════════════════════════════════

/**
 * 创建新任务
 */
async function onCreateTaskClick() {
  if (!ensureAuthenticated()) return;
  const name = getInputValue('taskName').trim();
  const type = getInputValue('taskType', 'RE');
  const workflowKind = type === 'KNOWLEDGE' ? 'learn' : 'solve';
  const target = getInputValue('taskTarget').trim();
  const gzctfChallengeId = getInputValue('taskGzctfChallengeId').trim();
  const systemPrompt = getInputValue('taskSystemPrompt').trim();
  const taskMode = getInputValue('taskMode', 'classic');
  const executionMode = getInputValue('taskExecutionMode', 'single');
  const contextMode = getInputValue('taskContextMode', 'linear');
  const learningConfig = getLearningConfig('task');
  const swarmSubagentConfig = getSwarmSubagentConfig('task');
  const skills = getSelectedSkills('taskSkills');
  const externalToolNames = getSelectedValues('taskExternalTools');
  const submitBtn = document.getElementById('createTaskSubmitBtn');
  const originalButtonText = submitBtn?.textContent || '创建任务';

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = taskCreateMode === 'batch' ? '批量创建中...' : '创建中...';
  }
  setTaskCreateProgress(5, '准备提交任务');

  try {
    if (taskCreateMode === 'batch') {
      const result = await createTasksInBatch({
        namePrefix: name,
        type,
        workflowKind,
        target,
        gzctfChallengeId,
        systemPrompt,
        taskMode,
        executionMode,
        contextMode,
        learningConfig,
        swarmSubagentConfig,
        files: uploadedTaskFiles,
        skills,
        externalToolNames,
      });

      if (result.createdCount > 0) {
        closeModal();
        await refreshTasks();
      }
      return;
    }

    if (!name) {
      alert('请输入任务名称');
      return;
    }

    const result = await createSingleTaskRequest({
      name,
      type,
      workflowKind,
      target,
      gzctfChallengeId,
      files: uploadedTaskFiles,
      systemPrompt,
      taskMode,
      executionMode,
      contextMode,
      learningMode: learningConfig.mode,
      learningSearchRounds: learningConfig.searchRounds,
      learningResultsPerQuery: learningConfig.resultsPerQuery,
      learningMaxSources: learningConfig.maxSources,
      learningMaxCharsPerSource: learningConfig.maxCharsPerSource,
      learningFocusKeywords: learningConfig.focusKeywords,
      learningExcludeKeywords: learningConfig.excludeKeywords,
      swarmSubagentAutoCount: swarmSubagentConfig.autoCount,
      swarmSubagentCountMin: swarmSubagentConfig.min,
      swarmSubagentCountMax: swarmSubagentConfig.max,
      swarmSubagentCountSuggested: swarmSubagentConfig.suggested,
      skills,
      externalToolNames,
    });

    if (result.success) {
      closeModal();
      await refreshTasks();
      addLog('ok', '✓ 任务已创建');
    } else {
      addLog('err', `任务创建失败: ${result.message}`);
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalButtonText;
    }
    if (document.getElementById('modalBg')?.classList.contains('show')) {
      resetTaskCreateProgress();
    }
  }
}

async function createSingleTaskRequest(payload) {
  const formData = buildTaskMultipartFormData(
    {
      ...payload,
      files: (payload.files || []).map(serializeTaskFile),
    },
    payload.files || [],
  );
  return multipartApiRequest(`${API_BASE}/tasks`, {
    formData,
    onProgress: updateTaskCreateRequestProgress,
  });
}

async function createBatchTaskRequest(payload) {
  const formData = buildTaskMultipartFormData(
    {
      ...payload,
      tasks: (payload.tasks || []).map(task => ({
        ...task,
        files: (task.files || []).map(serializeTaskFile),
      })),
    },
    collectUniqueTaskFiles(payload),
  );
  return multipartApiRequest(`${API_BASE}/tasks/batch`, {
    formData,
    onProgress: updateTaskCreateRequestProgress,
  });
}

function buildTaskMultipartFormData(payload, sourceFiles = []) {
  const formData = new FormData();
  formData.append('payload', JSON.stringify(payload));

  sourceFiles.forEach(file => {
    if (file?.file instanceof File && file.clientId) {
      formData.append(file.clientId, file.file, file.name);
    }
  });

  return formData;
}

function collectUniqueTaskFiles(payload) {
  const files = [];
  const seen = new Set();
  const pushFile = (file) => {
    if (!file?.clientId || seen.has(file.clientId)) return;
    seen.add(file.clientId);
    files.push(file);
  };

  if (Array.isArray(payload?.files)) {
    payload.files.forEach(pushFile);
  }
  if (Array.isArray(payload?.tasks)) {
    payload.tasks.forEach(task => {
      (task.files || []).forEach(pushFile);
    });
  }
  return files;
}

function serializeTaskFile(file) {
  return {
    clientId: file.clientId,
    name: file.name,
    size: file.size,
  };
}

function updateTaskCreateRequestProgress(progressEvent) {
  if (progressEvent.phase === 'uploading') {
    setTaskCreateProgress(progressEvent.percent, '正在上传文件');
    return;
  }
  if (progressEvent.phase === 'processing') {
    setTaskCreateProgress(progressEvent.percent, '服务器正在复制到工作空间');
    return;
  }
  setTaskCreateProgress(progressEvent.percent, '创建完成');
}

function parseBatchTaskDefinitions(rawValue, namePrefix, fallbackTarget) {
  return String(rawValue || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const segments = line.split(/\s*[|｜]\s*/);
      const rawName = (segments.shift() || '').trim();
      const lineTarget = segments.join(' | ').trim();
      const finalName = namePrefix ? `${namePrefix} ${rawName}` : rawName;
      return {
        name: finalName.trim(),
        target: lineTarget || fallbackTarget || ''
      };
    })
    .filter(item => item.name);
}

function buildBatchTaskAssignmentKey(taskDefinition, index) {
  return `${index}:${taskDefinition.name}|${taskDefinition.target || ''}`;
}

function normalizeBatchTaskAssignments(definitions) {
  const validFileKeys = new Set(uploadedTaskFiles.map(file => file.clientId));
  const nextAssignments = {};

  definitions.forEach((definition, index) => {
    const taskKey = buildBatchTaskAssignmentKey(definition, index);
    const currentKeys = Array.isArray(batchTaskFileAssignments[taskKey])
      ? batchTaskFileAssignments[taskKey]
      : [];

    nextAssignments[taskKey] = currentKeys.filter(fileKey => validFileKeys.has(fileKey));
  });

  batchTaskFileAssignments = nextAssignments;
  return nextAssignments;
}

function getBatchAssignedFiles(taskKey) {
  const selectedKeys = new Set(batchTaskFileAssignments[taskKey] || []);
  return uploadedTaskFiles.filter(file => selectedKeys.has(file.clientId));
}

function encodeBatchPlannerValue(value) {
  return encodeURIComponent(String(value));
}

function toggleBatchTaskFileByEncoded(encodedTaskKey, encodedFileKey) {
  toggleBatchTaskFile(decodeURIComponent(encodedTaskKey), decodeURIComponent(encodedFileKey));
}

function toggleBatchTaskFile(taskKey, fileKey) {
  const current = new Set(batchTaskFileAssignments[taskKey] || []);
  if (current.has(fileKey)) {
    current.delete(fileKey);
  } else {
    current.add(fileKey);
  }
  batchTaskFileAssignments[taskKey] = Array.from(current);
  refreshBatchTaskPlanner();
}

function setBatchTaskFiles(taskKey, fileKeys) {
  batchTaskFileAssignments[taskKey] = Array.from(new Set(fileKeys));
  refreshBatchTaskPlanner();
}

function setBatchTaskFilesByEncoded(encodedTaskKey, mode) {
  const taskKey = decodeURIComponent(encodedTaskKey);
  const allFileKeys = uploadedTaskFiles.map(file => file.clientId);
  setBatchTaskFiles(taskKey, mode === 'all' ? allFileKeys : []);
}

function applyFilesToAllBatchTasks() {
  const definitions = parseBatchTaskDefinitions(
    document.getElementById('batchTaskInput')?.value,
    document.getElementById('taskName')?.value.trim(),
    document.getElementById('taskTarget')?.value.trim(),
  );
  const allFileKeys = uploadedTaskFiles.map(file => file.clientId);
  normalizeBatchTaskAssignments(definitions);
  definitions.forEach((definition, index) => {
    batchTaskFileAssignments[buildBatchTaskAssignmentKey(definition, index)] = [...allFileKeys];
  });
  refreshBatchTaskPlanner();
}

function clearAllBatchTaskFiles() {
  const definitions = parseBatchTaskDefinitions(
    document.getElementById('batchTaskInput')?.value,
    document.getElementById('taskName')?.value.trim(),
    document.getElementById('taskTarget')?.value.trim(),
  );
  normalizeBatchTaskAssignments(definitions);
  definitions.forEach((definition, index) => {
    batchTaskFileAssignments[buildBatchTaskAssignmentKey(definition, index)] = [];
  });
  refreshBatchTaskPlanner();
}

function renderBatchTaskFileChips(taskKey) {
  if (uploadedTaskFiles.length === 0) {
    return '<div class="batch-task-empty">先上传文件，再分配到各个任务。</div>';
  }

  const selectedKeys = new Set(batchTaskFileAssignments[taskKey] || []);

  return uploadedTaskFiles.map(file => {
    const fileKey = file.clientId;
    const isSelected = selectedKeys.has(fileKey);
    return `
      <button
        class="batch-file-chip ${isSelected ? 'active' : ''}"
        type="button"
        onclick="toggleBatchTaskFileByEncoded('${encodeBatchPlannerValue(taskKey)}', '${encodeBatchPlannerValue(fileKey)}')"
      >
        <span class="batch-file-chip-name">${escapeHtml(file.name)}</span>
        <span class="batch-file-chip-meta">${(file.size / 1024).toFixed(1)} KB</span>
      </button>
    `;
  }).join('');
}

function refreshBatchTaskPlanner() {
  const planner = document.getElementById('batchTaskPlanner');
  const summary = document.getElementById('batchTaskSummary');
  const plannerGroup = document.getElementById('batchTaskPlannerGroup');

  if (!planner || !summary || !plannerGroup) {
    return;
  }

  if (taskCreateMode !== 'batch') {
    planner.innerHTML = '';
    summary.textContent = '切换到批量模式后，可在这里建立任务与文件的映射。';
    return;
  }

  const definitions = parseBatchTaskDefinitions(
    document.getElementById('batchTaskInput')?.value,
    document.getElementById('taskName')?.value.trim(),
    document.getElementById('taskTarget')?.value.trim(),
  );

  normalizeBatchTaskAssignments(definitions);

  if (definitions.length === 0) {
    planner.innerHTML = '<div class="batch-task-empty">先在上方每行填写一个任务。</div>';
    summary.textContent = '等待批量任务列表。';
    return;
  }

  const fullyAssignedCount = definitions.reduce((count, definition, index) => {
    const taskKey = buildBatchTaskAssignmentKey(definition, index);
    return count + (getBatchAssignedFiles(taskKey).length > 0 ? 1 : 0);
  }, 0);

  summary.textContent = `共 ${definitions.length} 个任务，文件池 ${uploadedTaskFiles.length} 个，已完成文件分配 ${fullyAssignedCount} 个。`;

  planner.innerHTML = definitions.map((definition, index) => {
    const taskKey = buildBatchTaskAssignmentKey(definition, index);
    const assignedFiles = getBatchAssignedFiles(taskKey);
    const targetLabel = definition.target || '未单独设置目标地址';

    return `
      <section class="batch-task-card">
        <div class="batch-task-card-head">
          <div>
            <div class="batch-task-card-title">${escapeHtml(definition.name)}</div>
            <div class="batch-task-card-meta">${escapeHtml(targetLabel)}</div>
          </div>
          <div class="batch-task-card-actions">
            <button class="mbtn mbtn-s batch-mini-btn" type="button" onclick="setBatchTaskFilesByEncoded('${encodeBatchPlannerValue(taskKey)}', 'all')">全部文件</button>
            <button class="mbtn mbtn-s batch-mini-btn" type="button" onclick="setBatchTaskFilesByEncoded('${encodeBatchPlannerValue(taskKey)}', 'clear')">清空</button>
          </div>
        </div>
        <div class="batch-task-card-status">
          已分配 ${assignedFiles.length} 个文件${assignedFiles.length ? `: ${escapeHtml(assignedFiles.map(file => file.name).join(', '))}` : ''}
        </div>
        <div class="batch-file-chip-grid">
          ${renderBatchTaskFileChips(taskKey)}
        </div>
      </section>
    `;
  }).join('');
}

async function createTasksInBatch({ namePrefix, type, workflowKind, target, systemPrompt, taskMode, executionMode, contextMode, learningConfig, swarmSubagentConfig, files, skills, selectedMcp, externalToolNames }) {
  const batchText = getInputValue('batchTaskInput');
  const definitions = parseBatchTaskDefinitions(batchText, namePrefix, target);

  if (definitions.length === 0) {
    alert('请至少填写一行批量任务');
    return { createdCount: 0, failedCount: 0 };
  }

  normalizeBatchTaskAssignments(definitions);
  const tasks = definitions.map((item, index) => {
    const taskKey = buildBatchTaskAssignmentKey(item, index);
    return {
      name: item.name,
      type,
      workflowKind,
      target: item.target,
      files: getBatchAssignedFiles(taskKey),
      systemPrompt,
      taskMode,
      executionMode,
      contextMode,
      learningMode: learningConfig?.mode,
      learningSearchRounds: learningConfig?.searchRounds,
      learningResultsPerQuery: learningConfig?.resultsPerQuery,
      learningMaxSources: learningConfig?.maxSources,
      learningMaxCharsPerSource: learningConfig?.maxCharsPerSource,
      learningFocusKeywords: learningConfig?.focusKeywords,
      learningExcludeKeywords: learningConfig?.excludeKeywords,
      skills,
      selectedMcp,
      externalToolNames,
      swarmSubagentAutoCount: Boolean(swarmSubagentConfig?.autoCount),
      swarmSubagentCountMin: Number(swarmSubagentConfig?.min),
      swarmSubagentCountMax: Number(swarmSubagentConfig?.max),
      swarmSubagentCountSuggested: Number(swarmSubagentConfig?.suggested),
    };
  });

  const missingFileAssignments = tasks.filter(task => task.files.length === 0);
  if (files.length > 0 && missingFileAssignments.length > 0) {
    addLog('warn', `⚠️ ${missingFileAssignments.length} 个任务还没有分配文件`);
  }

  const result = await createBatchTaskRequest({ tasks });
  const createdTasks = Array.isArray(result.data?.tasks) ? result.data.tasks : [];
  const errors = Array.isArray(result.data?.errors) ? result.data.errors : [];

  createdTasks.forEach(task => {
    addLog('ok', `✓ 已创建任务: ${task.name}`);
  });
  errors.forEach(error => {
    addLog('err', `批量创建失败 [${error.name || '未命名任务'}]: ${error.message}`);
  });

  if (result.success) {
    addLog('ok', `✓ 批量创建完成，成功 ${createdTasks.length} 个`);
  } else if (createdTasks.length > 0) {
    addLog('warn', `⚠️ 批量创建部分成功，成功 ${createdTasks.length} 个，失败 ${errors.length} 个`);
  }

  return {
    createdCount: createdTasks.length,
    failedCount: errors.length,
  };
}

/**
 * 任务卡片 - 启动按钮
 */
async function onTaskStartClick(btn) {
  const card = btn.closest('.task-card');
  const taskId = card.querySelector('.task-id').textContent;
  return onTaskStartById(taskId);
}

function resolveTaskNewInput(taskId) {
  const draft = taskDetailNewInputDraftState.get(taskId);
  if (typeof draft === 'string') {
    return draft.trim();
  }
  const task = latestTaskPayload.find(item => item.id === taskId);
  return String(task?.artifacts?.pending_new_input || '').trim();
}

function onTaskNewInputDraftChange(taskId, value) {
  taskDetailNewInputDraftState.set(taskId, String(value || ''));
  clearTaskNewInputFeedback(taskId, { rerender: false });
}

async function onTaskSaveNewInput(taskId) {
  if (!ensureAuthenticated()) return;
  const newInput = resolveTaskNewInput(taskId);
  const result = await apiRequest(`${API_BASE}/tasks/${taskId}/new-input`, {
    method: 'POST',
    body: JSON.stringify({ newInput })
  });

  if (result.success) {
    if (result.data) {
      applyTaskUpdateLocally(result.data);
    }
    setTaskNewInputFeedback(
      taskId,
      'success',
      newInput
        ? '新输入已保存，继续或重试任务时会注入本轮上下文。'
        : '待注入的新输入已清空。',
    );
    addLog('ok', `任务 ${taskId} 的新输入已保存`);
    await refreshTasks();
  } else {
    setTaskNewInputFeedback(taskId, 'error', result.message || '保存失败，请稍后重试。');
    addLog('err', `新输入保存失败: ${result.message}`);
  }
}

async function onTaskStartById(taskId) {
  if (!ensureAuthenticated()) return;
  if (!hasUsableApiConfig()) {
    addLog('warn', '⚠️ 当前未检测到可用 API 配置，已直接提交启动请求，由后端决定是否可运行。');
  }
  
  const result = await apiRequest(`${API_BASE}/tasks/${taskId}/start`, {
    method: 'POST',
    body: JSON.stringify({ newInput: resolveTaskNewInput(taskId) })
  });
  
  if (result.success) {
    taskDetailNewInputDraftState.delete(taskId);
    clearTaskNewInputFeedback(taskId, { rerender: false });
    addLog('ok', `任务 ${taskId} 已启动`);
    refreshTasks();
  } else {
    const reason = result.code || result.data?.code || 'workflow_error';
    const hint = result.data?.hint ? ` ${result.data.hint}` : '';
    addLog('err', `任务启动失败 [${reason}]: ${result.message}${hint}`);
  }
}

async function onTaskContinueById(taskId) {
  if (!ensureAuthenticated()) return;
  if (!hasUsableApiConfig()) {
    addLog('err', '❌ 当前用户没有可用的 API 配置，请先保存用户 API，或配置服务器兜底 API');
    openConfigModal();
    return;
  }

  const result = await apiRequest(`${API_BASE}/tasks/${taskId}/continue`, {
    method: 'POST',
    body: JSON.stringify({ newInput: resolveTaskNewInput(taskId) })
  });

  if (result.success) {
    taskDetailNewInputDraftState.delete(taskId);
    clearTaskNewInputFeedback(taskId, { rerender: false });
    addLog('ok', `任务 ${taskId} 已从当前进度继续`);
    refreshTasks();
  } else {
    const reason = result.code || result.data?.code || 'workflow_error';
    const hint = result.data?.hint ? ` ${result.data.hint}` : '';
    addLog('err', `任务继续失败 [${reason}]: ${result.message}${hint}`);
  }
}

async function onTaskRetryById(taskId) {
  if (!ensureAuthenticated()) return;
  if (!hasUsableApiConfig()) {
    addLog('err', '❌ 当前用户没有可用的 API 配置，请先保存用户 API，或配置服务器兜底 API');
    openConfigModal();
    return;
  }

  if (!confirm(`确定要将任务 ${taskId} 从零重试吗？这会清空已保存的 Agent 上下文和旧日志。`)) {
    return;
  }

  const result = await apiRequest(`${API_BASE}/tasks/${taskId}/retry`, {
    method: 'POST',
    body: JSON.stringify({ newInput: resolveTaskNewInput(taskId) })
  });

  if (result.success) {
    taskDetailNewInputDraftState.delete(taskId);
    clearTaskNewInputFeedback(taskId, { rerender: false });
    addLog('ok', `任务 ${taskId} 已重置并重新启动`);
    refreshTasks();
  } else {
    const reason = result.code || result.data?.code || 'workflow_error';
    const hint = result.data?.hint ? ` ${result.data.hint}` : '';
    addLog('err', `任务重试失败 [${reason}]: ${result.message}${hint}`);
  }
}

async function onTaskStopById(taskId) {
  if (!ensureAuthenticated()) return;
  if (!confirm(`确定要中止任务 ${taskId} 吗？当前运行会在安全检查点尽快退出。`)) {
    return;
  }

  const result = await apiRequest(`${API_BASE}/tasks/${taskId}/stop`, {
    method: 'POST'
  });

  if (result.success) {
    addLog('warn', `任务 ${taskId} 已发送中止请求`);
    refreshTasks();
  } else {
    const reason = result.code || result.data?.code || 'workflow_error';
    const hint = result.data?.hint ? ` ${result.data.hint}` : '';
    addLog('err', `任务中止失败 [${reason}]: ${result.message}${hint}`);
  }
}

/**
 * 编辑任务
 */
async function onEditTaskClick() {
  if (!ensureAuthenticated()) return;
  
  const taskId = getInputValue('editTaskId').trim();
  const name = getInputValue('editTaskName').trim();
  const target = getInputValue('editTaskTarget').trim();
  const gzctfChallengeId = getInputValue('editTaskGzctfChallengeId').trim();
  const taskType = getInputValue('editTaskType', 'RE');
  const workflowKind = taskType === 'KNOWLEDGE' ? 'learn' : 'solve';
  const systemPrompt = getInputValue('editTaskSystemPrompt').trim();
  const executionMode = getInputValue('editTaskExecutionMode', 'single');
  const taskMode = getInputValue('editTaskMode', 'classic');
  const learningConfig = getLearningConfig('editTask');
  const swarmSubagentConfig = getSwarmSubagentConfig('editTask');
  const skills = getSelectedSkills('editTaskSkills');
  const submitBtn = document.getElementById('editTaskSubmitBtn');
  const originalButtonText = submitBtn?.textContent || '保存修改';

  if (!name) {
    alert('请输入任务名称');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = '保存中...';
  }

  try {
    const result = await apiRequest(`${API_BASE}/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name,
        target,
        gzctfChallengeId,
        systemPrompt,
        workflowKind,
        taskMode,
        executionMode,
        learningMode: learningConfig.mode,
        learningSearchRounds: learningConfig.searchRounds,
        learningResultsPerQuery: learningConfig.resultsPerQuery,
        learningMaxSources: learningConfig.maxSources,
        learningMaxCharsPerSource: learningConfig.maxCharsPerSource,
        learningFocusKeywords: learningConfig.focusKeywords,
        learningExcludeKeywords: learningConfig.excludeKeywords,
        swarmSubagentAutoCount: swarmSubagentConfig.autoCount,
        swarmSubagentCountMin: swarmSubagentConfig.min,
        swarmSubagentCountMax: swarmSubagentConfig.max,
        swarmSubagentCountSuggested: swarmSubagentConfig.suggested,
        skills,
      })
    });

    if (result.success) {
      closeEditTaskModal();
      await refreshTasks();
      addLog('ok', `任务 ${taskId} 已更新`);
    } else {
      addLog('err', `任务更新失败: ${result.message}`);
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalButtonText;
    }
  }
}

/**
 * Delete one task from either a task card or another task-scoped action surface.
 *
 * @param {string|HTMLElement} taskIdOrBtn - Preferred explicit task id, or a legacy task button element.
 * @param {HTMLElement|null} fallbackBtn - Optional DOM element used when resolving legacy button clicks.
 * @returns {Promise<void>}
 */
async function onTaskDeleteClick(taskIdOrBtn, fallbackBtn = null) {
  // Verify auth state and explicit user confirmation before mutating task state.
  if (!ensureAuthenticated()) return;
  if (!confirm('确定删除此任务？')) return;

  // Resolve the task id from the explicit argument first, then fall back to legacy card DOM lookup.
  const explicitTaskId = typeof taskIdOrBtn === 'string' ? taskIdOrBtn.trim() : '';
  const candidateBtn = explicitTaskId ? fallbackBtn : taskIdOrBtn;
  const card = candidateBtn?.closest?.('.task-card') || null;
  const taskId = explicitTaskId || card?.querySelector('.task-id')?.textContent.trim() || '';
  if (!taskId) {
    addLog('err', '任务删除失败: 未找到任务编号');
    return;
  }

  // Call the backend deletion endpoint using the resolved stable task id.
  const result = await apiRequest(`${API_BASE}/tasks/${taskId}/delete`, {
    method: 'POST'
  });

  // Close affected UI surfaces and refresh the task list when deletion succeeds.
  if (result.success) {
    if (activeTaskDetailId === taskId) {
      closeTaskDetailModal();
    }
    await refreshTasks();
    addLog('warn', `🗑️ 任务 ${taskId} 已删除`);
  } else {
    // Surface the backend error when deletion is rejected or the task no longer exists.
    addLog('err', `任务删除失败: ${result.message}`);
  }
}
