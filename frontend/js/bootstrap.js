// ═══════════════════════════════════════════════════════════════
// 🚀 初始化入口
// ═══════════════════════════════════════════════════════════════

async function loadCurrentUserState({ forceRefreshTasks = false } = {}) {
  if (!isAuthenticated()) {
    currentUserConfigState = {
      has_server_fallback: false,
      using_server_fallback: false,
      effective_model: '',
      effective_api_base: '',
      effective_connector_type: 'litellm',
    };
    document.getElementById('apiKey').value = '';
    document.getElementById('apiBase').value = '';
    updateUserContextUi();
    if (forceRefreshTasks) {
      renderTasks([]);
      updateTaskStats([]);
    }
    return;
  }

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
      document.getElementById('apiKey').value = result.data.api_key || '';
      document.getElementById('apiBase').value = result.data.api_base || '';
      
      // 设置连接器类型
      const connectorType = result.data.connector_type || 'litellm';
      const connectorSelect = document.getElementById('connectorType');
      if (connectorSelect) {
        connectorSelect.value = connectorType;
        onConnectorTypeChange();  // 更新提示文本
      }
      
      document.getElementById('temperatureInput').value = result.data.temperature ?? '';
      document.getElementById('maxTokensInput').value = result.data.max_tokens ?? '';
      document.getElementById('timeoutInput').value = result.data.timeout ?? 60;
      document.getElementById('maxRoundsInput').value = result.data.max_rounds ?? 50;
      document.getElementById('maxContextCharsInput').value = result.data.max_context_chars ?? 14000;
      updateUserContextUi();

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
    document.getElementById('apiKey').value = savedKey || '';
    document.getElementById('apiBase').value = savedBase || '';
    if (savedConnector) {
      const connectorSelect = document.getElementById('connectorType');
      if (connectorSelect) {
        connectorSelect.value = savedConnector;
        onConnectorTypeChange();
      }
    }
  }

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
