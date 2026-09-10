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
let currentPlatformAccessToken = '';
let currentUserConfigState = {
  has_server_fallback: false,
  using_server_fallback: false,
  effective_model: '',
  effective_api_base: '',
  effective_connector_type: 'litellm',
  gzctf_enabled: false,
  agent_state_machine_enabled: true,
  gzctf_status_message: '',
  gzctf_has_cookie: false,
  gzctf_team: null,
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

function getCurrentPlatformAccessToken() {
  return currentPlatformAccessToken;
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
  currentPlatformAccessToken = currentUsername
    ? (localStorage.getItem(getUserStorageKey('platform_access_token')) || '').trim()
    : '';
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

function setPlatformAccessToken(token) {
  currentPlatformAccessToken = String(token || '').trim();
  if (currentUsername) {
    if (currentPlatformAccessToken) {
      localStorage.setItem(getUserStorageKey('platform_access_token'), currentPlatformAccessToken);
    } else {
      localStorage.removeItem(getUserStorageKey('platform_access_token'));
    }
  }
  updateUserContextUi();
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
  const identity = document.getElementById('userMenuIdentity');
  const tokenHint = document.getElementById('userMenuTokenHint');

  if (badge) {
    badge.textContent = isAuthenticated() ? currentUsername : '未登录';
  }
  if (authActionBtn) {
    authActionBtn.textContent = isAuthenticated() ? '切换账号' : '登录';
  }
  if (logoutBtn) {
    logoutBtn.style.display = isAuthenticated() ? 'inline-flex' : 'none';
  }
  if (identity) {
    identity.textContent = isAuthenticated() ? currentUsername : '未登录';
  }
  if (tokenHint) {
    tokenHint.textContent = currentPlatformAccessToken
      ? 'Platform Token 已缓存，可用于 codetalk / VS Code'
      : 'Platform Token 未配置';
  }
  if (scopeHint) {
    if (!isAuthenticated()) {
      scopeHint.textContent = '请先登录账号，再管理当前用户的系统设置。';
    } else if (currentUserConfigState.using_server_fallback) {
      scopeHint.textContent = '当前登录账号未填写自己的 API，正在使用服务器兜底配置。';
    } else if (currentUserConfigState.has_server_fallback) {
      scopeHint.textContent = '当前登录账号可独立保存自己的 API；留空时会自动回退到服务器兜底配置。';
    } else {
      scopeHint.textContent = '当前登录账号没有可用的服务器兜底 API，请保存自己的系统设置。';
    }
  }
}

function toggleUserMenu(event) {
  event?.stopPropagation();
  const shell = document.getElementById('userMenuShell');
  shell?.classList.toggle('open');
}

function closeUserMenu() {
  document.getElementById('userMenuShell')?.classList.remove('open');
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
  closePlatformTokenModal();
  closeUserMenu();
  clearAuthenticatedUser();
  currentUserConfigState = {
    has_server_fallback: false,
    using_server_fallback: false,
    effective_model: '',
    effective_api_base: '',
    effective_connector_type: 'litellm',
    gzctf_enabled: false,
    agent_state_machine_enabled: true,
    gzctf_status_message: '',
    gzctf_has_cookie: false,
    gzctf_team: null,
  };
  setInputValue('apiKey', '');
  setInputValue('apiBase', '');
  setCheckboxValue('gzctfEnabled', false);
  setInputValue('gzctfUsername', '');
  setInputValue('gzctfPassword', '');
  setInputValue('gzctfGameUrl', '');
  toggleGzctfConfigInputs(false);
  setCheckboxValue('agentStateMachineToggle', true);
  updateGzctfStatusUi({});
  updateUserContextUi();
  renderTasks([]);
  updateTaskStats([]);
  stopTaskRefresh();
  addLog('warn', '已退出登录');
  openAuthModal('login');
}

function openPlatformTokenModal() {
  if (!ensureAuthenticated()) return;
  closeUserMenu();
  setInputValue('platformTokenUsername', currentUsername);
  setInputValue('platformTokenLabel', getInputValue('platformTokenLabel').trim() || 'VS Code codetalk');
  setInputValue('platformTokenPassword', '');
  setInputValue('platformTokenValue', currentPlatformAccessToken || '');
  setPlatformTokenError('');
  document.getElementById('platformTokenModal')?.classList.add('show');
  if (currentPlatformAccessToken) {
    void inspectPlatformToken();
  } else {
    updatePlatformTokenMeta('尚未签发平台 Token');
  }
}

function closePlatformTokenModal(event) {
  if (!event || event.target === document.getElementById('platformTokenModal')) {
    document.getElementById('platformTokenModal')?.classList.remove('show');
  }
}

function setPlatformTokenError(message = '') {
  const errorEl = document.getElementById('platformTokenError');
  const errorText = document.getElementById('platformTokenErrorText');
  if (!errorEl || !errorText) return;
  const normalized = String(message || '').trim();
  if (!normalized) {
    errorEl.style.display = 'none';
    errorText.textContent = '';
    return;
  }
  errorText.textContent = normalized;
  errorEl.style.display = 'flex';
}

function updatePlatformTokenMeta(text) {
  const meta = document.getElementById('platformTokenMeta');
  if (meta) {
    meta.textContent = text;
  }
}

async function platformTokenRequest(path, token, options = {}) {
  const requestToken = String(token || '').trim();
  if (!requestToken) {
    return { success: false, message: '当前没有可用的平台 Token' };
  }
  const isFormData = options.body instanceof FormData;
  const headers = isFormData ? { ...(options.headers || {}) } : {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...headers,
        Authorization: `Bearer ${requestToken}`,
      },
    });
    return await response.json();
  } catch (error) {
    console.error('平台 Token 请求失败:', error);
    return { success: false, message: error.message };
  }
}

async function createPlatformToken() {
  if (!ensureAuthenticated()) return;
  const password = getInputValue('platformTokenPassword').trim();
  const label = getInputValue('platformTokenLabel').trim() || 'VS Code codetalk';
  const createBtn = document.getElementById('platformTokenCreateBtn');
  if (!password) {
    setPlatformTokenError('请输入当前账号密码');
    return;
  }
  setPlatformTokenError('');
  if (createBtn) {
    createBtn.disabled = true;
    createBtn.textContent = '签发中...';
  }
  const result = await apiRequest(`${API_BASE}/auth/tokens`, {
    method: 'POST',
    body: JSON.stringify({
      username: currentUsername,
      password,
      label,
    }),
  });
  if (createBtn) {
    createBtn.disabled = false;
    createBtn.textContent = '签发 Token';
  }
  if (!result.success) {
    setPlatformTokenError(result.message || '平台 Token 签发失败');
    return;
  }
  const token = String(result.data?.token || '').trim();
  setPlatformAccessToken(token);
  setInputValue('platformTokenValue', token);
  setInputValue('platformTokenPassword', '');
  updatePlatformTokenMeta(`已签发 ${result.data?.label || '平台 Token'} · 到期 ${formatDateTime(result.data?.expires_at)}`);
  addLog('ok', '已签发平台 Token');
}

async function inspectPlatformToken() {
  if (!ensureAuthenticated()) return;
  const token = getCurrentPlatformAccessToken() || getInputValue('platformTokenValue').trim();
  if (!token) {
    setPlatformTokenError('当前没有可校验的平台 Token');
    return;
  }
  setPlatformTokenError('');
  const result = await platformTokenRequest('/auth/tokens/current', token, { method: 'GET' });
  if (!result.success) {
    setPlatformTokenError(result.message || '平台 Token 校验失败');
    updatePlatformTokenMeta('平台 Token 校验失败');
    return;
  }
  setPlatformAccessToken(token);
  setInputValue('platformTokenValue', token);
  const user = result.data?.user?.username || currentUsername;
  const label = result.data?.label || result.data?.token_type || 'platform token';
  const scopes = Array.isArray(result.data?.scopes) ? result.data.scopes.join(', ') : '-';
  updatePlatformTokenMeta(`${user} · ${label} · scopes: ${scopes} · 到期 ${formatDateTime(result.data?.expires_at)}`);
}

async function copyPlatformToken() {
  const token = getCurrentPlatformAccessToken() || getInputValue('platformTokenValue').trim();
  if (!token) {
    setPlatformTokenError('当前没有可复制的平台 Token');
    return;
  }
  try {
    await navigator.clipboard.writeText(token);
    setPlatformTokenError('');
    updatePlatformTokenMeta('已复制平台 Token 到剪贴板');
  } catch (error) {
    setPlatformTokenError(`复制失败: ${error.message}`);
  }
}

function clearStoredPlatformToken() {
  setPlatformAccessToken('');
  setInputValue('platformTokenValue', '');
  setPlatformTokenError('');
  updatePlatformTokenMeta('已清空本地缓存的平台 Token');
}

async function revokePlatformToken() {
  if (!ensureAuthenticated()) return;
  const token = getCurrentPlatformAccessToken() || getInputValue('platformTokenValue').trim();
  if (!token) {
    setPlatformTokenError('当前没有可撤销的平台 Token');
    return;
  }
  setPlatformTokenError('');
  const result = await platformTokenRequest('/auth/tokens/revoke', token, { method: 'POST' });
  if (!result.success) {
    setPlatformTokenError(result.message || '平台 Token 撤销失败');
    return;
  }
  clearStoredPlatformToken();
  updatePlatformTokenMeta('平台 Token 已撤销');
  addLog('warn', '已撤销平台 Token');
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

/**
 * 获取多选框当前选中的值列表。
 */
function getSelectedValues(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return [];
  return Array.from(select.selectedOptions).map(opt => opt.value);
}

/**
 * 设置多选框的选中值列表。
 */
function setSelectedValues(selectId, values = []) {
  const select = document.getElementById(selectId);
  if (!select) return false;
  const selectedSet = new Set((Array.isArray(values) ? values : []).map(value => String(value || '').trim()).filter(Boolean));
  Array.from(select.options || []).forEach(option => {
    option.selected = selectedSet.has(option.value);
  });
  return true;
}

function getInputValue(id, fallback = '') {
  const element = document.getElementById(id);
  return element ? String(element.value ?? fallback) : String(fallback);
}

/**
 * Safely writes a value into an optional form control.
 *
 * @param {string} id - DOM id for the target input, textarea, or select.
 * @param {string} value - Value to assign when the target element exists.
 * @returns {boolean} Whether a matching element was found and updated.
 */
function setInputValue(id, value) {
  const element = document.getElementById(id);
  if (!element) {
    return false;
  }
  element.value = value;
  return true;
}

function setCheckboxValue(id, checked) {
  const element = document.getElementById(id);
  if (!element) {
    return false;
  }
  element.checked = Boolean(checked);
  return true;
}

function toggleGzctfConfigInputs(enabled) {
  const isEnabled = Boolean(enabled);
  const section = document.getElementById('gzctfConfigSection');
  const controls = [
    document.getElementById('gzctfUsername'),
    document.getElementById('gzctfPassword'),
    document.getElementById('gzctfGameUrl'),
    document.getElementById('fetchGzctfTeamBtn'),
  ];
  controls.forEach(control => {
    if (control) {
      control.disabled = !isEnabled;
    }
  });
  if (section) {
    section.querySelectorAll('button').forEach(button => {
      button.disabled = !isEnabled;
    });
  }
  if (section) {
    section.classList.toggle('config-section-disabled', !isEnabled);
  }
  const statusEl = document.getElementById('gzctfStatusText');
  if (statusEl) {
    statusEl.textContent = isEnabled
      ? '已启用 GZCTF 设置，保存后生效'
      : '未启用 GZCTF 设置';
  }
  const teamEl = document.getElementById('gzctfTeamText');
  if (teamEl) {
    teamEl.textContent = isEnabled
      ? '保存后可获取队伍信息'
      : '未启用 GZCTF 设置';
  }
}

function applyUserContextHeaders(headers = {}) {
  return {
    ...applyAuthHeaders(headers),
  };
}

function toggleApiKeyVisibility() {
  togglePasswordLikeVisibility('apiKey');
}

function toggleApiBaseVisibility() {
  const input = document.getElementById('apiBase');
  const btn = input?.parentElement?.querySelector('.eye-btn');
  if (!input || !btn) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁';
  }
}

function togglePasswordLikeVisibility(inputId, triggerBtn = null) {
  const input = document.getElementById(inputId);
  const btn = triggerBtn || input?.parentElement?.querySelector('.eye-btn');
  if (!input || !btn) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁';
  }
}

function updateGzctfStatusUi(status = {}) {
  const statusEl = document.getElementById('gzctfStatusText');
  const teamEl = document.getElementById('gzctfTeamText');
  if (!statusEl) return;
  const configured = Boolean(status.gzctf_enabled);
  const hasCookie = Boolean(status.gzctf_has_cookie);
  const message = String(status.gzctf_status_message || '').trim();
  const cookieFile = String(status.gzctf_cookie_file || '').trim();
  const team = status.gzctf_team && typeof status.gzctf_team === 'object' ? status.gzctf_team : null;
  if (!configured) {
    statusEl.textContent = '未启用 GZCTF 设置';
    if (teamEl) teamEl.textContent = '未启用 GZCTF 设置';
    return;
  }
  const cookieText = hasCookie ? 'Cookie 已保存' : 'Cookie 未保存';
  statusEl.textContent = message || `${cookieText}${cookieFile ? ` · ${cookieFile}` : ''}`;
  if (teamEl) {
    if (team && team.name) {
      const parts = [
        `当前队伍：${team.name}`,
        team.id ? `ID ${team.id}` : '',
        team.rank !== null && team.rank !== undefined ? `Rank ${team.rank}` : '',
        team.score !== null && team.score !== undefined ? `Score ${team.score}` : '',
      ].filter(Boolean);
      teamEl.textContent = parts.join(' · ');
    } else {
      teamEl.textContent = '尚未获取队伍信息';
    }
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

/**
 * Format backend timestamps for display in the local Chinese locale.
 *
 * @param {*} value - Timestamp string, epoch seconds, epoch milliseconds, or date-like value.
 * @returns {string} Human-readable local timestamp or a fallback text for invalid input.
 */
function formatDateTime(value) {
  if (!value) return '未知时间';
  const rawValue = String(value).trim();
  const numericValue = Number(rawValue);

  // Backend timestamps may arrive as epoch seconds, so convert small numeric values first.
  const normalizedValue = Number.isFinite(numericValue) && rawValue !== ''
    ? (numericValue < 1000000000000 ? numericValue * 1000 : numericValue)
    : /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(rawValue)
      ? rawValue.replace(' ', 'T')
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
