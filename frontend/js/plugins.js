/**
 * 插件管理模块
 * 
 * 负责插件列表展示、启用/禁用/重载插件、查看插件命令
 */

// ========== 插件管理状态 ==========
let pluginList = [];
let pluginCommands = {};
let isPluginModalOpen = false;

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
  // 添加键盘快捷键
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isPluginModalOpen) {
      closePluginModal();
    }
  });
});

// ========== 模态框控制 ==========

function openPluginModal() {
  const modal = document.getElementById('pluginModal');
  if (!modal) return;
  
  modal.classList.add('active');
  isPluginModalOpen = true;
  
  // 加载插件数据
  loadPluginList();
  loadPluginCommands();
}

function closePluginModal(event) {
  if (event && event.target !== event.currentTarget) return;
  
  const modal = document.getElementById('pluginModal');
  if (!modal) return;
  
  modal.classList.remove('active');
  isPluginModalOpen = false;
}

// ========== 数据加载 ==========

async function loadPluginList() {
  const listContainer = document.getElementById('pluginListContainer');
  if (!listContainer) return;
  
  listContainer.innerHTML = '<div class="plugin-loading">加载中...</div>';
  
  try {
    const resp = await fetch('/api/plugins/list');
    const data = await resp.json();
    
    if (data.success && data.data) {
      pluginList = data.data;
      renderPluginList();
    } else {
      listContainer.innerHTML = `<div class="plugin-error">加载失败: ${data.message || '未知错误'}</div>`;
    }
  } catch (err) {
    listContainer.innerHTML = `<div class="plugin-error">加载失败: ${err.message}</div>`;
  }
}

async function loadPluginCommands() {
  try {
    const resp = await fetch('/api/plugins/commands');
    const data = await resp.json();
    
    if (data.success && data.data) {
      pluginCommands = data.data;
      renderPluginCommands();
    }
  } catch (err) {
    console.error('加载插件命令失败:', err);
  }
}

// ========== 渲染 ==========

function renderPluginList() {
  const container = document.getElementById('pluginListContainer');
  if (!container) return;
  
  // 更新统计信息
  const enabledCount = pluginList.filter(p => p.state === 'enabled').length;
  const disabledCount = pluginList.filter(p => p.state === 'disabled').length;
  const errorCount = pluginList.filter(p => p.state === 'error').length;
  
  const enabledEl = document.getElementById('pluginEnabledCount');
  const disabledEl = document.getElementById('pluginDisabledCount');
  const errorEl = document.getElementById('pluginErrorCount');
  const totalEl = document.getElementById('pluginTotalCount');
  
  if (enabledEl) enabledEl.textContent = enabledCount;
  if (disabledEl) disabledEl.textContent = disabledCount;
  if (errorEl) errorEl.textContent = errorCount;
  if (totalEl) totalEl.textContent = pluginList.length;
  
  if (pluginList.length === 0) {
    container.innerHTML = '<div class="plugin-empty">暂无插件</div>';
    return;
  }
  
  // 按状态排序：已启用 -> 已加载 -> 其他
  const sortedPlugins = [...pluginList].sort((a, b) => {
    const statusOrder = { 'enabled': 0, 'loaded': 1, 'disabled': 2, 'error': 3 };
    return (statusOrder[a.state] || 4) - (statusOrder[b.state] || 4);
  });
  
  container.innerHTML = sortedPlugins.map(plugin => `
    <div class="plugin-item ${plugin.state}" data-name="${escapeHtml(plugin.name)}">
      <div class="plugin-header">
        <div class="plugin-info">
          <div class="plugin-name">
            ${escapeHtml(plugin.name)}
            <span class="plugin-version">v${escapeHtml(plugin.version || '1.0.0')}</span>
            ${plugin.enabled ? '<span class="plugin-badge enabled">启用</span>' : ''}
            ${plugin.state === 'error' ? '<span class="plugin-badge error">错误</span>' : ''}
          </div>
          <div class="plugin-desc">${escapeHtml(plugin.description || '无描述')}</div>
          <div class="plugin-meta">
            <span>作者: ${escapeHtml(plugin.author || '未知')}</span>
            <span>优先级: ${plugin.priority || 100}</span>
            <span class="plugin-state ${plugin.state}">${getStateLabel(plugin.state)}</span>
          </div>
          ${plugin.error ? `<div class="plugin-error-msg">错误: ${escapeHtml(plugin.error)}</div>` : ''}
          ${plugin.dependencies && plugin.dependencies.length > 0 ? `
            <div class="plugin-deps">依赖: ${plugin.dependencies.map(d => escapeHtml(d)).join(', ')}</div>
          ` : ''}
        </div>
        <div class="plugin-actions">
          ${plugin.state === 'enabled' ? `
            <button class="plugin-btn disable" onclick="disablePlugin('${escapeHtml(plugin.name)}')" title="禁用">
              禁用
            </button>
          ` : `
            <button class="plugin-btn enable" onclick="enablePlugin('${escapeHtml(plugin.name)}')" title="启用">
              启用
            </button>
          `}
          <button class="plugin-btn reload" onclick="reloadPlugin('${escapeHtml(plugin.name)}')" title="重新加载">
            重载
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

function renderPluginCommands() {
  const container = document.getElementById('pluginCommandsContainer');
  if (!container) return;
  
  const commands = Object.entries(pluginCommands);
  
  if (commands.length === 0) {
    container.innerHTML = '<div class="plugin-empty">暂无插件命令</div>';
    return;
  }
  
  container.innerHTML = commands.map(([name, info]) => `
    <div class="plugin-cmd-item">
      <div class="plugin-cmd-name">${escapeHtml(name)}</div>
      <div class="plugin-cmd-plugin">${escapeHtml(info.plugin || 'unknown')}</div>
      <div class="plugin-cmd-desc">${escapeHtml(info.description || '无描述')}</div>
      <div class="plugin-cmd-usage">用法: ${escapeHtml(info.usage || name)}</div>
    </div>
  `).join('');
}

// ========== 插件操作 ==========

async function enablePlugin(name) {
  try {
    const resp = await fetch(`/api/plugins/${encodeURIComponent(name)}/enable`, {
      method: 'POST'
    });
    const data = await resp.json();
    
    if (data.success) {
      showToast(`插件 ${name} 已启用`);
      loadPluginList();
      loadPluginCommands();
    } else {
      showToast(`启用失败: ${data.message}`, 'error');
    }
  } catch (err) {
    showToast(`启用失败: ${err.message}`, 'error');
  }
}

async function disablePlugin(name) {
  try {
    const resp = await fetch(`/api/plugins/${encodeURIComponent(name)}/disable`, {
      method: 'POST'
    });
    const data = await resp.json();
    
    if (data.success) {
      showToast(`插件 ${name} 已禁用`);
      loadPluginList();
      loadPluginCommands();
    } else {
      showToast(`禁用失败: ${data.message}`, 'error');
    }
  } catch (err) {
    showToast(`禁用失败: ${err.message}`, 'error');
  }
}

async function reloadPlugin(name) {
  if (!confirm(`确定要重新加载插件 ${name} 吗？`)) return;
  
  try {
    const resp = await fetch(`/api/plugins/${encodeURIComponent(name)}/reload`, {
      method: 'POST'
    });
    const data = await resp.json();
    
    if (data.success) {
      showToast(`插件 ${name} 已重新加载`);
      loadPluginList();
      loadPluginCommands();
    } else {
      showToast(`重载失败: ${data.message}`, 'error');
    }
  } catch (err) {
    showToast(`重载失败: ${err.message}`, 'error');
  }
}

// ========== 标签切换 ==========

function switchPluginTab(tab, btn) {
  // 更新按钮状态
  const buttons = document.querySelectorAll('.plugin-tab');
  buttons.forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  
  // 切换面板
  const listPanel = document.getElementById('pluginListPanel');
  const cmdPanel = document.getElementById('pluginCommandsPanel');
  
  if (tab === 'list') {
    if (listPanel) listPanel.style.display = 'block';
    if (cmdPanel) cmdPanel.style.display = 'none';
  } else {
    if (listPanel) listPanel.style.display = 'none';
    if (cmdPanel) cmdPanel.style.display = 'block';
  }
}

// ========== 工具函数 ==========

function getStateLabel(state) {
  const labels = {
    'unloaded': '未加载',
    'loading': '加载中',
    'loaded': '已加载',
    'enabling': '启用中',
    'enabled': '已启用',
    'disabled': '已禁用',
    'error': '错误'
  };
  return labels[state] || state;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, type = 'success') {
  // 复用已有的 toast 功能
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
  } else {
    alert(message);
  }
}

// ========== 导出全局函数 ==========
window.openPluginModal = openPluginModal;
window.closePluginModal = closePluginModal;
window.enablePlugin = enablePlugin;
window.disablePlugin = disablePlugin;
window.reloadPlugin = reloadPlugin;
window.switchPluginTab = switchPluginTab;
