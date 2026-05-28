/**
 * 工具管理模块 - 获取和展示 AI Agent 可用工具，支持热插拔
 */

// 工具缓存
let cachedTools = null;
let cachedCategories = null;
let cachedHotplugTools = null;

// ==================== Toast 提示 ====================

/**
 * 显示 Toast 提示
 * @param {string} message - 提示消息
 * @param {string} type - 类型: 'success' | 'error' | 'warning' | 'info'
 * @param {number} duration - 显示时长（毫秒）
 */
function showToast(message, type = 'info', duration = 3000) {
  // 创建 toast 元素
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    z-index: 9999;
    animation: slideIn 0.3s ease-out;
    max-width: 400px;
    word-break: break-word;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  
  // 根据类型设置颜色
  const colors = {
    success: 'background: rgba(16, 185, 129, 0.9); color: white; border: 1px solid #10b981;',
    error: 'background: rgba(239, 68, 68, 0.9); color: white; border: 1px solid #ef4444;',
    warning: 'background: rgba(245, 158, 11, 0.9); color: white; border: 1px solid #f59e0b;',
    info: 'background: rgba(59, 130, 246, 0.9); color: white; border: 1px solid #3b82f6;'
  };
  toast.style.cssText += colors[type] || colors.info;
  toast.textContent = message;
  
  // 添加动画样式
  if (!document.getElementById('toast-style')) {
    const style = document.createElement('style');
    style.id = 'toast-style';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(toast);
  
  // 自动移除
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, duration);
}

// ==================== 基础 API ====================

/**
 * 获取所有可用工具列表（包括热插拔）
 * @param {Object} options - 可选参数
 * @param {string} options.category - 按分类过滤
 * @param {boolean} options.includeHash - 是否包含 MD5 hash
 * @returns {Promise<Array>} 工具列表
 */
async function fetchTools(options = {}) {
  const params = new URLSearchParams();
  if (options.category) params.append('category', options.category);
  if (options.includeHash) params.append('include_hash', 'true');
  
  try {
    const response = await fetch(`/api/tools?${params.toString()}`, {
      headers: applyAuthHeaders()
    });
    const data = await response.json();
    
    if (data.success) {
      cachedTools = data.data;
      return data.data;
    }
    throw new Error(data.message || '获取工具列表失败');
  } catch (error) {
    console.error('获取工具列表失败:', error);
    return [];
  }
}

/**
 * 获取工具分类列表
 * @returns {Promise<Array>} 分类列表
 */
async function fetchToolCategories() {
  if (cachedCategories) return cachedCategories;
  
  try {
    const response = await fetch('/api/tools/categories', {
      headers: applyAuthHeaders()
    });
    const data = await response.json();
    
    if (data.success) {
      cachedCategories = data.data;
      return data.data;
    }
    throw new Error(data.message || '获取工具分类失败');
  } catch (error) {
    console.error('获取工具分类失败:', error);
    return [];
  }
}

/**
 * 获取单个工具详情
 * @param {string} toolName - 工具名称
 * @param {boolean} includeHash - 是否包含 hash
 * @returns {Promise<Object|null>} 工具详情
 */
async function fetchToolDetail(toolName, includeHash = true) {
  try {
    const params = includeHash ? '?include_hash=true' : '';
    const response = await fetch(`/api/tools/${encodeURIComponent(toolName)}${params}`, {
      headers: applyAuthHeaders()
    });
    const data = await response.json();
    
    if (data.success) {
      return data.data;
    }
    throw new Error(data.message || '获取工具详情失败');
  } catch (error) {
    console.error('获取工具详情失败:', error);
    return null;
  }
}

// ==================== 热插拔 API ====================

/**
 * 获取热插拔工具列表
 * @returns {Promise<Array>}
 */
async function fetchHotplugTools() {
  // 检查登录状态
  const token = currentAuthToken || '';
  if (!token) {
    return [];
  }
  
  try {
    const response = await fetch('/api/tools/hotplug', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.status === 401) {
      return [];
    }
    
    const data = await response.json();
    
    if (data.success) {
      cachedHotplugTools = data.data;
      return data.data;
    }
    throw new Error(data.message || '获取热插拔工具失败');
  } catch (error) {
    console.error('获取热插拔工具失败:', error);
    return [];
  }
}

/**
 * 添加/更新热插拔工具
 * @param {Object} toolDef - 工具定义
 * @returns {Promise<Object>}
 */
async function addHotplugTool(toolDef) {
  // 检查登录状态
  const token = currentAuthToken || '';
  if (!token) {
    showToast('请先登录', 'error');
    openAuthModal('login');
    throw new Error('未登录');
  }
  
  try {
    const response = await fetch('/api/tools/hotplug', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(toolDef)
    });
    
    if (response.status === 401) {
      showToast('登录已过期，请重新登录', 'error');
      openAuthModal('login');
      throw new Error('登录已过期');
    }
    
    const data = await response.json();
    
    if (data.success) {
      showToast(`工具已${data.data?.action === 'update' ? '更新' : '创建'}`, 'success');
      return data.data;
    }
    throw new Error(data.message);
  } catch (error) {
    console.error('添加热插拔工具失败:', error);
    showToast(error.message, 'error');
    throw error;
  }
}

/**
 * 删除热插拔工具
 * @param {string} toolName - 工具名称
 * @returns {Promise<Object>}
 */
async function removeHotplugTool(toolName) {
  if (!confirm(`确定要删除工具 "${toolName}" 吗？`)) {
    return { cancelled: true };
  }
  
  // 检查登录状态
  const token = currentAuthToken || '';
  if (!token) {
    showToast('请先登录', 'error');
    openAuthModal('login');
    throw new Error('未登录');
  }
  
  try {
    const response = await fetch(`/api/tools/hotplug/${encodeURIComponent(toolName)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.status === 401) {
      showToast('登录已过期，请重新登录', 'error');
      openAuthModal('login');
      throw new Error('登录已过期');
    }
    
    const data = await response.json();
    
    if (data.success) {
      showToast('工具已删除', 'success');
      // 清除缓存，确保下次获取最新数据
      cachedHotplugTools = null;
      cachedTools = null;
      return data.data;
    }
    throw new Error(data.message);
  } catch (error) {
    console.error('删除热插拔工具失败:', error);
    showToast(error.message, 'error');
    throw error;
  }
}

/**
 * 更新工具代码
 * @param {string} toolName - 工具名称
 * @param {string} code - Python 代码
 * @returns {Promise<Object>}
 */
async function updateToolCode(toolName, code) {
  // 检查登录状态
  const token = currentAuthToken || '';
  if (!token) {
    showToast('请先登录', 'error');
    openAuthModal('login');
    throw new Error('未登录');
  }
  
  try {
    const response = await fetch(`/api/tools/hotplug/${encodeURIComponent(toolName)}/code`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code })
    });
    
    if (response.status === 401) {
      showToast('登录已过期，请重新登录', 'error');
      openAuthModal('login');
      throw new Error('登录已过期');
    }
    
    const data = await response.json();
    
    if (data.success) {
      showToast('代码已更新', 'success');
      return data.data;
    }
    throw new Error(data.message);
  } catch (error) {
    console.error('更新工具代码失败:', error);
    showToast(error.message, 'error');
    throw error;
  }
}

/**
 * 重载所有热插拔工具
 * @returns {Promise<Object>}
 */
async function reloadAllHotplugTools() {
  // 检查登录状态
  const token = currentAuthToken || '';
  if (!token) {
    showToast('请先登录', 'error');
    openAuthModal('login');
    throw new Error('未登录');
  }
  
  try {
    const response = await fetch('/api/tools/hotplug/reload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.status === 401) {
      showToast('登录已过期，请重新登录', 'error');
      openAuthModal('login');
      throw new Error('登录已过期');
    }
    
    const data = await response.json();
    
    if (data.success) {
      const stats = data.data || {};
      const msg = `重载完成: +${stats.loaded || 0} ~${stats.updated || 0} -${stats.removed || 0}`;
      showToast(msg, 'success');
      return data.data;
    }
    throw new Error(data.message);
  } catch (error) {
    console.error('重载热插拔工具失败:', error);
    showToast(error.message, 'error');
    throw error;
  }
}

/**
 * 检查工具 hash 是否变化
 * @param {string} toolName - 工具名称
 * @param {string} expectedHash - 期望的 hash
 * @returns {Promise<Object>}
 */
async function checkToolHash(toolName, expectedHash) {
  // 检查登录状态
  const token = currentAuthToken || '';
  if (!token) {
    return null;
  }
  
  try {
    const response = await fetch(
      `/api/tools/hotplug/${encodeURIComponent(toolName)}/hash?expected=${expectedHash}`,
      { 
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (response.status === 401) {
      return null;
    }
    
    const data = await response.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error('检查工具 hash 失败:', error);
    return null;
  }
}

/**
 * 获取热插拔状态
 * @returns {Promise<Object>}
 */
async function fetchHotplugStatus() {
  // 检查登录状态
  const token = currentAuthToken || '';
  if (!token) {
    return null;
  }
  
  try {
    const response = await fetch('/api/tools/hotplug/status', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.status === 401) {
      return null;
    }
    
    const data = await response.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error('获取热插拔状态失败:', error);
    return null;
  }
}

// ==================== 缓存管理 ====================

/**
 * 刷新工具缓存
 */
async function refreshToolsCache() {
  cachedTools = null;
  cachedCategories = null;
  cachedHotplugTools = null;
  await Promise.all([fetchTools({ includeHash: true }), fetchToolCategories(), fetchHotplugTools()]);
}

// ==================== UI ====================

// 分类颜色映射
const CATEGORY_COLORS = {
  'filesystem': '#3b82f6',
  'network': '#8b5cf6',
  'system': '#ef4444',
  'knowledge': '#10b981',
  'utility': '#f59e0b',
  'mcp': '#ec4899'
};

const TOOL_TYPE_META = {
  basic: {
    label: '基本工具',
    emoji: '🧱',
    badgeClass: 'tool-badge-basic',
    cardClass: 'tool-basic'
  },
  internal: {
    label: '内部工具',
    emoji: '🏠',
    badgeClass: 'tool-badge-internal',
    cardClass: 'tool-internal'
  },
  external: {
    label: '外部工具',
    emoji: '🔌',
    badgeClass: 'tool-badge-hotplug',
    cardClass: 'tool-hotplug'
  }
};

function getToolType(tool) {
  if (tool._tool_type) return tool._tool_type;
  if (tool._source === 'internal') return 'internal';
  if (tool._source === 'builtin') return 'basic';
  return 'external';
}

/**
 * 打开工具列表模态框
 */
async function openToolsModal() {
  const modal = document.getElementById('toolsModal');
  if (!modal) {
    createToolsModal();
    return openToolsModal();
  }
  
  modal.style.display = 'flex';
  await renderToolsList();
}

/**
 * 关闭工具列表模态框
 */
function closeToolsModal(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.getElementById('toolsModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * 创建工具列表模态框
 */
function createToolsModal() {
  if (document.getElementById('toolsModal')) return;
  
  const modalHTML = `
    <div class="modal-bg" id="toolsModal" onclick="closeToolsModal(event)">
      <div class="modal tools-modal" onclick="event.stopPropagation()">
        <div class="mcp-header">
          <div class="mcp-header-title">🛠️ 可用工具列表</div>
          <div class="mcp-header-actions">
            <button class="mcp-btn-icon" onclick="openHotplugManager()" title="外部工具管理">🔌</button>
            <button class="mcp-btn-icon" onclick="refreshToolsCache().then(renderToolsList)" title="刷新">🔄</button>
          </div>
        </div>
        
        <div class="tools-filter-bar">
          <select class="tools-filter-select" id="toolsCategoryFilter" onchange="renderToolsList()">
            <option value="">全部分类</option>
          </select>
          <input type="text" class="tools-search-input" id="toolsSearchInput" placeholder="搜索工具..." oninput="renderToolsList()">
          <label class="tools-checkbox">
            <input type="checkbox" id="toolsShowHash" onchange="renderToolsList()">
            显示Hash
          </label>
        </div>
        
        <div class="tools-list-container" id="toolsListContainer">
          <div class="tools-loading">加载中...</div>
        </div>
        
        <div class="tools-stats" id="toolsStats"></div>
        
        <div class="mcp-footer">
          <div class="mcp-footer-left">
            <button class="mcp-btn-primary" onclick="showAddPluginModal()">➕ 添加插件</button>
          </div>
          <div class="mcp-footer-right">
            <button class="mcp-btn-secondary" onclick="closeToolsModal()">关闭</button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  const div = document.createElement('div');
  div.innerHTML = modalHTML;
  document.body.appendChild(div.firstElementChild);
  
  loadToolCategoryOptions();
}

/**
 * 显示添加插件模态框（选择添加方式）
 */
function showAddPluginModal() {
  let modal = document.getElementById('addPluginModal');
  if (!modal) {
    const modalHTML = `
      <div class="modal-bg" id="addPluginModal" onclick="closeAddPluginModal(event)">
        <div class="modal add-plugin-modal" onclick="event.stopPropagation()">
          <div class="mcp-header">
            <div class="mcp-header-title">➕ 添加插件</div>
            <div class="mcp-header-actions">
              <button class="mcp-btn-icon" onclick="closeAddPluginModal()">✕</button>
            </div>
          </div>
          
          <div class="add-plugin-content">
            <div class="add-plugin-option" onclick="closeAddPluginModal(); showUploadScriptForm();">
              <div class="add-plugin-icon">📤</div>
              <div class="add-plugin-title">上传脚本</div>
              <div class="add-plugin-desc">上传 .py 文件，自动提取 handler 函数和文档</div>
            </div>
            
            <div class="add-plugin-option" onclick="closeAddPluginModal(); openHotplugManager();">
              <div class="add-plugin-icon">🔌</div>
              <div class="add-plugin-title">外部工具管理</div>
              <div class="add-plugin-desc">管理已有外部工具，重载配置文件</div>
            </div>
          </div>
          
          <div class="mcp-footer">
            <button class="mcp-btn-secondary" onclick="closeAddPluginModal()">取消</button>
          </div>
        </div>
      </div>
    `;
    
    const div = document.createElement('div');
    div.innerHTML = modalHTML;
    document.body.appendChild(div.firstElementChild);
    modal = document.getElementById('addPluginModal');
  }
  
  if (modal) {
    modal.style.display = 'flex';
  }
}

/**
 * 关闭添加插件模态框
 */
function closeAddPluginModal(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.getElementById('addPluginModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * 加载分类选项
 */
async function loadToolCategoryOptions() {
  const select = document.getElementById('toolsCategoryFilter');
  if (!select) return;
  
  const categories = await fetchToolCategories();
  select.innerHTML = '<option value="">全部分类</option>' +
    categories.map(cat => `<option value="${cat.key}">${cat.label}</option>`).join('');
}

/**
 * 渲染工具列表
 */
async function renderToolsList() {
  const container = document.getElementById('toolsListContainer');
  const stats = document.getElementById('toolsStats');
  if (!container) return;
  
  const categoryFilter = document.getElementById('toolsCategoryFilter')?.value || '';
  const searchQuery = document.getElementById('toolsSearchInput')?.value.toLowerCase() || '';
  const showHash = document.getElementById('toolsShowHash')?.checked || false;
  
  let tools = cachedTools || await fetchTools({ includeHash: true });
  
  if (categoryFilter) {
    tools = tools.filter(t => t.category === categoryFilter);
  }
  
  if (searchQuery) {
    tools = tools.filter(t => 
      t.name.toLowerCase().includes(searchQuery) ||
      t.description.toLowerCase().includes(searchQuery)
    );
  }
  
  if (tools.length === 0) {
    container.innerHTML = '<div class="tools-empty">没有找到匹配的工具</div>';
  } else {
    container.innerHTML = tools.map(tool => {
      const args = getToolParameterMap(tool);
      const argList = Object.entries(args).map(([name, desc]) => 
        `<div class="tool-arg"><span class="tool-arg-name">${escapeHtml(name)}</span><span class="tool-arg-desc">${escapeHtml(desc)}</span></div>`
      ).join('');
      
      const categoryColor = CATEGORY_COLORS[tool.category] || '#6b7280';
      const toolType = getToolType(tool);
      const typeMeta = TOOL_TYPE_META[toolType] || TOOL_TYPE_META.external;
      const hashDisplay = showHash && tool._hash ? 
        `<div class="tool-hash" title="MD5 Hash">${tool._hash.substring(0, 8)}...</div>` : '';
      
      return `
        <div class="tool-card ${typeMeta.cardClass}" data-tool="${escapeHtml(tool.name)}">
          <div class="tool-header">
            <div class="tool-name-row">
              <span class="tool-name">${escapeHtml(tool.name)}</span>
              <span class="tool-category" style="background:${categoryColor}20;color:${categoryColor}">
                ${escapeHtml(tool.category_label || tool.category)}
              </span>
              ${tool.dangerous ? '<span class="tool-badge-danger">⚠️ 危险</span>' : ''}
              <span class="${typeMeta.badgeClass}">${typeMeta.emoji} ${typeMeta.label}</span>
            </div>
            <div class="tool-description">${escapeHtml(tool.description)}</div>
            ${hashDisplay}
          </div>
          ${Object.keys(args).length > 0 ? `
            <div class="tool-args">
              <div class="tool-args-title">参数:</div>
              ${argList}
            </div>
          ` : ''}
          ${tool.timeout ? `<div class="tool-timeout">⏱️ 超时: ${tool.timeout}秒</div>` : ''}
        </div>
      `;
    }).join('');
  }
  
  if (stats) {
    const basicCount = tools.filter(t => getToolType(t) === 'basic').length;
    const internalCount = tools.filter(t => getToolType(t) === 'internal').length;
    const externalCount = tools.filter(t => getToolType(t) === 'external').length;
    stats.innerHTML = `共 ${tools.length} 个工具（基本: ${basicCount}, 内部: ${internalCount}, 外部: ${externalCount}）`;
  }
}

// ==================== 外部工具管理 UI ====================

/**
 * 打开外部工具管理器
 */
async function openHotplugManager() {
  const modal = document.getElementById('hotplugModal');
  if (!modal) {
    createHotplugModal();
    return openHotplugManager();
  }
  
  modal.style.display = 'flex';
  await renderHotplugList();
}

/**
 * 关闭外部工具管理器
 */
function closeHotplugModal(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.getElementById('hotplugModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * 创建外部工具管理模态框
 */
function createHotplugModal() {
  if (document.getElementById('hotplugModal')) return;
  
  const modalHTML = `
    <div class="modal-bg" id="hotplugModal" onclick="closeHotplugModal(event)">
      <div class="modal hotplug-modal" onclick="event.stopPropagation()">
        <div class="mcp-header">
          <div class="mcp-header-title">🔌 外部工具管理</div>
          <div class="mcp-header-actions">
            <button class="mcp-btn-icon" onclick="reloadAllHotplugTools().then(renderHotplugList)" title="重载所有">🔄</button>
          </div>
        </div>
        
        <div class="hotplug-toolbar">
          <div class="hotplug-stats" id="hotplugStats">加载中...</div>
          <div class="hotplug-actions">
            <button class="mcp-btn-secondary" onclick="showUploadScriptForm()">📤 上传脚本</button>
          </div>
        </div>
        
        <div class="hotplug-list" id="hotplugList">
          <div class="tools-loading">加载中...</div>
        </div>
        
        <div class="mcp-footer">
          <div class="mcp-footer-left">
            <span class="tools-hint">修改 data/tools/*.json 后点击重载外部工具</span>
          </div>
          <div class="mcp-footer-right">
            <button class="mcp-btn-secondary" onclick="closeHotplugModal()">关闭</button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  const div = document.createElement('div');
  div.innerHTML = modalHTML;
  document.body.appendChild(div.firstElementChild);
  
  // 添加上传脚本表单模态框
  createUploadScriptModal();
}

/**
 * 创建上传脚本模态框
 */
function createUploadScriptModal() {
  if (document.getElementById('uploadScriptModal')) return;
  
  const modalHTML = `
    <div class="modal-bg" id="uploadScriptModal" onclick="closeUploadScriptModal(event)">
      <div class="modal tool-form-modal" onclick="event.stopPropagation()">
        <div class="mcp-header">
          <div class="mcp-header-title">📤 上传 Python 脚本</div>
        </div>
        
        <div class="tool-form-content">
          <div class="form-group">
            <label>上传文件 *</label>
            <div class="upload-zone" id="scriptUploadZone" style="padding: 24px; text-align: center;">
              <input type="file" id="scriptFileInput" multiple style="display: none;" onchange="handleScriptFileSelect(this)">
              <div class="upload-icon">📄</div>
              <div class="upload-text" id="scriptUploadText">
                点击或拖拽上传多个文件
                <br>
                <span style="opacity:0.6;font-size:12px">必须包含一个 .py 主文件，参数会整理成当前 tool schema</span>
              </div>
              <div class="upload-file-list" id="scriptFileList" style="display: none; margin-top: 10px; text-align: left; font-size: 13px;"></div>
            </div>
            <div class="form-group" id="mainFileSelector" style="display: none; margin-top: 12px; margin-bottom: 0;">
              <label>主文件（.py 可执行入口）*</label>
              <select class="form-input" id="mainFileSelect" style="width: 100%; padding: 8px 12px; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-sm);"></select>
            </div>
            <div id="handlerCheckResult" style="margin-top: 10px; padding: 10px 12px; border-radius: 6px; font-size: 13px; display: none;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span id="handlerCheckIcon"></span>
                <span id="handlerCheckText"></span>
              </div>
            </div>
            <div style="margin-top: 8px; padding: 10px; background: rgba(59, 130, 246, 0.1); border-radius: 6px; border-left: 3px solid #3b82f6;">
              <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
                <strong style="color: var(--text-primary);">Python 文件要求：</strong><br>
                • 主文件需要提供可调用入口，后端会把参数整理成当前 tool schema<br>
                • 运行结果应返回可读文本或包含 success 字段的对象<br>
                • 示例：<code style="background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 3px;">return {'success': True, 'result': '...'}</code>
              </div>
            </div>
          </div>
          
          <div class="form-group">
            <label>工具名称（可选，默认使用文件名）</label>
            <input type="text" class="form-input" id="uploadToolName" placeholder="my_tool">
          </div>
          
          <div class="form-group">
            <label>描述（可选，默认从文件 docstring 提取）</label>
            <input type="text" class="form-input" id="uploadToolDesc" placeholder="工具功能描述">
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label>分类</label>
              <select class="form-input" id="uploadToolCategory">
                <option value="utility">实用工具</option>
                <option value="filesystem">文件系统</option>
                <option value="network">网络</option>
                <option value="system">系统</option>
                <option value="knowledge">知识库</option>
              </select>
            </div>
            
            <div class="form-group">
              <label>超时(秒)</label>
              <input type="number" class="form-input" id="uploadToolTimeout" placeholder="无">
            </div>
          </div>
          
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" id="uploadToolDangerous">
              危险操作（可能修改系统）
            </label>
          </div>
          
          <!-- 上传结果显示区域 -->
          <div id="uploadResultArea" style="display: none; margin-top: 16px; padding: 12px 16px; border-radius: 8px; font-size: 14px;">
            <div style="display: flex; align-items: flex-start; gap: 10px;">
              <span id="uploadResultIcon" style="font-size: 18px; flex-shrink: 0;"></span>
              <div style="flex: 1;">
                <div id="uploadResultTitle" style="font-weight: 600; margin-bottom: 4px;"></div>
                <div id="uploadResultMessage" style="opacity: 0.9; line-height: 1.5;"></div>
                <div id="uploadResultDetails" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(0,0,0,0.1); font-size: 12px; opacity: 0.8;"></div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="mcp-footer">
          <button class="mcp-btn-secondary" onclick="closeUploadScriptModal()">取消</button>
          <button class="mcp-btn-primary" onclick="submitScriptUpload()">上传并创建</button>
        </div>
      </div>
    </div>
  `;
  
  const div = document.createElement('div');
  div.innerHTML = modalHTML;
  document.body.appendChild(div.firstElementChild);
  
  // 绑定拖拽事件
  const zone = document.getElementById('scriptUploadZone');
  if (zone) {
    zone.addEventListener('click', () => document.getElementById('scriptFileInput')?.click());
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const input = document.getElementById('scriptFileInput');
        const dt = new DataTransfer();
        for (let i = 0; i < files.length; i++) {
          dt.items.add(files[i]);
        }
        input.files = dt.files;
        handleScriptFileSelect(input);
      }
    });
  }
}

/**
 * 从 Python 文件内容提取 doc 和 arguments_schema
 */
function extractPythonDoc(content) {
  // 提取模块级 docstring ("""...""" 或 '''...''')
  const moduleDocMatch = content.match(/^\s*(?:"""|''')([\s\S]*?)(?:"""|''')/);
  let moduleDoc = moduleDocMatch ? moduleDocMatch[1].trim() : '';
  
  // 提取 handler 函数的 docstring
  const handlerMatch = content.match(/def\s+handler\s*\([^)]*\):\s*(?:"""|''')([\s\S]*?)(?:"""|''')/);
  let handlerDoc = handlerMatch ? handlerMatch[1].trim() : '';
  
  // 优先级：模块 doc > handler doc
  const finalDoc = moduleDoc || handlerDoc;
  const docToParse = finalDoc || handlerDoc;
  
  // 从 doc 中提取 :param xxx: 格式的参数
  const argumentsSchema = {};
  if (docToParse) {
    // 匹配 :param xxx: description 格式
    const paramRegex = /:param\s+(\w+):\s*(.+?)(?=:\n|\n\n|:\w|$)/gs;
    let match;
    while ((match = paramRegex.exec(docToParse)) !== null) {
      const paramName = match[1];
      const paramDesc = match[2].trim().replace(/\n/g, ' ');
      argumentsSchema[paramName] = paramDesc;
    }
    
    // 如果上面的正则没匹配到，尝试简单格式
    if (Object.keys(argumentsSchema).length === 0) {
      const simpleParamRegex = /:param\s+(\w+):\s*(.+)/g;
      while ((match = simpleParamRegex.exec(docToParse)) !== null) {
        const paramName = match[1];
        const paramDesc = match[2].trim();
        argumentsSchema[paramName] = paramDesc;
      }
    }
  }
  
  return {
    doc: finalDoc,
    handlerDoc: handlerDoc,
    argumentsSchema: argumentsSchema
  };
}

/**
 * 提取工具参数映射，优先使用 JSON schema 的 properties
 */
function getToolParameterMap(tool) {
  const schema = tool.parameters && typeof tool.parameters === 'object' ? tool.parameters : null;
  if (schema && schema.properties && typeof schema.properties === 'object') {
    const result = {};
    for (const [name, value] of Object.entries(schema.properties)) {
      if (value && typeof value === 'object') {
        result[name] = value.description || value.title || '';
      } else {
        result[name] = '';
      }
    }
    return result;
  }
  return tool.arguments_schema || {};
}

// 当前选中的上传文件列表
let selectedUploadFiles = [];

/**
 * 处理脚本文件选择（支持多文件）
 */
function handleScriptFileSelect(input) {
  const files = Array.from(input.files || []);
  if (!files.length) return;

  selectedUploadFiles = files;

  const fileListEl = document.getElementById('scriptFileList');
  const mainFileSelect = document.getElementById('mainFileSelect');
  const mainFileSelector = document.getElementById('mainFileSelector');
  const checkResult = document.getElementById('handlerCheckResult');

  // 渲染文件列表
  if (fileListEl) {
    fileListEl.innerHTML = files.map(f => {
      const isPy = f.name.endsWith('.py');
      return `<div style="padding: 5px 0; border-bottom: 1px solid var(--border);">
        <span style="color: var(--text-dim);">${isPy ? '🐍' : '📎'}</span> ${escapeHtml(f.name)}
        <span style="color: var(--text-muted); font-size: 12px;">(${(f.size / 1024).toFixed(1)} KB)</span>
      </div>`;
    }).join('');
    fileListEl.style.display = 'block';
  }

  const pyFiles = files.filter(f => f.name.endsWith('.py'));
  if (pyFiles.length === 0) {
    if (mainFileSelector) mainFileSelector.style.display = 'none';
    updateHandlerCheckUI(false, null, null, '未找到 .py 文件');
    showToast('请上传至少一个 .py 文件', 'error');
    return;
  }

  let checkedCount = 0;
  const handlerFiles = [];
  let firstExtracted = null;

  pyFiles.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      const hasHandler = /\bdef\s+handler\s*\(/.test(content);
      if (hasHandler) {
        handlerFiles.push(file.name);
        if (!firstExtracted) {
          firstExtracted = extractPythonDoc(content);
        }
      }
      checkedCount++;
      if (checkedCount === pyFiles.length) {
        if (handlerFiles.length > 0) {
          if (mainFileSelect && mainFileSelector) {
            mainFileSelect.innerHTML = handlerFiles.map((name, idx) =>
              `<option value="${escapeHtml(name)}" ${idx === 0 ? 'selected' : ''}>${escapeHtml(name)}</option>`
            ).join('');
            mainFileSelector.style.display = 'block';
          }
          updateHandlerCheckUI(true, firstExtracted, handlerFiles[0]);
          // 自动填充工具名
          const nameInput = document.getElementById('uploadToolName');
          if (nameInput && !nameInput.value.trim()) {
            nameInput.value = handlerFiles[0].replace(/\.py$/i, '');
          }
        } else {
          if (mainFileSelector) mainFileSelector.style.display = 'none';
          updateHandlerCheckUI(false, null, null, '所有 .py 文件均未找到 handler 函数');
        }
      }
    };
    reader.readAsText(file);
  });
}

function updateHandlerCheckUI(hasHandler, extracted, fileName, errorText) {
  const checkResult = document.getElementById('handlerCheckResult');
  const checkIcon = document.getElementById('handlerCheckIcon');
  const checkText = document.getElementById('handlerCheckText');
  if (!checkResult || !checkIcon || !checkText) return;

  checkResult.style.display = 'block';
  if (hasHandler) {
    checkResult.style.background = 'rgba(16, 185, 129, 0.1)';
    checkResult.style.border = '1px solid rgba(16, 185, 129, 0.3)';
    checkIcon.textContent = '✅';
    let info = `<strong>验证通过</strong> - ${escapeHtml(fileName)} 包含 handler 函数`;
    if (extracted && extracted.doc) {
      const preview = extracted.doc.split('\n')[0].substring(0, 50);
      info += `<br><small style="opacity:0.8">📄 文档: ${escapeHtml(preview)}${extracted.doc.length > 50 ? '...' : ''}</small>`;
    }
    if (extracted && Object.keys(extracted.argumentsSchema).length > 0) {
      info += `<br><small style="opacity:0.8">📋 参数: ${Object.keys(extracted.argumentsSchema).join(', ')}</small>`;
    }
    checkText.innerHTML = info;
  } else {
    checkResult.style.background = 'rgba(239, 68, 68, 0.1)';
    checkResult.style.border = '1px solid rgba(239, 68, 68, 0.3)';
    checkIcon.textContent = '❌';
    checkText.innerHTML = `<strong>${errorText || '缺少 handler 函数'}</strong>`;
  }
}

/**
 * 显示上传脚本表单
 */
function showUploadScriptForm() {
  const modal = document.getElementById('uploadScriptModal');
  if (!modal) {
    createUploadScriptModal();
    return showUploadScriptForm();
  }
  
  // 确保上传窗口在最上层（移到 body 末尾）
  document.body.appendChild(modal);
  
  // 重置表单
  const fileInput = document.getElementById('scriptFileInput');
  if (fileInput) fileInput.value = '';
  
  const fileName = document.getElementById('scriptFileName');
  if (fileName) {
    fileName.textContent = '';
    fileName.style.display = 'none';
  }
  
  // 重置 handler 检查结果
  const checkResult = document.getElementById('handlerCheckResult');
  if (checkResult) {
    checkResult.style.display = 'none';
  }
  
  // 重置上传结果区域
  hideUploadResult();
  
  document.getElementById('uploadToolName').value = '';
  document.getElementById('uploadToolDesc').value = '';
  document.getElementById('uploadToolCategory').value = 'utility';
  document.getElementById('uploadToolTimeout').value = '';
  document.getElementById('uploadToolDangerous').checked = false;
  
  modal.style.display = 'flex';
}

/**
 * 关闭上传脚本模态框
 */
function closeUploadScriptModal(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.getElementById('uploadScriptModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * 处理删除工具（带刷新）
 * @param {string} toolName - 工具名称
 */
async function handleDeleteTool(toolName) {
  try {
    await removeHotplugTool(toolName);
    // 删除成功后立即刷新列表
    await renderHotplugList();
  } catch (error) {
    // 删除失败也刷新列表，确保界面同步
    console.log('删除操作完成，刷新列表');
    await renderHotplugList();
  }
}

/**
 * 显示上传结果
 */
function showUploadResult(type, title, message, details = '') {
  const resultArea = document.getElementById('uploadResultArea');
  const resultIcon = document.getElementById('uploadResultIcon');
  const resultTitle = document.getElementById('uploadResultTitle');
  const resultMessage = document.getElementById('uploadResultMessage');
  const resultDetails = document.getElementById('uploadResultDetails');
  
  if (!resultArea) return;
  
  resultArea.style.display = 'block';
  resultTitle.textContent = title;
  resultMessage.textContent = message;
  
  if (type === 'success') {
    resultArea.style.background = 'rgba(16, 185, 129, 0.1)';
    resultArea.style.border = '1px solid rgba(16, 185, 129, 0.3)';
    resultIcon.textContent = '✅';
  } else if (type === 'error') {
    resultArea.style.background = 'rgba(239, 68, 68, 0.1)';
    resultArea.style.border = '1px solid rgba(239, 68, 68, 0.3)';
    resultIcon.textContent = '❌';
  } else if (type === 'warning') {
    resultArea.style.background = 'rgba(245, 158, 11, 0.1)';
    resultArea.style.border = '1px solid rgba(245, 158, 11, 0.3)';
    resultIcon.textContent = '⚠️';
  }
  
  if (details) {
    resultDetails.style.display = 'block';
    resultDetails.textContent = details;
  } else {
    resultDetails.style.display = 'none';
  }
}

/**
 * 隐藏上传结果
 */
function hideUploadResult() {
  const resultArea = document.getElementById('uploadResultArea');
  if (resultArea) {
    resultArea.style.display = 'none';
  }
}

/**
 * 提交脚本上传（支持多文件）
 */
async function submitScriptUpload() {
  hideUploadResult();

  if (!selectedUploadFiles || selectedUploadFiles.length === 0) {
    showUploadResult('error', '上传失败', '请先选择文件');
    showToast('请先选择文件', 'error');
    return;
  }

  const mainFileSelect = document.getElementById('mainFileSelect');
  const mainFile = mainFileSelect ? mainFileSelect.value : '';

  const pyFiles = selectedUploadFiles.filter(f => f.name.endsWith('.py'));
  if (pyFiles.length === 0) {
    showUploadResult('error', '上传失败', '必须包含至少一个 .py 文件');
    showToast('必须包含至少一个 .py 文件', 'error');
    return;
  }

  if (!mainFile) {
    showUploadResult('error', '上传失败', '请选择包含 handler 的主文件');
    showToast('请选择包含 handler 的主文件', 'error');
    return;
  }

  const formData = new FormData();
  selectedUploadFiles.forEach(file => {
    formData.append('files', file);
  });
  formData.append('main_file', mainFile);
  formData.append('name', document.getElementById('uploadToolName').value.trim());
  formData.append('description', document.getElementById('uploadToolDesc').value.trim());
  formData.append('category', document.getElementById('uploadToolCategory').value);
  formData.append('dangerous', document.getElementById('uploadToolDangerous').checked);

  const timeout = document.getElementById('uploadToolTimeout').value;
  if (timeout) formData.append('timeout', timeout);

  // 强制从 localStorage 重新同步 token，避免内存变量落后
  const storedToken = localStorage.getItem('pofp_auth_token');
  if (storedToken && storedToken !== currentAuthToken) {
    console.log('[Upload] Syncing token from localStorage:', storedToken.slice(0, 20) + '...');
    currentAuthToken = storedToken;
  }
  const token = currentAuthToken || '';
  console.log('[Upload] Using token:', token ? token.slice(0, 20) + '...' : '(empty)');
  if (!token) {
    showUploadResult('error', '上传失败', '请先登录后再上传脚本');
    showToast('请先登录后再上传脚本', 'error');
    openAuthModal('login');
    return;
  }

  showUploadResult('warning', '正在上传...', `正在上传 ${selectedUploadFiles.length} 个文件，请稍候`);

  try {
    const response = await fetch('/api/tools/hotplug/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (response.status === 401) {
      showUploadResult('error', '上传失败', '登录已过期，请重新登录');
      showToast('登录已过期，请重新登录', 'error');
      openAuthModal('login');
      return;
    }

    const data = await response.json();

    if (data.success) {
      const toolName = data.data?.name || '未知';
      const action = data.data?.action === 'updated' ? '更新' : '创建';
      const hash = data.data?.hash ? data.data.hash.substring(0, 8) : '';
      const argsSchema = data.data?.parameters?.properties ? data.data.parameters.properties : (data.data?.arguments_schema || {});
      const hasDoc = data.data?.has_doc;
      const docPreview = data.data?.doc_preview;
      const attachments = data.data?.attachments || [];

      let details = `MD5: ${hash}... | 主文件: ${mainFile}`;
      if (attachments.length > 0) {
        details += ` | 附件: ${attachments.length} 个`;
      }

      const paramCount = Object.keys(argsSchema).length;
      if (paramCount > 0) {
        const paramList = Object.keys(argsSchema).join(', ');
        details += `\n📋 提取到 ${paramCount} 个参数: ${paramList}`;
      }

      if (hasDoc) {
        details += '\n📄 已提取工具文档';
        if (docPreview) {
          details += `\n   预览: ${docPreview.substring(0, 60)}${docPreview.length > 60 ? '...' : ''}`;
        }
      }

      showUploadResult(
        'success',
        `上传成功！`,
        `工具 "${toolName}" ${action}成功`,
        details
      );
      showToast(`工具 "${toolName}" 上传成功`, 'success');

      setTimeout(async () => {
        closeUploadScriptModal();
        await renderHotplugList();
        cachedTools = null;
      }, 1500);
    } else {
      const errorMsg = data.message || '上传失败，请检查文件内容';
      showUploadResult('error', '上传失败', errorMsg, '请确保主文件包含可调用入口');
      showToast(errorMsg, 'error');
    }
  } catch (error) {
    console.error('上传脚本失败:', error);
    const errorMsg = error.message || '网络错误，请稍后重试';
    showUploadResult('error', '上传失败', errorMsg, '请检查网络连接后重试');
    showToast('上传失败: ' + errorMsg, 'error');
  }
}

/**
 * 渲染外部工具列表
 */
async function renderHotplugList() {
  const container = document.getElementById('hotplugList');
  const stats = document.getElementById('hotplugStats');
  if (!container) return;
  
  const [tools, status] = await Promise.all([
    fetchHotplugTools(),
    fetchHotplugStatus()
  ]);
  
  if (status) {
    stats.innerHTML = `外部: ${status.external_count} | 内部: ${status.internal_count} | 基本: ${status.basic_count} | 总计: ${status.total_count}`;
  }
  
  if (tools.length === 0) {
    container.innerHTML = `
        <div class="tools-empty">
        <div>暂无外部工具</div>
        <button class="mcp-btn-primary" onclick="showUploadScriptForm()" style="margin-top:16px">上传第一个脚本</button>
      </div>
    `;
    return;
  }
  
  container.innerHTML = tools.map(tool => {
    const categoryColor = CATEGORY_COLORS[tool.category] || '#6b7280';
    const date = tool._updated_at ? new Date(tool._updated_at * 1000).toLocaleString() : '-';
    
    return `
      <div class="hotplug-item" data-tool-name="${escapeHtml(tool.name)}">
        <div class="hotplug-item-header">
          <div class="hotplug-item-title">
            <span class="tool-name">${escapeHtml(tool.name)}</span>
            <span class="tool-category" style="background:${categoryColor}20;color:${categoryColor}">
              ${escapeHtml(tool.category_label || tool.category)}
            </span>
            ${tool.dangerous ? '<span class="tool-badge-danger">⚠️</span>' : ''}
          </div>
          <div class="hotplug-item-actions">
            <button class="hotplug-btn" onclick="handleDeleteTool('${escapeHtml(tool.name)}')" title="删除">🗑️</button>
          </div>
        </div>
        <div class="hotplug-item-desc">${escapeHtml(tool.description)}</div>
        <div class="hotplug-item-meta">
          <span title="MD5 Hash">🔐 ${tool._hash?.substring(0, 8)}...</span>
          <span>🕐 ${date}</span>
          ${tool.code ? '💻 有代码' : ''}
        </div>
      </div>
    `;
  }).join('');
}



// ==================== 样式 ====================

const toolsCSS = `
/* 添加插件模态框 */
.add-plugin-modal {
  max-width: 500px;
  width: 90vw;
}

.add-plugin-content {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.add-plugin-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

.add-plugin-option:hover {
  border-color: var(--primary);
  background: var(--surface-2);
  transform: translateY(-2px);
  box-shadow: var(--card-shadow);
}

.add-plugin-icon {
  font-size: 2rem;
  margin-bottom: 12px;
}

.add-plugin-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 8px;
}

.add-plugin-desc {
  font-size: 0.85rem;
  color: var(--text-dim);
  line-height: 1.5;
}

/* 工具列表样式 */
.tools-modal {
  max-width: 900px;
  width: 90vw;
  max-height: 85vh;
}

.tools-filter-bar {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--border);
  align-items: center;
}

.tools-filter-select {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font-size: 14px;
  min-width: 140px;
}

.tools-search-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font-size: 14px;
}

.tools-search-input::placeholder {
  color: var(--text-muted);
}

.tools-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-dim);
  white-space: nowrap;
}

.tools-list-container {
  padding: 16px;
  overflow-y: auto;
  max-height: 55vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tools-loading, .tools-empty {
  text-align: center;
  padding: 40px;
  color: var(--text-dim);
}

.tool-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  background: var(--surface);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.tool-card:hover {
  border-color: var(--primary);
  box-shadow: var(--card-shadow);
}

.tool-hotplug {
  border-left: 3px solid var(--pink);
}

.tool-basic {
  border-left: 3px solid #3b82f6;
}

.tool-internal {
  border-left: 3px solid #10b981;
}

.tool-header {
  margin-bottom: 10px;
}

.tool-name-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.tool-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--text);
  font-family: 'JetBrains Mono', monospace;
}

.tool-category {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 12px;
  font-weight: 500;
}

.tool-badge-danger {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 12px;
  background: rgba(248, 81, 73, 0.15);
  color: var(--danger);
  font-weight: 500;
}

.tool-badge-hotplug {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 12px;
  background: rgba(219, 97, 146, 0.15);
  color: var(--pink);
  font-weight: 500;
}

.tool-badge-basic {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 12px;
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
  font-weight: 500;
}

.tool-badge-internal {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 12px;
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  font-weight: 500;
}

.tool-hash {
  font-size: 11px;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  margin-top: 4px;
}

.tool-description {
  font-size: 13px;
  color: var(--text-dim);
  line-height: 1.5;
}

.tool-args {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--border);
}

.tool-args-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
  margin-bottom: 8px;
}

.tool-arg {
  display: flex;
  gap: 10px;
  padding: 4px 0;
  font-size: 12px;
}

.tool-arg-name {
  font-family: 'JetBrains Mono', monospace;
  color: var(--primary);
  min-width: 100px;
  font-weight: 500;
}

.tool-arg-desc {
  color: var(--text-dim);
  flex: 1;
}

.tool-timeout {
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-muted);
}

.tools-stats {
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-dim);
  text-align: center;
}

/* 热插拔管理样式 */
.hotplug-modal {
  max-width: 800px;
  width: 90vw;
  max-height: 85vh;
}

.hotplug-toolbar {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.hotplug-stats {
  font-size: 13px;
  color: var(--text-dim);
}

.hotplug-actions {
  display: flex;
  gap: 8px;
}

/* 上传区域样式 */
#scriptUploadZone {
  border: 2px dashed var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: all 0.2s;
}

#scriptUploadZone:hover,
#scriptUploadZone.drag-over {
  border-color: var(--primary);
  background: rgba(88, 166, 255, 0.05);
}

.hotplug-list {
  padding: 16px;
  overflow-y: auto;
  max-height: 55vh;
}

.hotplug-item {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  margin-bottom: 12px;
  background: var(--surface);
}

.hotplug-item-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.hotplug-item-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.hotplug-item-actions {
  display: flex;
  gap: 8px;
}

.hotplug-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  opacity: 0.7;
  transition: opacity 0.2s;
  color: var(--text);
}

.hotplug-btn:hover {
  opacity: 1;
  background: var(--surface-2);
}

.hotplug-item-desc {
  font-size: 13px;
  color: var(--text-dim);
  margin-bottom: 8px;
}

.hotplug-item-meta {
  font-size: 11px;
  color: var(--text-muted);
  display: flex;
  gap: 16px;
}

/* 工具表单样式 */
.tool-form-modal {
  max-width: 600px;
  width: 90vw;
  max-height: 85vh;
}

.tool-form-content {
  padding: 16px;
  overflow-y: auto;
  max-height: 60vh;
}

.tool-form-content label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--text-dim);
}

.tool-form-content .form-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font-size: 14px;
}

.tool-form-content .form-input:focus {
  outline: none;
  border-color: var(--primary);
}

.tool-form-content textarea.form-input {
  resize: vertical;
  min-height: 80px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
  color: var(--text);
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
}

.code-editor {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
}
`;

// 注入样式
(function injectToolsCSS() {
  if (document.getElementById('tools-css')) return;
  const style = document.createElement('style');
  style.id = 'tools-css';
  style.textContent = toolsCSS;
  document.head.appendChild(style);
})();
