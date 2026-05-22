// ═══════════════════════════════════════════════════════════════
// 🚀 初始化入口
// ═══════════════════════════════════════════════════════════════

/**
 * Load the authenticated user's saved runtime configuration into the UI.
 *
 * @param {{ forceRefreshTasks?: boolean }} options - Optional refresh behavior for task data.
 * @returns {Promise<void>} Resolves after config state and optional task state are refreshed.
 */
async function loadCurrentUserState({ forceRefreshTasks = false } = {}) {
  // Reset all config-bound UI state immediately when no authenticated user exists.
  if (!isAuthenticated()) {
    currentUserConfigState = {
      has_server_fallback: false,
      using_server_fallback: false,
      effective_model: '',
      effective_api_base: '',
      effective_connector_type: 'litellm',
    };
    setInputValue('apiKey', '');
    setInputValue('apiBase', '');
    const showTerminalToggle = document.getElementById('showTerminalOutputToggle');
    if (showTerminalToggle) {
      showTerminalToggle.checked = true;
    }
    updateUserContextUi();
    if (forceRefreshTasks) {
      renderTasks([]);
      updateTaskStats([]);
    }
    return;
  }

  // Fetch the saved backend config and hydrate the settings modal with server-authoritative values.
  try {
    const result = await apiRequest(`${API_BASE}/config`);
    if (result.success && result.data) {
      currentUserConfigState = {
        has_server_fallback: Boolean(result.data.has_server_fallback),
        using_server_fallback: Boolean(result.data.using_server_fallback),
        effective_model: result.data.effective_model || '',
        effective_api_base: result.data.effective_api_base || '',
        effective_connector_type: result.data.connector_type || 'litellm',
      };
      setInputValue('apiKey', result.data.api_key || '');
      setInputValue('apiBase', result.data.api_base || '');
      
      // 设置连接器类型
      const connectorType = result.data.connector_type || 'litellm';
      const connectorSelect = document.getElementById('connectorType');
      if (connectorSelect) {
        connectorSelect.value = connectorType;
        onConnectorTypeChange();  // 更新提示文本
      }
      
      setInputValue('temperatureInput', result.data.temperature ?? '');
      setInputValue('maxTokensInput', result.data.max_tokens ?? '');
      setInputValue('timeoutInput', result.data.timeout ?? 60);
      setInputValue('maxRoundsInput', result.data.max_rounds ?? 50);
      setInputValue('maxContextCharsInput', result.data.max_context_chars ?? 14000);
      const showTerminalToggle = document.getElementById('showTerminalOutputToggle');
      if (showTerminalToggle) {
        showTerminalToggle.checked = result.data.show_terminal_output !== false;
      }
      updateUserContextUi();

      // Refresh the model selector only when a usable API config exists for the current user.
      if (hasUsableApiConfig()) {
        await fetchModels();
        const preferredModel = result.data.model || result.data.effective_model;
        if (preferredModel) {
          setConfiguredModelValue(preferredModel);
          document.getElementById('modelMeta').textContent = currentUserConfigState.using_server_fallback
            ? `当前使用服务器兜底模型: ${preferredModel}`
            : `当前默认模型: ${preferredModel}`;
        }
      } else {
        document.getElementById('modelMeta').textContent = '请先填写用户 API，或启用服务器兜底 API';
      }

      addLog('ok', `⚙️ 已加载账号 ${getCurrentUsername()} 的配置`);
    }
  } catch (error) {
    // Fall back to local cached values when the backend is temporarily unreachable.
    currentUserConfigState = {
      has_server_fallback: false,
      using_server_fallback: false,
      effective_model: '',
      effective_api_base: '',
      effective_connector_type: 'litellm',
    };
    updateUserContextUi();
    addLog('warn', '⚙️ 无法连接后端，使用本地缓存');
    const savedKey = localStorage.getItem(getUserStorageKey('ctf_api_key'));
    const savedBase = localStorage.getItem(getUserStorageKey('ctf_api_base'));
    const savedConnector = localStorage.getItem(getUserStorageKey('ctf_connector_type'));
    const savedShowTerminalOutput = localStorage.getItem(getUserStorageKey('ctf_show_terminal_output'));
    setInputValue('apiKey', savedKey || '');
    setInputValue('apiBase', savedBase || '');
    if (savedConnector) {
      const connectorSelect = document.getElementById('connectorType');
      if (connectorSelect) {
        connectorSelect.value = savedConnector;
        onConnectorTypeChange();
      }
    }
    const showTerminalToggle = document.getElementById('showTerminalOutputToggle');
    if (showTerminalToggle && savedShowTerminalOutput !== null) {
      showTerminalToggle.checked = savedShowTerminalOutput !== 'false';
    }
  }

  // Refresh task state after config hydration when the caller requested it.
  if (forceRefreshTasks) {
    await refreshTasks();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // 初始化主题
  initTheme();
  
  addLog('sys', 'POFP Agent 已启动');
  addLog('info', '界面已加载，等待指令...');

  updateUserContextUi();
  onTaskTypeChange();
  onTaskModeChange();
  onEditTaskModeChange();
  onTaskExecutionModeChange();
  onEditTaskExecutionModeChange();

  try {
    const authenticated = await bootstrapAuthState();
    if (authenticated) {
      await loadCurrentUserState();
      await loadSkills();
      await refreshTasks();
    } else {
      renderTasks([]);
      updateTaskStats([]);
    }
  } catch (error) {
    console.error('初始化认证或配置失败:', error);
  }

  const taskGrid = document.getElementById('taskGrid');
  taskGrid?.addEventListener('pointerdown', pauseTaskRefresh);
  taskGrid?.addEventListener('dragstart', pauseTaskRefresh);
  taskGrid?.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.task-log-area, .task-card, .task-grid')) {
      pauseTaskRefresh();
    }
  });
  window.addEventListener('pointerup', resumeTaskRefresh);
  window.addEventListener('dragend', resumeTaskRefresh);
  window.addEventListener('blur', resumeTaskRefresh);

  if (isAuthenticated()) {
    startTaskRefresh();
  }
});

// 全局错误捕获
window.addEventListener('error', (e) => {
  console.error('💥 Agent 运行时错误:', e.message);
  if (typeof addLog === 'function') {
    addLog('err', `💥 ${e.message} @${e.filename}:${e.lineno}`);
  }
});
