/**
 * POFP CTF Agent - Frontend Logic Module
 * 纯界面交互逻辑，所有函数仅为 UI 反馈，无实际业务逻辑
 * 
 * @version 1.0.0
 * @author POFP Team
 */

// ═══════════════════════════════════════════════════════════════
// 📦 全局状态
// ═══════════════════════════════════════════════════════════════
let uploadedTaskFiles = [];
let taskCreateMode = 'single';
let batchTaskFileAssignments = {};
const API_BASE = `${window.location.origin}/api`;
let taskRefreshInterval = null;
let isTaskRefreshPaused = false;
let taskRefreshPauseDepth = 0;
let queuedTaskPayload = null;
let lastRenderedTaskSnapshot = '';
let latestTaskPayload = [];
const expandedTaskIds = new Set();
const taskDetailOutputPageState = new Map();
const taskDetailTabState = new Map();
const taskThinkingGraphPageState = new Map();
const taskThinkingGraphZoomState = new Map();
const taskThinkingGraphSelectedNodeState = new Map();
const taskThinkingGraphPanState = new Map();
let activeTaskDetailId = null;
let activeThinkingGraphModalTaskId = null;
let activeSwarmRunModalTaskId = null;
let activeSwarmRunModalRunId = null;
let lastRenderedTaskDetailId = null;
const taskDetailScrollState = new Map();
let activeLogPanelTaskId = null;
let activeLogPanelType = null; // 'tool' | 'verbose'
const taskDetailNewInputDraftState = new Map();
const taskDetailNewInputFeedbackState = new Map();
const taskDetailNewInputFeedbackTimers = new Map();
let taskCreateUploadState = { active: false, progress: 0, label: '' };
let currentAuthToken = localStorage.getItem('pofp_auth_token') || '';
let currentUsername = localStorage.getItem('pofp_auth_username') || '';
let currentUserConfigState = {
  has_server_fallback: false,
  using_server_fallback: false,
  effective_model: '',
  effective_api_base: '',
  effective_connector_type: 'litellm',
};

// 连接器类型描述
const CONNECTOR_DESCRIPTIONS = {
  litellm: 'LiteLLM 支持大多数 API 格式，包括第三方代理',
  openai: 'OpenAI 格式直接兼容 OpenAI 官方及第三方 OpenAI 格式 API',
  anthropic: 'Anthropic 直接支持 Claude 系列模型',
};

// Skills 全局状态
let availableSkills = [];
let skillsLoaded = false;

function setMode(mode, btn) {
}

function normalizeUsername(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 32);
  return normalized;
}

function getUserStorageKey(key, username = currentUsername || 'anonymous') {
  return `${key}:${normalizeUsername(username) || 'anonymous'}`;
}

function getCurrentUsername() {
  return currentUsername;
}

function applyAuthHeaders(headers = {}) {
  const nextHeaders = { ...headers };
  if (currentAuthToken) {
    nextHeaders.Authorization = `Bearer ${currentAuthToken}`;
  }
  return nextHeaders;
}

function setAuthenticatedUser(token, username) {
  currentAuthToken = String(token || '').trim();
  currentUsername = normalizeUsername(username);
  if (currentAuthToken) {
    localStorage.setItem('pofp_auth_token', currentAuthToken);
  } else {
    localStorage.removeItem('pofp_auth_token');
  }
  if (currentUsername) {
    localStorage.setItem('pofp_auth_username', currentUsername);
  } else {
    localStorage.removeItem('pofp_auth_username');
  }
  latestTaskPayload = [];
  queuedTaskPayload = null;
  lastRenderedTaskSnapshot = '';
  taskDetailOutputPageState.clear();
  taskDetailTabState.clear();
  taskThinkingGraphPageState.clear();
  taskThinkingGraphZoomState.clear();
  taskThinkingGraphPanState.clear();
  taskDetailScrollState.clear();
  taskDetailNewInputDraftState.clear();
  taskDetailNewInputFeedbackState.clear();
  taskDetailNewInputFeedbackTimers.forEach(timerId => clearTimeout(timerId));
  taskDetailNewInputFeedbackTimers.clear();
  activeTaskDetailId = null;
  activeThinkingGraphModalTaskId = null;
  lastRenderedTaskDetailId = null;
  taskRefreshPauseDepth = 0;
  isTaskRefreshPaused = false;
  document.body.classList.remove('task-refresh-paused');
  document.getElementById('taskDetailModal')?.classList.remove('show');
  document.getElementById('thinkingGraphModal')?.classList.remove('show');
  updateUserContextUi();
}

function clearAuthenticatedUser() {
  setAuthenticatedUser('', '');
}

function isAuthenticated() {
  return Boolean(currentAuthToken && currentUsername);
}

function hasUsableApiConfig() {
  if (!isAuthenticated()) {
    return false;
  }
  const localApiKey = document.getElementById('apiKey')?.value.trim();
  return Boolean(localApiKey || currentUserConfigState.has_server_fallback);
}

function updateUserContextUi() {
  const badge = document.getElementById('currentUserBadge');
  const authActionBtn = document.getElementById('authActionBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const scopeHint = document.getElementById('configScopeHint');

  if (badge) {
    badge.textContent = isAuthenticated() ? currentUsername : '未登录';
  }
  if (authActionBtn) {
    authActionBtn.textContent = isAuthenticated() ? '切换账号' : '登录';
  }
  if (logoutBtn) {
    logoutBtn.style.display = isAuthenticated() ? 'inline-flex' : 'none';
  }
  if (scopeHint) {
    if (!isAuthenticated()) {
      scopeHint.textContent = '请先登录账号，再管理当前用户的 API 配置。';
    } else if (currentUserConfigState.using_server_fallback) {
      scopeHint.textContent = '当前登录账号未填写自己的 API，正在使用服务器兜底配置。';
    } else if (currentUserConfigState.has_server_fallback) {
      scopeHint.textContent = '当前登录账号可独立保存自己的 API；留空时会自动回退到服务器兜底配置。';
    } else {
      scopeHint.textContent = '当前登录账号没有可用的服务器兜底 API，请保存自己的 API 配置。';
    }
  }
}

function openAuthModal(mode = 'login') {
  const modal = document.getElementById('authModal');
  const submitText = document.getElementById('authSubmitText');
  const toggleBtn = document.getElementById('authToggleBtn');
  const toggleHint = document.getElementById('authToggleHint');
  const subtitle = document.getElementById('authSubtitle');
  const usernameInput = document.getElementById('authUsername');
  const passwordInput = document.getElementById('authPassword');
  const errorEl = document.getElementById('authError');
  if (!modal || !submitText || !toggleBtn || !usernameInput || !passwordInput) {
    return;
  }
  modal.dataset.mode = mode === 'register' ? 'register' : 'login';
  submitText.textContent = mode === 'register' ? '注册并登录' : '登录';
  toggleBtn.textContent = mode === 'register' ? '去登录' : '去注册';
  if (toggleHint) toggleHint.textContent = mode === 'register' ? '已有账号？' : '还没有账号？';
  if (subtitle) subtitle.textContent = mode === 'register' ? '创建新账号开始使用' : '连接到服务器开始工作';
  usernameInput.value = currentUsername || '';
  passwordInput.value = '';
  // 清除错误
  if (errorEl) errorEl.style.display = 'none';
  modal.classList.add('show');
  
  // 绑定回车键提交（仅在该弹窗内）
  const handleEnterKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitAuth();
    }
  };
  usernameInput.onkeydown = handleEnterKey;
  passwordInput.onkeydown = handleEnterKey;
}

function closeAuthModal(event) {
  if (!event || event.target === document.getElementById('authModal')) {
    document.getElementById('authModal')?.classList.remove('show');
  }
}

function toggleAuthMode() {
  const modal = document.getElementById('authModal');
  const mode = modal?.dataset.mode === 'register' ? 'login' : 'register';
  openAuthModal(mode);
}

async function submitAuth() {
  const modal = document.getElementById('authModal');
  const username = document.getElementById('authUsername')?.value.trim();
  const password = document.getElementById('authPassword')?.value || '';
  const mode = modal?.dataset.mode === 'register' ? 'register' : 'login';
  const errorEl = document.getElementById('authError');
  const errorText = document.getElementById('authErrorText');

  if (!username || !password) {
    if (errorEl && errorText) {
      errorText.textContent = '请输入账号和密码';
      errorEl.style.display = 'flex';
    }
    return;
  }

  const endpoint = mode === 'register' ? `${API_BASE}/auth/register` : `${API_BASE}/auth/login`;
  const result = await apiRequest(endpoint, {
    method: 'POST',
    headers: {},
    body: JSON.stringify({ username, password }),
    skipAuthRedirect: true,
  });

  if (!result.success) {
    if (errorEl && errorText) {
      errorText.textContent = `${mode === 'register' ? '注册' : '登录'}失败: ${result.message}`;
      errorEl.style.display = 'flex';
    }
    return;
  }

  // 清除错误
  if (errorEl) errorEl.style.display = 'none';
  
  setAuthenticatedUser(result.data?.token, result.data?.user?.username || username);
  closeAuthModal();
  addLog('ok', `${mode === 'register' ? '注册' : '登录'}成功，当前账号: ${getCurrentUsername()}`);
  if (typeof loadCurrentUserState === 'function') {
    await loadCurrentUserState({ forceRefreshTasks: true });
  }
  startTaskRefresh();
}

async function logout() {
  await apiRequest(`${API_BASE}/auth/logout`, {
    method: 'POST',
    skipAuthRedirect: true,
  });
  closeAuthModal();
  clearAuthenticatedUser();
  currentUserConfigState = {
    has_server_fallback: false,
    using_server_fallback: false,
    effective_model: '',
    effective_api_base: '',
  };
  document.getElementById('apiKey').value = '';
  document.getElementById('apiBase').value = '';
  updateUserContextUi();
  renderTasks([]);
  updateTaskStats([]);
  stopTaskRefresh();
  addLog('warn', '已退出登录');
  openAuthModal('login');
}

function ensureAuthenticated() {
  if (isAuthenticated()) {
    return true;
  }
  addLog('warn', '请先登录账号');
  openAuthModal('login');
  return false;
}

async function bootstrapAuthState() {
  const result = await apiRequest(`${API_BASE}/auth/me`, {
    method: 'GET',
    skipAuthRedirect: true,
  });

  if (!result.success || !result.data?.authenticated) {
    clearAuthenticatedUser();
    updateUserContextUi();
    openAuthModal(result.data?.has_users ? 'login' : 'register');
    return false;
  }

  setAuthenticatedUser(currentAuthToken, result.data.user.username);
  closeAuthModal();
  return true;
}

// ═══════════════════════════════════════════════════════════════
// 🧠 Skills 管理
// ═══════════════════════════════════════════════════════════════

/**
 * 加载可用 skills 列表
 */
async function loadSkills(taskType = '') {
  if (!isAuthenticated()) return;

  const params = new URLSearchParams();
  if (taskType) params.set('task_type', String(taskType).trim().toUpperCase());
  const url = `${API_BASE}/skills${params.toString() ? `?${params.toString()}` : ''}`;
  const result = await apiRequest(url);
  if (result.success && Array.isArray(result.data)) {
    availableSkills = result.data;
    skillsLoaded = true;
    
    // 更新创建任务模态框中的 skills 选择
    populateSkillsSelect('taskSkills', [], taskType || document.getElementById('taskType')?.value || '');
    
    addLog('info', `已加载 ${availableSkills.length} 个 skills`);
  } else {
    addLog('warn', '加载 skills 失败');
  }
}

/**
 * 获取选中的 skills
 */
function getSelectedSkills(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return [];
  return Array.from(select.selectedOptions).map(opt => opt.value);
}

function applyUserContextHeaders(headers = {}) {
  return {
    ...applyAuthHeaders(headers),
  };
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('apiKey');
  const btn = input.parentElement.querySelector('.eye-btn');
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁';
  }
}

function toggleApiBaseVisibility() {
  const input = document.getElementById('apiBase');
  const btn = input.parentElement.querySelector('.eye-btn');
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁';
  }
}

// ═══════════════════════════════════════════════════════════════
// 🔌 连接器类型管理
// ═══════════════════════════════════════════════════════════════

function onConnectorTypeChange() {
  const connectorType = document.getElementById('connectorType')?.value || 'litellm';
  const hintEl = document.getElementById('connectorTypeHint');
  
  if (hintEl && CONNECTOR_DESCRIPTIONS[connectorType]) {
    hintEl.textContent = CONNECTOR_DESCRIPTIONS[connectorType];
  }
  
  // 切换连接器时更新 API Base 占位符提示和标签
  const apiBaseInput = document.getElementById('apiBase');
  const apiBaseHint = document.getElementById('apiBaseHint');
  
  if (apiBaseInput) {
    const placeholders = {
      litellm: '留空自动识别，或输入第三方代理 URL',
      openai: '留空使用官方地址，或输入自定义 URL 如 https://vibe.supai.app/v1',
      anthropic: '留空使用官方地址，或输入自定义代理地址',
    };
    apiBaseInput.placeholder = placeholders[connectorType] || placeholders.litellm;
  }
  
  if (apiBaseHint) {
    const hints = {
      litellm: '支持 OpenAI、DeepSeek、Moonshot 等大多数兼容格式',
      openai: 'OpenAI 官方或任何兼容 OpenAI 格式的第三方 API',
      anthropic: 'Anthropic 官方或 Claude 代理服务',
    };
    apiBaseHint.textContent = hints[connectorType] || hints.litellm;
  }
  
  // 根据连接器类型更新默认模型提示
  updateModelPlaceholder(connectorType);
}

function updateModelPlaceholder(connectorType) {
  const modelSelect = document.getElementById('modelSelect');
  const modelMeta = document.getElementById('modelMeta');
  
  if (!modelSelect) return;
  
  // 如果模型列表为空，显示对应连接器的默认提示
  if (modelSelect.options.length <= 1) {
    const defaultModels = {
      litellm: 'gpt-4o-mini, gpt-4o, deepseek-chat, claude-3-opus...',
      openai: 'gpt-4o-mini, gpt-4o, gpt-4-turbo, o1-mini...',
      anthropic: 'claude-3-7-sonnet, claude-3-5-sonnet, claude-3-opus...',
    };
    
    if (modelMeta) {
      modelMeta.textContent = `${connectorType} 推荐模型: ${defaultModels[connectorType] || defaultModels.litellm}`;
    }
  }
}

function toggleManualModelInput(enabled, preserveValue = true) {
  const manualToggle = document.getElementById('manualModelToggle');
  const modelSelect = document.getElementById('modelSelect');
  const manualInput = document.getElementById('manualModelInput');

  if (!modelSelect || !manualInput) return;

  const useManual = Boolean(enabled);
  if (manualToggle) {
    manualToggle.checked = useManual;
  }

  if (useManual) {
    if (preserveValue && !manualInput.value.trim()) {
      manualInput.value = modelSelect.value || manualInput.value;
    }
    modelSelect.classList.add('hidden');
    manualInput.classList.remove('hidden');
  } else {
    if (preserveValue && manualInput.value.trim()) {
      modelSelect.value = manualInput.value.trim();
    }
    manualInput.classList.add('hidden');
    modelSelect.classList.remove('hidden');
  }
}

function getConfiguredModelValue() {
  const manualToggle = document.getElementById('manualModelToggle');
  const manualInput = document.getElementById('manualModelInput');
  const modelSelect = document.getElementById('modelSelect');

  if (manualToggle?.checked) {
    return manualInput?.value.trim() || '';
  }
  return modelSelect?.value || '';
}

function setConfiguredModelValue(model) {
  const normalizedModel = String(model || '').trim();
  const modelSelect = document.getElementById('modelSelect');
  const manualInput = document.getElementById('manualModelInput');

  if (manualInput) {
    manualInput.value = normalizedModel;
  }
  if (!modelSelect) return;

  const hasOption = Array.from(modelSelect.options).some(option => option.value === normalizedModel);
  if (normalizedModel && !hasOption) {
    toggleManualModelInput(true, false);
    return;
  }

  modelSelect.value = normalizedModel;
  toggleManualModelInput(false, false);
}

// ═══════════════════════════════════════════════════════════════
// 🔌 API 请求工具
// ═══════════════════════════════════════════════════════════════

async function apiRequest(url, options = {}) {
  try {
    const { skipAuthRedirect = false, ...requestOptions } = options;
    const isFormData = options.body instanceof FormData;
    const headers = isFormData ? { ...(requestOptions.headers || {}) } : {
      'Content-Type': 'application/json',
      ...(requestOptions.headers || {})
    };
    const response = await fetch(url, {
      ...requestOptions,
      headers: applyUserContextHeaders(headers),
    });
    const payload = await response.json();
    if (response.status === 401 && !skipAuthRedirect) {
      clearAuthenticatedUser();
      updateUserContextUi();
      openAuthModal(payload?.data?.has_users ? 'login' : 'register');
    }
    return payload;
  } catch (error) {
    console.error('API请求失败:', error);
    addLog('err', `API请求失败: ${error.message}`);
    return { success: false, message: error.message };
  }
}

function multipartApiRequest(url, { formData, onProgress, skipAuthRedirect = false } = {}) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    if (currentAuthToken) {
      xhr.setRequestHeader('Authorization', `Bearer ${currentAuthToken}`);
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || typeof onProgress !== 'function') return;
      onProgress({
        phase: 'uploading',
        loaded: event.loaded,
        total: event.total,
        percent: Math.min(90, Math.round((event.loaded / event.total) * 90)),
      });
    };

    xhr.upload.onload = () => {
      if (typeof onProgress === 'function') {
        onProgress({ phase: 'processing', percent: 95 });
      }
    };

    xhr.onload = () => {
      if (typeof onProgress === 'function') {
        onProgress({ phase: 'done', percent: 100 });
      }
      try {
        const payload = JSON.parse(xhr.responseText || '{}');
        if (xhr.status === 401 && !skipAuthRedirect) {
          clearAuthenticatedUser();
          updateUserContextUi();
          openAuthModal(payload?.data?.has_users ? 'login' : 'register');
        }
        resolve(payload);
      } catch (error) {
        addLog('err', `API请求失败: ${error.message}`);
        resolve({ success: false, message: error.message });
      }
    };

    xhr.onerror = () => {
      addLog('err', 'API请求失败: 网络错误');
      resolve({ success: false, message: '网络错误' });
    };

    xhr.send(formData);
  });
}

function formatDateTime(value) {
  if (!value) return '未知时间';
  const normalizedValue = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(value))
    ? String(value).replace(' ', 'T')
    : value;
  const date = new Date(normalizedValue);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}
