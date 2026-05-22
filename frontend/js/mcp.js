// ═══════════════════════════════════════════════════════════════
// 🔌 MCP 服务器配置管理
// ═══════════════════════════════════════════════════════════════

const MCP_CONFIG_KEY = 'pofp_mcp_servers';

/**
 * HTML 转义
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 默认 MCP 服务器配置示例
const DEFAULT_MCP_SERVERS = [
  {
    name: 'filesystem',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp/workspace'],
    enabled: true
  },
  {
    name: 'fetch',
    transport: 'stdio',
    command: 'uvx',
    args: ['mcp-server-fetch'],
    enabled: true
  }
];

/**
 * 获取 MCP 服务器配置（从 localStorage）
 */
function getMCPServers() {
  try {
    const saved = localStorage.getItem(MCP_CONFIG_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load MCP config:', e);
  }
  return [];
}

/**
 * 保存 MCP 服务器配置到 localStorage
 */
function saveMCPServers(servers) {
  try {
    localStorage.setItem(MCP_CONFIG_KEY, JSON.stringify(servers));
    return true;
  } catch (e) {
    console.error('Failed to save MCP config:', e);
    return false;
  }
}

/**
 * 添加新的 MCP 服务器
 */
function addMCPServer(server) {
  const servers = getMCPServers();
  // 检查名称是否重复
  if (servers.some(s => s.name === server.name)) {
    return { success: false, message: '服务器名称已存在' };
  }
  servers.push({
    ...server,
    enabled: true
  });
  saveMCPServers(servers);
  return { success: true };
}

/**
 * 更新 MCP 服务器配置
 */
function updateMCPServer(name, updates) {
  const servers = getMCPServers();
  const index = servers.findIndex(s => s.name === name);
  if (index === -1) {
    return { success: false, message: '服务器不存在' };
  }
  servers[index] = { ...servers[index], ...updates };
  saveMCPServers(servers);
  return { success: true };
}

/**
 * 删除 MCP 服务器
 */
function deleteMCPServer(name) {
  const servers = getMCPServers();
  const filtered = servers.filter(s => s.name !== name);
  if (filtered.length === servers.length) {
    return { success: false, message: '服务器不存在' };
  }
  saveMCPServers(filtered);
  return { success: true };
}

/**
 * 切换 MCP 服务器启用状态
 */
function toggleMCPServer(name) {
  const servers = getMCPServers();
  const server = servers.find(s => s.name === name);
  if (!server) {
    return { success: false, message: '服务器不存在' };
  }
  server.enabled = !server.enabled;
  saveMCPServers(servers);
  return { success: true, enabled: server.enabled };
}

/**
 * 打开 MCP 配置模态框
 */
function openMCPModal() {
  const modal = document.getElementById('mcpModal');
  if (modal) {
    renderMCPServerList();
    modal.classList.add('show');
  }
}

/**
 * 从 MCP 模态框刷新用户托管服务器状态
 */
async function refreshUserMCPServerStatusFromMCP(serverId) {
  try {
    const token = localStorage.getItem('pofp_auth_token');
    const response = await fetch(`/api/user-mcp/${serverId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('刷新失败');
    addLog('info', `托管服务器 ${serverId} 状态已刷新`);
    renderMCPServerList();
  } catch (err) {
    addLog('err', `刷新托管服务器状态失败: ${err.message}`);
  }
}

/**
 * 从 MCP 模态框删除用户托管服务器记录
 */
async function deleteUserMCPServerFromMCP(serverId) {
  if (!confirm('确定要删除这个 Server 记录吗？（这不会停止客户端运行的脚本）')) return;
  try {
    const token = localStorage.getItem('pofp_auth_token');
    const response = await fetch(`/api/user-mcp/${serverId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('删除失败');
    addLog('ok', 'Server 记录已删除');
    renderMCPServerList();
  } catch (err) {
    addLog('err', `删除托管服务器失败: ${err.message}`);
  }
}

/**
 * 关闭 MCP 配置模态框
 */
function closeMCPModal(event) {
  if (!event || event.target === document.getElementById('mcpModal')) {
    document.getElementById('mcpModal')?.classList.remove('show');
  }
}

/**
 * 渲染 MCP 服务器列表（包含本地配置 + 用户托管）
 */
async function renderMCPServerList() {
  const container = document.getElementById('mcpServerList');
  if (!container) return;
  
  container.innerHTML = '<div class="mcp-empty"><div class="mcp-empty-icon">⏳</div><div class="mcp-empty-text">加载中...</div></div>';
  
  const servers = getMCPServers();
  
  let hostedServers = [];
  try {
    const token = localStorage.getItem('pofp_auth_token');
    if (token) {
      const response = await fetch('/api/user-mcp', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const result = await response.json();
        hostedServers = result.data?.servers || [];
      }
    }
  } catch (e) {
    console.error('Failed to load hosted MCP servers:', e);
  }
  
  const hasLocal = servers.length > 0;
  const hasHosted = hostedServers.length > 0;
  
  if (!hasLocal && !hasHosted) {
    container.innerHTML = `
      <div class="mcp-empty">
        <div class="mcp-empty-icon">🔌</div>
        <div class="mcp-empty-text">暂无 MCP 服务器配置</div>
        <div class="mcp-empty-hint">点击下方按钮添加服务器，或切换到“托管”下载本地脚本</div>
      </div>
    `;
    return;
  }
  
  let html = '';
  
  if (hasLocal) {
    html += `<div class="mcp-section-title">本地配置</div>`;
    html += servers.map(server => `
      <div class="mcp-server-card ${server.enabled ? '' : 'disabled'}">
        <div class="mcp-server-header">
          <div class="mcp-server-info">
            <div class="mcp-server-name">${escapeHtml(server.name)}</div>
            <div class="mcp-server-type">${escapeHtml(server.transport)} • ${escapeHtml(server.command || server.url || 'N/A')}</div>
          </div>
          <div class="mcp-server-toggle">
            <label class="mcp-toggle">
              <input type="checkbox" ${server.enabled ? 'checked' : ''} onchange="onMCPServerToggle('${escapeHtml(server.name)}')">
              <span class="mcp-toggle-slider"></span>
            </label>
          </div>
        </div>
        <div class="mcp-server-details">
          <div class="mcp-detail-row">
            <span class="mcp-detail-label">传输方式:</span>
            <span class="mcp-detail-value">${escapeHtml(server.transport)}</span>
          </div>
          ${server.transport === 'stdio' ? `
            <div class="mcp-detail-row">
              <span class="mcp-detail-label">命令:</span>
              <span class="mcp-detail-value">${escapeHtml(server.command)}</span>
            </div>
            <div class="mcp-detail-row">
              <span class="mcp-detail-label">参数:</span>
              <span class="mcp-detail-value">${(server.args || []).map(a => escapeHtml(a)).join(' ')}</span>
            </div>
          ` : `
            <div class="mcp-detail-row">
              <span class="mcp-detail-label">URL:</span>
              <span class="mcp-detail-value">${escapeHtml(server.url)}</span>
            </div>
          `}
        </div>
        <div class="mcp-server-actions">
          <button class="mcp-btn mcp-btn-edit" onclick="onMCPServerEdit('${escapeHtml(server.name)}')">编辑</button>
          <button class="mcp-btn mcp-btn-delete" onclick="onMCPServerDelete('${escapeHtml(server.name)}')">删除</button>
        </div>
      </div>
    `).join('');
  }
  
  if (hasHosted) {
    html += `<div class="mcp-section-title">用户自托管 <span style="font-size:12px;color:var(--text-muted);font-weight:400">（自动拉取）</span></div>`;
    html += hostedServers.map(server => `
      <div class="mcp-server-card ${server.is_online ? 'online' : 'offline'} hosted">
        <div class="mcp-server-header">
          <div class="mcp-server-info">
            <div class="mcp-server-name">
              ${escapeHtml(server.name)}
              <span class="mcp-status-badge ${server.is_online ? 'online' : 'offline'}">
                ${server.is_online ? '🟢 在线' : '🔴 离线'}
              </span>
            </div>
            <div class="mcp-server-type">${escapeHtml(server.transport)} • ${escapeHtml(server.url || server.command || 'N/A')}</div>
          </div>
        </div>
        <div class="mcp-server-details">
          <div class="mcp-detail-row">
            <span class="mcp-detail-label">状态:</span>
            <span class="mcp-detail-value">${escapeHtml(server.status)}${server.status_message ? ' - ' + escapeHtml(server.status_message) : ''}</span>
          </div>
          ${server.url ? `
            <div class="mcp-detail-row">
              <span class="mcp-detail-label">URL:</span>
              <span class="mcp-detail-value">${escapeHtml(server.url)}</span>
            </div>
          ` : ''}
          ${server.pwd ? `
            <div class="mcp-detail-row">
              <span class="mcp-detail-label">工作目录:</span>
              <span class="mcp-detail-value">${escapeHtml(server.pwd)}</span>
            </div>
          ` : ''}
          <div class="mcp-detail-row">
            <span class="mcp-detail-label">最后心跳:</span>
            <span class="mcp-detail-value">${server.last_heartbeat ? new Date(server.last_heartbeat * 1000).toLocaleString('zh-CN') : '-'}</span>
          </div>
        </div>
        <div class="mcp-server-actions">
          <button class="mcp-btn mcp-btn-edit" onclick="refreshUserMCPServerStatusFromMCP('${escapeHtml(server.id)}')">刷新状态</button>
          <button class="mcp-btn mcp-btn-delete" onclick="deleteUserMCPServerFromMCP('${escapeHtml(server.id)}')">删除记录</button>
        </div>
      </div>
    `).join('');
  }
  
  container.innerHTML = html;
}

/**
 * 切换服务器启用状态
 */
function onMCPServerToggle(name) {
  const result = toggleMCPServer(name);
  if (result.success) {
    renderMCPServerList();
    addLog('info', `MCP 服务器 "${name}" 已${result.enabled ? '启用' : '禁用'}`);
  }
}

/**
 * 删除服务器
 */
function onMCPServerDelete(name) {
  if (!confirm(`确定要删除 MCP 服务器 "${name}" 吗？`)) {
    return;
  }
  const result = deleteMCPServer(name);
  if (result.success) {
    renderMCPServerList();
    addLog('ok', `MCP 服务器 "${name}" 已删除`);
  } else {
    addLog('err', result.message);
  }
}

/**
 * 编辑服务器（打开编辑表单）
 */
let editingMCPServer = null;

function onMCPServerEdit(name) {
  const servers = getMCPServers();
  const server = servers.find(s => s.name === name);
  if (!server) return;
  
  editingMCPServer = name;
  
  // 填充表单
  document.getElementById('mcpEditName').value = server.name;
  document.getElementById('mcpEditTransport').value = server.transport;
  document.getElementById('mcpEditCommand').value = server.command || '';
  document.getElementById('mcpEditArgs').value = (server.args || []).join(' ');
  document.getElementById('mcpEditUrl').value = server.url || '';
  
  // 显示/隐藏相关字段
  updateMCPEditFormVisibility();
  
  // 切换显示编辑表单
  document.getElementById('mcpAddForm').style.display = 'block';
  document.getElementById('mcpFormTitle').textContent = '编辑 MCP 服务器';
  document.getElementById('mcpSaveBtn').textContent = '保存修改';
}

/**
 * 显示添加服务器表单
 */
function showMCPAddForm() {
  editingMCPServer = null;
  
  // 清空表单
  document.getElementById('mcpEditName').value = '';
  document.getElementById('mcpEditTransport').value = 'stdio';
  document.getElementById('mcpEditCommand').value = '';
  document.getElementById('mcpEditArgs').value = '';
  document.getElementById('mcpEditUrl').value = '';
  
  updateMCPEditFormVisibility();
  
  document.getElementById('mcpAddForm').style.display = 'block';
  document.getElementById('mcpFormTitle').textContent = '添加 MCP 服务器';
  document.getElementById('mcpSaveBtn').textContent = '添加服务器';
}

/**
 * 隐藏添加/编辑表单
 */
function hideMCPAddForm() {
  document.getElementById('mcpAddForm').style.display = 'none';
  editingMCPServer = null;
}

/**
 * 根据传输方式显示/隐藏字段
 */
function updateMCPEditFormVisibility() {
  const transport = document.getElementById('mcpEditTransport').value;
  const stdioFields = document.getElementById('mcpStdioFields');
  const sseFields = document.getElementById('mcpSseFields');
  
  if (transport === 'stdio') {
    stdioFields.style.display = 'block';
    sseFields.style.display = 'none';
  } else {
    stdioFields.style.display = 'none';
    sseFields.style.display = 'block';
  }
}

/**
 * 保存 MCP 服务器配置
 */
function onMCPServerSave() {
  const name = document.getElementById('mcpEditName').value.trim();
  const transport = document.getElementById('mcpEditTransport').value;
  
  if (!name) {
    addLog('err', '请输入服务器名称');
    return;
  }
  
  let server = {
    name,
    transport,
    enabled: true
  };
  
  if (transport === 'stdio') {
    const command = document.getElementById('mcpEditCommand').value.trim();
    const argsStr = document.getElementById('mcpEditArgs').value.trim();
    
    if (!command) {
      addLog('err', '请输入命令');
      return;
    }
    
    server.command = command;
    server.args = argsStr ? argsStr.split(/\s+/) : [];
  } else {
    const url = document.getElementById('mcpEditUrl').value.trim();
    
    if (!url) {
      addLog('err', '请输入 SSE URL');
      return;
    }
    
    server.url = url;
  }
  
  let result;
  if (editingMCPServer) {
    // 编辑模式
    if (editingMCPServer !== name) {
      // 名称改变了，需要删除旧的，添加新的
      deleteMCPServer(editingMCPServer);
    }
    result = addMCPServer(server);
    if (result.success) {
      addLog('ok', `MCP 服务器 "${name}" 已更新`);
    }
  } else {
    // 添加模式
    result = addMCPServer(server);
    if (result.success) {
      addLog('ok', `MCP 服务器 "${name}" 已添加`);
    }
  }
  
  if (!result.success) {
    addLog('err', result.message);
    return;
  }
  
  hideMCPAddForm();
  renderMCPServerList();
}

/**
 * 加载示例配置
 */
function loadMCPSampleConfig() {
  if (!confirm('这将覆盖现有的 MCP 服务器配置，确定继续吗？')) {
    return;
  }
  
  saveMCPServers(DEFAULT_MCP_SERVERS);
  renderMCPServerList();
  addLog('ok', '已加载示例 MCP 配置');
}

/**
 * 导出 MCP 配置
 */
function exportMCPConfig() {
  const servers = getMCPServers();
  const dataStr = JSON.stringify(servers, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mcp-servers.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  addLog('ok', 'MCP 配置已导出');
}

/**
 * 导入 MCP 配置
 */
function importMCPConfig(input) {
  const file = input.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const servers = JSON.parse(e.target.result);
      if (!Array.isArray(servers)) {
        throw new Error('配置文件格式错误');
      }
      
      saveMCPServers(servers);
      renderMCPServerList();
      addLog('ok', `已导入 ${servers.length} 个 MCP 服务器配置`);
    } catch (err) {
      addLog('err', `导入失败: ${err.message}`);
    }
  };
  reader.readAsText(file);
  input.value = '';
}
