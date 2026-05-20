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
const API_BASE = `${window.location.origin}/api`;
let taskRefreshInterval = null;
let isTaskRefreshPaused = false;
let queuedTaskPayload = null;
let lastRenderedTaskSnapshot = '';
let latestTaskPayload = [];
const expandedTaskIds = new Set();

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
// 🔌 API 请求工具
// ═══════════════════════════════════════════════════════════════

async function apiRequest(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    return await response.json();
  } catch (error) {
    console.error('API请求失败:', error);
    addLog('err', `API请求失败: ${error.message}`);
    return { success: false, message: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// 🎨 主题与页面导航
// ═══════════════════════════════════════════════════════════════

/**
 * 切换深色/浅色主题
 */
function toggleTheme() {
  const root = document.documentElement;
  const current = root.getAttribute('data-theme');
  root.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
}

/**
 * 切换主页面标签
 * @param {string} name - 页面标识：'agent' | 'tasks' | 'config'
 * @param {HTMLElement} btn - 触发点击的 tab 按钮
 */
function switchPage(name, btn) {
  document.querySelectorAll('.header-nav-btn').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  
  if (name === 'tasks') {
    refreshTasks();
    startTaskRefresh();
  } else if (name === 'config') {
    openConfigModal();
  } else if (name === 'cockpit') {
    openCockpitModal();
  } else if (name === 'knowledge') {
    openKnowledgeModal();
  }
}

// ═══════════════════════════════════════════════════════════════
// 🪟 Modal 弹窗控制
// ═══════════════════════════════════════════════════════════════

/**
 * 打开新建任务弹窗
 */
function openNewTaskModal() {
  document.getElementById('modalBg').classList.add('show');
  onTaskTypeChange();
  uploadedTaskFiles = [];
  updateUploadedFilesDisplay();
}

/**
 * 关闭新建任务弹窗并重置表单
 */
function closeModal() {
  document.getElementById('modalBg').classList.remove('show');
  
  document.getElementById('taskName').value = '';
  document.getElementById('taskTarget').value = '';
  document.getElementById('taskSystemPrompt').value = '';
  document.getElementById('taskType').value = 'RE';
  document.getElementById('taskFileInput').value = '';
  
  uploadedTaskFiles = [];
  updateUploadedFilesDisplay();
}

// 点击遮罩层关闭弹窗
document.getElementById('modalBg')?.addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// ═══════════════════════════════════════════════════════════════
// 🔍 RE 模式联动逻辑
// ═══════════════════════════════════════════════════════════════

/**
 * 任务类型变更时，动态调整表单字段显示
 */
function onTaskTypeChange() {
  const type = document.getElementById('taskType').value;
  const targetGroup = document.getElementById('targetAddrGroup');
  const targetInput = document.getElementById('taskTarget');
  const uploadText = document.getElementById('uploadText');
  
  const typeHints = {
    'RE': '上传二进制文件、源码等',
    'WEB': '有需要就填写',
    'CRYPTO': '有需要就填写',
    'MISC': '有需要就填写'
  };
  
  uploadText.innerHTML = `点击或拖拽上传题目文件<br><span style="opacity:0.6;font-size:10px">${typeHints[type]}</span>`;
  
  if (type === 'RE') {
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
    if (!uploadedTaskFiles.find(f => f.name === file.name && f.size === file.size)) {
      uploadedTaskFiles.push({ name: file.name, size: file.size });
    }
  });
  updateUploadedFilesDisplay();
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
}

// ═══════════════════════════════════════════════════════════════
// 🎮 控制面板按钮事件
// ═══════════════════════════════════════════════════════════════

async function onStartClick() {
  const apiKey = document.getElementById('apiKey').value.trim();

  if (!apiKey) {
    addLog('err', '❌ 未配置 API 密钥，请先到配置页保存');
    switchPage('config');
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
  const apiKey = document.getElementById('apiKey').value.trim();
  const apiBase = document.getElementById('apiBase').value.trim();
  const fetchBtn = document.getElementById('fetchModelsBtn');
  const modelMeta = document.getElementById('modelMeta');
  
  if (!apiKey) {
    addLog('warn', '⚠️ 请先输入API密钥');
    if (modelMeta) modelMeta.textContent = '缺少 API 密钥，无法读取模型列表';
    return;
  }
  
  addLog('info', '正在获取模型列表...');
  if (fetchBtn) {
    fetchBtn.disabled = true;
    fetchBtn.textContent = '读取中...';
  }
  if (modelMeta) modelMeta.textContent = '正在同步模型列表...';
  
  const result = await apiRequest(`${API_BASE}/models`, {
    method: 'POST',
    body: JSON.stringify({ api_key: apiKey, api_base: apiBase })
  });
  
  if (result.success && result.data) {
    const modelSelect = document.getElementById('modelSelect');
    modelSelect.innerHTML = '<option value="">选择模型</option>';
    
    result.data.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      modelSelect.appendChild(option);
    });

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

async function onSaveConfigClick() {
  const btn = event.target;
  const originalText = btn.textContent;
  
  const apiKey = document.getElementById('apiKey').value;
  const apiBase = document.getElementById('apiBase').value;
  const model = document.getElementById('modelSelect').value;
  
  const result = await apiRequest(`${API_BASE}/config`, {
    method: 'POST',
    body: JSON.stringify({ api_key: apiKey, api_base: apiBase, model })
  });
  
  if (result.success) {
    btn.textContent = '✓ 已保存';
    btn.style.background = 'var(--dot)';
    
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = '';
    }, 1500);
    
    addLog('ok', '⚙️ 配置已成功保存');
  } else {
    addLog('err', `⚙️ 配置保存失败: ${result.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// 📋 任务卡片管理
// ═══════════════════════════════════════════════════════════════

/**
 * 创建新任务
 */
async function onCreateTaskClick() {
  const name = document.getElementById('taskName').value.trim();
  const type = document.getElementById('taskType').value;
  const target = document.getElementById('taskTarget').value.trim();
  const systemPrompt = document.getElementById('taskSystemPrompt').value.trim();
  
  if (!name) {
    alert('请输入任务名称');
    return;
  }
  
  const result = await apiRequest(`${API_BASE}/tasks`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      type,
      target,
      files: uploadedTaskFiles,
      systemPrompt
    })
  });
  
  if (result.success) {
    closeModal();
    refreshTasks();
    addLog('ok', `✓ 任务已创建`);
  } else {
    addLog('err', `任务创建失败: ${result.message}`);
  }
}

/**
 * 任务卡片 - 启动按钮
 */
async function onTaskStartClick(btn) {
  const card = btn.closest('.task-card');
  const taskId = card.querySelector('.task-id').textContent;
  const apiKey = document.getElementById('apiKey').value.trim();

  if (!apiKey) {
    addLog('err', '❌ 未配置 API 密钥，请先到配置页保存');
    switchPage('config');
    return;
  }
  
  const result = await apiRequest(`${API_BASE}/tasks/${taskId}/start`, {
    method: 'POST'
  });
  
  if (result.success) {
    addLog('ok', `任务 ${taskId} 已启动`);
    refreshTasks();
  } else {
    addLog('err', `任务启动失败: ${result.message}`);
  }
}

/**
 * 任务卡片 - 删除按钮
 */
async function onTaskDeleteClick(btn) {
  if (!confirm('确定删除此任务？')) return;
  
  const card = btn.closest('.task-card');
  const taskId = card.querySelector('.task-id').textContent;
  
  const result = await apiRequest(`${API_BASE}/tasks/${taskId}/delete`, {
    method: 'POST'
  });
  
  if (result.success) {
    refreshTasks();
    addLog('warn', `🗑️ 任务 ${taskId} 已删除`);
  } else {
    addLog('err', `任务删除失败: ${result.message}`);
  }
}

/**
 * 更新任务统计数字
 */
function updateTaskStats(tasks) {
  let run = 0, done = 0, err = 0;
  
  tasks.forEach(task => {
    if (task.status === 'running') run++;
    else if (task.status === 'done') done++;
    else if (task.status === 'error') err++;
  });
  
  document.getElementById('statRun').textContent = run;
  document.getElementById('statDone').textContent = done;
  document.getElementById('statErr').textContent = err;
}

/**
 * 刷新任务列表
 */
async function refreshTasks() {
  const result = await apiRequest(`${API_BASE}/tasks`);
  if (result.success && result.data) {
    queueOrRenderTasks(result.data);
    updateTaskStats(result.data);
  }
}

/**
 * 根据当前交互状态决定立即渲染还是暂存任务数据。
 */
function queueOrRenderTasks(tasks) {
  latestTaskPayload = tasks;
  const snapshot = JSON.stringify(tasks);

  if (isTaskRefreshPaused) {
    queuedTaskPayload = tasks;
    return;
  }

  if (snapshot === lastRenderedTaskSnapshot) {
    return;
  }

  renderTasks(tasks);
  lastRenderedTaskSnapshot = snapshot;
  queuedTaskPayload = null;
}

/**
 * 渲染任务卡片
 */
function renderTasks(tasks) {
  const grid = document.getElementById('taskGrid');

  grid.innerHTML = tasks.map(task => {
    const badgeClass = {
      'idle': 'badge-idle',
      'running': 'badge-run',
      'done': 'badge-done',
      'error': 'badge-err'
    }[task.status] || 'badge-idle';
    
    const badgeText = {
      'idle': '闲置',
      'running': '运行中',
      'done': '已完成',
      'error': '失败'
    }[task.status] || '闲置';
    
    const progressColor = task.status === 'running' ? '#4ade80' : 
                         task.status === 'done' ? '#60a5fa' : 
                         task.status === 'error' ? '#f87171' : '#444';
    
    const fileInfo = (task.files && task.files.length > 0) 
      ? `📎 ${task.files.length} 个文件` 
      : '';
    
    const createdDate = new Date(task.created_at);
    const timeStr = createdDate.toLocaleTimeString('zh-CN', { hour12: false });
    
    const detailData = buildTaskDetailData(task);
    const latestPreview = escapeHtml(detailData.engineeringLogs.at(-1) || '点击查看工程细节和 LLM 输出');
    
    // 安全转义用户输入
    const safeId = escapeHtml(task.id);
    const safeName = escapeHtml(task.name);
    const safeType = escapeHtml(task.type);
    const safeTarget = escapeHtml(task.target || '');
    
    return `
      <div class="task-card">
        <div class="task-bar">
          <div class="task-bar-fill" style="width:${task.progress}%;background:${progressColor}"></div>
        </div>
        <div class="task-head" onclick="openTaskDetailModal('${safeId}')" style="cursor:pointer">
          <div class="task-meta">
            <div class="task-id">${safeId}</div>
            <div class="task-name">
              ${safeName} <span style="color:var(--text-3);font-size:11px">[${safeType}]</span>
            </div>
            <div class="task-target">
              ${task.type === 'RE' ? (fileInfo || '等待上传文件') : (safeTarget || '📎 仅文件分析')}
            </div>
          </div>
          <div class="badge ${badgeClass}">${badgeText}</div>
        </div>
        <div class="task-log-area" onclick="openTaskDetailModal('${safeId}')" style="cursor:pointer">
          <div class="task-log-line preview">${latestPreview}</div>
        </div>
        <div class="task-foot">
          <div class="task-time">创建于 ${timeStr}</div>
          <div class="task-actions">
            <button class="task-btn primary" onclick="openTaskDetailModal('${task.id}')">查看详情</button>
            ${task.status === 'idle' ? `<button class="task-btn" onclick="event.stopPropagation();onTaskStartClick(this)">启动</button>` : ''}
            <button class="task-btn danger" onclick="event.stopPropagation();onTaskDeleteClick(this)">删除</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * 切换任务详情展开状态，并保留当前任务数据快照。
 * @deprecated 已改用浮窗模式，使用 openTaskDetailModal
 */
function toggleTaskDetails(taskId) {
  openTaskDetailModal(taskId);
}

/**
 * 打开任务详情浮窗
 */
function openTaskDetailModal(taskId) {
  const task = latestTaskPayload.find(t => t.id === taskId);
  if (!task) return;
  
  const detailData = buildTaskDetailData(task);
  
  // 设置标题
  document.getElementById('taskDetailTitle').innerHTML = `
    ${escapeHtml(task.id)} <span style="color:var(--text-3);font-size:12px">[${escapeHtml(task.type)}] ${escapeHtml(task.name)}</span>
  `;
  
  // 渲染浮窗内容
  document.getElementById('taskDetailContent').innerHTML = renderTaskDetailModal(detailData);
  
  // 显示浮窗
  document.getElementById('taskDetailModal').classList.add('show');
  
  // 暂停任务刷新
  pauseTaskRefresh();
}

/**
 * 关闭任务详情浮窗
 */
function closeTaskDetailModal(event) {
  // 如果传入了事件且点击的是浮窗背景（不是内容区域），或者没有传入事件（直接调用）
  if (!event || event.target === document.getElementById('taskDetailModal')) {
    document.getElementById('taskDetailModal').classList.remove('show');
    resumeTaskRefresh();
  }
}

/**
 * 构建任务详情区所需的工程信息与 LLM 输出。
 */
function buildTaskDetailData(task) {
  let llmOutput = '';
  const engineeringLogs = [];

  task.logs.forEach(log => {
    const parsedOutput = parseLlmOutput(log);
    if (parsedOutput) {
      llmOutput = parsedOutput;
    } else {
      engineeringLogs.push(log);
    }
  });

  return {
    task,
    llmOutput,
    engineeringLogs,
    filesLabel: task.files?.length ? task.files.map(file => file.name).join(', ') : '无',
    modulesLabel: task.modules?.length ? task.modules.join(', ') : '无',
    payloadLabel: task.payload ? task.payload : '默认',
  };
}

/**
 * 从日志中提取 LLM 输出文本。
 */
function parseLlmOutput(log) {
  const normalized = String(log);
  const match = normalized.match(/^(?:\[\d{2}:\d{2}:\d{2}\]\s*)?(AI分析结果|扫描报告):\s*\n?([\s\S]*)$/);
  if (!match) return '';
  return match[2].trim();
}

/**
 * 渲染任务展开后的详情区域。
 */
function renderTaskDetails(detailData) {
  const { task, llmOutput, engineeringLogs, filesLabel, modulesLabel, payloadLabel } = detailData;
  const metaHtml = [
    ['状态', task.status],
    ['进度', `${task.progress}%`],
    ['目标', task.target || '无'],
    ['模块', modulesLabel],
    ['文件', filesLabel],
    ['Payload', payloadLabel]
  ].map(([label, value]) => `
    <div class="task-meta-chip">
      <span class="task-meta-chip-label">${escapeHtml(label)}</span>
      <span class="task-meta-chip-value">${escapeHtml(value)}</span>
    </div>
  `).join('');

  const engineeringLogHtml = engineeringLogs.length
    ? engineeringLogs.map(log => `<div class="task-engineering-log">${escapeHtml(log)}</div>`).join('')
    : '<div class="task-engineering-log">暂无工程日志</div>';

  const llmHtml = llmOutput
    ? `<div class="markdown-content">${renderMarkdown(llmOutput)}</div>`
    : '<div class="task-llm-empty">暂无 LLM 输出。等待任务完成后，这里会展示渲染后的 Markdown 报告。</div>';

  return `
    <div class="task-details">
      <section class="task-detail-block">
        <div class="task-detail-head">
          <div class="task-detail-title">工程块</div>
        </div>
        <div class="task-detail-body">
          <div class="task-engineering-meta">${metaHtml}</div>
          <div class="task-engineering-loglist">${engineeringLogHtml}</div>
        </div>
      </section>
      <section class="task-detail-block">
        <div class="task-detail-head">
          <div class="task-detail-title">LLM 输出块</div>
        </div>
        <div class="task-detail-body">
          <div class="task-llm-content">${llmHtml}</div>
        </div>
      </section>
    </div>
  `;
}

/**
 * 渲染任务详情浮窗内容（工程块 + LLM输出块）
 */
function renderTaskDetailModal(detailData) {
  const { task, llmOutput, engineeringLogs, filesLabel, modulesLabel, payloadLabel } = detailData;
  
  // 状态标签和颜色
  const statusMap = {
    'idle': { text: '闲置', color: '#a1a1aa' },
    'running': { text: '运行中', color: '#4ade80' },
    'done': { text: '已完成', color: '#60a5fa' },
    'error': { text: '失败', color: '#f87171' }
  };
  const statusInfo = statusMap[task.status] || statusMap['idle'];
  
  // 工程块元数据
  const metaItems = [
    ['状态', `<span style="color:${statusInfo.color}">${statusInfo.text}</span>`],
    ['进度', `${task.progress}%`],
    ['类型', task.type],
    ['目标', task.target || '无'],
    ['模块', modulesLabel],
    ['文件', filesLabel],
    ['Payload', payloadLabel],
    ['创建时间', new Date(task.created_at).toLocaleString('zh-CN')]
  ];
  
  const metaHtml = metaItems.map(([label, value]) => `
    <div class="task-meta-item">
      <div class="task-meta-label">${escapeHtml(label)}</div>
      <div class="task-meta-value">${value}</div>
    </div>
  `).join('');
  
  // 工程日志
  const logsHtml = engineeringLogs.length
    ? engineeringLogs.map(log => `<div class="task-log-entry">${escapeHtml(log)}</div>`).join('')
    : '<div class="task-log-entry" style="color:var(--text-3)">暂无工程日志</div>';
  
  // LLM 输出
  const llmHtml = llmOutput
    ? `<div class="markdown-content">${renderMarkdown(llmOutput)}</div>`
    : '<div class="llm-empty-state">暂无 LLM 输出<br>等待任务完成后，这里会展示渲染后的 Markdown 报告</div>';
  
  return `
    <div class="task-detail-panel task-detail-engineering">
      <div class="task-detail-panel-header">
        <div class="task-detail-panel-title">⚙️ 工程块</div>
        <div style="font-size:11px;color:var(--text-3)">${engineeringLogs.length} 条日志</div>
      </div>
      <div class="task-detail-panel-body">
        <div class="task-meta-grid">
          ${metaHtml}
        </div>
        <div class="task-logs">
          ${logsHtml}
        </div>
      </div>
    </div>
    <div class="task-detail-panel task-detail-llm">
      <div class="task-detail-panel-header">
        <div class="task-detail-panel-title">🤖 LLM 输出块</div>
      </div>
      <div class="task-detail-panel-body">
        ${llmHtml}
      </div>
    </div>
  `;
}

/**
 * 将 Markdown 文本渲染成基础 HTML。
 */
function renderMarkdown(markdown) {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let paragraphBuffer = [];
  let listBuffer = [];
  let listType = '';
  let codeFence = false;
  let codeBuffer = [];
  let tableBuffer = [];

  function flushParagraph() {
    if (!paragraphBuffer.length) return;
    html.push(`<p>${renderInlineMarkdown(paragraphBuffer.join(' '))}</p>`);
    paragraphBuffer = [];
  }

  function flushList() {
    if (!listBuffer.length) return;
    const tag = listType === 'ol' ? 'ol' : 'ul';
    html.push(`<${tag}>${listBuffer.map(item => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</${tag}>`);
    listBuffer = [];
    listType = '';
  }

  function flushCodeBlock() {
    if (!codeBuffer.length) return;
    html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
    codeBuffer = [];
  }

  function flushTable() {
    if (tableBuffer.length < 2 || !isMarkdownTableSeparator(tableBuffer[1])) {
      paragraphBuffer.push(...tableBuffer);
      tableBuffer = [];
      return;
    }

    const headerCells = splitMarkdownTableRow(tableBuffer[0]);
    const bodyRows = tableBuffer.slice(2).map(splitMarkdownTableRow);
    const headerHtml = headerCells.map(cell => `<th>${renderInlineMarkdown(cell)}</th>`).join('');
    const bodyHtml = bodyRows
      .map(row => `<tr>${row.map(cell => `<td>${renderInlineMarkdown(cell)}</td>`).join('')}</tr>`)
      .join('');

    html.push(`
      <table>
        <thead><tr>${headerHtml}</tr></thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    `);
    tableBuffer = [];
  }

  lines.forEach(line => {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      flushParagraph();
      flushList();
      flushTable();
      if (codeFence) {
        flushCodeBlock();
        codeFence = false;
      } else {
        codeFence = true;
      }
      return;
    }

    if (codeFence) {
      codeBuffer.push(line);
      return;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      flushTable();
      return;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      flushTable();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      return;
    }

    const blockquoteMatch = trimmed.match(/^>\s?(.*)$/);
    if (blockquoteMatch) {
      flushParagraph();
      flushList();
      flushTable();
      html.push(`<blockquote>${renderInlineMarkdown(blockquoteMatch[1])}</blockquote>`);
      return;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      flushTable();
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listBuffer.push(orderedMatch[1]);
      return;
    }

    const unorderedMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (unorderedMatch) {
      flushParagraph();
      flushTable();
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      listBuffer.push(unorderedMatch[1]);
      return;
    }

    if (isMarkdownTableCandidate(trimmed)) {
      flushParagraph();
      flushList();
      tableBuffer.push(trimmed);
      return;
    }

    flushList();
    flushTable();
    paragraphBuffer.push(trimmed);
  });

  if (codeFence) flushCodeBlock();
  flushParagraph();
  flushList();
  flushTable();

  return html.join('');
}

/**
 * 渲染 Markdown 行内语法。
 */
function renderInlineMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return html;
}

/**
 * 判断某一行是否可能是 Markdown 表格行。
 */
function isMarkdownTableCandidate(line) {
  return (line.match(/\|/g) || []).length >= 2;
}

/**
 * 判断某一行是否是 Markdown 表头分隔线。
 */
function isMarkdownTableSeparator(line) {
  const cells = splitMarkdownTableRow(line);
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));
}

/**
 * 将一行 Markdown 表格拆分成单元格。
 */
function splitMarkdownTableRow(line) {
  const trimmedLine = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmedLine.split('|').map(cell => cell.trim());
}

/**
 * 转义 HTML 特殊字符，避免日志内容直接注入 DOM。
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 暂停任务列表自动重绘，避免用户拖动时 DOM 被整体替换。
 */
function pauseTaskRefresh() {
  isTaskRefreshPaused = true;
  document.body.classList.add('task-refresh-paused');
}

/**
 * 恢复任务列表自动重绘，并应用拖动期间积压的最新任务快照。
 */
function resumeTaskRefresh() {
  if (!isTaskRefreshPaused) return;

  isTaskRefreshPaused = false;
  document.body.classList.remove('task-refresh-paused');

  if (queuedTaskPayload) {
    queueOrRenderTasks(queuedTaskPayload);
  }
}

/**
 * 开始定时刷新任务
 */
function startTaskRefresh() {
  stopTaskRefresh();
  taskRefreshInterval = setInterval(refreshTasks, 2000);
}

/**
 * 停止定时刷新任务
 */
function stopTaskRefresh() {
  if (taskRefreshInterval) {
    clearInterval(taskRefreshInterval);
    taskRefreshInterval = null;
  }
}

// ═══════════════════════════════════════════════════════════════
// 📝 日志系统
// ═══════════════════════════════════════════════════════════════

/**
 * 向日志面板添加一条记录
 */
function addLog(level, msg) {
  const now = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const tagMap = {
    sys: '[SYS]',
    info: '[INFO]',
    ok: '[OK]',
    warn: '[WARN]',
    err: '[ERR]'
  };
  const tag = tagMap[level] || tagMap.info;
  console.log(`${now} ${tag} ${msg}`);
}

// ═══════════════════════════════════════════════════════════════
// 🚀 初始化入口
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  addLog('sys', 'POFP Agent 已启动');
  addLog('info', '界面已加载，等待指令...');
  
  onTaskTypeChange();
  
  try {
    const result = await apiRequest(`${API_BASE}/config`);
    if (result.success && result.data) {
      if (result.data.api_key) document.getElementById('apiKey').value = result.data.api_key;
      if (result.data.api_base) document.getElementById('apiBase').value = result.data.api_base;
      
      if (result.data.api_key) {
        await fetchModels();
        if (result.data.model) {
          document.getElementById('modelSelect').value = result.data.model;
          document.getElementById('modelMeta').textContent = `当前默认模型: ${result.data.model}`;
        }
      } else {
        document.getElementById('modelMeta').textContent = '请先填写 API 密钥，再读取模型列表';
      }
      
      addLog('ok', '⚙️ 配置已从后端加载');
    }
  } catch (error) {
    addLog('warn', '⚙️ 无法连接后端，使用本地存储');
    const savedKey = localStorage.getItem('ctf_api_key');
    const savedBase = localStorage.getItem('ctf_api_base');
    if (savedKey) document.getElementById('apiKey').value = savedKey;
    if (savedBase) document.getElementById('apiBase').value = savedBase;
  }

  const taskGrid = document.getElementById('taskGrid');
  const tasksPage = document.getElementById('page-tasks');
  taskGrid?.addEventListener('pointerdown', pauseTaskRefresh);
  taskGrid?.addEventListener('dragstart', pauseTaskRefresh);
  tasksPage?.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.task-log-area, .task-card, .task-grid')) {
      pauseTaskRefresh();
    }
  });
  window.addEventListener('pointerup', resumeTaskRefresh);
  window.addEventListener('dragend', resumeTaskRefresh);
  window.addEventListener('blur', resumeTaskRefresh);
});

// 全局错误捕获
window.addEventListener('error', (e) => {
  console.error('💥 Agent 运行时错误:', e.message);
  if (typeof addLog === 'function') {
    addLog('err', `💥 ${e.message} @${e.filename}:${e.lineno}`);
  }
});
