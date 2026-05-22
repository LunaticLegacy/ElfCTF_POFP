// ═══════════════════════════════════════════════════════════════
// 👤 用户自托管 MCP Server 管理
// ═══════════════════════════════════════════════════════════════

/**
 * 打开用户自托管 MCP Server 管理模态框
 */
function openUserMCPModal() {
  const modal = document.getElementById('userMcpModal');
  if (modal) {
    renderUserMCPServerList();
    renderTempMCPServerList();
    modal.classList.add('show');
  }
}

/**
 * 关闭用户自托管 MCP Server 管理模态框
 */
function closeUserMCPModal(event) {
  if (!event || event.target === document.getElementById('userMcpModal')) {
    document.getElementById('userMcpModal')?.classList.remove('show');
  }
}

/**
 * 渲染用户自托管 Server 列表
 */
async function renderUserMCPServerList() {
  const container = document.getElementById('userMcpServerList');
  if (!container) return;

  try {
    const token = localStorage.getItem('pofp_auth_token');
    const response = await fetch('/api/user-mcp', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('获取列表失败');
    }

    const result = await response.json();
    const servers = result.data?.servers || [];

    if (servers.length === 0) {
      container.innerHTML = `
        <div class="mcp-empty">
          <div class="mcp-empty-icon">💻</div>
          <div class="mcp-empty-text">暂无自托管 Server</div>
          <div class="mcp-empty-hint">从上方下载脚本并在本地运行</div>
        </div>
      `;
      return;
    }

    container.innerHTML = servers.map(server => `
      <div class="mcp-server-card ${server.is_online ? 'online' : 'offline'}">
        <div class="mcp-server-header">
          <div class="mcp-server-info">
            <div class="mcp-server-name">
              ${escapeHtml(server.name)}
              <span class="mcp-status-badge ${server.is_online ? 'online' : 'offline'}">
                ${server.is_online ? '🟢 在线' : '🔴 离线'}
              </span>
            </div>
            <div class="mcp-server-type">${escapeHtml(server.transport)} • ${escapeHtml(server.id.substring(0, 8))}</div>
          </div>
        </div>
        <div class="mcp-server-details">
          <div class="mcp-detail-row">
            <span class="mcp-detail-label">描述:</span>
            <span class="mcp-detail-value">${escapeHtml(server.description)}</span>
          </div>
          <div class="mcp-detail-row">
            <span class="mcp-detail-label">传输:</span>
            <span class="mcp-detail-value">${server.transport}</span>
          </div>
          ${server.url ? `
            <div class="mcp-detail-row">
              <span class="mcp-detail-label">URL:</span>
              <span class="mcp-detail-value">${escapeHtml(server.url)}</span>
            </div>
          ` : ''}
          <div class="mcp-detail-row">
            <span class="mcp-detail-label">创建时间:</span>
            <span class="mcp-detail-value">${formatTime(server.created_at)}</span>
          </div>
          ${server.last_heartbeat ? `
            <div class="mcp-detail-row">
              <span class="mcp-detail-label">最后心跳:</span>
              <span class="mcp-detail-value">${formatTime(server.last_heartbeat)}</span>
            </div>
          ` : ''}
        </div>
        <div class="mcp-server-actions">
          <button class="mcp-btn mcp-btn-edit" onclick="refreshUserMCPServerStatus('${server.id}')">刷新状态</button>
          <button class="mcp-btn mcp-btn-delete" onclick="deleteUserMCPServer('${server.id}')">删除</button>
        </div>
      </div>
    `).join('');

  } catch (err) {
    container.innerHTML = `
      <div class="mcp-empty">
        <div class="mcp-empty-icon">⚠️</div>
        <div class="mcp-empty-text">加载失败</div>
        <div class="mcp-empty-hint">${escapeHtml(err.message)}</div>
      </div>
    `;
  }
}

/**
 * 渲染服务端生成的临时 Server 列表
 */
async function renderTempMCPServerList() {
  const container = document.getElementById('tempMcpServerList');
  if (!container) return;

  try {
    const token = localStorage.getItem('pofp_auth_token');
    const response = await fetch('/api/temp-mcp', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('获取列表失败');
    }

    const result = await response.json();
    const servers = result.data?.servers || [];

    if (servers.length === 0) {
      container.innerHTML = `
        <div class="mcp-empty" style="padding: 30px 20px;">
          <div class="mcp-empty-icon">📦</div>
          <div class="mcp-empty-text">暂无可用脚本</div>
          <div class="mcp-empty-hint">下载默认脚本到本地运行，服务端可反向连接</div>
          <div style="margin-top: 16px; display: flex; gap: 10px; justify-content: center;">
            <button class="mcp-btn mcp-btn-primary" onclick="downloadDefaultMCPScript('stdio')">
              ⬇️ 下载 stdio 脚本
            </button>
            <button class="mcp-btn mcp-btn-edit" onclick="downloadDefaultMCPScript('sse')">
              ⬇️ 下载 SSE 脚本
            </button>
          </div>
          <div style="margin-top: 12px; font-size: 0.8rem; color: var(--text-muted);">
            💡 或使用 <a href="#" onclick="openCreateTempMCPModal(); return false;" style="color: var(--primary);">临时 MCP 管理</a> 创建自定义脚本
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = servers.map(server => `
      <div class="mcp-server-card">
        <div class="mcp-server-header">
          <div class="mcp-server-info">
            <div class="mcp-server-name">${escapeHtml(server.name)}</div>
            <div class="mcp-server-type">TTL: ${Math.floor(server.time_to_live / 60)}分钟 • 剩余执行: ${server.remaining_executions}</div>
          </div>
        </div>
        <div class="mcp-server-details" style="padding: 10px 0;">
          <div class="mcp-detail-row">
            <span class="mcp-detail-label">描述:</span>
            <span class="mcp-detail-value">${escapeHtml(server.description)}</span>
          </div>
          <div class="mcp-detail-row">
            <span class="mcp-detail-label">工具数:</span>
            <span class="mcp-detail-value">${server.tools?.length || 0}</span>
          </div>
        </div>
        <div class="mcp-server-actions">
          <button class="mcp-btn mcp-btn-edit" onclick="downloadUserMCPScript('${server.id}', 'stdio')">下载 (stdio)</button>
          <button class="mcp-btn mcp-btn-primary" onclick="downloadUserMCPScript('${server.id}', 'sse')">下载 (SSE)</button>
        </div>
      </div>
    `).join('');

  } catch (err) {
    container.innerHTML = `
      <div class="mcp-empty" style="padding: 20px;">
        <div class="mcp-empty-icon">⚠️</div>
        <div class="mcp-empty-text">加载失败</div>
        <div class="mcp-empty-hint">${escapeHtml(err.message)}</div>
      </div>
    `;
  }
}

/**
 * 下载用户自托管 MCP 脚本
 */
async function downloadUserMCPScript(serverId, mode) {
  try {
    const token = localStorage.getItem('pofp_auth_token');
    const port = mode === 'sse' ? '8080' : '';
    const url = `/api/user-mcp/${serverId}/download?mode=${mode}${port ? '&port=' + port : ''}`;
    
    // 使用 fetch 获取文件内容
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('下载失败');
    }

    // 获取文件名
    const contentDisposition = response.headers.get('content-disposition');
    let filename = `mcp_server_${mode}.py`;
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="(.+)"/);
      if (match) {
        filename = match[1];
      }
    }

    // 下载文件
    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);

    addLog('ok', `已下载 ${mode} 模式脚本: ${filename}`);
    
    // 显示提示
    alert(`脚本已下载！\n\n使用方法:\n1. 运行: python3 ${filename}\n2. 脚本会自动向服务端注册\n3. 在"已托管 Server"标签页查看状态`);

  } catch (err) {
    addLog('err', `下载脚本失败: ${err.message}`);
  }
}

/**
 * 下载默认 MCP 脚本（当没有临时 Server 时）
 */
async function downloadDefaultMCPScript(mode) {
  try {
    const token = localStorage.getItem('pofp_auth_token');
    // 使用一个默认的 server ID，后端会生成默认脚本
    const serverId = 'default';
    const port = mode === 'sse' ? '8080' : '';
    const url = `/api/user-mcp/${serverId}/download?mode=${mode}${port ? '&port=' + port : ''}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('下载失败');
    }

    // 获取文件名
    const contentDisposition = response.headers.get('content-disposition');
    let filename = `mcp_server_${mode}.py`;
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="(.+)"/);
      if (match) {
        filename = match[1];
      }
    }

    // 下载文件
    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);

    addLog('ok', `已下载默认 ${mode} 脚本: ${filename}`);
    
    alert(`默认脚本已下载！\\n\\n使用方法:\\n1. 运行: python3 ${filename}\\n2. 脚本会自动向服务端注册\\n3. 切换到"已托管 Server"标签页查看状态`);

  } catch (err) {
    addLog('err', `下载脚本失败: ${err.message}`);
    // 如果下载失败，提示用户使用临时 MCP 管理
    if (confirm('下载默认脚本失败。是否打开临时 MCP 管理创建自定义脚本？')) {
      openCreateTempMCPModal();
    }
  }
}

/**
 * 打开创建临时 MCP Server 的模态框
 */
function openCreateTempMCPModal() {
  // 创建模态框
  let modal = document.getElementById('createTempMcpModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'createTempMcpModal';
    modal.className = 'modal-bg';
    modal.innerHTML = `
      <div class="modal" style="width: min(600px, calc(100vw - 40px)); max-height: 85vh;">
        <div class="mcp-header">
          <div class="mcp-header-title">📦 创建临时 MCP Server</div>
        </div>
        
        <div style="padding: 20px; overflow-y: auto; max-height: 60vh;">
          <div class="form-group" style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px; color: var(--text-dim); font-size: 0.85rem;">服务器名称 *</label>
            <input type="text" id="tempMcpName" class="mcp-form-input" placeholder="如: my-file-server" style="width: 100%;">
          </div>
          
          <div class="form-group" style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px; color: var(--text-dim); font-size: 0.85rem;">描述 *</label>
            <input type="text" id="tempMcpDesc" class="mcp-form-input" placeholder="简短描述这个服务器的功能" style="width: 100%;">
          </div>
          
          <div class="form-group" style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px; color: var(--text-dim); font-size: 0.85rem;">工具定义</label>
            <div id="toolsContainer" style="display: flex; flex-direction: column; gap: 12px;">
              <!-- 工具列表将在这里动态添加 -->
            </div>
            <button type="button" onclick="addToolField()" style="margin-top: 10px; padding: 6px 12px; background: var(--surface); border: 1px dashed var(--border); border-radius: var(--radius-sm); color: var(--text-dim); cursor: pointer; font-size: 0.85rem;">
              + 添加工具
            </button>
          </div>
          
          <div style="background: var(--surface); border-radius: var(--radius-sm); padding: 12px; margin-top: 16px;">
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 8px;">
              💡 预设工具模板（点击添加）:
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              <button type="button" onclick="addPresetTool('execute_command')" style="padding: 4px 10px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-dim); cursor: pointer; font-size: 0.8rem;">
                ⚡ 执行命令
              </button>
              <button type="button" onclick="addPresetTool('read_file')" style="padding: 4px 10px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-dim); cursor: pointer; font-size: 0.8rem;">
                📄 读取文件
              </button>
              <button type="button" onclick="addPresetTool('write_file')" style="padding: 4px 10px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-dim); cursor: pointer; font-size: 0.8rem;">
                ✏️ 写入文件
              </button>
              <button type="button" onclick="addPresetTool('list_directory')" style="padding: 4px 10px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-dim); cursor: pointer; font-size: 0.8rem;">
                📁 列出目录
              </button>
              <button type="button" onclick="addPresetTool('search_text')" style="padding: 4px 10px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-dim); cursor: pointer; font-size: 0.8rem;">
                🔍 文本搜索
              </button>
            </div>
          </div>
        </div>
        
        <div class="mcp-footer">
          <div class="mcp-footer-left">
            <small style="color: var(--text-muted);">创建后可下载脚本到本地运行</small>
          </div>
          <div class="mcp-footer-right">
            <button type="button" class="mcp-btn-secondary" onclick="closeCreateTempMCPModal()">取消</button>
            <button type="button" class="mcp-btn-primary" onclick="submitCreateTempMCP()">创建</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    // 点击背景关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeCreateTempMCPModal();
    });
  }
  
  // 初始化一个默认工具
  document.getElementById('toolsContainer').innerHTML = '';
  addPresetTool('execute_command');
  
  modal.classList.add('show');
}

/**
 * 关闭创建临时 MCP Server 的模态框
 */
function closeCreateTempMCPModal() {
  const modal = document.getElementById('createTempMcpModal');
  if (modal) {
    modal.classList.remove('show');
  }
}

/**
 * 添加工具输入字段
 */
function addToolField(toolData = null) {
  const container = document.getElementById('toolsContainer');
  const toolIndex = container.children.length;
  
  const toolDiv = document.createElement('div');
  toolDiv.className = 'tool-field';
  toolDiv.style.cssText = 'background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px;';
  toolDiv.innerHTML = `
    <div style="display: flex; gap: 10px; margin-bottom: 10px;">
      <input type="text" class="tool-name mcp-form-input" placeholder="工具名称 (如: execute_command)" 
        value="${toolData ? toolData.name : ''}" style="flex: 1;">
      <button type="button" onclick="this.closest('.tool-field').remove()" 
        style="padding: 6px 10px; background: var(--danger); border: none; border-radius: var(--radius-sm); color: white; cursor: pointer; font-size: 0.8rem;">
        删除
      </button>
    </div>
    <input type="text" class="tool-desc mcp-form-input" placeholder="工具描述" 
      value="${toolData ? toolData.description : ''}" style="width: 100%; margin-bottom: 10px;">
    <textarea class="tool-schema mcp-form-input" placeholder='参数模式 (JSON Schema，可选，默认为 string 类型的 command 参数)'
      style="width: 100%; min-height: 80px; font-family: monospace; font-size: 0.8rem;">${toolData ? JSON.stringify(toolData.inputSchema, null, 2) : ''}</textarea>
  `;
  
  container.appendChild(toolDiv);
}

/**
 * 添加预设工具
 */
function addPresetTool(toolType) {
  const presets = {
    execute_command: {
      name: 'execute_command',
      description: '在本地执行 shell 命令',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的命令' },
          timeout: { type: 'integer', description: '超时时间（秒）', default: 30 }
        },
        required: ['command']
      }
    },
    read_file: {
      name: 'read_file',
      description: '读取本地文件内容',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          limit: { type: 'integer', description: '最大读取行数', default: 100 }
        },
        required: ['path']
      }
    },
    write_file: {
      name: 'write_file',
      description: '写入内容到本地文件',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '文件内容' }
        },
        required: ['path', 'content']
      }
    },
    list_directory: {
      name: 'list_directory',
      description: '列出目录内容',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录路径', default: '.' }
        }
      }
    },
    search_text: {
      name: 'search_text',
      description: '在文件中搜索文本',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: '搜索模式（正则表达式）' },
          path: { type: 'string', description: '文件或目录路径' },
          recursive: { type: 'boolean', description: '是否递归搜索', default: false }
        },
        required: ['pattern', 'path']
      }
    }
  };
  
  const preset = presets[toolType];
  if (preset) {
    addToolField(preset);
  }
}

/**
 * 提交创建临时 MCP Server
 */
async function submitCreateTempMCP() {
  const name = document.getElementById('tempMcpName').value.trim();
  const description = document.getElementById('tempMcpDesc').value.trim();
  
  if (!name) {
    alert('请输入服务器名称');
    return;
  }
  if (!description) {
    alert('请输入描述');
    return;
  }
  
  // 收集工具定义
  const tools = [];
  const toolFields = document.querySelectorAll('.tool-field');
  toolFields.forEach(field => {
    const name = field.querySelector('.tool-name').value.trim();
    const desc = field.querySelector('.tool-desc').value.trim();
    const schemaText = field.querySelector('.tool-schema').value.trim();
    
    if (name) {
      let schema = { type: 'object', properties: {} };
      if (schemaText) {
        try {
          schema = JSON.parse(schemaText);
        } catch (e) {
          console.warn('Invalid schema for tool', name, e);
        }
      }
      tools.push({
        name: name,
        description: desc || name,
        inputSchema: schema
      });
    }
  });
  
  if (tools.length === 0) {
    alert('请至少添加一个工具');
    return;
  }
  
  try {
    const token = localStorage.getItem('pofp_auth_token');
    const response = await fetch('/api/temp-mcp', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: name,
        description: description,
        tools: tools,
        ttl_seconds: 3600,
        max_executions: 100
      })
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || '创建失败');
    }
    
    const result = await response.json();
    addLog('ok', `临时 MCP Server 创建成功: ${result.data.name} (${result.data.id})`);
    
    closeCreateTempMCPModal();
    
    // 切换到可用脚本标签页并刷新
    switchUserMCPTab('temp', document.querySelector('.user-mcp-tab'));
    renderTempMCPServerList();
    
    // 提示下载
    if (confirm(`Server 创建成功！\\n\\n是否立即下载脚本？`)) {
      downloadUserMCPScript(result.data.id, 'stdio');
    }
    
  } catch (err) {
    addLog('err', `创建临时 MCP Server 失败: ${err.message}`);
    alert(`创建失败: ${err.message}`);
  }
}

/**
 * 刷新 Server 状态
 */
async function refreshUserMCPServerStatus(serverId) {
  try {
    const token = localStorage.getItem('pofp_auth_token');
    const response = await fetch(`/api/user-mcp/${serverId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('获取状态失败');
    }

    const result = await response.json();
    const server = result.data;
    
    addLog('info', `Server "${server.name}" 状态: ${server.is_online ? '在线' : '离线'}`);
    
    // 刷新列表
    renderUserMCPServerList();

  } catch (err) {
    addLog('err', `刷新状态失败: ${err.message}`);
  }
}

/**
 * 删除用户 MCP Server 记录
 */
async function deleteUserMCPServer(serverId) {
  if (!confirm('确定要删除这个 Server 记录吗？（这不会停止客户端运行的脚本）')) {
    return;
  }

  try {
    const token = localStorage.getItem('pofp_auth_token');
    const response = await fetch(`/api/user-mcp/${serverId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('删除失败');
    }

    addLog('ok', 'Server 记录已删除');
    renderUserMCPServerList();

  } catch (err) {
    addLog('err', `删除失败: ${err.message}`);
  }
}

/**
 * 切换标签页
 */
function switchUserMCPTab(tab, btn) {
  // 更新按钮状态
  document.querySelectorAll('.user-mcp-tab').forEach(el => el.classList.remove('active'));
  btn.classList.add('active');
  
  // 切换面板
  if (tab === 'temp') {
    document.getElementById('tempMcpPanel').style.display = 'block';
    document.getElementById('hostedMcpPanel').style.display = 'none';
    renderTempMCPServerList();
  } else {
    document.getElementById('tempMcpPanel').style.display = 'none';
    document.getElementById('hostedMcpPanel').style.display = 'block';
    renderUserMCPServerList();
  }
}

/**
 * 格式化时间
 */
function formatTime(timestamp) {
  if (!timestamp) return '-';
  const date = new Date(timestamp * 1000);
  return date.toLocaleString('zh-CN');
}

/**
 * HTML 转义
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
