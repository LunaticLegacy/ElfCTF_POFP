// ═══════════════════════════════════════════════════════════════
// 🎨 主题与页面导航
// ═══════════════════════════════════════════════════════════════

const THEME_STORAGE_KEY = 'pofp_theme';

/**
 * 安全转义 HTML 特殊字符，防止 XSS 攻击
 */
function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 初始化主题（从 localStorage 读取或默认深色）
 */
function initTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = savedTheme || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeToggleIcon(theme);
}

/**
 * 切换深色/浅色主题
 */
function toggleTheme() {
  const root = document.documentElement;
  const current = root.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  localStorage.setItem(THEME_STORAGE_KEY, next);
  updateThemeToggleIcon(next);
}

/**
 * 更新主题切换按钮图标
 */
function updateThemeToggleIcon(theme) {
  const btn = document.querySelector('.theme-toggle');
  if (btn) {
    btn.setAttribute('aria-label', theme === 'dark' ? '切换到浅色主题' : '切换到深色主题');
    btn.textContent = theme === 'dark' ? '☀' : '☾';
  }
}

function switchPage(name, btn) {
  document.querySelectorAll('.header-nav-btn').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');

  if (name === 'config') {
    openConfigModal();
  } else if (name === 'cockpit') {
    openCockpitModal();
  } else if (name === 'knowledge') {
    openKnowledgeModal();
  }
}

function openConfigModal() {
  document.getElementById('configModal')?.classList.add('show');
}

function closeConfigModal(event) {
  if (!event || event.target === document.getElementById('configModal')) {
    document.getElementById('configModal')?.classList.remove('show');
  }
}

// ═══════════════════════════════════════════════════════════════
// 🪟 Modal 弹窗控制
// ═══════════════════════════════════════════════════════════════

/**
 * 关闭新建任务弹窗并重置表单
 */
function closeModal() {
  document.getElementById('modalBg')?.classList.remove('show');
  
  setInputValue('taskName', '');
  setInputValue('taskTarget', '');
  setInputValue('taskGzctfChallengeId', '');
  setInputValue('taskSystemPrompt', '');
  setInputValue('taskMode', 'classic');
  setInputValue('taskExecutionMode', 'single');
  applySwarmSubagentConfig('task', DEFAULT_SWARM_SUBAGENT_CONFIG);
  applyLearningConfig('task', DEFAULT_LEARNING_CONFIG);
  setInputValue('batchTaskInput', '');
  setInputValue('taskType', 'RE');
  setInputValue('taskFileInput', '');
  setTaskCreateMode('single');
  onTaskTypeChange();
  onTaskModeChange();
  onTaskExecutionModeChange();
  uploadedTaskFiles = [];
  batchTaskFileAssignments = {};
  resetTaskCreateProgress();
  updateUploadedFilesDisplay();
  refreshBatchTaskPlanner();
}

// 点击遮罩层关闭弹窗
document.getElementById('modalBg')?.addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// ═══════════════════════════════════════════════════════════════
// 🔍 RE 模式联动逻辑
// ═══════════════════════════════════════════════════════════════

const LOCAL_FILE_TASK_TYPES = new Set(['RE', 'PWN']);
const KNOWLEDGE_TASK_TYPES = new Set(['KNOWLEDGE']);
const TASK_MODE_DESCRIPTIONS = {
  classic: 'Classic Agent 是基础编排人格，偏单主线推进，通常与低延迟思考图或线性求解器搭配。',
  luna_333: 'Luna-333 是构建在 Classic Agent 之上的强化编排策略，更强调滚动迭代、投票与策略沉淀，通常更适合完整版思考图。',
};
const TASK_EXECUTION_MODE_DESCRIPTIONS = {
  single: '单代理模式会按单条执行链推进，适合大多数常规任务。',
  swarm: 'Swarm 并行测试适合同时探索多个分支、payload、候选网页或样本时启用。',
};
const DEFAULT_SWARM_SUBAGENT_CONFIG = {
  autoCount: false,
  min: 2,
  max: 4,
  suggested: 4,
};
const DEFAULT_LEARNING_CONFIG = {
  mode: 'focused',
  searchRounds: 2,
  resultsPerQuery: 8,
  maxSources: 6,
  maxCharsPerSource: 12000,
  focusKeywords: [],
  excludeKeywords: [],
};

function isKnowledgeTaskType(type) {
  return KNOWLEDGE_TASK_TYPES.has(String(type || '').trim().toUpperCase());
}

function normalizeLearningConfigValue(value, fallback, minimum, maximum) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(minimum, Math.min(maximum, numeric));
}

function getLearningConfig(prefix) {
  const modeSelect = document.getElementById(`${prefix}LearningMode`);
  const searchRoundsInput = document.getElementById(`${prefix}LearningSearchRounds`);
  const resultsPerQueryInput = document.getElementById(`${prefix}LearningResultsPerQuery`);
  const maxSourcesInput = document.getElementById(`${prefix}LearningMaxSources`);
  const maxCharsInput = document.getElementById(`${prefix}LearningMaxCharsPerSource`);
  const focusKeywordsInput = document.getElementById(`${prefix}LearningFocusKeywords`);
  const excludeKeywordsInput = document.getElementById(`${prefix}LearningExcludeKeywords`);
  const mode = String(modeSelect?.value || DEFAULT_LEARNING_CONFIG.mode).trim();
  return {
    mode: mode === 'self_search' ? 'self_search' : 'focused',
    searchRounds: normalizeLearningConfigValue(searchRoundsInput?.value, DEFAULT_LEARNING_CONFIG.searchRounds, 1, 8),
    resultsPerQuery: normalizeLearningConfigValue(resultsPerQueryInput?.value, DEFAULT_LEARNING_CONFIG.resultsPerQuery, 1, 20),
    maxSources: normalizeLearningConfigValue(maxSourcesInput?.value, DEFAULT_LEARNING_CONFIG.maxSources, 1, 16),
    maxCharsPerSource: normalizeLearningConfigValue(maxCharsInput?.value, DEFAULT_LEARNING_CONFIG.maxCharsPerSource, 2000, 40000),
    focusKeywords: String(focusKeywordsInput?.value || '').split(/[\n,，;；]+/).map(item => item.trim()).filter(Boolean).slice(0, 16),
    excludeKeywords: String(excludeKeywordsInput?.value || '').split(/[\n,，;；]+/).map(item => item.trim()).filter(Boolean).slice(0, 16),
  };
}

function applyLearningConfig(prefix, config = {}) {
  const normalized = {
    mode: String(config.mode ?? config.learningMode ?? DEFAULT_LEARNING_CONFIG.mode).trim() === 'self_search' ? 'self_search' : 'focused',
    searchRounds: normalizeLearningConfigValue(
      config.searchRounds ?? config.learningSearchRounds,
      DEFAULT_LEARNING_CONFIG.searchRounds,
      1,
      8,
    ),
    resultsPerQuery: normalizeLearningConfigValue(
      config.resultsPerQuery ?? config.learningResultsPerQuery,
      DEFAULT_LEARNING_CONFIG.resultsPerQuery,
      1,
      20,
    ),
    maxSources: normalizeLearningConfigValue(
      config.maxSources ?? config.learningMaxSources,
      DEFAULT_LEARNING_CONFIG.maxSources,
      1,
      16,
    ),
    maxCharsPerSource: normalizeLearningConfigValue(
      config.maxCharsPerSource ?? config.learningMaxCharsPerSource,
      DEFAULT_LEARNING_CONFIG.maxCharsPerSource,
      2000,
      40000,
    ),
    focusKeywords: Array.isArray(config.focusKeywords ?? config.learningFocusKeywords)
      ? (config.focusKeywords ?? config.learningFocusKeywords).map(item => String(item || '').trim()).filter(Boolean).slice(0, 16)
      : [],
    excludeKeywords: Array.isArray(config.excludeKeywords ?? config.learningExcludeKeywords)
      ? (config.excludeKeywords ?? config.learningExcludeKeywords).map(item => String(item || '').trim()).filter(Boolean).slice(0, 16)
      : [],
  };

  const modeSelect = document.getElementById(`${prefix}LearningMode`);
  const searchRoundsInput = document.getElementById(`${prefix}LearningSearchRounds`);
  const resultsPerQueryInput = document.getElementById(`${prefix}LearningResultsPerQuery`);
  const maxSourcesInput = document.getElementById(`${prefix}LearningMaxSources`);
  const maxCharsInput = document.getElementById(`${prefix}LearningMaxCharsPerSource`);
  const focusKeywordsInput = document.getElementById(`${prefix}LearningFocusKeywords`);
  const excludeKeywordsInput = document.getElementById(`${prefix}LearningExcludeKeywords`);
  if (modeSelect) modeSelect.value = normalized.mode;
  if (searchRoundsInput) searchRoundsInput.value = String(normalized.searchRounds);
  if (resultsPerQueryInput) resultsPerQueryInput.value = String(normalized.resultsPerQuery);
  if (maxSourcesInput) maxSourcesInput.value = String(normalized.maxSources);
  if (maxCharsInput) maxCharsInput.value = String(normalized.maxCharsPerSource);
  if (focusKeywordsInput) focusKeywordsInput.value = normalized.focusKeywords.join(', ');
  if (excludeKeywordsInput) excludeKeywordsInput.value = normalized.excludeKeywords.join(', ');
}

function syncTaskWorkflowControls(prefix, taskType = '') {
  const normalizedType = String(taskType || '').trim().toUpperCase();
  const isKnowledge = isKnowledgeTaskType(normalizedType);
  const isCreate = prefix === 'task';
  const taskModeSelect = document.getElementById(`${prefix}Mode`);
  const taskModeDescription = document.getElementById(`${prefix}ModeDescription`);
  const executionModeGroup = document.getElementById(`${prefix}ExecutionModeGroup`);
  const executionModeSelect = document.getElementById(`${prefix}ExecutionMode`);
  const swarmConfigGroup = document.getElementById(`${prefix}SwarmSubagentConfigGroup`);
  const learningConfigGroup = document.getElementById(`${prefix}LearningConfigGroup`);
  const learningConfigDescription = document.getElementById(`${prefix}LearningConfigDescription`);
  const targetGroup = document.getElementById(isCreate ? 'targetAddrGroup' : 'editTargetAddrGroup');
  const targetInput = document.getElementById(isCreate ? 'taskTarget' : 'editTaskTarget');
  const targetLabel = document.getElementById(isCreate ? 'taskTargetLabel' : 'editTaskTargetLabel');
  const uploadGroup = isCreate ? document.getElementById('taskFileUploadGroup') : null;
  const batchPlannerGroup = isCreate ? document.getElementById('batchTaskPlannerGroup') : null;

  if (isKnowledge) {
    if (taskModeSelect) {
      taskModeSelect.value = 'luna_333';
      taskModeSelect.disabled = true;
    }
    if (taskModeDescription) {
      taskModeDescription.textContent = 'Knowledge Harvest / 学习模式仅支持 Luna-333，会直接走联网学习与知识沉淀流程。';
    }
    if (!executionModeSelect?.value) {
      if (executionModeSelect) executionModeSelect.value = 'single';
    }
    executionModeGroup?.classList.remove('hidden');
    learningConfigGroup?.classList.remove('hidden');
    syncSwarmSubagentConfigUI(prefix);
    targetGroup?.classList.remove('hidden');
    if (targetInput) {
      targetInput.required = true;
      targetInput.placeholder = '填写学习主题、检索关键词或直接给出题解 URL';
    }
    if (targetLabel) {
      targetLabel.textContent = '学习主题 / URL';
    }
    if (isCreate) {
      uploadGroup?.classList.add('hidden');
      batchPlannerGroup?.classList.add('hidden');
      if (uploadedTaskFiles.length) {
        uploadedTaskFiles = [];
        batchTaskFileAssignments = {};
        updateUploadedFilesDisplay();
        refreshBatchTaskPlanner();
      }
    }
    if (learningConfigDescription) {
      const learningConfig = getLearningConfig(prefix);
      const executionMode = String(executionModeSelect?.value || 'single').trim() || 'single';
      learningConfigDescription.textContent = learningConfig.mode === 'self_search'
        ? `自搜索学习会滚动扩展检索词；当前搜索 ${learningConfig.searchRounds} 轮，每轮 ${learningConfig.resultsPerQuery} 条候选，最多抓取 ${learningConfig.maxSources} 个来源。${executionMode === 'swarm' ? 'Swarm 会把多条搜索分支同时推进。' : '单代理会按轮次顺序推进搜索。'}`
        : `定向学习会围绕你的主题做批量搜索；当前搜索 ${learningConfig.searchRounds} 轮，每轮 ${learningConfig.resultsPerQuery} 条候选，最多抓取 ${learningConfig.maxSources} 个来源。${executionMode === 'swarm' ? 'Swarm 会把多页/多分支检索同时推进。' : '单代理会按轮次顺序推进搜索。'}`;
    }
    return;
  }

  if (taskModeSelect) {
    taskModeSelect.disabled = false;
  }
  updateTaskModeDescription(`${prefix}Mode`, `${prefix}ModeDescription`);
  executionModeGroup?.classList.remove('hidden');
  learningConfigGroup?.classList.add('hidden');
  swarmConfigGroup?.classList.toggle('hidden', String(document.getElementById(`${prefix}ExecutionMode`)?.value || 'single').trim() !== 'swarm');
  if (targetLabel) {
    targetLabel.textContent = '目标地址';
  }
  if (isCreate) {
    uploadGroup?.classList.remove('hidden');
    if (taskCreateMode === 'batch') {
      batchPlannerGroup?.classList.remove('hidden');
    }
  }
}

function normalizeSwarmSubagentConfigValue(value, fallback) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(1, Math.min(8, numeric));
}

function getSwarmSubagentConfig(prefix) {
  const minInput = document.getElementById(`${prefix}SwarmSubagentCountMin`);
  const maxInput = document.getElementById(`${prefix}SwarmSubagentCountMax`);
  const suggestedInput = document.getElementById(`${prefix}SwarmSubagentCountSuggested`);
  const autoCheckbox = document.getElementById(`${prefix}SwarmSubagentAutoCount`);

  let minimum = normalizeSwarmSubagentConfigValue(minInput?.value, DEFAULT_SWARM_SUBAGENT_CONFIG.min);
  let maximum = normalizeSwarmSubagentConfigValue(maxInput?.value, DEFAULT_SWARM_SUBAGENT_CONFIG.max);
  if (minimum > maximum) {
    [minimum, maximum] = [maximum, minimum];
  }
  const suggested = Math.max(
    minimum,
    Math.min(maximum, normalizeSwarmSubagentConfigValue(suggestedInput?.value, DEFAULT_SWARM_SUBAGENT_CONFIG.suggested)),
  );

  return {
    autoCount: Boolean(autoCheckbox?.checked),
    min: minimum,
    max: maximum,
    suggested,
  };
}

function applySwarmSubagentConfig(prefix, config = {}) {
  const normalized = {
    autoCount: Boolean(config.autoCount ?? config.swarmSubagentAutoCount ?? DEFAULT_SWARM_SUBAGENT_CONFIG.autoCount),
    min: normalizeSwarmSubagentConfigValue(
      config.min ?? config.swarmSubagentCountMin,
      DEFAULT_SWARM_SUBAGENT_CONFIG.min,
    ),
    max: normalizeSwarmSubagentConfigValue(
      config.max ?? config.swarmSubagentCountMax,
      DEFAULT_SWARM_SUBAGENT_CONFIG.max,
    ),
    suggested: normalizeSwarmSubagentConfigValue(
      config.suggested ?? config.swarmSubagentCountSuggested,
      DEFAULT_SWARM_SUBAGENT_CONFIG.suggested,
    ),
  };
  if (normalized.min > normalized.max) {
    [normalized.min, normalized.max] = [normalized.max, normalized.min];
  }
  normalized.suggested = Math.max(normalized.min, Math.min(normalized.max, normalized.suggested));

  const minInput = document.getElementById(`${prefix}SwarmSubagentCountMin`);
  const maxInput = document.getElementById(`${prefix}SwarmSubagentCountMax`);
  const suggestedInput = document.getElementById(`${prefix}SwarmSubagentCountSuggested`);
  const autoCheckbox = document.getElementById(`${prefix}SwarmSubagentAutoCount`);
  if (minInput) minInput.value = String(normalized.min);
  if (maxInput) maxInput.value = String(normalized.max);
  if (suggestedInput) suggestedInput.value = String(normalized.suggested);
  if (autoCheckbox) autoCheckbox.checked = normalized.autoCount;
}

function syncSwarmSubagentConfigUI(prefix) {
  const executionMode = String(document.getElementById(`${prefix}ExecutionMode`)?.value || 'single').trim() || 'single';
  const configGroup = document.getElementById(`${prefix}SwarmSubagentConfigGroup`);
  const description = document.getElementById(`${prefix}SwarmSubagentConfigDescription`);
  if (configGroup) {
    configGroup.classList.toggle('hidden', executionMode !== 'swarm');
  }

  const normalized = getSwarmSubagentConfig(prefix);
  applySwarmSubagentConfig(prefix, normalized);

  if (description) {
    description.textContent = normalized.autoCount
      ? `仅在 Swarm 模式下生效。LLM 可在 ${normalized.min}-${normalized.max} 个子 agent 之间自主决定，建议值 ${normalized.suggested} 会作为偏好保留。`
      : `仅在 Swarm 模式下生效。当前会优先采用建议值 ${normalized.suggested}；下限 ${normalized.min} 和上限 ${normalized.max} 会随任务一起保存，便于后续切换自动决策。`;
  }
}

function updateTaskModeDescription(selectId, descriptionId) {
  const select = document.getElementById(selectId);
  const description = document.getElementById(descriptionId);
  if (!select || !description) {
    return;
  }
  const mode = String(select.value || 'classic').trim() || 'classic';
  description.textContent = TASK_MODE_DESCRIPTIONS[mode] || TASK_MODE_DESCRIPTIONS.classic;
}

function onTaskModeChange() {
  updateTaskModeDescription('taskMode', 'taskModeDescription');
  syncTaskWorkflowControls('task', document.getElementById('taskType')?.value || 'RE');
}

function onEditTaskModeChange() {
  updateTaskModeDescription('editTaskMode', 'editTaskModeDescription');
  syncTaskWorkflowControls('editTask', document.getElementById('editTaskType')?.value || 'RE');
}

function updateTaskExecutionModeDescription(selectId, descriptionId) {
  const select = document.getElementById(selectId);
  const description = document.getElementById(descriptionId);
  if (!select || !description) {
    return;
  }
  const mode = String(select.value || 'single').trim() || 'single';
  description.textContent = TASK_EXECUTION_MODE_DESCRIPTIONS[mode] || TASK_EXECUTION_MODE_DESCRIPTIONS.single;
}

function onTaskExecutionModeChange() {
  updateTaskExecutionModeDescription('taskExecutionMode', 'taskExecutionModeDescription');
  syncSwarmSubagentConfigUI('task');
  syncTaskWorkflowControls('task', document.getElementById('taskType')?.value || 'RE');
}

function onEditTaskExecutionModeChange() {
  updateTaskExecutionModeDescription('editTaskExecutionMode', 'editTaskExecutionModeDescription');
  syncSwarmSubagentConfigUI('editTask');
  syncTaskWorkflowControls('editTask', document.getElementById('editTaskType')?.value || 'RE');
}

function onTaskSwarmSubagentAutoCountChange() {
  syncSwarmSubagentConfigUI('task');
}

function onEditTaskSwarmSubagentAutoCountChange() {
  syncSwarmSubagentConfigUI('editTask');
}

function onTaskSwarmSubagentConfigInputChange() {
  syncSwarmSubagentConfigUI('task');
}

function onEditTaskSwarmSubagentConfigInputChange() {
  syncSwarmSubagentConfigUI('editTask');
}

/**
 * 任务类型变更时，动态调整表单字段显示
 */
function onTaskTypeChange() {
  const type = getInputValue('taskType', 'RE');
  const targetGroup = document.getElementById('targetAddrGroup');
  const targetInput = document.getElementById('taskTarget');
  const uploadText = document.getElementById('uploadText');
  
  const typeHints = {
    'RE': '上传二进制文件、源码等',
    'PWN': '上传 ELF、附件、利用脚本或相关源码',
    'WEB': '有需要就填写',
    'CRYPTO': '有需要就填写',
    'MISC': '有需要就填写',
    'KNOWLEDGE': '联网学习模式不需要上传附件，优先填写主题或 URL'
  };
  
  uploadText.innerHTML = `点击或拖拽上传题目文件<br><span style="opacity:0.6;font-size:10px">${typeHints[type]}</span>`;
  
  if (isKnowledgeTaskType(type)) {
    targetGroup.classList.remove('hidden');
    targetInput.required = true;
  } else if (LOCAL_FILE_TASK_TYPES.has(type)) {
    targetGroup.classList.add('hidden');
    targetInput.required = false;
    targetInput.value = '';
  } else {
    targetGroup.classList.remove('hidden');
    targetInput.required = true;
    targetInput.placeholder = type === 'WEB' ? '填写容器地址' :
                              type === 'CRYPTO' ? '填写容器地址' :
                              type === 'MISC' ? '填写容器地址' : '';
  }
  syncTaskWorkflowControls('task', type);

  if (typeof loadSkills === 'function' && isAuthenticated()) {
    loadSkills(type);
  } else if (Array.isArray(availableSkills) && availableSkills.length > 0) {
    populateSkillsSelect('taskSkills', getSelectedSkills('taskSkills'), type);
  }
}

function setTaskCreateMode(mode, trigger) {
  taskCreateMode = mode === 'batch' ? 'batch' : 'single';

  const singleBtn = document.getElementById('singleTaskModeBtn');
  const batchBtn = document.getElementById('batchTaskModeBtn');
  const batchGroup = document.getElementById('batchTaskGroup');
  const batchPlannerGroup = document.getElementById('batchTaskPlannerGroup');
  const taskCreateModal = document.getElementById('taskCreateModal');
  const taskNameLabel = document.getElementById('taskNameLabel');
  const taskNameInput = document.getElementById('taskName');
  const submitBtn = document.getElementById('createTaskSubmitBtn');

  singleBtn?.classList.toggle('active', taskCreateMode === 'single');
  batchBtn?.classList.toggle('active', taskCreateMode === 'batch');
  batchGroup?.classList.toggle('hidden', taskCreateMode !== 'batch');
  batchPlannerGroup?.classList.toggle('hidden', taskCreateMode !== 'batch');
  taskCreateModal?.classList.toggle('batch-layout', taskCreateMode === 'batch');

  if (taskNameLabel) {
    taskNameLabel.textContent = taskCreateMode === 'batch' ? '默认任务名称前缀（可选）' : '任务名称';
  }
  if (taskNameInput) {
    taskNameInput.placeholder = taskCreateMode === 'batch' ? '留空则直接使用每行的任务名称' : '随便填写';
  }
  if (submitBtn) {
    submitBtn.textContent = taskCreateMode === 'batch' ? '批量创建' : '创建任务';
  }

  if (trigger instanceof HTMLElement) {
    trigger.blur();
  }

  syncTaskWorkflowControls('task', document.getElementById('taskType')?.value || 'RE');
  refreshBatchTaskPlanner();
}

// ═══════════════════════════════════════════════════════════════
// 📎 文件上传 UI 反馈
// ═══════════════════════════════════════════════════════════════

/**
 * 处理任务文件选择事件
 */
function handleTaskFileSelect(input) {
  const files = Array.from(input.files);
  files.forEach(file => {
    if (!uploadedTaskFiles.find(f => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)) {
      uploadedTaskFiles.push({
        clientId: `upload_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        file,
      });
    }
  });
  updateUploadedFilesDisplay();
  refreshBatchTaskPlanner();
  input.value = '';
}

/**
 * 更新已上传文件列表的 UI 显示
 */
function updateUploadedFilesDisplay() {
  const container = document.getElementById('uploadedFiles');
  
  if (uploadedTaskFiles.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  container.innerHTML = uploadedTaskFiles.map((file, idx) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:250px">
        📄 ${escapeHtml(file.name)} (${(file.size/1024).toFixed(1)} KB)
      </span>
      <button onclick="removeTaskFile(${idx})" 
              style="background:none;border:none;color:var(--text-3);cursor:pointer;font-size:12px">
        ×
      </button>
    </div>
  `).join('');
}

/**
 * 移除已上传的单个文件
 */
function removeTaskFile(index) {
  uploadedTaskFiles.splice(index, 1);
  updateUploadedFilesDisplay();
  refreshBatchTaskPlanner();
}

function setTaskCreateProgress(percent, label) {
  taskCreateUploadState = {
    active: true,
    progress: Math.max(0, Math.min(100, Number(percent) || 0)),
    label: label || '处理中...',
  };

  const shell = document.getElementById('taskCreateProgress');
  const fill = document.getElementById('taskCreateProgressFill');
  const text = document.getElementById('taskCreateProgressLabel');
  shell?.classList.remove('hidden');
  if (fill) fill.style.width = `${taskCreateUploadState.progress}%`;
  if (text) text.textContent = `${taskCreateUploadState.label} ${taskCreateUploadState.progress}%`;
}

function resetTaskCreateProgress() {
  taskCreateUploadState = { active: false, progress: 0, label: '' };
  document.getElementById('taskCreateProgress')?.classList.add('hidden');
  const fill = document.getElementById('taskCreateProgressFill');
  const text = document.getElementById('taskCreateProgressLabel');
  if (fill) fill.style.width = '0%';
  if (text) text.textContent = '准备上传...';
}

// ═══════════════════════════════════════════════════════════════
// 📝 编辑任务模态框控制
// ═══════════════════════════════════════════════════════════════

let currentEditingTaskId = null;

/**
 * 打开编辑任务模态框
 */
async function openEditTaskModal(taskId) {
  const task = latestTaskPayload.find(t => t.id === taskId);
  if (!task) {
    addLog('err', `任务 ${taskId} 未找到`);
    return;
  }

  // 检查任务状态
  if (task.status === 'running') {
    addLog('warn', '任务运行中，不能编辑');
    return;
  }

  currentEditingTaskId = taskId;

  // 填充表单
  setInputValue('editTaskId', taskId);
  setInputValue('editTaskName', task.name || '');
  setInputValue('editTaskType', task.type || 'RE');
  setInputValue('editTaskTarget', task.target || '');
  setInputValue('editTaskGzctfChallengeId', task.gzctfChallengeId || '');
  setInputValue('editTaskSystemPrompt', task.systemPrompt || '');
  setInputValue('editTaskMode', task.taskMode || 'classic');
  setInputValue('editTaskExecutionMode', task.executionMode || 'single');
  applyLearningConfig('editTask', {
    mode: task.learningMode,
    searchRounds: task.learningSearchRounds,
    resultsPerQuery: task.learningResultsPerQuery,
    maxSources: task.learningMaxSources,
    maxCharsPerSource: task.learningMaxCharsPerSource,
    focusKeywords: task.learningFocusKeywords,
    excludeKeywords: task.learningExcludeKeywords,
  });
  applySwarmSubagentConfig('editTask', {
    autoCount: task.swarmSubagentAutoCount,
    min: task.swarmSubagentCountMin,
    max: task.swarmSubagentCountMax,
    suggested: task.swarmSubagentCountSuggested,
  });
  onEditTaskModeChange();
  onEditTaskExecutionModeChange();

  // 根据类型显示/隐藏目标地址
  const targetGroup = document.getElementById('editTargetAddrGroup');
  if (isKnowledgeTaskType(task.type)) {
    targetGroup.classList.remove('hidden');
  } else if (LOCAL_FILE_TASK_TYPES.has(task.type)) {
    targetGroup.classList.add('hidden');
  } else {
    targetGroup.classList.remove('hidden');
  }
  syncTaskWorkflowControls('editTask', task.type || 'RE');

  // 填充 skills 选择
  if (typeof loadSkills === 'function' && isAuthenticated()) {
    await loadSkills(task.type || 'RE');
  }
  populateSkillsSelect('editTaskSkills', task.skills || [], task.type || 'RE');

  // 显示文件列表
  const filesContainer = document.getElementById('editTaskFiles');
  if (filesContainer) {
    if (task.files && task.files.length > 0) {
      filesContainer.innerHTML = task.files.map(f => `
        <div style="padding:4px 0;font-size:12px;">
          📄 ${escapeHtml(f.name)} (${(f.size / 1024).toFixed(1)} KB)
        </div>
      `).join('');
    } else {
      filesContainer.innerHTML = '<span style="color:var(--text-muted);font-size:12px;">无文件</span>';
    }
  }

  document.getElementById('editTaskModalBg').classList.add('show');
}

/**
 * 关闭编辑任务模态框
 */
function closeEditTaskModal(event) {
  if (!event || event.target === document.getElementById('editTaskModalBg')) {
    document.getElementById('editTaskModalBg').classList.remove('show');
    currentEditingTaskId = null;
    setInputValue('editTaskGzctfChallengeId', '');
  }
}

/**
 * 填充 skills 下拉框
 */
function populateSkillsSelect(selectId, selectedSkills = [], taskType = '') {
  const select = document.getElementById(selectId);
  if (!select) return;

  const selectedSet = new Set(selectedSkills);
  const normalizedTaskType = String(taskType || '').trim().toUpperCase();
  const visibleSkills = availableSkills.filter(skill => {
    const taskTypes = Array.isArray(skill.taskTypes) ? skill.taskTypes : [];
    return taskTypes.length === 0 || !normalizedTaskType || taskTypes.includes(normalizedTaskType);
  });
  select.innerHTML = visibleSkills.map(skill => `
    <option value="${escapeHtml(skill.id)}" ${selectedSet.has(skill.id) ? 'selected' : ''}>
      ${escapeHtml(skill.name || skill.id)}
    </option>
  `).join('');
}

/**
 * 填充 MCP 服务器下拉框
 */
async function populateMcpSelect(selectId, selectedMcp = '') {
  const select = document.getElementById(selectId);
  if (!select) return;

  try {
    const token = localStorage.getItem('pofp_auth_token');
    if (!token) {
      select.innerHTML = '<option value="">未登录</option>';
      return;
    }
    
    const response = await fetch('/api/user-mcp', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      select.innerHTML = '<option value="">加载失败</option>';
      return;
    }
    
    const result = await response.json();
    const servers = result.data?.servers || [];
    
    let html = '<option value="">不使用托管 MCP</option>';
    servers.forEach(server => {
      const statusIcon = server.is_online ? '🟢' : '🔴';
      html += `<option value="${escapeHtml(server.id)}" ${server.id === selectedMcp ? 'selected' : ''}>` +
              `${statusIcon} ${escapeHtml(server.name)} (${escapeHtml(server.transport)})` +
              `</option>`;
    });
    select.innerHTML = html;
  } catch (err) {
    select.innerHTML = '<option value="">加载失败</option>';
  }
}

/**
 * 打开新建任务模态框
 */
function openNewTaskModal() {
  document.getElementById('modalBg')?.classList.add('show');
  setTaskCreateMode('single');
  setInputValue('taskMode', 'classic');
  setInputValue('taskExecutionMode', 'single');
  applySwarmSubagentConfig('task', DEFAULT_SWARM_SUBAGENT_CONFIG);
  applyLearningConfig('task', DEFAULT_LEARNING_CONFIG);
  onTaskTypeChange();
  onTaskModeChange();
  onTaskExecutionModeChange();
  uploadedTaskFiles = [];
  batchTaskFileAssignments = {};
  resetTaskCreateProgress();
  updateUploadedFilesDisplay();
  refreshBatchTaskPlanner();

  if (typeof loadSkills === 'function' && isAuthenticated()) {
    loadSkills(document.getElementById('taskType')?.value || 'RE');
  } else if (Array.isArray(availableSkills) && availableSkills.length > 0) {
    populateSkillsSelect('taskSkills', [], document.getElementById('taskType')?.value || 'RE');
  }

}
