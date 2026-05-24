// 任务排序状态
let taskSortState = {
  by: 'updated_at',  // 'updated_at' | 'created_at' | 'name'
  asc: false         // true = 正序, false = 倒序
};

/**
 * 对任务列表进行排序
 */
function sortTasks(tasks) {
  const { by, asc } = taskSortState;
  const sorted = [...tasks];
  
  sorted.sort((a, b) => {
    let valA, valB;
    
    switch (by) {
      case 'created_at':
        valA = new Date(a.created_at || 0).getTime();
        valB = new Date(b.created_at || 0).getTime();
        break;
      case 'updated_at':
        valA = new Date(a.updated_at || a.created_at || 0).getTime();
        valB = new Date(b.updated_at || b.created_at || 0).getTime();
        break;
      case 'name':
        valA = (a.name || '').toLowerCase();
        valB = (b.name || '').toLowerCase();
        break;
      default:
        return 0;
    }
    
    if (valA < valB) return asc ? -1 : 1;
    if (valA > valB) return asc ? 1 : -1;
    return 0;
  });
  
  return sorted;
}

/**
 * 处理排序方式变更
 */
function onTaskSortChange() {
  const select = document.getElementById('taskSortBy');
  if (select) {
    taskSortState.by = select.value;
    renderTasks(latestTaskPayload);
  }
}

/**
 * 切换排序方向
 */
function toggleTaskSortDirection() {
  taskSortState.asc = !taskSortState.asc;
  const btn = document.getElementById('taskSortDir');
  if (btn) {
    btn.textContent = taskSortState.asc ? '↑' : '↓';
    btn.title = taskSortState.asc ? '正序' : '倒序';
  }
  renderTasks(latestTaskPayload);
}

/**
 * 更新任务统计数字
 */
function updateTaskStats(tasks) {
  let run = 0, done = 0, err = 0;
  
  tasks.forEach(task => {
    const statusKey = getTaskStatusKey(task);
    if (statusKey === 'running') run++;
    else if (statusKey === 'done') done++;
    else if (statusKey === 'error' || statusKey === 'canceled') err++;
  });
  
  document.getElementById('statRun').textContent = run;
  document.getElementById('statDone').textContent = done;
  document.getElementById('statErr').textContent = err;
}

/**
 * 刷新任务列表
 */
async function fetchLatestTasksSnapshot() {
  if (!isAuthenticated()) {
    latestTaskPayload = [];
    queuedTaskPayload = null;
    queueOrRenderTasks([]);
    updateTaskStats([]);
    return [];
  }
  const result = await apiRequest(`${API_BASE}/tasks`);
  if (!result.success || !Array.isArray(result.data)) {
    return null;
  }
  latestTaskPayload = result.data;
  queuedTaskPayload = isTaskRefreshPaused ? result.data : null;
  updateTaskStats(result.data);
  return result.data;
}

async function withRefreshButtonState(buttonId, action) {
  const refreshButton = buttonId ? document.getElementById(buttonId) : null;
  const originalLabel = refreshButton ? refreshButton.textContent : '刷新';
  if (refreshButton) {
    refreshButton.disabled = true;
    refreshButton.classList.add('is-loading');
    refreshButton.textContent = '刷新中...';
  }
  try {
    return await action();
  } finally {
    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.classList.remove('is-loading');
      refreshButton.textContent = originalLabel;
    }
  }
}

async function refreshTasks() {
  const tasks = await fetchLatestTasksSnapshot();
  if (tasks) {
    queueOrRenderTasks(tasks);
  }
}

async function refreshTasksWithButton(buttonId = 'taskListRefreshBtn') {
  await withRefreshButtonState(buttonId, async () => {
    const tasks = await fetchLatestTasksSnapshot();
    if (!tasks) {
      return;
    }
    queueOrRenderTasks(tasks);
    refreshOpenTaskDetailModal(tasks);
    refreshOpenLogPanelModal(tasks);
    refreshOpenThinkingGraphModal(tasks);
    refreshOpenSwarmRunModal(tasks);
  });
}

async function refreshActiveTaskDetailModal() {
  if (!activeTaskDetailId || !isAuthenticated()) {
    return;
  }
  await withRefreshButtonState('taskDetailRefreshBtn', async () => {
    const tasks = await fetchLatestTasksSnapshot();
    if (!tasks) {
      return;
    }
    refreshOpenTaskDetailModal(tasks);
    refreshOpenLogPanelModal(tasks);
    refreshOpenThinkingGraphModal(tasks);
    refreshOpenSwarmRunModal(tasks);
  });
}

async function refreshActiveThinkingGraphModal() {
  if (!activeThinkingGraphModalTaskId || !isAuthenticated()) {
    return;
  }
  await withRefreshButtonState('thinkingGraphRefreshBtn', async () => {
    const tasks = await fetchLatestTasksSnapshot();
    if (!tasks) {
      return;
    }
    refreshOpenTaskDetailModal(tasks);
    refreshOpenThinkingGraphModal(tasks);
    refreshOpenSwarmRunModal(tasks);
  });
}

async function refreshActiveSwarmRunModal() {
  if (!activeSwarmRunModalTaskId || !activeSwarmRunModalRunId || !isAuthenticated()) {
    return;
  }
  await withRefreshButtonState('swarmRunRefreshBtn', async () => {
    const tasks = await fetchLatestTasksSnapshot();
    if (!tasks) {
      return;
    }
    refreshOpenTaskDetailModal(tasks);
    refreshOpenSwarmRunModal(tasks);
  });
}

/**
 * 根据当前交互状态决定立即渲染还是暂存任务数据。
 */
function queueOrRenderTasks(tasks) {
  // 如果刷新被暂停，先暂存数据，不更新全局状态和浮窗
  if (isTaskRefreshPaused) {
    queuedTaskPayload = tasks;
    return;
  }

  // 只有在未暂停状态下才更新全局状态和刷新 UI
  latestTaskPayload = tasks;
  const snapshot = JSON.stringify(tasks);

  refreshOpenTaskDetailModal(tasks);
  refreshOpenLogPanelModal(tasks);
  refreshOpenThinkingGraphModal(tasks);

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
  
  // 应用排序
  const sortedTasks = sortTasks(tasks);

  grid.innerHTML = sortedTasks.map(task => {
    const actionButtons = renderTaskActionButtons(task, { fromCard: true });
    const statusKey = getTaskStatusKey(task);
    const badgeClass = getTaskStatusBadgeClass(task);
    const badgeText = getTaskStatusLabel(task);
    
    const progressColor = statusKey === 'running' ? '#4ade80' :
                         statusKey === 'done' ? '#60a5fa' :
                         (statusKey === 'error' || statusKey === 'canceled') ? '#f87171' : '#444';
    
    const fileInfo = (task.files && task.files.length > 0) 
      ? `📎 ${task.files.length} 个文件` 
      : '';
    
    const timeStr = formatDateTime(task.created_at);
    
    const detailData = buildTaskDetailData(task);
    
    // 安全转义用户输入
    const safeId = escapeHtml(task.id);
    const safeName = escapeHtml(task.name);
    const safeType = escapeHtml(getTaskTypeLabel(task.type));
    const safeTarget = escapeHtml(task.target || '');
    const progressPercent = detailData.progressPercent;
    const summaryBlocks = renderTaskCardSummaryBlocks(task, detailData, { fileInfo, safeTarget });
    
    return `
      <div class="task-card">
        <div class="task-bar">
          <div class="task-bar-fill" style="width:${progressPercent}%;background:${progressColor}"></div>
        </div>
        <div class="task-head" onclick="openTaskDetailModal('${safeId}')" style="cursor:pointer">
          <div class="task-meta">
            <div class="task-id">${safeId}</div>
            <div class="task-name">
              ${safeName} <span style="color:var(--text-3);font-size:11px">[${safeType}]</span>
            </div>
            <div class="task-target">
              ${LOCAL_FILE_TASK_TYPES.has(task.type) ? (fileInfo || '等待上传文件') : (safeTarget || (isLearningWorkflowTask(task) ? '填写学习主题或 URL' : '📎 仅文件分析'))}
            </div>
          </div>
          <div class="badge ${badgeClass}">${badgeText}</div>
        </div>
        <div class="task-log-area" onclick="openTaskDetailModal('${safeId}')" style="cursor:pointer">
          ${summaryBlocks}
        </div>
        <div class="task-foot">
          <div class="task-time">创建于 ${timeStr}</div>
          <div class="task-actions">
            <button class="task-btn primary" onclick="openTaskDetailModal('${safeId}')">查看详情</button>
            ${actionButtons}
            <button class="task-btn danger" onclick="event.stopPropagation();onTaskDeleteClick('${safeId}', this)">删除</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Render a compact block summary for one task card.
 *
 * @param {Object} task - Backend task snapshot used to derive current task state.
 * @param {Object} detailData - Derived task detail data produced by `buildTaskDetailData`.
 * @param {Object} display - Precomputed display values from the card renderer.
 * @returns {string} HTML string containing small, independently scannable summary blocks.
 */
function renderTaskCardSummaryBlocks(task, detailData, display = {}) {
  const targetLabel = LOCAL_FILE_TASK_TYPES.has(task.type)
    ? (display.fileInfo || '等待上传文件')
    : (task.target || (isLearningWorkflowTask(task) ? '填写学习主题或 URL' : '仅文件分析'));
  const latestProgress = detailData.engineeringLogs.at(-1) || '点击查看工程细节和 LLM 输出';
  const executionLabel = isLearningWorkflowTask(task)
    ? (task.executionMode === 'swarm' ? 'Swarm 学习' : '单代理学习')
    : (task.executionMode === 'swarm' ? 'Swarm 并行' : '单代理');

  // Keep each card preview as three stable blocks so list scanning stays predictable.
  const blocks = [
    ['对象', targetLabel],
    ['最新进展', latestProgress],
    ['执行', `${executionLabel} · ${detailData.progressPercent}%`],
  ];

  return `
    <div class="task-summary-grid">
      ${blocks.map(([label, value]) => `
        <div class="task-summary-block">
          <div class="task-summary-label">${escapeHtml(label)}</div>
          <div class="task-summary-value">${escapeHtml(value)}</div>
        </div>
      `).join('')}
    </div>
  `;
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
  
  // 先暂停任务刷新，避免在打开面板过程中数据被更新导致显示错误
  pauseTaskRefresh();
  
  activeTaskDetailId = taskId;

  if (!taskDetailOutputPageState.has(taskId)) {
    const initialOutputs = collectFormalOutputs(task.logs);
    taskDetailOutputPageState.set(taskId, Math.max(initialOutputs.length - 1, 0));
  }
  if (!taskDetailTabState.has(taskId)) {
    taskDetailTabState.set(taskId, 'progress');
  }
  
  renderTaskDetailModalForTask(task);
  
  // 显示浮窗
  document.getElementById('taskDetailModal').classList.add('show');
  requestAnimationFrame(() => syncThinkingGraphFloatingLabel(taskId));
}

/**
 * 关闭任务详情浮窗
 */
function closeTaskDetailModal(event) {
  // 如果传入了事件且点击的是浮窗背景（不是内容区域），或者没有传入事件（直接调用）
  if (!event || event.target === document.getElementById('taskDetailModal')) {
    captureTaskDetailScrollState(activeTaskDetailId);
    removeThinkingGraphFloatingLabel();
    activeTaskDetailId = null;
    document.getElementById('taskDetailModal').classList.remove('show');
    // 恢复任务刷新
    resumeTaskRefresh();
  }
}

/**
 * 打开日志面板展开浮窗
 */
function openLogPanelModal(taskId, type) {
  event.stopPropagation();
  
  // 先暂停任务刷新，避免在打开面板过程中数据被更新
  pauseTaskRefresh();
  
  // 从最新的任务列表中查找任务
  const task = latestTaskPayload.find(t => t.id === taskId);
  if (!task) {
    console.error(`[LogPanel] 错误: 任务 ${taskId} 未找到，当前 latestTaskPayload 有 ${latestTaskPayload.length} 个任务`);
    addLog('err', `无法打开日志面板: 任务 ${taskId} 数据未找到`);
    resumeTaskRefresh();
    return;
  }
  
  // 设置当前活动的日志面板任务
  activeLogPanelTaskId = taskId;
  activeLogPanelType = type;

  const detailData = buildTaskDetailData(task);
  const titles = {
    'tool': '🧰 工具块',
    'verbose': '🛰 Agent Verbose',
    'llm': '🤖 LLM 输出块'
  };
  document.getElementById('logPanelTitle').textContent = titles[type] || type;
  document.getElementById('logPanelContent').innerHTML = renderLogPanelContent(detailData, type);
  document.getElementById('logPanelModal').classList.add('show');
  
  console.log(`[LogPanel] 已打开 ${taskId} 的 ${type} 日志面板`);
}

/**
 * 关闭日志面板展开浮窗
 */
function closeLogPanelModal(event) {
  if (!event || event.target === document.getElementById('logPanelModal')) {
    activeLogPanelTaskId = null;
    activeLogPanelType = null;
    document.getElementById('logPanelModal').classList.remove('show');
    // 恢复任务刷新
    resumeTaskRefresh();
  }
}

/**
 * 渲染日志面板展开浮窗内容
 */
function renderLogPanelContent(detailData, type) {
  let logs, emptyText, contentHtml;
  
  if (type === 'tool') {
    logs = detailData.toolLogs;
    emptyText = '暂无工具日志';
    contentHtml = logs.length
      ? logs.map(log => `<div class="task-log-entry">${escapeHtml(log)}</div>`).join('')
      : `<div class="task-log-entry task-log-entry-empty">${emptyText}</div>`;
  } else if (type === 'verbose') {
    logs = detailData.verboseLogs;
    emptyText = '暂无 Agent verbose 日志';
    contentHtml = logs.length
      ? logs.map(log => `<div class="task-log-entry">${escapeHtml(log)}</div>`).join('')
      : `<div class="task-log-entry task-log-entry-empty">${emptyText}</div>`;
  } else if (type === 'llm') {
    const llmOutputs = detailData.llmOutputs || [];
    const activeIndex = detailData.activeOutputIndex || 0;
    if (llmOutputs.length === 0) {
      contentHtml = `<div class="task-log-entry task-log-entry-empty">暂无 LLM 输出</div>`;
    } else {
      const output = llmOutputs[activeIndex] || llmOutputs[llmOutputs.length - 1];
      contentHtml = `
        <div class="task-log-entry" style="white-space:pre-wrap;font-family:'JetBrains Mono',monospace;font-size:12px;">
          ${escapeHtml(output.content || '无内容')}
        </div>
      `;
    }
  }

  return `<div class="log-panel-body">${contentHtml}</div>`;
}

/**
 * 刷新已打开的日志面板展开浮窗
 * 使用增量更新，避免完全重绘导致滚动位置和选择状态丢失
 */
function refreshOpenLogPanelModal(tasks) {
  if (!tasks) {
    console.error('[LogPanel] 错误: refreshOpenLogPanelModal 需要传入 tasks 参数');
    return;
  }
  
  const modal = document.getElementById('logPanelModal');
  if (!modal || !modal.classList.contains('show') || !activeLogPanelTaskId || !activeLogPanelType) {
    return;
  }

  // 如果用户在浮窗内正在选中文本，跳过刷新
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed) {
    const anchorNode = selection.anchorNode;
    if (anchorNode && modal.contains(anchorNode)) {
      return;
    }
  }

  // 如果浮窗内有输入框获得焦点，跳过刷新以避免吞掉正在输入的内容
  if (modal.contains(document.activeElement) &&
      (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT')) {
    return;
  }

  // 如果任务列表为空，保持浮窗打开
  if (tasks.length === 0) {
    return;
  }

  const task = tasks.find(t => t.id === activeLogPanelTaskId);
  if (!task) {
    console.warn(`[LogPanel] 警告: 任务 ${activeLogPanelTaskId} 在当前列表中未找到`);
    return;
  }

  const detailData = buildTaskDetailData(task);
  const contentEl = document.getElementById('logPanelContent');
  const scrollContainer = contentEl.querySelector('.log-panel-body');
  
  if (!scrollContainer) {
    // 首次渲染
    contentEl.innerHTML = renderLogPanelContent(detailData, activeLogPanelType);
    return;
  }

  // 增量更新：只追加新日志，不替换整个内容
  const logs = activeLogPanelType === 'tool' ? detailData.toolLogs :
               activeLogPanelType === 'verbose' ? detailData.verboseLogs : null;
  
  if (logs) {
    // 获取当前已显示的日志条目
    const existingEntries = scrollContainer.querySelectorAll('.task-log-entry:not(.task-log-entry-empty)');
    const existingCount = existingEntries.length;
    
    // 如果有新日志，追加它们
    if (logs.length > existingCount) {
      // 如果之前显示的是"暂无日志"，清空容器
      if (existingEntries.length === 0 && scrollContainer.querySelector('.task-log-entry-empty')) {
        scrollContainer.innerHTML = '';
      }
      
      // 追加新日志条目
      const newLogs = logs.slice(existingCount);
      const fragment = document.createDocumentFragment();
      newLogs.forEach(log => {
        const entry = document.createElement('div');
        entry.className = 'task-log-entry';
        entry.textContent = log;
        fragment.appendChild(entry);
      });
      scrollContainer.appendChild(fragment);
      
      // 更新标题计数
      const titleEl = document.getElementById('logPanelTitle');
      if (titleEl) {
        const titles = {
          'tool': '🧰 工具块',
          'verbose': '🛰 Agent Verbose',
          'llm': '🤖 LLM 输出块'
        };
        titleEl.textContent = titles[activeLogPanelType] || activeLogPanelType;
      }
    }
    // 如果日志数量相同，不做任何更新（保留滚动位置和选择状态）
  } else if (activeLogPanelType === 'llm') {
    // LLM 输出需要特殊处理，因为可能有分页
    const newHtml = renderLogPanelContent(detailData, activeLogPanelType);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = newHtml;
    const newBody = tempDiv.querySelector('.log-panel-body');
    
    if (newBody && scrollContainer.innerHTML !== newBody.innerHTML) {
      const savedScrollTop = scrollContainer.scrollTop;
      scrollContainer.innerHTML = newBody.innerHTML;
      scrollContainer.scrollTop = savedScrollTop;
    }
  }
}

function appendLogEntries(container, newLogs) {
  if (!container) return;
  const existingEntries = container.querySelectorAll('.task-log-entry:not(.task-log-entry-empty)');
  const existingCount = existingEntries.length;

  if (newLogs.length > existingCount) {
    if (existingCount === 0 && container.querySelector('.task-log-entry-empty')) {
      container.innerHTML = '';
    }
    const fragment = document.createDocumentFragment();
    newLogs.slice(existingCount).forEach(log => {
      const entry = document.createElement('div');
      entry.className = 'task-log-entry';
      entry.textContent = log;
      fragment.appendChild(entry);
    });
    container.appendChild(fragment);
  }
}

function updateProgressPage(container, task, detailData) {
  const statusMap = {
    'idle': { text: '闲置', color: '#a1a1aa' },
    'running': { text: '运行中', color: '#4ade80' },
    'done': { text: '已完成', color: '#60a5fa' },
    'error': { text: '失败', color: '#f87171' },
    'canceled': { text: '已中止', color: '#f87171' }
  };
  const statusInfo = statusMap[getTaskStatusKey(task)] || statusMap['idle'];
  const progressPercent = detailData.progressPercent;

  // 更新 Hero 状态栏
  const badge = container.querySelector('.task-progress-badge');
  if (badge) {
    badge.textContent = statusInfo.text;
    badge.style.color = statusInfo.color;
    badge.style.borderColor = statusInfo.color;
  }

  const barFill = container.querySelector('.task-progress-bar-fill');
  if (barFill) {
    barFill.style.width = `${progressPercent}%`;
    barFill.style.background = statusInfo.color;
  }

  const percent = container.querySelector('.task-progress-percent');
  if (percent) percent.textContent = `${progressPercent}% 完成`;

  const typeBadge = container.querySelector('.task-progress-type-badge');
  if (typeBadge) typeBadge.textContent = escapeHtml(task.type);

  // 更新左侧信息区（仅替换发生变化的子项，保留容器滚动位置）
  const leftCol = container.querySelector('.task-progress-col');
  if (leftCol) {
    const updates = [
      { label: '状态', text: statusInfo.text, color: statusInfo.color },
      { label: '进度', text: `${progressPercent}%` },
      { label: '类型', text: escapeHtml(task.type) },
      { label: '目标', text: escapeHtml(task.target || '无') },
      { label: 'GZCTF ID', text: escapeHtml(task.gzctfChallengeId || '未设置') },
      { label: '模块', text: escapeHtml(detailData.modulesLabel) },
      { label: '文件', text: escapeHtml(detailData.filesLabel) },
      { label: 'Payload', text: escapeHtml(detailData.payloadLabel) },
      { label: 'Skills', html: detailData.skillsLabel },
      { label: '工作空间', text: escapeHtml(detailData.workspaceLabel) },
      { label: '创建时间', text: escapeHtml(formatDateTime(task.created_at)) },
    ];

    for (const upd of updates) {
      for (const item of leftCol.querySelectorAll('.task-progress-info-item')) {
        const lbl = item.querySelector('.task-progress-info-label');
        if (lbl && lbl.textContent.trim() === upd.label) {
          const valEl = item.querySelector('.task-progress-info-value');
          if (valEl) {
            if ('color' in upd) valEl.style.color = upd.color;
            const newContent = upd.html !== undefined ? upd.html : upd.text;
            if (valEl.innerHTML !== newContent) valEl.innerHTML = newContent;
          }
          break;
        }
      }
    }
  }

  // 更新右侧日志区（增量追加，避免 innerHTML 全量替换导致选中和滚动位置丢失）
  const { toolLogs, verboseLogs } = detailData;

  const logPanels = container.querySelectorAll('.task-progress-log-panel');
  if (logPanels.length >= 2) {
    const toolCount = logPanels[0].querySelector('.task-progress-log-panel-count');
    const toolBody = logPanels[0].querySelector('.task-progress-log-panel-body');
    if (toolCount) toolCount.textContent = `${toolLogs.length} 条`;
    appendLogEntries(toolBody, toolLogs);

    const verbCount = logPanels[1].querySelector('.task-progress-log-panel-count');
    const verbBody = logPanels[1].querySelector('.task-progress-log-panel-body');
    if (verbCount) verbCount.textContent = `${verboseLogs.length} 条`;
    appendLogEntries(verbBody, verboseLogs);

    // 同步更新标题栏的点击事件绑定，防止极端情况下的串台
    const toolHeader = logPanels[0].querySelector('.task-progress-log-panel-header');
    const verbHeader = logPanels[1].querySelector('.task-progress-log-panel-header');
    if (toolHeader) toolHeader.setAttribute('onclick', `openLogPanelModal('${escapeHtml(task.id)}', 'tool')`);
    if (verbHeader) verbHeader.setAttribute('onclick', `openLogPanelModal('${escapeHtml(task.id)}', 'verbose')`);
  }

  refreshOpenLogPanelModal([task]);
}

function renderTaskDetailModalForTask(task, options = {}) {
  const { preserveScroll = false } = options;
  const scrollState = preserveScroll ? captureTaskDetailScrollState(task.id) : null;
  const detailData = buildTaskDetailData(task);

  document.getElementById('taskDetailTitle').innerHTML = `
    ${escapeHtml(task.id)} <span style="color:var(--text-3);font-size:12px">[${escapeHtml(getTaskTypeLabel(task.type))}] ${escapeHtml(task.name)}</span>
  `;

  const contentEl = document.getElementById('taskDetailContent');

  // 当前进度页签支持子板块级局部更新，避免左侧信息区滚动位置丢失
  // 仅在同一个任务且已存在 progress DOM 时才增量更新；切换任务时必须全量重绘，避免事件绑定串台
  const canIncrementalUpdate = detailData.activeTab === 'progress'
    && contentEl.querySelector('.task-progress-root')
    && lastRenderedTaskDetailId === task.id;

  if (canIncrementalUpdate) {
    updateProgressPage(contentEl, task, detailData);
    // 操作按钮栏也要同步更新（状态变化时可能可用性改变）
    const actionsBody = contentEl.querySelector('.task-detail-panel-actions .task-detail-panel-body');
    if (actionsBody) {
      const actionButtons = renderTaskActionButtons(task);
      const editButton = getTaskStatusKey(task) !== 'running'
        ? `<button class="task-btn" onclick="openEditTaskModal('${task.id}')">编辑</button>`
        : '';
      const newActionsHtml = `
        <div class="task-actions" style="justify-content:flex-end">
          ${editButton}
          ${actionButtons || '<span style="color:var(--text-3);font-size:12px">当前状态下没有可执行操作</span>'}
        </div>
      `;
      if (actionsBody.innerHTML.trim() !== newActionsHtml.trim()) {
        actionsBody.innerHTML = newActionsHtml;
      }
    }
  } else {
    contentEl.innerHTML = renderTaskDetailModal(detailData);
    lastRenderedTaskDetailId = task.id;
  }

  if (preserveScroll) {
    restoreTaskDetailScrollState(task.id, scrollState);
  }
  requestAnimationFrame(() => syncThinkingGraphFloatingLabel(task.id));
}

function refreshOpenTaskDetailModal(tasks = latestTaskPayload) {
  const modal = document.getElementById('taskDetailModal');
  if (!modal || !modal.classList.contains('show') || !activeTaskDetailId) {
    return;
  }
  if (document.activeElement?.classList?.contains('task-new-input-textarea')) {
    return;
  }

  // 如果用户在浮窗内正在选中文本，跳过刷新以避免 innerHTML 重建导致选中消失
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed) {
    const anchorNode = selection.anchorNode;
    if (anchorNode && modal.contains(anchorNode)) {
      return;
    }
  }

  // 如果任务列表为空（可能是认证问题或加载中），保持浮窗打开
  if (!tasks || tasks.length === 0) {
    return;
  }

  const task = tasks.find(item => item.id === activeTaskDetailId);
  if (!task) {
    // 任务在当前列表中未找到，显示错误提示
    console.warn(`[TaskDetail] 警告: 任务 ${activeTaskDetailId} 在当前列表中未找到`);
    const contentEl = document.getElementById('taskDetailContent');
    if (contentEl) {
      contentEl.innerHTML = `<div class="task-detail-error" style="padding:20px;text-align:center;color:var(--text-3)">任务数据加载中，请稍后再试...</div>`;
    }
    return;
  }

  renderTaskDetailModalForTask(task, { preserveScroll: true });
}

function refreshOpenThinkingGraphModal(tasks = latestTaskPayload) {
  const modal = document.getElementById('thinkingGraphModal');
  if (!modal || !modal.classList.contains('show') || !activeThinkingGraphModalTaskId) {
    return;
  }

  const task = tasks.find(item => item.id === activeThinkingGraphModalTaskId);
  if (!task) {
    return;
  }

  renderThinkingGraphModalForTask(task);
}

function refreshOpenSwarmRunModal(tasks = latestTaskPayload) {
  const modal = document.getElementById('swarmRunModal');
  if (!modal || !modal.classList.contains('show') || !activeSwarmRunModalTaskId || !activeSwarmRunModalRunId) {
    return;
  }

  const task = tasks.find(item => item.id === activeSwarmRunModalTaskId);
  if (!task) {
    return;
  }

  renderSwarmRunModalForTask(task, activeSwarmRunModalRunId);
}

function captureTaskDetailScrollState(taskId = activeTaskDetailId) {
  if (!taskId) return null;

  const state = {};
  document.querySelectorAll('#taskDetailContent [data-scroll-key]').forEach(node => {
    const scrollKey = node.getAttribute('data-scroll-key');
    if (!scrollKey) return;
    state[scrollKey] = node.scrollTop;
  });
  taskDetailScrollState.set(taskId, state);
  return state;
}

function restoreTaskDetailScrollState(taskId = activeTaskDetailId, state = null) {
  if (!taskId) return;
  const effectiveState = state || taskDetailScrollState.get(taskId);
  if (!effectiveState) return;

  document.querySelectorAll('#taskDetailContent [data-scroll-key]').forEach(node => {
    const scrollKey = node.getAttribute('data-scroll-key');
    if (!scrollKey) return;
    node.scrollTop = effectiveState[scrollKey] || 0;
  });
}

function upsertTaskInCollection(tasks, updatedTask) {
  if (!Array.isArray(tasks) || !updatedTask?.id) {
    return tasks;
  }
  const index = tasks.findIndex(item => item?.id === updatedTask.id);
  if (index < 0) {
    return tasks;
  }
  const next = tasks.slice();
  next[index] = updatedTask;
  return next;
}

function applyTaskUpdateLocally(updatedTask) {
  if (!updatedTask?.id) {
    return;
  }
  latestTaskPayload = upsertTaskInCollection(latestTaskPayload, updatedTask);
  queuedTaskPayload = upsertTaskInCollection(queuedTaskPayload, updatedTask);

  const modal = document.getElementById('taskDetailModal');
  if (activeTaskDetailId === updatedTask.id && modal?.classList?.contains('show')) {
    renderTaskDetailModalForTask(updatedTask, { preserveScroll: true });
  }
}

function getTaskNewInputFeedback(taskId) {
  const feedback = taskDetailNewInputFeedbackState.get(taskId);
  if (!feedback || !String(feedback.message || '').trim()) {
    return null;
  }
  return feedback;
}

function clearTaskNewInputFeedback(taskId, options = {}) {
  const { rerender = true } = options;
  const timerId = taskDetailNewInputFeedbackTimers.get(taskId);
  if (timerId) {
    clearTimeout(timerId);
    taskDetailNewInputFeedbackTimers.delete(taskId);
  }
  taskDetailNewInputFeedbackState.delete(taskId);

  const modal = document.getElementById('taskDetailModal');
  if (rerender && activeTaskDetailId === taskId && modal?.classList?.contains('show')) {
    const task = latestTaskPayload.find(item => item.id === taskId);
    if (task) {
      renderTaskDetailModalForTask(task, { preserveScroll: true });
    }
  }
}

function setTaskNewInputFeedback(taskId, type, message, options = {}) {
  const { autoHideMs = type === 'error' ? 6000 : 4000 } = options;
  const normalizedMessage = String(message || '').trim();
  if (!normalizedMessage) {
    clearTaskNewInputFeedback(taskId, options);
    return;
  }

  const timerId = taskDetailNewInputFeedbackTimers.get(taskId);
  if (timerId) {
    clearTimeout(timerId);
  }

  taskDetailNewInputFeedbackState.set(taskId, {
    type: type === 'error' ? 'error' : 'success',
    message: normalizedMessage,
    updatedAt: new Date().toISOString(),
  });

  const modal = document.getElementById('taskDetailModal');
  if (activeTaskDetailId === taskId && modal?.classList?.contains('show')) {
    const task = latestTaskPayload.find(item => item.id === taskId);
    if (task) {
      renderTaskDetailModalForTask(task, { preserveScroll: true });
    }
  }

  if (autoHideMs > 0) {
    const nextTimerId = window.setTimeout(() => {
      clearTaskNewInputFeedback(taskId);
    }, autoHideMs);
    taskDetailNewInputFeedbackTimers.set(taskId, nextTimerId);
  } else {
    taskDetailNewInputFeedbackTimers.delete(taskId);
  }
}

/**
 * Build the normalized data model consumed by the task detail modal.
 *
 * @param {Object} task - Raw backend task snapshot.
 * @returns {Object} Fully normalized detail-view model for rendering.
 */
function buildTaskDetailData(task) {
  // Split persisted task logs into rendered LLM outputs and engineering traces.
  const llmOutputs = [];
  const engineeringLogs = [];

  // Normalize structured backend artifacts into frontend-friendly detail models.
  const thinkingGraph = normalizeTaskThinkingGraph(task.artifacts?.thinking_graph_state, task.artifacts || {});
  const knowledgeHarvestState = task.artifacts?.knowledge_harvest_state && typeof task.artifacts.knowledge_harvest_state === 'object'
    ? task.artifacts.knowledge_harvest_state
    : {};
  const swarmRuns = normalizeTaskSwarmRuns(task.artifacts?.swarm_runs, knowledgeHarvestState);
  const autonomousWorkflow = normalizeTaskAutonomousWorkflow(task.artifacts?.autonomous_workflow);
  const persistedContextSnapshot = normalizeTaskContextSnapshot(task.artifacts?.context_snapshot);
  const pendingNewInput = taskDetailNewInputDraftState.has(task.id)
    ? taskDetailNewInputDraftState.get(task.id)
    : String(task.artifacts?.pending_new_input || '');
  const newInputFeedback = getTaskNewInputFeedback(task.id);
  const newInputHistory = Array.isArray(task.artifacts?.new_input_history)
    ? task.artifacts.new_input_history
        .filter(item => item && typeof item === 'object' && String(item.content || '').trim())
        .map(item => ({
          content: String(item.content || '').trim(),
          usedAt: String(item.used_at || '').trim(),
        }))
    : [];

  // Parse every task log line into either formal LLM output blocks or raw engineering output.
  task.logs.forEach(log => {
    const parsedOutput = parseFormalOutput(log);
    if (parsedOutput) {
      llmOutputs.push(parsedOutput);
    } else {
      engineeringLogs.push(log);
    }
  });

  // Resolve per-task UI state and pre-split engineering traces for detail subpanes.
  const activeOutputIndex = resolveActiveOutputIndex(task.id, llmOutputs.length);
  const activeTab = resolveTaskDetailTab(task.id);
  const activeThinkingGraphPage = resolveTaskThinkingGraphPage(task.id);
  const thinkingGraphZoom = resolveTaskThinkingGraphZoom(task.id);
  const { toolLogs, verboseLogs } = splitEngineeringLogs(engineeringLogs);
  const contextSnapshot = hasRenderableTaskContextSnapshot(persistedContextSnapshot)
    ? persistedContextSnapshot
    : deriveTaskContextSnapshotFromLogs(task.logs);

  return {
    task,
    progressPercent: normalizeTaskProgressValue(task.progress),
    llmOutputs,
    activeOutputIndex,
    activeTab,
    activeThinkingGraphPage,
    thinkingGraphZoom,
    engineeringLogs,
    toolLogs,
    verboseLogs,
    thinkingGraph,
    swarmRuns,
    autonomousWorkflow,
    knowledgeHarvestState,
    contextSnapshot,
    pendingNewInput,
    newInputFeedback,
    newInputHistory,
    filesLabel: formatTaskFilesLabel(task.files),
    modulesLabel: task.modules?.length ? task.modules.join(', ') : '无',
    payloadLabel: task.payload ? task.payload : '默认',
    skillsLabel: formatTaskSkillsHtml(task.skills),
    workspaceLabel: task.artifacts?.workspace_dir ? task.artifacts.workspace_dir : '未创建',
  };
}

/**
 * Return whether a normalized task context snapshot has any renderable entries.
 *
 * @param {Object} snapshot - Normalized context snapshot.
 * @returns {boolean} `true` when any context section contains entries.
 */
function hasRenderableTaskContextSnapshot(snapshot) {
  // Guard against nullish or malformed snapshot payloads before checking sections.
  if (!snapshot || typeof snapshot !== 'object') {
    return false;
  }

  // Treat any non-empty uncompacted, compacted, or memory section as renderable context.
  return Boolean(
    Array.isArray(snapshot.uncompacted) && snapshot.uncompacted.length
    || Array.isArray(snapshot.compacted) && snapshot.compacted.length
    || Array.isArray(snapshot.memories) && snapshot.memories.length
  );
}

/**
 * Derive a best-effort context snapshot from persisted task logs.
 *
 * @param {Array} logs - Raw task log lines as returned by the backend.
 * @returns {Object} Synthetic normalized context snapshot grouped like the persisted format.
 */
function deriveTaskContextSnapshotFromLogs(logs) {
  // Normalize the incoming log list before building fallback context entries.
  const sourceLogs = Array.isArray(logs) ? logs.map(item => String(item || '')).filter(Boolean) : [];
  const fallbackEntries = [];
  let currentEntry = null;

  // Group verbose logs by agent turn so each turn becomes one fallback uncompacted entry.
  sourceLogs.forEach((logLine) => {
    const turnMatch = logLine.match(/Executing Turn:\s*(\d+)/);
    if (turnMatch) {
      if (currentEntry) {
        fallbackEntries.push(finalizeDerivedTaskContextEntry(currentEntry));
      }
      currentEntry = {
        id: Number(turnMatch[1]),
        role: 'assistant',
        contentLines: [],
        toolCallInfo: [],
        toolCallResult: [],
        tags: ['derived_from_logs'],
      };
      return;
    }

    if (!currentEntry || !logLine.includes('Agent verbose:')) {
      return;
    }

    const normalizedLine = logLine.replace(/^.*?Agent verbose:\s*/, '').trim();
    if (!normalizedLine) {
      return;
    }

    // Split tool invocation lines, tool result lines, and generic commentary into separate buckets.
    if (normalizedLine.startsWith('[Agent] Calling tool')) {
      currentEntry.toolCallInfo.push(normalizedLine);
      return;
    }
    if (normalizedLine.startsWith('[Agent] Result of tool')) {
      currentEntry.toolCallResult.push(normalizedLine);
      return;
    }
    if (!normalizedLine.startsWith('[Agent]')) {
      currentEntry.contentLines.push(normalizedLine);
    }
  });

  // Flush the final open turn after the log scan finishes.
  if (currentEntry) {
    fallbackEntries.push(finalizeDerivedTaskContextEntry(currentEntry));
  }

  // Return a normalized empty-compatible snapshot so the renderer can stay unchanged.
  return {
    uncompacted: fallbackEntries.filter(entry => entry.content || entry.toolCallInfo.length || entry.toolCallResult.length),
    compacted: [],
    memories: [],
    stats: {
      uncompactedCount: fallbackEntries.length,
      compactedCount: 0,
      memoryCount: 0,
    },
  };
}

/**
 * Finalize one log-derived context entry into the normalized frontend shape.
 *
 * @param {Object} draftEntry - Mutable in-progress fallback entry built from logs.
 * @returns {Object} Normalized fallback context entry.
 */
function finalizeDerivedTaskContextEntry(draftEntry) {
  // Collapse collected commentary lines into one readable context content block.
  const content = draftEntry.contentLines.join('\n').trim();

  // Return the same field names used by persisted context snapshots.
  return {
    id: draftEntry.id,
    role: draftEntry.role,
    content,
    toolCallInfo: draftEntry.toolCallInfo,
    toolCallResult: draftEntry.toolCallResult,
    tags: draftEntry.tags,
  };
}

/**
 * Normalize a backend progress value into a display-safe percentage.
 *
 * @param {*} value - Raw progress value from the task snapshot.
 * @returns {number} Integer percentage clamped to the inclusive 0-100 range.
 */
function normalizeTaskProgressValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

/**
 * Build a stable file label for task detail surfaces.
 *
 * @param {Array} files - Backend file records attached to the task.
 * @returns {string} Comma-separated unique file names or an empty-state label.
 */
function formatTaskFilesLabel(files) {
  if (!Array.isArray(files)) {
    return '无';
  }
  const names = [...new Set(files
    .map(file => String(file?.name || '').trim())
    .filter(Boolean))];
  return names.length ? names.join(', ') : '无';
}

/**
 * Build sanitized skill chips for task detail surfaces.
 *
 * @param {Array} skills - Skill identifiers attached to the task.
 * @returns {string} HTML for skill chips or a muted default label.
 */
function formatTaskSkillsHtml(skills) {
  if (!Array.isArray(skills)) {
    return '<span style="color:var(--text-muted)">默认</span>';
  }
  const names = [...new Set(skills
    .map(skill => String(skill || '').trim())
    .filter(skill => skill && skill !== 'undefined' && skill !== 'null'))];
  return names.length
    ? names.map(skill => `<span class="skill-tag">${escapeHtml(skill)}</span>`).join(' ')
    : '<span style="color:var(--text-muted)">默认</span>';
}

function getTaskEffectiveSolverEngine(task) {
  const runtimeSolver = String(task?.artifacts?.runtime_solver_engine || '').trim();
  if (runtimeSolver) return runtimeSolver;
  return String(task?.solverEngine || '').trim();
}

/**
 * Normalize backend and legacy frontend task statuses into one UI key.
 *
 * @param {Object} task - Backend task snapshot with a `status` field.
 * @returns {string} UI status key used for labels, badges, and action buttons.
 */
function getTaskStatusKey(task) {
  const status = String(task?.status || '').trim().toLowerCase();
  const aliases = {
    pending: 'idle',
    idle: 'idle',
    running: 'running',
    completed: 'done',
    done: 'done',
    failed: 'error',
    error: 'error',
    stopped: 'canceled',
    canceled: 'canceled',
  };
  return aliases[status] || 'idle';
}

/**
 * Return the human-readable status label for a task.
 *
 * @param {Object} task - Backend task snapshot with a `status` field.
 * @returns {string} Chinese status label for the UI.
 */
function getTaskStatusLabel(task) {
  const labels = {
    idle: '闲置',
    running: '运行中',
    done: '已完成',
    error: '失败',
    canceled: '已中止',
  };
  return labels[getTaskStatusKey(task)] || labels.idle;
}

/**
 * Return the badge CSS class for a task status.
 *
 * @param {Object} task - Backend task snapshot with a `status` field.
 * @returns {string} Badge class name used by task cards.
 */
function getTaskStatusBadgeClass(task) {
  const classes = {
    idle: 'badge-idle',
    running: 'badge-run',
    done: 'badge-done',
    error: 'badge-err',
    canceled: 'badge-err',
  };
  return classes[getTaskStatusKey(task)] || classes.idle;
}

function isLearningWorkflowTask(task) {
  return String(task?.workflowKind || '').trim() === 'learn' || String(task?.type || '').trim() === 'KNOWLEDGE';
}

function getTaskTypeLabel(taskType) {
  const normalized = String(taskType || '').trim().toUpperCase();
  if (normalized === 'KNOWLEDGE') return 'Knowledge Harvest / 学习';
  return String(taskType || '').trim() || '未知';
}

function isTaskThinkingGraphModeEnabled(task) {
  const solverEngine = getTaskEffectiveSolverEngine(task);
  // 支持思考图求解器、线性求解器和混合求解器
  return solverEngine === 'thinking_graph' 
    || solverEngine === 'thinking_graph_fast'
    || solverEngine === 'linear'
    || solverEngine === 'hybrid';
}

function hasThinkingGraphData(task) {
  const thinkingGraph = normalizeTaskThinkingGraph(
    task.artifacts?.thinking_graph_state, 
    task.artifacts || {}
  );
  // 检查是否有任何思考图内容
  return thinkingGraph.hypotheses.length > 0
    || thinkingGraph.branches.length > 0
    || thinkingGraph.facts.length > 0
    || thinkingGraph.openQuestions.length > 0
    || thinkingGraph.executions.length > 0
    || thinkingGraph.graphSummary
    || thinkingGraph.focus;
}

function getTaskSolverEngineLabel(solverEngine) {
  const normalized = String(solverEngine || '').trim();
  if (normalized === 'none') return '不使用求解器 / Learning Workflow';
  if (normalized === 'hybrid') return 'Hybrid / 自动选择';
  if (normalized === 'thinking_graph') return '思考图 / 完整版';
  if (normalized === 'linear') return '线性求解器';
  return '思考图 / 低延迟';
}

function getTaskSolverInitialStrategyLabel(strategy) {
  const normalized = String(strategy || '').trim();
  if (normalized === 'none') return '不使用求解器初始方案';
  if (normalized === 'auto') return 'Auto / 由求解器自行决定';
  return '程序逻辑图 IR / 全量逻辑恢复';
}

function getLearningReviewStatusLabel(status) {
  const normalized = String(status || '').trim();
  if (normalized === 'accept') return '通过';
  if (normalized === 'needs_human_review') return '待人工复核';
  if (normalized === 'reject') return '拒绝';
  return normalized || '未知';
}

function renderLearningPipelineCollection(items, renderItem, emptyText) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="task-thinking-empty">${escapeHtml(emptyText)}</div>`;
  }
  return items.map(item => renderItem(item)).join('');
}

/**
 * 从日志中提取正式 LLM 输出页。
 */
function parseFormalOutput(log) {
  const normalized = String(log);
  const match = normalized.match(
    /^(?:\[(?:\d{2}:\d{2}:\d{2}|\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]\s*)?(AI分析结果|扫描报告|自动化计划|LLM正式输出(?:\s*[\[(（]?(?:第)?\s*\d+\s*(?:轮)?[\])）]?)?)[:：]\s*\n?([\s\S]*)$/
  );
  if (!match) return '';
  return {
    title: normalizeFormalOutputTitle(match[1]),
    content: match[2].trim(),
  };
}

function normalizeFormalOutputTitle(rawTitle) {
  const normalized = String(rawTitle).trim();
  if (normalized.startsWith('LLM正式输出')) {
    const roundMatch = normalized.match(/(\d+)/);
    return roundMatch ? `正式输出 · 第 ${roundMatch[1]} 轮` : '正式输出';
  }
  return normalized;
}

function collectFormalOutputs(logs) {
  return logs
    .map(parseFormalOutput)
    .filter(Boolean);
}

function resolveActiveOutputIndex(taskId, outputCount) {
  if (outputCount <= 0) {
    taskDetailOutputPageState.set(taskId, 0);
    return 0;
  }

  const savedIndex = taskDetailOutputPageState.get(taskId);
  if (typeof savedIndex !== 'number') {
    const latestIndex = outputCount - 1;
    taskDetailOutputPageState.set(taskId, latestIndex);
    return latestIndex;
  }

  const boundedIndex = Math.max(0, Math.min(savedIndex, outputCount - 1));
  taskDetailOutputPageState.set(taskId, boundedIndex);
  return boundedIndex;
}

function setTaskDetailOutputPage(taskId, nextIndex) {
  const task = latestTaskPayload.find(t => t.id === taskId);
  if (!task) return;

  const outputCount = collectFormalOutputs(task.logs).length;
  const boundedIndex = Math.max(0, Math.min(nextIndex, Math.max(outputCount - 1, 0)));
  taskDetailOutputPageState.set(taskId, boundedIndex);

  document.getElementById('taskDetailContent').innerHTML = renderTaskDetailModal(buildTaskDetailData(task));
  requestAnimationFrame(() => syncThinkingGraphFloatingLabel(taskId));
}

/**
 * Resolve the persisted active tab for one task detail modal.
 *
 * @param {string} taskId - Task identifier whose tab state should be restored.
 * @returns {string} Normalized active tab id.
 */
function resolveTaskDetailTab(taskId) {
  // Read the saved tab state and accept only tabs supported by the renderer.
  const savedTab = taskDetailTabState.get(taskId);
  if (savedTab === 'llm' || savedTab === 'progress' || savedTab === 'context' || savedTab === 'learning' || savedTab === 'graph' || savedTab === 'swarm') {
    return savedTab;
  }

  // Fall back to the progress tab when no valid persisted state exists.
  taskDetailTabState.set(taskId, 'progress');
  return 'progress';
}

/**
 * Persist and switch the active task detail tab, then re-render the modal body.
 *
 * @param {string} taskId - Task identifier whose detail tab is changing.
 * @param {string} nextTab - Requested tab id from the UI.
 * @returns {void}
 */
function setTaskDetailTab(taskId, nextTab) {
  // Resolve the latest task snapshot before mutating tab-specific UI state.
  const task = latestTaskPayload.find(t => t.id === taskId);
  if (!task) return;

  // Normalize the requested tab so unsupported values snap back to progress.
  const normalizedTab = ['progress', 'llm', 'context', 'learning', 'graph', 'swarm'].includes(nextTab) ? nextTab : 'progress';
  taskDetailTabState.set(taskId, normalizedTab);

  // Re-render the detail body so the newly selected tab becomes visible immediately.
  document.getElementById('taskDetailContent').innerHTML = renderTaskDetailModal(buildTaskDetailData(task));
  requestAnimationFrame(() => syncThinkingGraphFloatingLabel(taskId));
}

function resolveTaskThinkingGraphPage(taskId) {
  const task = latestTaskPayload.find(t => t.id === taskId);
  const savedPage = taskThinkingGraphPageState.get(taskId);
  // 支持所有求解器的思考图页面（包括 linear 和 hybrid）
  if (savedPage === 'overview' || savedPage === 'visual' || savedPage === 'action') {
    return savedPage;
  }
  // 默认显示结构视图
  taskThinkingGraphPageState.set(taskId, 'overview');
  return 'overview';
}

function setTaskThinkingGraphPage(taskId, nextPage) {
  const task = latestTaskPayload.find(t => t.id === taskId);
  if (!task) return;
  // 所有求解器都支持 overview、visual 和 action 页面
  const allowedPages = ['overview', 'visual', 'action'];
  const normalizedPage = allowedPages.includes(nextPage) ? nextPage : 'overview';
  taskThinkingGraphPageState.set(taskId, normalizedPage);
  document.getElementById('taskDetailContent').innerHTML = renderTaskDetailModal(buildTaskDetailData(task));
  requestAnimationFrame(() => syncThinkingGraphFloatingLabel(taskId));
}

function resolveTaskThinkingGraphSelectedNode(taskId) {
  const savedNodeId = taskThinkingGraphSelectedNodeState.get(taskId);
  return typeof savedNodeId === 'string' && savedNodeId.trim() ? savedNodeId.trim() : '';
}

function setThinkingGraphNodeSelectionDom(nodeGroup, isSelected) {
  if (!nodeGroup) return;
  nodeGroup.classList.toggle('is-selected', Boolean(isSelected));
  nodeGroup.querySelectorAll('.task-thinking-visual-node-label-connector, .task-thinking-visual-node-label-box').forEach(node => {
    node.classList.toggle('is-selected', Boolean(isSelected));
  });
}

function setThinkingGraphLegendSelectionDom(visualRoot, selectedNodeGroup) {
  if (!visualRoot) return;
  const selectedKind = String(selectedNodeGroup?.dataset?.kind || '').trim();
  const selectedStatus = String(selectedNodeGroup?.dataset?.status || '').trim();
  const selectedIsActive = selectedNodeGroup?.dataset?.active === 'true';
  const hasStatusVisual = Boolean(getThinkingGraphStatusVisual(selectedStatus));

  visualRoot.querySelectorAll('.task-thinking-legend-item[data-legend-kind]').forEach((legendItem) => {
    const legendKind = String(legendItem.dataset.legendKind || '').trim();
    const legendStatus = String(legendItem.dataset.legendStatus || '').trim();
    const legendActiveOutline = legendItem.dataset.legendActiveOutline === 'true';
    let isSelected = false;

    if (selectedNodeGroup) {
      if (legendActiveOutline) {
        isSelected = selectedIsActive;
      } else if (legendStatus && legendStatus !== 'active-outline') {
        isSelected = selectedStatus === legendStatus;
      } else {
        isSelected = selectedKind === legendKind && !hasStatusVisual;
      }
    }

    legendItem.classList.toggle('is-selected', isSelected);
  });
}

function resetThinkingGraphEdgeSelectionDom(edgeGroup) {
  if (!edgeGroup) return;
  edgeGroup.classList.remove('is-incoming', 'is-outgoing');
}

function applyThinkingGraphSelectionToStage(stage, previousNodeId, selectedNodeId) {
  if (!stage) return false;
  const touchedNodeIds = [previousNodeId, selectedNodeId].map(item => String(item || '').trim()).filter(Boolean);
  const touchedEdgeGroups = new Set();

  touchedNodeIds.forEach(nodeId => {
    const escapedNodeId = CSS.escape(nodeId);
    const nodeGroup = stage.querySelector(`.task-thinking-visual-node-group[data-node-id="${escapedNodeId}"]`);
    setThinkingGraphNodeSelectionDom(nodeGroup, nodeId === selectedNodeId);
    stage.querySelectorAll(
      `.task-thinking-visual-edge-group[data-source="${escapedNodeId}"], .task-thinking-visual-edge-group[data-target="${escapedNodeId}"]`,
    ).forEach(edgeGroup => touchedEdgeGroups.add(edgeGroup));
  });

  touchedEdgeGroups.forEach(edgeGroup => {
    resetThinkingGraphEdgeSelectionDom(edgeGroup);
    if (!selectedNodeId) return;
    if (edgeGroup.getAttribute('data-target') === selectedNodeId) {
      edgeGroup.classList.add('is-incoming');
    } else if (edgeGroup.getAttribute('data-source') === selectedNodeId) {
      edgeGroup.classList.add('is-outgoing');
    }
  });

  if (selectedNodeId) {
    const nodeLayer = stage.querySelector('.task-thinking-visual-nodes');
    const selectedNodeGroup = stage.querySelector(`.task-thinking-visual-node-group[data-node-id="${CSS.escape(selectedNodeId)}"]`);
    if (nodeLayer && selectedNodeGroup) {
      nodeLayer.appendChild(selectedNodeGroup);
    }
  }

  const visualRoot = stage.closest('.task-thinking-visual-root');
  const selectedNodeGroup = selectedNodeId
    ? stage.querySelector(`.task-thinking-visual-node-group[data-node-id="${CSS.escape(selectedNodeId)}"]`)
    : null;
  setThinkingGraphLegendSelectionDom(visualRoot, selectedNodeGroup);
  return true;
}

function updateTaskThinkingGraphSelectionDom(taskId, previousNodeId, selectedNodeId) {
  if (!taskId) return false;
  const stages = document.querySelectorAll(`.task-thinking-visual-stage[data-task-id="${CSS.escape(taskId)}"]`);
  if (!stages.length) return false;
  stages.forEach(stage => applyThinkingGraphSelectionToStage(stage, previousNodeId, selectedNodeId));
  return true;
}

function setTaskThinkingGraphSelectedNode(taskId, nodeId) {
  const task = latestTaskPayload.find(t => t.id === taskId);
  if (!task || !nodeId) return;
  const normalizedNodeId = String(nodeId).trim();
  const previousNodeId = resolveTaskThinkingGraphSelectedNode(taskId);
  if (previousNodeId === normalizedNodeId) {
    updateTaskThinkingGraphSelectionDom(taskId, previousNodeId, normalizedNodeId);
    syncThinkingGraphFloatingLabel(taskId);
    return;
  }
  taskThinkingGraphSelectedNodeState.set(taskId, normalizedNodeId);
  if (!updateTaskThinkingGraphSelectionDom(taskId, previousNodeId, normalizedNodeId)) {
    rerenderThinkingGraphSurfaces(task);
    return;
  }
  syncThinkingGraphFloatingLabel(taskId);
}

function clearTaskThinkingGraphSelection(taskId) {
  const task = latestTaskPayload.find(t => t.id === taskId);
  if (!task) return;
  if (!taskThinkingGraphSelectedNodeState.has(taskId)) return;
  const previousNodeId = resolveTaskThinkingGraphSelectedNode(taskId);
  taskThinkingGraphSelectedNodeState.delete(taskId);
  if (!updateTaskThinkingGraphSelectionDom(taskId, previousNodeId, '')) {
    rerenderThinkingGraphSurfaces(task);
    return;
  }
  removeThinkingGraphFloatingLabel();
}

function rerenderThinkingGraphSurfaces(task) {
  if (!task) return;

  if (activeTaskDetailId === task.id) {
    const contentEl = document.getElementById('taskDetailContent');
    if (contentEl) {
      contentEl.innerHTML = renderTaskDetailModal(buildTaskDetailData(task));
      lastRenderedTaskDetailId = task.id;
    }
  }

  if (activeThinkingGraphModalTaskId === task.id) {
    renderThinkingGraphModalForTask(task);
    return;
  }
  requestAnimationFrame(() => syncThinkingGraphFloatingLabel(task.id));
}

function resolveTaskThinkingGraphZoom(taskId) {
  const savedZoom = Number(taskThinkingGraphZoomState.get(taskId));
  if (Number.isFinite(savedZoom) && savedZoom > 0) {
    return Math.max(0.5, Math.min(savedZoom, 2.5));
  }
  taskThinkingGraphZoomState.set(taskId, 1);
  return 1;
}

function setTaskThinkingGraphZoom(taskId, nextZoom) {
  const task = latestTaskPayload.find(t => t.id === taskId);
  if (!task) return;
  const normalizedZoom = Math.max(0.5, Math.min(Number(nextZoom) || 1, 2.5));
  taskThinkingGraphZoomState.set(taskId, normalizedZoom);
  rerenderThinkingGraphSurfaces(task);
}

function adjustTaskThinkingGraphZoom(taskId, delta) {
  const currentZoom = resolveTaskThinkingGraphZoom(taskId);
  const nextZoom = Math.round((currentZoom + delta) * 100) / 100;
  setTaskThinkingGraphZoom(taskId, nextZoom);
}

function resolveTaskThinkingGraphPan(taskId) {
  const savedPan = taskThinkingGraphPanState.get(taskId);
  if (savedPan && Number.isFinite(savedPan.x) && Number.isFinite(savedPan.y)) {
    return { x: savedPan.x, y: savedPan.y };
  }
  const defaultPan = { x: 0, y: 0 };
  taskThinkingGraphPanState.set(taskId, defaultPan);
  return defaultPan;
}

function setTaskThinkingGraphPan(taskId, nextPan, options = {}) {
  if (!taskId) return;
  const normalizedPan = {
    x: Number.isFinite(Number(nextPan?.x)) ? Number(nextPan.x) : 0,
    y: Number.isFinite(Number(nextPan?.y)) ? Number(nextPan.y) : 0,
  };
  taskThinkingGraphPanState.set(taskId, normalizedPan);
  if (options.rerender) {
    const task = latestTaskPayload.find(t => t.id === taskId);
    if (task) {
      rerenderThinkingGraphSurfaces(task);
    }
  }
}

function applyTaskThinkingGraphPanTransform(taskId, pan) {
  if (!taskId) return;
  const normalizedPan = {
    x: Number.isFinite(Number(pan?.x)) ? Number(pan.x) : 0,
    y: Number.isFinite(Number(pan?.y)) ? Number(pan.y) : 0,
  };
  document.querySelectorAll(`.task-thinking-visual-stage[data-task-id="${CSS.escape(taskId)}"]`).forEach(stage => {
    stage.style.transform = `translate(${normalizedPan.x}px, ${normalizedPan.y}px)`;
  });
  syncThinkingGraphFloatingLabel(taskId);
}

function onTaskThinkingGraphWheel(event, taskId) {
  if (!(event.ctrlKey || event.metaKey)) {
    return;
  }
  event.preventDefault();
  adjustTaskThinkingGraphZoom(taskId, event.deltaY < 0 ? 0.1 : -0.1);
}

let activeThinkingGraphDragState = null;
const THINKING_GRAPH_FLOATING_LABEL_ID = 'taskThinkingGraphFloatingLabel';

function getThinkingGraphFloatingLabelElement() {
  let overlay = document.getElementById(THINKING_GRAPH_FLOATING_LABEL_ID);
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = THINKING_GRAPH_FLOATING_LABEL_ID;
  overlay.className = 'task-thinking-floating-label';
  overlay.setAttribute('aria-hidden', 'true');
  document.body.appendChild(overlay);
  return overlay;
}

function removeThinkingGraphFloatingLabel() {
  document.getElementById(THINKING_GRAPH_FLOATING_LABEL_ID)?.remove();
}

function findThinkingGraphRenderHost(taskId) {
  if (!taskId) return null;
  const escapedTaskId = CSS.escape(taskId);
  const modal = document.getElementById('thinkingGraphModal');
  if (modal?.classList.contains('show')) {
    const modalStage = modal.querySelector(`.task-thinking-visual-stage[data-task-id="${escapedTaskId}"]`);
    if (modalStage) {
      return {
        stage: modalStage,
        shell: modalStage.closest('.task-thinking-visual-canvas-shell'),
      };
    }
  }
  const detailStage = document.querySelector(`#taskDetailContent .task-thinking-visual-stage[data-task-id="${escapedTaskId}"]`);
  if (detailStage) {
    return {
      stage: detailStage,
      shell: detailStage.closest('.task-thinking-visual-canvas-shell'),
    };
  }
  return null;
}

function syncThinkingGraphFloatingLabel(taskId) {
  if (!taskId) {
    removeThinkingGraphFloatingLabel();
    return;
  }
  const task = latestTaskPayload.find(item => item.id === taskId);
  const selectedNodeId = resolveTaskThinkingGraphSelectedNode(taskId);
  if (!task || !selectedNodeId) {
    removeThinkingGraphFloatingLabel();
    return;
  }

  const host = findThinkingGraphRenderHost(taskId);
  if (!host?.shell) {
    removeThinkingGraphFloatingLabel();
    return;
  }

  const detailData = buildTaskDetailData(task);
  const thinkingGraph = detailData?.thinkingGraph && typeof detailData.thinkingGraph === 'object'
    ? detailData.thinkingGraph
    : normalizeTaskThinkingGraph(task?.artifacts?.thinking_graph_state, task?.artifacts || {});
  if (!thinkingGraph || typeof thinkingGraph !== 'object') {
    removeThinkingGraphFloatingLabel();
    return;
  }
  const model = buildThinkingGraphVisualModel(thinkingGraph);
  const node = (model.nodes || []).find(item => item.id === selectedNodeId);
  if (!node) {
    removeThinkingGraphFloatingLabel();
    return;
  }

  const layout = getThinkingGraphNodeLabelLayout(node, model);
  const zoom = resolveTaskThinkingGraphZoom(taskId);
  const pan = resolveTaskThinkingGraphPan(taskId);
  const shellRect = host.shell.getBoundingClientRect();
  const overlay = getThinkingGraphFloatingLabelElement();
  const labelLinesHtml = layout.labelLines.map(line => `<div class="task-thinking-overlay-label-line">${escapeHtml(line)}</div>`).join('');
  const metaHtml = layout.metaText ? `<div class="task-thinking-overlay-label-meta">${escapeHtml(layout.metaText)}</div>` : '';
  const left = shellRect.left + 12 + pan.x + (layout.boxX * zoom);
  const top = shellRect.top + 12 + pan.y + (layout.boxY * zoom);
  const width = layout.boxWidth * zoom;
  const minHeight = layout.boxHeight * zoom;
  const viewportPadding = 12;
  const safeLeft = Math.max(viewportPadding, Math.min(left, window.innerWidth - width - viewportPadding));
  const safeTop = Math.max(viewportPadding, Math.min(top, window.innerHeight - minHeight - viewportPadding));

  overlay.className = `task-thinking-floating-label ${node.isActive ? 'is-active' : ''}`;
  overlay.innerHTML = `${labelLinesHtml}${metaHtml}`;
  overlay.style.left = `${safeLeft.toFixed(1)}px`;
  overlay.style.top = `${safeTop.toFixed(1)}px`;
  overlay.style.width = `${width.toFixed(1)}px`;
  overlay.style.minHeight = `${minHeight.toFixed(1)}px`;
  overlay.style.display = 'flex';
}

function syncActiveThinkingGraphFloatingLabel() {
  const activeTaskId = activeThinkingGraphModalTaskId || activeTaskDetailId;
  if (!activeTaskId) {
    removeThinkingGraphFloatingLabel();
    return;
  }
  syncThinkingGraphFloatingLabel(activeTaskId);
}

function startThinkingGraphPan(event, taskId) {
  const shell = event.currentTarget;
  if (!shell || event.button !== 0 || !taskId) return;
  const stage = shell.querySelector(`.task-thinking-visual-stage[data-task-id="${CSS.escape(taskId)}"]`);
  if (!stage) return;
  const currentPan = resolveTaskThinkingGraphPan(taskId);

  activeThinkingGraphDragState = {
    taskId,
    shell,
    stage,
    startX: event.clientX,
    startY: event.clientY,
    panX: currentPan.x,
    panY: currentPan.y,
  };

  shell.classList.add('dragging');
  event.preventDefault();
}

function updateThinkingGraphPan(event) {
  if (!activeThinkingGraphDragState) return;
  const { taskId, startX, startY, panX, panY, stage } = activeThinkingGraphDragState;
  const nextPan = {
    x: panX + (event.clientX - startX),
    y: panY + (event.clientY - startY),
  };
  // 直接更新 stage 和 overlay，避免查询 DOM
  if (stage) {
    stage.style.transform = `translate(${nextPan.x}px, ${nextPan.y}px)`;
  }
  syncThinkingGraphFloatingLabel(taskId);
}

function stopThinkingGraphPan(event) {
  if (!activeThinkingGraphDragState) return;
  const { taskId, shell, startX, startY, panX, panY } = activeThinkingGraphDragState;
  const nextPan = {
    x: panX + (event ? (event.clientX - startX) : 0),
    y: panY + (event ? (event.clientY - startY) : 0),
  };
  setTaskThinkingGraphPan(taskId, nextPan);
  shell.classList.remove('dragging');
  activeThinkingGraphDragState = null;
}

document.addEventListener('mousemove', updateThinkingGraphPan);
document.addEventListener('mouseup', stopThinkingGraphPan);
window.addEventListener('resize', syncActiveThinkingGraphFloatingLabel);
document.addEventListener('scroll', syncActiveThinkingGraphFloatingLabel, true);

function openThinkingGraphModal(taskId) {
  const task = latestTaskPayload.find(t => t.id === taskId);
  if (!task) return;
  pauseTaskRefresh();
  activeThinkingGraphModalTaskId = taskId;
  renderThinkingGraphModalForTask(task);
  document.getElementById('thinkingGraphModal')?.classList.add('show');
  requestAnimationFrame(() => syncThinkingGraphFloatingLabel(taskId));
}

function renderThinkingGraphModalForTask(task) {
  const detailData = buildTaskDetailData(task);
  const titleEl = document.getElementById('thinkingGraphModalTitle');
  const contentEl = document.getElementById('thinkingGraphModalContent');
  if (!titleEl || !contentEl) return;

  titleEl.innerHTML = `${escapeHtml(task.id)} <span style="color:var(--text-3);font-size:12px">[${escapeHtml(task.type)}] ${escapeHtml(task.name)} · 思考图</span>`;
  contentEl.innerHTML = renderThinkingGraphVisual(detailData.thinkingGraph, {
    taskId: task.id,
    zoom: detailData.thinkingGraphZoom,
    standalone: true,
  });
  requestAnimationFrame(() => syncThinkingGraphFloatingLabel(task.id));
}

function downloadTextFile(filename, content, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildTaskThinkingResultMarkdown(task) {
  const detailData = buildTaskDetailData(task);
  const { thinkingGraph } = detailData;
  const lines = [
    `# ${task.name || task.id}`,
    '',
    `- 任务 ID: ${task.id}`,
    `- 类型: ${task.type || '未记录'}`,
    `- 目标: ${task.target || '无'}`,
    `- 当前节点: ${thinkingGraph.currentNode || '未记录'}`,
    `- 轮次: ${thinkingGraph.roundIndex || 0}`,
    `- 焦点: ${thinkingGraph.focus || '未记录'}`,
    `- 更新时间: ${thinkingGraph.updatedAt || '未记录'}`,
    '',
    '## 图摘要',
    '',
    thinkingGraph.graphSummary || '当前还没有思考图摘要。',
    '',
    '## 已验证事实',
    '',
    ...(thinkingGraph.facts.length ? thinkingGraph.facts.map(item => `- ${item}`) : ['- 无']),
    '',
    '## 假设',
    '',
    ...(thinkingGraph.hypotheses.length
      ? thinkingGraph.hypotheses.map(item => `- [${item.status || 'open'}] (${Number(item.confidence || 0).toFixed(2)}) ${item.content}`)
      : ['- 无']),
    '',
    '## 已否定内容',
    '',
    ...(thinkingGraph.rejectedItems.length ? thinkingGraph.rejectedItems.map(item => `- ${item}`) : ['- 无']),
    '',
    '## 分支',
    '',
    ...(thinkingGraph.branches.length
      ? thinkingGraph.branches.map(item => `- [${item.status || 'open'}] (${Number(item.confidence || 0).toFixed(2)}) ${item.title}${item.goal ? `: ${item.goal}` : ''}`)
      : ['- 无']),
    '',
    '## 未解问题',
    '',
    ...(thinkingGraph.openQuestions.length ? thinkingGraph.openQuestions.map(item => `- ${item}`) : ['- 无']),
    '',
    '## 最近工具',
    '',
    `- 工具: ${thinkingGraph.lastTool || '未记录'}`,
    `- 参数: ${thinkingGraph.lastToolArguments || '未记录'}`,
    `- 结果: ${thinkingGraph.lastToolResult || '未记录'}`,
    '',
    '## 收束信息',
    '',
    `- 原因: ${thinkingGraph.terminationReason || '当前还没有收束原因。'}`,
    '',
    '## 最终结论',
    '',
    thinkingGraph.finalAnswer || '当前还没有最终结论。',
    '',
  ];
  return lines.join('\n');
}

function exportTaskThinkingResult(taskId) {
  const task = latestTaskPayload.find(item => item.id === taskId);
  if (!task) return;
  const filename = `${taskId}-thinking-result.md`;
  downloadTextFile(filename, buildTaskThinkingResultMarkdown(task), 'text/markdown;charset=utf-8');
  addLog('ok', `任务 ${taskId} 的思考结果已导出为 ${filename}`);
}

function buildTaskVerboseText(task) {
  const detailData = buildTaskDetailData(task);
  const lines = [
    `任务 ID: ${task.id}`,
    `任务名称: ${task.name || task.id}`,
    `任务类型: ${task.type || '未记录'}`,
    `状态: ${task.status || '未记录'}`,
    `求解器: ${getTaskSolverEngineLabel(getTaskEffectiveSolverEngine(task))}`,
    `工作空间: ${task.artifacts?.workspace_dir || '未创建'}`,
    '',
    '=== Agent Verbose ===',
    '',
  ];

  if (detailData.verboseLogs.length) {
    lines.push(...detailData.verboseLogs);
  } else {
    lines.push('暂无 Agent verbose 日志');
  }

  lines.push('');
  return lines.join('\n');
}

function exportTaskVerboseLogs(taskId) {
  const task = latestTaskPayload.find(item => item.id === taskId);
  if (!task) return;

  const detailData = buildTaskDetailData(task);
  if (!detailData.verboseLogs.length) {
    addLog('warn', `任务 ${taskId} 当前没有可导出的 Agent verbose 日志`);
    return;
  }

  const filename = `${taskId}-agent-verbose.txt`;
  downloadTextFile(filename, buildTaskVerboseText(task));
  addLog('ok', `任务 ${taskId} 的 Agent verbose 已导出为 ${filename}`);
}

function exportActiveThinkingGraphResult() {
  if (!activeThinkingGraphModalTaskId) return;
  exportTaskThinkingResult(activeThinkingGraphModalTaskId);
}

function closeThinkingGraphModal(event) {
  if (!event || event.target === document.getElementById('thinkingGraphModal')) {
    const closingTaskId = activeThinkingGraphModalTaskId;
    activeThinkingGraphModalTaskId = null;
    document.getElementById('thinkingGraphModal')?.classList.remove('show');
    stopThinkingGraphPan();
    if (closingTaskId && activeTaskDetailId === closingTaskId) {
      requestAnimationFrame(() => syncThinkingGraphFloatingLabel(closingTaskId));
    } else {
      removeThinkingGraphFloatingLabel();
    }
    resumeTaskRefresh();
  }
}

function openSwarmRunModal(taskId, runId) {
  const task = latestTaskPayload.find(t => t.id === taskId);
  if (!task || !runId) return;
  pauseTaskRefresh();
  activeSwarmRunModalTaskId = taskId;
  activeSwarmRunModalRunId = runId;
  renderSwarmRunModalForTask(task, runId);
  document.getElementById('swarmRunModal')?.classList.add('show');
}

function renderSwarmRunModalForTask(task, runId) {
  const detailData = buildTaskDetailData(task);
  const run = detailData.swarmRuns.find(item => item.id === runId);
  const titleEl = document.getElementById('swarmRunModalTitle');
  const contentEl = document.getElementById('swarmRunModalContent');
  if (!titleEl || !contentEl) return;

  if (!run) {
    titleEl.innerHTML = `${escapeHtml(task.id)} <span style="color:var(--text-3);font-size:12px">Swarm 实例加载中</span>`;
    contentEl.innerHTML = '<div class="task-thinking-empty" style="padding:16px;">当前没有找到对应的 Swarm 实例。</div>';
    return;
  }

  titleEl.innerHTML = `${escapeHtml(run.id)} <span style="color:var(--text-3);font-size:12px">[${escapeHtml(task.type)}] ${escapeHtml(task.name)} · Swarm 实例</span>`;
  contentEl.innerHTML = renderSwarmRunModalContent(run);
}

function closeSwarmRunModal(event) {
  if (!event || event.target === document.getElementById('swarmRunModal')) {
    activeSwarmRunModalTaskId = null;
    activeSwarmRunModalRunId = null;
    document.getElementById('swarmRunModal')?.classList.remove('show');
    resumeTaskRefresh();
  }
}

function splitEngineeringLogs(engineeringLogs) {
  /**
   * Split task logs into tool-oriented and verbose-oriented buckets.
   *
   * Args:
   *   engineeringLogs: Raw engineering log lines stored on the task.
   *
   * Returns:
   *   An object with `toolLogs` and `verboseLogs` arrays.
   */
  const toolLogs = [];
  const verboseLogs = [];

  engineeringLogs.forEach(log => {
    const text = String(log);
    if (
      text.includes('[Tool:')
      || text.includes('[Agent] Calling tool')
      || text.includes('[Agent] Result of tool')
    ) {
      toolLogs.push(log);
      return;
    }
    verboseLogs.push(log);
  });

  return { toolLogs, verboseLogs };
}

function normalizeTaskThinkingGraph(rawValue, artifacts = {}) {
  const source = rawValue && typeof rawValue === 'object' ? rawValue : {};
  const legacyClueVault = artifacts.clue_vault && typeof artifacts.clue_vault === 'object' ? artifacts.clue_vault : {};
  const normalizeList = (value) => Array.isArray(value)
    ? value.map(item => String(item || '').trim()).filter(Boolean)
    : [];
  const normalizeTimestamp = (value) => String(value || '').trim();
  const normalizePreview = (value) => {
    if (!value || typeof value !== 'object') return '';
    try {
      const text = JSON.stringify(value, null, 2);
      return text.length > 4000 ? `${text.slice(0, 4000)}\n...` : text;
    } catch (_) {
      return '';
    }
  };

  const hypotheses = Array.isArray(source.hypotheses) && source.hypotheses.length
    ? source.hypotheses
        .filter(item => item && typeof item === 'object')
        .map(item => ({
          id: String(item.id || '').trim(),
          content: String(item.content || '').trim(),
          status: String(item.status || 'open').trim() || 'open',
          confidence: Number(item.confidence ?? 0),
          evidence: normalizeList(item.evidence),
          updatedAt: normalizeTimestamp(item.updated_at),
        }))
        .filter(item => item.content)
    : normalizeList(legacyClueVault.hypotheses).map((content, index) => ({
        id: `legacy-h${index + 1}`,
        content,
        status: 'open',
        confidence: 0.5,
        evidence: [],
        updatedAt: '',
      }));

  const branches = Array.isArray(source.branches)
    ? source.branches
        .filter(item => item && typeof item === 'object')
        .map(item => ({
          id: String(item.id || '').trim(),
          title: String(item.title || '').trim(),
          goal: String(item.goal || '').trim(),
          status: String(item.status || 'open').trim() || 'open',
          confidence: Number(item.confidence ?? 0),
          linkedHypotheses: normalizeList(item.linked_hypotheses),
          lastAction: String(item.last_action || '').trim(),
          updatedAt: normalizeTimestamp(item.updated_at),
        }))
        .filter(item => item.title)
    : [];

  const executions = Array.isArray(source.executions)
    ? source.executions
        .filter(item => item && typeof item === 'object')
        .map(item => ({
          roundIndex: Number(item.round_index ?? 0),
          node: String(item.node || '').trim(),
          commentary: String(item.commentary || '').trim(),
          tool: String(item.tool || '').trim(),
          argumentsPreview: normalizePreview(item.arguments),
          reason: String(item.reason || '').trim(),
          outcome: String(item.outcome || '').trim(),
          resultPreview: String(item.result_preview || '').trim(),
          createdAt: normalizeTimestamp(item.created_at),
        }))
    : [];

  const expertRoutes = Array.isArray(source.expert_routes)
    ? source.expert_routes
        .filter(item => item && typeof item === 'object')
        .map(item => ({
          expertId: String(item.expert_id || '').trim(),
          title: String(item.title || '').trim(),
          score: Number(item.score ?? 0),
          reason: String(item.reason || '').trim(),
          branchTitle: String(item.branch_title || '').trim(),
          status: String(item.status || 'candidate').trim() || 'candidate',
          updatedAt: normalizeTimestamp(item.updated_at),
        }))
        .filter(item => item.title)
    : [];

  const expertProposals = Array.isArray(source.expert_proposals)
    ? source.expert_proposals
        .filter(item => item && typeof item === 'object')
        .map(item => ({
          id: String(item.id || '').trim(),
          expertId: String(item.expert_id || '').trim(),
          expertTitle: String(item.expert_title || '').trim(),
          actionType: String(item.action_type || 'tool_call').trim() || 'tool_call',
          commentary: String(item.commentary || '').trim(),
          tool: String(item.tool || '').trim(),
          argumentsPreview: normalizePreview(item.arguments),
          reason: String(item.reason || '').trim(),
          branchTitle: String(item.branch_title || '').trim(),
          expectedSignal: String(item.expected_signal || '').trim(),
          confidence: Number(item.confidence ?? 0),
          updatedAt: normalizeTimestamp(item.updated_at),
        }))
        .filter(item => item.id)
    : [];
  const swarmWorkers = Array.isArray(source.swarm_workers)
    ? source.swarm_workers
        .filter(item => item && typeof item === 'object')
        .map(item => ({
          id: String(item.id || '').trim(),
          expertId: String(item.expert_id || '').trim(),
          expertTitle: String(item.expert_title || '').trim(),
          branchTitle: String(item.branch_title || '').trim(),
          tool: String(item.tool || '').trim(),
          status: String(item.status || '').trim(),
          selection: String(item.selection || '').trim(),
          conclusion: String(item.conclusion || '').trim(),
        }))
        .filter(item => item.id)
    : [];

  const arbitrationSource = source.arbitration && typeof source.arbitration === 'object' ? source.arbitration : {};
  const arbitration = Object.keys(arbitrationSource).length
    ? {
        decisionType: String(arbitrationSource.decision_type || '').trim(),
        selectedProposalId: String(arbitrationSource.selected_proposal_id || '').trim(),
        selectedExpertId: String(arbitrationSource.selected_expert_id || '').trim(),
        selectedExpertTitle: String(arbitrationSource.selected_expert_title || '').trim(),
        summary: String(arbitrationSource.summary || '').trim(),
        reason: String(arbitrationSource.reason || '').trim(),
        tool: String(arbitrationSource.tool || '').trim(),
        argumentsPreview: normalizePreview(arbitrationSource.arguments),
        branchTitle: String(arbitrationSource.branch_title || '').trim(),
        expectedSignal: String(arbitrationSource.expected_signal || '').trim(),
        content: String(arbitrationSource.content || '').trim(),
        updatedAt: normalizeTimestamp(arbitrationSource.updated_at),
      }
    : null;

  return {
    currentNode: String(source.current_node || '').trim(),
    roundIndex: Number(source.round_index ?? 0),
    graphSummary: String(source.graph_summary || artifacts.thinking_graph_summary || legacyClueVault.summary_snapshot || '').trim(),
    focus: String(source.focus || legacyClueVault.next_step || '').trim(),
    terminationReason: String(source.termination_reason || '').trim(),
    finalAnswer: String(source.final_answer || '').trim(),
    facts: normalizeList(source.facts).length ? normalizeList(source.facts) : normalizeList(legacyClueVault.facts),
    rejectedItems: normalizeList(source.rejected_items),
    openQuestions: normalizeList(source.open_questions).length ? normalizeList(source.open_questions) : normalizeList(legacyClueVault.open_questions),
    runtimeInputs: normalizeList(source.runtime_inputs),
    expertPool: normalizeList(source.expert_pool),
    activeExperts: normalizeList(source.active_experts),
    hypotheses,
    branches,
    expertRoutes,
    expertProposals,
    swarmWorkers,
    arbitration,
    executions,
    lastTool: String(source.last_tool || '').trim(),
    lastToolArguments: normalizePreview(source.last_tool_arguments),
    lastToolResult: normalizePreview(source.last_tool_result),
    checkpointPath: String(source.checkpoint_path || legacyClueVault.checkpoint_path || '').trim(),
    updatedAt: normalizeTimestamp(source.updated_at),
    workflowMode: String(artifacts.workflow_mode || '').trim(),
    workspaceDir: String(source.workspace_dir || artifacts.workspace_dir || '').trim(),
  };
}

function normalizeTaskSwarmRuns(rawValue, knowledgeHarvestState = null) {
  const normalizeTimestamp = (value) => String(value || '').trim();
  const normalizePreview = (value) => {
    if (!value || typeof value !== 'object') return '';
    try {
      const text = JSON.stringify(value, null, 2);
      return text.length > 3000 ? `${text.slice(0, 3000)}\n...` : text;
    } catch (_) {
      return '';
    }
  };

  // 求解模式：从 swarm_runs 提取
  const solverRuns = Array.isArray(rawValue)
    ? rawValue
        .filter(item => item && typeof item === 'object')
        .map(item => ({
          id: String(item.id || '').trim(),
          roundIndex: Number(item.round_index ?? 0),
          proposalId: String(item.proposal_id || '').trim(),
          expertId: String(item.expert_id || '').trim(),
          expertTitle: String(item.expert_title || '').trim(),
          branchTitle: String(item.branch_title || '').trim(),
          tool: String(item.tool || '').trim(),
          argumentsPreview: normalizePreview(item.arguments),
          selection: String(item.selection || '').trim(),
          work: String(item.work || '').trim(),
          status: String(item.status || 'running').trim() || 'running',
          createdAt: normalizeTimestamp(item.created_at),
          destroyedAt: normalizeTimestamp(item.destroyed_at),
          conclusion: String(item.conclusion || '').trim(),
          kind: 'solver',
        }))
        .filter(item => item.id)
    : [];

  // 学习模式：从 knowledge_harvest_state 提取 swarm worker runs
  const learningRuns = [];
  if (knowledgeHarvestState && typeof knowledgeHarvestState === 'object') {
    const workerRuns = Array.isArray(knowledgeHarvestState.swarm_worker_runs)
      ? knowledgeHarvestState.swarm_worker_runs
      : [];
    const swarmReviews = Array.isArray(knowledgeHarvestState.swarm_reviews)
      ? knowledgeHarvestState.swarm_reviews
      : [];
    
    // Worker runs
    workerRuns.forEach((item, index) => {
      if (!item || typeof item !== 'object') return;
      const stage = String(item.stage || '').trim();
      const stageLabel = stage === 'discover' ? '发现' : stage === 'ingest' ? '抓取' : stage === 'process' ? '处理' : stage;
      learningRuns.push({
        id: String(item.worker_id || `learning-worker-${index}`),
        roundIndex: Number(item.item_index || 0),
        proposalId: '',
        expertId: String(item.worker_id || '').trim(),
        expertTitle: `${stageLabel} Worker`,
        branchTitle: String(item.input || '').slice(0, 60),
        tool: stage,
        argumentsPreview: normalizePreview(item),
        selection: '',
        work: `输入: ${String(item.input || '').slice(0, 100)}\n结果: ${item.result_count ?? 0} 项`,
        status: String(item.status || 'completed').trim() || 'completed',
        createdAt: '',
        destroyedAt: '',
        conclusion: '',
        kind: 'learning',
        stage: stage,
        resultCount: item.result_count,
      });
    });

    // Swarm reviews
    swarmReviews.forEach((item, index) => {
      if (!item || typeof item !== 'object') return;
      const stage = String(item.stage || '').trim();
      const stageLabel = stage === 'direction_review' ? '方向审核' : stage === 'content_review' ? '内容审核' : '审核';
      learningRuns.push({
        id: String(item.reviewer_id || `learning-reviewer-${index}`),
        roundIndex: index,
        proposalId: '',
        expertId: String(item.reviewer_id || '').trim(),
        expertTitle: `Swarm ${stageLabel}`,
        branchTitle: String(item.status || '').toUpperCase(),
        tool: 'review',
        argumentsPreview: normalizePreview(item),
        selection: String(item.status || ''),
        work: String(item.summary || '').slice(0, 200),
        status: 'completed',
        createdAt: '',
        destroyedAt: '',
        conclusion: String(item.summary || ''),
        kind: 'learning',
        isReview: true,
        concerns: item.concerns,
        recommendedActions: item.recommended_actions,
      });
    });
  }

  return [...solverRuns, ...learningRuns];
}

/**
 * Normalize a backend task context snapshot into stable frontend arrays.
 *
 * @param {*} rawValue - Raw backend `artifacts.context_snapshot` payload.
 * @returns {Object} Normalized uncompacted, compacted, memory, and stats sections.
 */
function normalizeTaskContextSnapshot(rawValue) {
  // Normalize the root payload before reading nested context sections.
  const source = rawValue && typeof rawValue === 'object' ? rawValue : {};

  // Normalize uncompacted entries into a stable array of strings and metadata.
  const uncompacted = Array.isArray(source.uncompacted)
    ? source.uncompacted
        .filter(item => item && typeof item === 'object')
        .map(item => ({
          id: Number(item.id ?? 0),
          role: String(item.role || '').trim(),
          content: String(item.content || '').trim(),
          toolCallInfo: Array.isArray(item.tool_call_info) ? item.tool_call_info.map(entry => String(entry || '').trim()).filter(Boolean) : [],
          toolCallResult: Array.isArray(item.tool_call_result) ? item.tool_call_result.map(entry => String(entry || '').trim()).filter(Boolean) : [],
          tags: Array.isArray(item.tags) ? item.tags.map(entry => String(entry || '').trim()).filter(Boolean) : [],
        }))
    : [];

  // Normalize compacted entries into summary objects with source links.
  const compacted = Array.isArray(source.compacted)
    ? source.compacted
        .filter(item => item && typeof item === 'object')
        .map(item => ({
          id: Number(item.id ?? 0),
          abstractMsg: String(item.abstract_msg || '').trim(),
          sourceIds: Array.isArray(item.source_ids) ? item.source_ids.map(entry => Number(entry ?? 0)).filter(Number.isFinite) : [],
          tags: Array.isArray(item.tags) ? item.tags.map(entry => String(entry || '').trim()).filter(Boolean) : [],
        }))
    : [];

  // Normalize persistent memories into a flat ordered array for rendering.
  const memories = Array.isArray(source.memories)
    ? source.memories
        .filter(item => item && typeof item === 'object')
        .map(item => ({
          id: Number(item.id ?? 0),
          content: String(item.content || '').trim(),
        }))
    : [];

  // Derive counters from normalized data unless the backend already provided them.
  const rawStats = source.stats && typeof source.stats === 'object' ? source.stats : {};
  return {
    uncompacted,
    compacted,
    memories,
    stats: {
      uncompactedCount: Number.isFinite(Number(rawStats.uncompacted_count)) ? Number(rawStats.uncompacted_count) : uncompacted.length,
      compactedCount: Number.isFinite(Number(rawStats.compacted_count)) ? Number(rawStats.compacted_count) : compacted.length,
      memoryCount: Number.isFinite(Number(rawStats.memory_count)) ? Number(rawStats.memory_count) : memories.length,
    },
  };
}

/**
 * Render one structured context section inside the task detail context tab.
 *
 * @param {string} title - Section title shown to the user.
 * @param {Array} entries - Normalized context entries for this section.
 * @param {string} kind - Section kind: uncompacted, compacted, or memory.
 * @returns {string} HTML for one context section.
 */
function renderTaskContextSection(title, entries, kind) {
  // Render either the entry list or a stable empty-state placeholder for this section.
  const bodyHtml = Array.isArray(entries) && entries.length
    ? entries.map(entry => renderTaskContextEntry(entry, kind)).join('')
    : `<div class="task-thinking-empty">当前没有${escapeHtml(title)}上下文。</div>`;

  // Wrap the rendered section body in the same card shell used by other detail tabs.
  return `
    <section class="task-thinking-section">
      <div class="task-thinking-section-title">${escapeHtml(title)}</div>
      <div class="task-context-stack">${bodyHtml}</div>
    </section>
  `;
}

/**
 * Render one normalized task context entry.
 *
 * @param {Object} entry - Normalized context entry.
 * @param {string} kind - Entry kind: uncompacted, compacted, or memory.
 * @returns {string} HTML for one context item card.
 */
function renderTaskContextEntry(entry, kind) {
  // Render raw uncompacted context entries with role, tags, and tool traces.
  if (kind === 'uncompacted') {
    const toolInfoHtml = entry.toolCallInfo.length
      ? `
        <div class="task-thinking-subsection">
          <div class="task-thinking-subtitle">工具调用</div>
          <pre class="task-thinking-code">${escapeHtml(entry.toolCallInfo.join('\n\n'))}</pre>
        </div>
      `
      : '';
    const toolResultHtml = entry.toolCallResult.length
      ? `
        <div class="task-thinking-subsection">
          <div class="task-thinking-subtitle">工具结果</div>
          <pre class="task-thinking-code">${escapeHtml(entry.toolCallResult.join('\n\n'))}</pre>
        </div>
      `
      : '';
    return `
      <div class="task-context-card">
        <div class="task-context-card-head">
          <div class="task-context-card-title">#${escapeHtml(String(entry.id))} · ${escapeHtml(entry.role || 'unknown')}</div>
          <div class="task-context-chip">${escapeHtml((entry.tags || []).join(' · ') || '无标签')}</div>
        </div>
        <pre class="task-thinking-code">${escapeHtml(entry.content || '空内容')}</pre>
        ${toolInfoHtml}
        ${toolResultHtml}
      </div>
    `;
  }

  // Render compacted context entries with their summary text and source links.
  if (kind === 'compacted') {
    return `
      <div class="task-context-card">
        <div class="task-context-card-head">
          <div class="task-context-card-title">#${escapeHtml(String(entry.id))} · 压缩摘要</div>
          <div class="task-context-chip">${escapeHtml((entry.tags || []).join(' · ') || '无标签')}</div>
        </div>
        <div class="task-context-card-meta">source_ids: ${escapeHtml((entry.sourceIds || []).join(', ') || '无')}</div>
        <pre class="task-thinking-code">${escapeHtml(entry.abstractMsg || '空摘要')}</pre>
      </div>
    `;
  }

  // Render persistent memories as simple ordered summary cards.
  return `
    <div class="task-context-card">
      <div class="task-context-card-head">
        <div class="task-context-card-title">Memory #${escapeHtml(String(entry.id))}</div>
      </div>
      <pre class="task-thinking-code">${escapeHtml(entry.content || '空记忆')}</pre>
    </div>
  `;
}

function normalizeTaskAutonomousWorkflow(rawValue) {
  const source = rawValue && typeof rawValue === 'object' ? rawValue : {};
  const normalizeTimestamp = (value) => String(value || '').trim();
  const normalizeDetails = (value) => (value && typeof value === 'object' ? value : {});

  return {
    currentStage: String(source.current_stage || '').trim(),
    executionMode: String(source.execution_mode || '').trim(),
    systemReady: Boolean(source.system_ready),
    finalOutcome: String(source.final_outcome || '').trim(),
    finalAnswer: String(source.final_answer || '').trim(),
    lastFailureReason: String(source.last_failure_reason || '').trim(),
    distillationStatus: String(source.distillation_status || '').trim(),
    updatedAt: normalizeTimestamp(source.updated_at),
    stages: Array.isArray(source.stages)
      ? source.stages
          .filter(item => item && typeof item === 'object')
          .map(item => ({
            key: String(item.key || '').trim(),
            title: String(item.title || '').trim(),
            status: String(item.status || 'pending').trim() || 'pending',
            summary: String(item.summary || '').trim(),
            details: normalizeDetails(item.details),
            startedAt: normalizeTimestamp(item.started_at),
            finishedAt: normalizeTimestamp(item.finished_at),
          }))
          .filter(item => item.key)
      : [],
    rounds: Array.isArray(source.rounds)
      ? source.rounds
          .filter(item => item && typeof item === 'object')
          .map(item => ({
            roundIndex: Number(item.round_index ?? 0),
            focus: String(item.focus || '').trim(),
            graphSummary: String(item.graph_summary || '').trim(),
            tool: String(item.tool || '').trim(),
            toolResultPreview: String(item.tool_result_preview || '').trim(),
            verificationOutcome: String(item.verification_outcome || '').trim(),
            createdAt: normalizeTimestamp(item.created_at),
          }))
      : [],
  };
}

function getAutonomousWorkflowStage(autonomousWorkflow, stageKey) {
  if (!autonomousWorkflow || !Array.isArray(autonomousWorkflow.stages)) {
    return null;
  }
  return autonomousWorkflow.stages.find(item => item.key === stageKey) || null;
}

function getTaskLatestAutonomousRound(autonomousWorkflow) {
  return Array.isArray(autonomousWorkflow?.rounds) && autonomousWorkflow.rounds.length
    ? autonomousWorkflow.rounds[autonomousWorkflow.rounds.length - 1]
    : null;
}

function renderThinkingGraphMetric(label, value) {
  return `
    <div class="task-thinking-metric">
      <div class="task-thinking-metric-label">${escapeHtml(label)}</div>
      <div class="task-thinking-metric-value">${escapeHtml(value || '—')}</div>
    </div>
  `;
}

function resolveTaskFocus(thinkingGraph, autonomousWorkflow, artifacts = null) {
  const graphFocus = String(thinkingGraph?.focus || '').trim();
  if (graphFocus) return graphFocus;

  const latestRound = getTaskLatestAutonomousRound(autonomousWorkflow);
  const roundFocus = String(latestRound?.focus || '').trim();
  if (roundFocus) return roundFocus;

  const currentStage = getAutonomousWorkflowStage(autonomousWorkflow, autonomousWorkflow?.currentStage);
  const stageDetailsFocus = String(currentStage?.details?.focus || '').trim();
  if (stageDetailsFocus) return stageDetailsFocus;

  const stageSummary = String(currentStage?.summary || '').trim();
  if (stageSummary) return stageSummary;

  const runtimeArtifacts = artifacts && typeof artifacts === 'object' ? artifacts : {};
  const linearState = runtimeArtifacts.linear_solver_state && typeof runtimeArtifacts.linear_solver_state === 'object'
    ? runtimeArtifacts.linear_solver_state
    : {};
  const linearSummary = String(linearState.summary || '').trim();
  if (linearSummary) return linearSummary;

  const agentSummary = String(runtimeArtifacts.agent_summary || '').trim();
  if (agentSummary) return agentSummary;

  const graphSummary = String(thinkingGraph?.graphSummary || '').trim();
  if (graphSummary) return graphSummary;

  const toolResult = String(thinkingGraph?.lastToolResult || '').trim();
  if (toolResult) return truncateThinkingGraphActionText(toolResult, 120);

  return '当前还没有明确 focus。';
}

function normalizeTaskActionRuntime(task, thinkingGraph, autonomousWorkflow) {
  const artifacts = task?.artifacts && typeof task.artifacts === 'object' ? task.artifacts : {};
  const linearState = artifacts.linear_solver_state && typeof artifacts.linear_solver_state === 'object'
    ? artifacts.linear_solver_state
    : {};
  const currentStage = getAutonomousWorkflowStage(autonomousWorkflow, autonomousWorkflow?.currentStage);
  const analysisStage = getAutonomousWorkflowStage(autonomousWorkflow, 'analysis');
  const toolStage = getAutonomousWorkflowStage(autonomousWorkflow, 'tool_execution');
  const verificationStage = getAutonomousWorkflowStage(autonomousWorkflow, 'verification');
  const latestRound = getTaskLatestAutonomousRound(autonomousWorkflow);
  const recentMessages = Array.isArray(linearState.recent_messages)
    ? linearState.recent_messages.filter(item => item && typeof item === 'object')
    : [];
  const latestAssistantMessage = recentMessages
    .slice()
    .reverse()
    .find(item => String(item.role || '').trim() === 'assistant');
  const workflowMode = String(artifacts.workflow_mode || '').trim() || 'unknown';
  const updatedAt = String(
    autonomousWorkflow?.updatedAt
    || currentStage?.finishedAt
    || currentStage?.startedAt
    || verificationStage?.finishedAt
    || toolStage?.finishedAt
    || analysisStage?.startedAt
    || thinkingGraph?.updatedAt
    || ''
  ).trim();
  const summary = String(
    currentStage?.details?.summary
    || currentStage?.details?.graph_summary
    || currentStage?.summary
    || latestRound?.graphSummary
    || verificationStage?.details?.summary
    || toolStage?.details?.result_preview
    || analysisStage?.details?.graph_summary
    || linearState.summary
    || artifacts.agent_summary
    || thinkingGraph?.graphSummary
    || ''
  ).trim();
  const currentTool = String(
    toolStage?.details?.tool
    || latestRound?.tool
    || thinkingGraph?.lastTool
    || ''
  ).trim();
  const currentResult = String(
    latestRound?.toolResultPreview
    || toolStage?.details?.result_preview
    || thinkingGraph?.lastToolResult
    || ''
  ).trim();
  const currentActionSummary = String(
    currentStage?.summary
    || verificationStage?.summary
    || toolStage?.summary
    || analysisStage?.summary
    || latestAssistantMessage?.content
    || latestRound?.verificationOutcome
    || summary
    || ''
  ).trim();
  const roundIndex = Number(
    linearState.round_index
    ?? currentStage?.details?.round_index
    ?? verificationStage?.details?.round_index
    ?? analysisStage?.details?.round_index
    ?? latestRound?.roundIndex
    ?? artifacts.agent_rounds
    ?? thinkingGraph?.roundIndex
    ?? 0
  );
  const finalSnapshot = String(
    autonomousWorkflow?.finalAnswer
    || autonomousWorkflow?.finalOutcome
    || thinkingGraph?.finalAnswer
    || thinkingGraph?.terminationReason
    || ''
  ).trim();

  return {
    workflowMode,
    updatedAt,
    roundIndex: Number.isFinite(roundIndex) ? roundIndex : 0,
    summary,
    currentTool,
    currentResult,
    currentActionSummary,
    finalSnapshot,
  };
}

function getThinkingGraphNodeInfo(currentNode = '') {
  switch (String(currentNode || '').trim()) {
    case 'observe':
      return {
        key: 'observe',
        label: '观察局面',
        summary: '正在整理样本、事实、约束和仍待确认的问题。',
        chipClass: 'status-active',
      };
    case 'route':
      return {
        key: 'route',
        label: '路由专家',
        summary: '中枢正在根据当前图状态选择最值得激活的专家模块。',
        chipClass: 'status-active',
      };
    case 'propose':
      return {
        key: 'propose',
        label: '收集提案',
        summary: '已激活的专家正在提交各自的最小动作提案。',
        chipClass: 'status-active',
      };
    case 'arbitrate':
      return {
        key: 'arbitrate',
        label: '仲裁动作',
        summary: '中枢正在比较专家提案，并选出本轮主动作。',
        chipClass: 'status-open',
      };
    case 'plan':
      return {
        key: 'plan',
        label: '规划动作',
        summary: '正在挑选主分支，并决定下一步最小验证动作。',
        chipClass: 'status-active',
      };
    case 'execute':
      return {
        key: 'execute',
        label: '执行验证',
        summary: '正在调用工具、运行命令或落地一次具体验证。',
        chipClass: 'status-active',
      };
    case 'evaluate':
      return {
        key: 'evaluate',
        label: '评估结果',
        summary: '正在判断最新结果是否支持当前分支，或是否需要回退修正。',
        chipClass: 'status-open',
      };
    case 'finalize':
      return {
        key: 'finalize',
        label: '收束答案',
        summary: '正在整理最终结论、解题路径和收束说明。',
        chipClass: 'status-resolved',
      };
    default:
      return {
        key: 'unknown',
        label: '待进入节点',
        summary: '思考图已初始化，等待进入下一阶段。',
        chipClass: 'status-open',
      };
  }
}

function getThinkingGraphMostRecentItem(items, preferredStatuses = []) {
  if (!Array.isArray(items) || !items.length) {
    return null;
  }
  const sorted = items.slice().sort((left, right) => {
    const leftTime = String(left?.updatedAt || left?.createdAt || '');
    const rightTime = String(right?.updatedAt || right?.createdAt || '');
    if (leftTime !== rightTime) {
      return rightTime.localeCompare(leftTime);
    }
    return String(right?.id || '').localeCompare(String(left?.id || ''));
  });
  for (const status of preferredStatuses) {
    const match = sorted.find(item => String(item?.status || '').trim() === status);
    if (match) return match;
  }
  return sorted[0];
}

function truncateThinkingGraphActionText(text, maxLength = 220) {
  return truncateThinkingGraphText(text, maxLength) || '未记录';
}

function renderThinkingGraphFocusCard(thinkingGraph, autonomousWorkflow = null) {
  const nodeInfo = getThinkingGraphNodeInfo(thinkingGraph.currentNode);
  const focusText = resolveTaskFocus(thinkingGraph, autonomousWorkflow);
  const metaParts = [
    thinkingGraph.roundIndex ? `第 ${thinkingGraph.roundIndex} 轮` : '第 0 轮',
    nodeInfo.label,
  ];
  if (thinkingGraph.updatedAt) {
    metaParts.push(formatDateTime(thinkingGraph.updatedAt) || thinkingGraph.updatedAt);
  }

  return `
    <section class="task-thinking-section">
      <div class="task-thinking-section-title">Current Focus</div>
      <div class="task-thinking-focus-card">
        <div class="task-thinking-focus-head">
          <div class="task-thinking-focus-eyebrow">模型当前优先围绕这个目标推进</div>
          <div class="task-thinking-chip ${nodeInfo.chipClass}">${escapeHtml(nodeInfo.label)}</div>
        </div>
        <div class="task-thinking-focus-text">${escapeHtml(focusText)}</div>
        <div class="task-thinking-focus-meta">${escapeHtml(metaParts.join(' · '))}</div>
      </div>
    </section>
  `;
}

function renderThinkingGraphCurrentActionCard(thinkingGraph) {
  const nodeInfo = getThinkingGraphNodeInfo(thinkingGraph.currentNode);
  const activeBranch = getThinkingGraphMostRecentItem(thinkingGraph.branches, ['open', 'blocked', 'resolved']);
  const branchLinkedHypotheses = activeBranch?.linkedHypotheses?.length
    ? thinkingGraph.hypotheses.filter(item => activeBranch.linkedHypotheses.includes(item.id))
    : [];
  const activeHypothesis = getThinkingGraphMostRecentItem(
    branchLinkedHypotheses.length ? branchLinkedHypotheses : thinkingGraph.hypotheses,
    ['open', 'supported', 'rejected'],
  );
  const latestExecution = Array.isArray(thinkingGraph.executions) && thinkingGraph.executions.length
    ? thinkingGraph.executions[thinkingGraph.executions.length - 1]
    : null;
  const currentTool = thinkingGraph.lastTool || latestExecution?.tool || '';
  const latestResult = thinkingGraph.lastToolResult || latestExecution?.resultPreview || '';
  const currentActionSummary = latestExecution?.commentary
    || latestExecution?.reason
    || activeBranch?.goal
    || nodeInfo.summary;
  const metricItems = [
    ['当前阶段', nodeInfo.label],
    ['当前分支', activeBranch?.title || '未锁定'],
    ['当前假设', activeHypothesis?.content || '未锁定'],
    ['当前工具', currentTool || '尚未执行工具'],
  ].map(([label, value]) => renderThinkingGraphMetric(label, truncateThinkingGraphActionText(value, 96))).join('');

  return `
    <section class="task-thinking-section">
      <div class="task-thinking-section-title">当前动作卡</div>
      <div class="task-thinking-action-card">
        <div class="task-thinking-action-head">
          <div>
            <div class="task-thinking-action-title">${escapeHtml(nodeInfo.label)}</div>
            <div class="task-thinking-action-summary">${escapeHtml(currentActionSummary)}</div>
          </div>
          <div class="task-thinking-chip ${nodeInfo.chipClass}">${escapeHtml(thinkingGraph.currentNode || 'idle')}</div>
        </div>
        <div class="task-thinking-action-metrics">${metricItems}</div>
        ${activeBranch?.goal ? `
          <div class="task-thinking-subsection">
            <div class="task-thinking-subtitle">分支目标</div>
            <div class="task-thinking-item">${escapeHtml(activeBranch.goal)}</div>
          </div>
        ` : ''}
        ${latestExecution?.reason ? `
          <div class="task-thinking-subsection">
            <div class="task-thinking-subtitle">本轮动机</div>
            <div class="task-thinking-item">${escapeHtml(latestExecution.reason)}</div>
          </div>
        ` : ''}
        ${latestResult ? `
          <div class="task-thinking-subsection">
            <div class="task-thinking-subtitle">最新结果快照</div>
            <pre class="task-thinking-code">${escapeHtml(latestResult)}</pre>
          </div>
        ` : ''}
      </div>
    </section>
  `;
}

function renderThinkingGraphTextList(title, items, emptyText) {
  const body = items.length
    ? items.map(item => `<div class="task-thinking-item">${escapeHtml(item)}</div>`).join('')
    : `<div class="task-thinking-empty">${escapeHtml(emptyText)}</div>`;
  return `
    <section class="task-thinking-section">
      <div class="task-thinking-section-title">${escapeHtml(title)}</div>
      <div class="task-thinking-list">${body}</div>
    </section>
  `;
}

function renderThinkingGraphHypotheses(hypotheses) {
  const body = hypotheses.length
    ? hypotheses.map(item => `
        <div class="task-thinking-entity">
          <div class="task-thinking-entity-head">
            <div class="task-thinking-entity-title">${escapeHtml(item.content)}</div>
            <div class="task-thinking-chip status-${escapeHtml(item.status)}">${escapeHtml(item.status)}</div>
          </div>
          <div class="task-thinking-entity-meta">
            ${item.id ? `ID ${escapeHtml(item.id)} · ` : ''}置信度 ${(Number.isFinite(item.confidence) ? item.confidence : 0).toFixed(2)}
            ${item.updatedAt ? ` · ${escapeHtml(formatDateTime(item.updatedAt) || item.updatedAt)}` : ''}
          </div>
          ${item.evidence.length ? `
            <div class="task-thinking-subsection">
              <div class="task-thinking-subtitle">证据</div>
              ${item.evidence.map(entry => `<div class="task-thinking-item">${escapeHtml(entry)}</div>`).join('')}
            </div>
          ` : ''}
        </div>
      `).join('')
    : '<div class="task-thinking-empty">当前还没有结构化假设。</div>';

  return `
    <section class="task-thinking-section">
      <div class="task-thinking-section-title">假设</div>
      <div class="task-thinking-stack">${body}</div>
    </section>
  `;
}

function renderThinkingGraphBranches(branches) {
  const body = branches.length
    ? branches.map(item => `
        <div class="task-thinking-entity">
          <div class="task-thinking-entity-head">
            <div class="task-thinking-entity-title">${escapeHtml(item.title)}</div>
            <div class="task-thinking-chip status-${escapeHtml(item.status)}">${escapeHtml(item.status)}</div>
          </div>
          <div class="task-thinking-entity-meta">
            ${item.id ? `ID ${escapeHtml(item.id)} · ` : ''}置信度 ${(Number.isFinite(item.confidence) ? item.confidence : 0).toFixed(2)}
            ${item.updatedAt ? ` · ${escapeHtml(formatDateTime(item.updatedAt) || item.updatedAt)}` : ''}
          </div>
          ${item.goal ? `
            <div class="task-thinking-subsection">
              <div class="task-thinking-subtitle">目标</div>
              <div class="task-thinking-item">${escapeHtml(item.goal)}</div>
            </div>
          ` : ''}
          ${item.lastAction ? `
            <div class="task-thinking-subsection">
              <div class="task-thinking-subtitle">最近动作</div>
              <pre class="task-thinking-code">${escapeHtml(item.lastAction)}</pre>
            </div>
          ` : ''}
        </div>
      `).join('')
    : '<div class="task-thinking-empty">当前还没有分支。</div>';

  return `
    <section class="task-thinking-section">
      <div class="task-thinking-section-title">分支</div>
      <div class="task-thinking-stack">${body}</div>
    </section>
  `;
}

function renderThinkingGraphExecutions(executions) {
  const body = executions.length
    ? executions.map(item => `
        <div class="task-thinking-exec">
          <div class="task-thinking-exec-head">
            <div class="task-thinking-exec-title">Round ${escapeHtml(String(item.roundIndex || 0))} · ${escapeHtml(item.node || 'node')}</div>
            <div class="task-thinking-chip status-${escapeHtml(item.outcome || 'open')}">${escapeHtml(item.outcome || 'executed')}</div>
          </div>
          <div class="task-thinking-entity-meta">
            ${item.createdAt ? escapeHtml(formatDateTime(item.createdAt) || item.createdAt) : '未记录时间'}
            ${item.tool ? ` · ${escapeHtml(item.tool)}` : ''}
          </div>
          ${item.commentary ? `<div class="task-thinking-item">${escapeHtml(item.commentary)}</div>` : ''}
          ${item.reason ? `
            <div class="task-thinking-subsection">
              <div class="task-thinking-subtitle">原因</div>
              <div class="task-thinking-item">${escapeHtml(item.reason)}</div>
            </div>
          ` : ''}
          ${item.argumentsPreview ? `
            <div class="task-thinking-subsection">
              <div class="task-thinking-subtitle">参数</div>
              <pre class="task-thinking-code">${escapeHtml(item.argumentsPreview)}</pre>
            </div>
          ` : ''}
          ${item.resultPreview ? `
            <div class="task-thinking-subsection">
              <div class="task-thinking-subtitle">结果摘要</div>
              <pre class="task-thinking-code">${escapeHtml(item.resultPreview)}</pre>
            </div>
          ` : ''}
        </div>
      `).join('')
    : '<div class="task-thinking-empty">当前还没有执行轨迹。</div>';

  return `
    <section class="task-thinking-section">
      <div class="task-thinking-section-title">执行轨迹</div>
      <div class="task-thinking-stack">${body}</div>
    </section>
  `;
}

function renderThinkingGraphOrchestration(thinkingGraph) {
  const routes = Array.isArray(thinkingGraph.expertRoutes) ? thinkingGraph.expertRoutes : [];
  const proposals = Array.isArray(thinkingGraph.expertProposals) ? thinkingGraph.expertProposals : [];
  const arbitration = thinkingGraph.arbitration;
  const normalizeChipStatus = (value) => {
    const normalized = String(value || '').trim();
    if (['selected', 'active', 'running'].includes(normalized)) return 'active';
    if (['final', 'resolved', 'done'].includes(normalized)) return 'resolved';
    if (['standby', 'candidate', 'tool_call', 'proposal', 'fallback'].includes(normalized)) return 'open';
    return normalized || 'open';
  };
  const activeExpertsText = Array.isArray(thinkingGraph.activeExperts) && thinkingGraph.activeExperts.length
    ? thinkingGraph.activeExperts.join(' · ')
    : '当前还没有激活的专家模块。';
  const routesHtml = routes.length
    ? routes.map(item => `
        <div class="task-thinking-entity">
          <div class="task-thinking-entity-head">
            <div class="task-thinking-entity-title">${escapeHtml(item.title)}</div>
            <div class="task-thinking-chip status-${escapeHtml(normalizeChipStatus(item.status))}">${escapeHtml(item.status)}</div>
          </div>
          <div class="task-thinking-entity-meta">
            ${(Number.isFinite(item.score) ? item.score : 0).toFixed(2)}
            ${item.updatedAt ? ` · ${escapeHtml(formatDateTime(item.updatedAt) || item.updatedAt)}` : ''}
          </div>
          ${item.branchTitle ? `
            <div class="task-thinking-subsection">
              <div class="task-thinking-subtitle">服务分支</div>
              <div class="task-thinking-item">${escapeHtml(item.branchTitle)}</div>
            </div>
          ` : ''}
          ${item.reason ? `
            <div class="task-thinking-subsection">
              <div class="task-thinking-subtitle">路由原因</div>
              <div class="task-thinking-item">${escapeHtml(item.reason)}</div>
            </div>
          ` : ''}
        </div>
      `).join('')
    : '<div class="task-thinking-empty">当前还没有专家路由结果。</div>';
  const proposalsHtml = proposals.length
    ? proposals.map(item => `
        <div class="task-thinking-entity">
          <div class="task-thinking-entity-head">
            <div class="task-thinking-entity-title">${escapeHtml(item.expertTitle || item.id)}</div>
            <div class="task-thinking-chip status-${escapeHtml(normalizeChipStatus(item.actionType))}">${escapeHtml(item.actionType)}</div>
          </div>
          <div class="task-thinking-entity-meta">
            ${escapeHtml(item.id)}
            ${item.tool ? ` · ${escapeHtml(item.tool)}` : ''}
            ${item.updatedAt ? ` · ${escapeHtml(formatDateTime(item.updatedAt) || item.updatedAt)}` : ''}
          </div>
          ${item.branchTitle ? `
            <div class="task-thinking-subsection">
              <div class="task-thinking-subtitle">目标分支</div>
              <div class="task-thinking-item">${escapeHtml(item.branchTitle)}</div>
            </div>
          ` : ''}
          ${item.reason ? `
            <div class="task-thinking-subsection">
              <div class="task-thinking-subtitle">提案理由</div>
              <div class="task-thinking-item">${escapeHtml(item.reason)}</div>
            </div>
          ` : ''}
          ${item.expectedSignal ? `
            <div class="task-thinking-subsection">
              <div class="task-thinking-subtitle">预期信号</div>
              <div class="task-thinking-item">${escapeHtml(item.expectedSignal)}</div>
            </div>
          ` : ''}
          ${item.argumentsPreview ? `
            <div class="task-thinking-subsection">
              <div class="task-thinking-subtitle">参数</div>
              <pre class="task-thinking-code">${escapeHtml(item.argumentsPreview)}</pre>
            </div>
          ` : ''}
        </div>
      `).join('')
    : '<div class="task-thinking-empty">当前还没有专家提案。</div>';

  return `
    <section class="task-thinking-section">
      <div class="task-thinking-section-title">中枢调度</div>
      <div class="task-thinking-summary">${escapeHtml(activeExpertsText)}</div>
      <div class="task-thinking-subsection" style="margin-top:12px;">
        <div class="task-thinking-subtitle">专家路由</div>
        <div class="task-thinking-stack">${routesHtml}</div>
      </div>
      <div class="task-thinking-subsection" style="margin-top:12px;">
        <div class="task-thinking-subtitle">专家提案</div>
        <div class="task-thinking-stack">${proposalsHtml}</div>
      </div>
      <div class="task-thinking-subsection" style="margin-top:12px;">
        <div class="task-thinking-subtitle">本轮仲裁</div>
        ${arbitration ? `
          <div class="task-thinking-entity">
            <div class="task-thinking-entity-head">
              <div class="task-thinking-entity-title">${escapeHtml(arbitration.selectedExpertTitle || arbitration.decisionType || '未命名仲裁')}</div>
              <div class="task-thinking-chip status-${escapeHtml(normalizeChipStatus(arbitration.decisionType || 'open'))}">${escapeHtml(arbitration.decisionType || 'open')}</div>
            </div>
            <div class="task-thinking-entity-meta">
              ${arbitration.updatedAt ? escapeHtml(formatDateTime(arbitration.updatedAt) || arbitration.updatedAt) : '未记录时间'}
              ${arbitration.tool ? ` · ${escapeHtml(arbitration.tool)}` : ''}
            </div>
            ${arbitration.summary ? `
              <div class="task-thinking-subsection">
                <div class="task-thinking-subtitle">总结</div>
                <div class="task-thinking-item">${escapeHtml(arbitration.summary)}</div>
              </div>
            ` : ''}
            ${arbitration.reason ? `
              <div class="task-thinking-subsection">
                <div class="task-thinking-subtitle">原因</div>
                <div class="task-thinking-item">${escapeHtml(arbitration.reason)}</div>
              </div>
            ` : ''}
            ${arbitration.argumentsPreview ? `
              <div class="task-thinking-subsection">
                <div class="task-thinking-subtitle">参数</div>
                <pre class="task-thinking-code">${escapeHtml(arbitration.argumentsPreview)}</pre>
              </div>
            ` : ''}
          </div>
        ` : '<div class="task-thinking-empty">当前还没有仲裁结果。</div>'}
      </div>
    </section>
  `;
}

function renderSwarmRunModalContent(run) {
  const detailRows = [
    ['实例 ID', run.id || '未记录'],
    ['轮次', run.roundIndex ? `第 ${run.roundIndex} 轮` : '未记录'],
    ['专家', run.expertTitle || run.expertId || '未记录'],
    ['分支', run.branchTitle || '未记录'],
    ['工具', run.tool || '未记录'],
    ['选择状态', run.selection || '未记录'],
    ['运行状态', run.status || '未记录'],
    ['创建时间', formatDateTime(run.createdAt) || run.createdAt || '未记录'],
    ['销毁时间', formatDateTime(run.destroyedAt) || run.destroyedAt || '仍在运行'],
  ].map(([label, value]) => renderThinkingGraphMetric(label, value)).join('');

  return `
    <div class="task-thinking-graph swarm-run-modal-layout">
      <section class="task-thinking-section">
        <div class="task-thinking-section-title">实例概览</div>
        <div class="task-thinking-metrics">${detailRows}</div>
      </section>
      <section class="task-thinking-section">
        <div class="task-thinking-section-title">工作内容</div>
        <pre class="task-thinking-code">${escapeHtml(run.work || '未记录')}</pre>
      </section>
      ${run.argumentsPreview ? `
        <section class="task-thinking-section">
          <div class="task-thinking-section-title">参数</div>
          <pre class="task-thinking-code">${escapeHtml(run.argumentsPreview)}</pre>
        </section>
      ` : ''}
      <section class="task-thinking-section">
        <div class="task-thinking-section-title">结论</div>
        <pre class="task-thinking-code">${escapeHtml(run.conclusion || '尚未产出结论')}</pre>
      </section>
    </div>
  `;
}

function renderSwarmRuns(taskId, swarmRuns) {
  if (!swarmRuns.length) {
    return '<div class="task-thinking-empty">当前还没有可展示的 Swarm 实例输出。</div>';
  }

  const normalizeChipStatus = (value) => {
    const normalized = String(value || '').trim();
    if (['running'].includes(normalized)) return 'active';
    if (['finished'].includes(normalized)) return 'resolved';
    if (['queued', 'parked'].includes(normalized)) return normalized;
    return normalized || 'open';
  };

  return `
    <div class="swarm-run-grid">
      ${swarmRuns.slice().reverse().map(item => `
        <button class="swarm-run-card" type="button" onclick="openSwarmRunModal('${taskId}', '${item.id}')">
          <div class="swarm-run-card-head">
            <div class="swarm-run-card-title">${escapeHtml(item.branchTitle || item.expertTitle || item.id)}</div>
            <div class="task-thinking-chip status-${escapeHtml(normalizeChipStatus(item.status))}">${escapeHtml(item.status)}</div>
          </div>
          <div class="swarm-run-card-meta">
            ${escapeHtml(item.id)}
            ${item.roundIndex ? ` · 第 ${item.roundIndex} 轮` : ''}
            ${item.expertTitle ? ` · ${escapeHtml(item.expertTitle)}` : ''}
            ${item.tool ? ` · ${escapeHtml(item.tool)}` : ''}
          </div>
          <div class="swarm-run-card-actions">
            <div class="task-thinking-chip status-${escapeHtml(normalizeChipStatus(item.selection || 'open'))}">${escapeHtml(item.selection || '未选择')}</div>
            <div class="swarm-run-card-link">点击查看详情</div>
          </div>
          <div class="swarm-run-card-preview">${escapeHtml(truncateThinkingGraphText(item.work || item.conclusion || '未记录', 140) || '未记录')}</div>
        </button>
      `).join('')}
    </div>
  `;
}

function getActionGraphStageInfo(autonomousWorkflow, actionRuntime) {
  const fallbackLabels = {
    system_init: '系统初始化',
    tool_library: '自动构建工具库',
    knowledge_bootstrap: '动态知识库初始化',
    task_intake: '接入题目',
    analysis: 'Agent 自主分析',
    knowledge_retrieval: '知识库检索',
    external_research: '外部搜索',
    tool_execution: '工具执行',
    verification: '结果验证',
    distillation: '知识提炼',
  };
  const currentStageKey = String(autonomousWorkflow?.currentStage || '').trim();
  const currentStage = currentStageKey
    ? getAutonomousWorkflowStage(autonomousWorkflow, currentStageKey)
    : null;
  if (currentStage) {
    return {
      key: currentStage.key,
      label: currentStage.title || fallbackLabels[currentStage.key] || currentStage.key,
      summary: currentStage.summary || '',
      status: currentStage.status || 'running',
    };
  }
  const workflowMode = String(actionRuntime?.workflowMode || '').trim();
  const fallbackLabel = workflowMode === 'linear_solver'
    ? '线性求解'
    : workflowMode === 'thinking_graph_fast'
      ? '低延迟思考图'
      : workflowMode === 'thinking_graph_swarm' || workflowMode === 'thinking_graph'
        ? '思考图推进'
        : '分析阶段';
  return {
    key: currentStageKey || workflowMode || 'analysis',
    label: currentStageKey ? (fallbackLabels[currentStageKey] || currentStageKey) : fallbackLabel,
    summary: String(actionRuntime?.summary || '').trim() || '当前任务正在推进中。',
    status: actionRuntime?.finalSnapshot ? 'done' : 'running',
  };
}

function buildActionGraphChipItems(items, options = {}) {
  const { activeItem = '', limit = 8 } = options;
  const normalizedItems = Array.isArray(items)
    ? items.map(item => String(item || '').trim()).filter(Boolean)
    : [];
  const visible = normalizedItems.slice(0, limit).map(label => ({
    label,
    active: Boolean(activeItem) && label === activeItem,
    muted: false,
  }));
  if (normalizedItems.length > limit) {
    visible.push({
      label: `+${normalizedItems.length - limit}`,
      active: false,
      muted: true,
    });
  }
  return visible;
}

function buildTaskActionGraphData(detailData) {
  const {
    task,
    thinkingGraph,
    autonomousWorkflow,
    filesLabel,
    modulesLabel,
    workspaceLabel,
  } = detailData;
  const artifacts = task.artifacts && typeof task.artifacts === 'object' ? task.artifacts : {};
  const runtimeConfig = artifacts.runtime_config && typeof artifacts.runtime_config === 'object'
    ? artifacts.runtime_config
    : {};
  const actionRuntime = normalizeTaskActionRuntime(task, thinkingGraph, autonomousWorkflow);
  const latestExecution = Array.isArray(thinkingGraph.executions) && thinkingGraph.executions.length
    ? thinkingGraph.executions[thinkingGraph.executions.length - 1]
    : null;
  const currentTool = actionRuntime.currentTool || '';
  const currentResult = actionRuntime.currentResult || '';
  const systemStage = getAutonomousWorkflowStage(autonomousWorkflow, 'system_init');
  const toolStage = getAutonomousWorkflowStage(autonomousWorkflow, 'tool_library');
  const knowledgeStage = getAutonomousWorkflowStage(autonomousWorkflow, 'knowledge_bootstrap');
  const stageInfo = getActionGraphStageInfo(autonomousWorkflow, actionRuntime);
  const resolvedFocus = resolveTaskFocus(thinkingGraph, autonomousWorkflow, artifacts);
  const systemDetails = systemStage?.details && typeof systemStage.details === 'object' ? systemStage.details : {};
  const toolDetails = toolStage?.details && typeof toolStage.details === 'object' ? toolStage.details : {};
  const knowledgeDetails = knowledgeStage?.details && typeof knowledgeStage.details === 'object' ? knowledgeStage.details : {};
  const snapshot = toolDetails.snapshot && typeof toolDetails.snapshot === 'object' ? toolDetails.snapshot : {};
  const vectorIndex = knowledgeDetails.vector_index && typeof knowledgeDetails.vector_index === 'object'
    ? knowledgeDetails.vector_index
    : {};
  const dynamicSources = knowledgeDetails.dynamic_sources && typeof knowledgeDetails.dynamic_sources === 'object'
    ? knowledgeDetails.dynamic_sources
    : {};
  const builtinTools = Array.isArray(snapshot.builtin_tools) ? snapshot.builtin_tools.map(item => String(item || '').trim()).filter(Boolean) : [];
  const internalTools = Array.isArray(snapshot.internal_tools) ? snapshot.internal_tools.map(item => String(item || '').trim()).filter(Boolean) : [];
  const externalTools = Array.isArray(snapshot.external_tools) ? snapshot.external_tools.map(item => String(item || '').trim()).filter(Boolean) : [];
  const binaries = Array.isArray(snapshot.binaries) ? snapshot.binaries.filter(item => item && typeof item === 'object') : [];
  const availableBinaries = binaries.filter(item => item.available).map(item => String(item.name || '').trim()).filter(Boolean);
  const missingBinaries = binaries.filter(item => !item.available).map(item => String(item.name || '').trim()).filter(Boolean);
  const selectedMcp = String(artifacts.selected_mcp || '').trim();
  const model = String(runtimeConfig.model || systemDetails.model || '未配置').trim();
  const connector = String(runtimeConfig.connector_type || systemDetails.connector_type || '未配置').trim();
  const searchEnabled = Boolean(systemDetails.search_enabled);
  const crawlEnabled = Boolean(systemDetails.crawl_enabled);
  const vectorEntries = Number(vectorIndex.entry_count ?? 0);
  const vectorBackendReady = vectorIndex.backend_ready !== undefined
    ? Boolean(vectorIndex.backend_ready)
    : vectorEntries > 0;
  const vectorMode = String(vectorIndex.query_mode || '').trim() || (vectorBackendReady ? 'hybrid' : 'keyword_fallback');
  const sourceCount = Number(dynamicSources.source_count ?? 0);
  const indexedCount = Number(dynamicSources.indexed_count ?? 0);
  const currentToolGroup = builtinTools.includes(currentTool)
    ? 'builtin'
    : internalTools.includes(currentTool)
      ? 'internal'
      : externalTools.includes(currentTool)
        ? 'external'
        : availableBinaries.includes(currentTool)
          ? 'binary'
          : '';
  const activeKnowledge = stageInfo.key === 'knowledge_retrieval' || currentTool === 'search_knowledge';
  const activeSearch = stageInfo.key === 'external_research' || currentTool === 'search_web';
  const activeCrawler = stageInfo.key === 'external_research' || currentTool === 'fetch_webpage';
  const activeTooling = stageInfo.key === 'tool_execution' || Boolean(currentTool);
  const finalSnapshot = actionRuntime.finalSnapshot;
  const currentPath = [
    task.name || task.id,
    stageInfo.label,
    model && model !== '未配置' ? `模型 ${model}` : '',
    activeKnowledge ? '知识库' : '',
    activeSearch ? '搜索' : '',
    activeCrawler ? '抓取' : '',
    currentTool ? `工具 ${currentTool}` : '',
    finalSnapshot ? '输出' : '',
  ].filter(Boolean);

  return {
    headline: {
      stage: stageInfo.label,
      summary: stageInfo.summary || actionRuntime.summary || '当前任务正在推进中。',
      focus: resolvedFocus,
      currentTool: currentTool || '尚未执行工具',
      model,
      currentPath,
    },
    sections: [
      {
        title: '输入层',
        nodes: [
          {
            title: '任务上下文',
            status: 'active',
            badge: '当前任务',
            value: `${task.type} · ${task.name || task.id}`,
            meta: `${task.taskMode === 'luna_333' ? '模式: Luna-333' : '模式: Classic'}${task.target ? ` · 目标: ${task.target}` : ''}`,
            chips: buildActionGraphChipItems(task.modules?.length ? task.modules : [task.type], { limit: 6 }),
          },
          {
            title: '文件与模块',
            status: task.files?.length ? 'ready' : 'inactive',
            badge: task.files?.length ? '已载入' : '无附件',
            value: filesLabel || '无',
            meta: `模块: ${modulesLabel || '无'}`,
            chips: buildActionGraphChipItems(task.files?.map(file => file.name) || [], { limit: 6 }),
          },
        ],
      },
      {
        title: 'Agent 内核',
        nodes: [
          {
            title: '执行引擎',
            status: 'active',
            badge: task.executionMode === 'swarm' ? 'Swarm' : 'Single',
            value: actionRuntime.workflowMode || autonomousWorkflow.executionMode || 'unknown',
            meta: `${task.taskMode === 'luna_333' ? 'Luna-333 任务模式' : 'Classic 任务模式'} · ${stageInfo.summary || actionRuntime.summary || '当前任务正在推进。'}`,
          },
          {
            title: '当前阶段',
            status: 'active',
            badge: '运行中',
            value: stageInfo.label,
            meta: actionRuntime.updatedAt ? `更新时间: ${formatDateTime(actionRuntime.updatedAt) || actionRuntime.updatedAt}` : '等待阶段更新',
          },
          {
            title: 'Current Focus',
            status: 'active',
            badge: '当前',
            value: resolvedFocus,
            meta: actionRuntime.summary || '等待下一轮动作带来更多结构化摘要。',
          },
        ],
      },
      {
        title: '模型与编排',
        nodes: [
          {
            title: '推理模型',
            status: model && model !== '未配置' ? 'active' : 'warning',
            badge: connector || '未配置',
            value: model,
            meta: runtimeConfig.api_base ? `API Base: ${runtimeConfig.api_base}` : '使用当前任务的默认模型入口',
          },
          {
            title: '连接器与 MCP',
            status: selectedMcp ? 'ready' : 'inactive',
            badge: selectedMcp ? 'MCP 已选' : '本地运行',
            value: connector || '未配置连接器',
            meta: selectedMcp || '当前任务没有绑定托管 MCP 服务器',
          },
        ],
      },
      {
        title: '知识与检索',
        nodes: [
          {
            title: '知识库',
            status: activeKnowledge ? 'active' : (vectorBackendReady ? 'ready' : 'warning'),
            badge: activeKnowledge ? '当前' : (vectorBackendReady ? '可用' : '降级'),
            value: `条目 ${vectorEntries} · ${vectorMode}`,
            meta: vectorIndex.knowledge_base_root || '知识库根目录未记录',
          },
          {
            title: '动态知识',
            status: indexedCount > 0 ? 'ready' : 'inactive',
            badge: indexedCount > 0 ? '已索引' : '空',
            value: `来源 ${sourceCount} · 分块 ${Number(dynamicSources.chunk_count ?? 0)}`,
            meta: dynamicSources.dynamic_kb_root || '当前没有动态知识目录信息',
          },
          {
            title: '搜索与抓取',
            status: activeSearch || activeCrawler ? 'active' : ((searchEnabled || crawlEnabled) ? 'ready' : 'inactive'),
            badge: activeSearch ? '搜索中' : (activeCrawler ? '抓取中' : ((searchEnabled || crawlEnabled) ? '可用' : '未启用')),
            value: `搜索 ${searchEnabled ? 'on' : 'off'} · 抓取 ${crawlEnabled ? 'on' : 'off'}`,
            meta: currentTool === 'search_web' || currentTool === 'fetch_webpage'
              ? `当前动作: ${currentTool}`
              : '按当前阶段决定是否外扩资料源',
          },
        ],
      },
      {
        title: '工具与环境',
        nodes: [
          {
            title: '基础 / 内部 / 外置工具',
            status: activeTooling ? 'active' : 'ready',
            badge: currentTool ? `当前 ${currentTool}` : '可调用',
            value: `${builtinTools.length} / ${internalTools.length} / ${externalTools.length}`,
            meta: '顺序分别对应 basic、internal、external',
            chips: [
              ...buildActionGraphChipItems(builtinTools, { activeItem: currentTool, limit: 5 }),
              ...buildActionGraphChipItems(internalTools, { activeItem: currentTool, limit: 3 }),
              ...buildActionGraphChipItems(externalTools, { activeItem: currentTool, limit: 3 }),
            ],
          },
          {
            title: '命令行工具链',
            status: currentToolGroup === 'binary' ? 'active' : (availableBinaries.length ? 'ready' : 'warning'),
            badge: currentToolGroup === 'binary' ? '当前' : `${availableBinaries.length} 可用`,
            value: availableBinaries.length
              ? availableBinaries.join(', ')
              : '当前未检测到可用推荐 CLI',
            meta: missingBinaries.length ? `缺失: ${missingBinaries.join(', ')}` : '推荐命令行工具已就绪',
            chips: buildActionGraphChipItems(availableBinaries, { activeItem: currentTool, limit: 8 }),
          },
          {
            title: '工作空间',
            status: activeTooling ? 'active' : 'ready',
            badge: 'Workspace',
            value: workspaceLabel || thinkingGraph.workspaceDir || '未创建',
            meta: currentTool ? `最近动作在这里落盘: ${currentTool}` : '工具输出、输入和状态文件会落到这里',
          },
        ],
      },
      {
        title: '输出层',
        nodes: [
          {
            title: '当前动作',
            status: 'active',
            badge: currentTool ? '工具执行' : '阶段推进',
            value: currentTool || stageInfo.label,
            meta: actionRuntime.currentActionSummary || latestExecution?.commentary || latestExecution?.reason || stageInfo.summary || '等待下一轮动作。',
          },
          {
            title: '最新结果',
            status: currentResult ? 'ready' : 'inactive',
            badge: currentResult ? '已更新' : '等待',
            value: currentResult || actionRuntime.summary || '当前还没有新的结果摘要。',
            meta: actionRuntime.updatedAt ? `更新于 ${formatDateTime(actionRuntime.updatedAt) || actionRuntime.updatedAt}` : '结果会在工具返回后同步到这里',
          },
          {
            title: '最终收束',
            status: finalSnapshot ? 'ready' : 'inactive',
            badge: finalSnapshot ? '已收束' : '未收束',
            value: finalSnapshot || '任务还没有形成最终结论。',
            meta: autonomousWorkflow.lastFailureReason || thinkingGraph.terminationReason || '完成后这里会显示终态说明',
          },
        ],
      },
    ],
  };
}

function renderTaskActionGraphNode(node) {
  const chips = Array.isArray(node.chips) ? node.chips : [];
  return `
    <div class="task-action-node status-${escapeHtml(node.status || 'inactive')}">
      <div class="task-action-node-head">
        <div class="task-action-node-title">${escapeHtml(node.title || '未命名节点')}</div>
        <div class="task-action-node-badge">${escapeHtml(node.badge || '节点')}</div>
      </div>
      <div class="task-action-node-value">${escapeHtml(node.value || '未记录')}</div>
      ${node.meta ? `<div class="task-action-node-meta">${escapeHtml(node.meta)}</div>` : ''}
      ${chips.length ? `
        <div class="task-action-node-chips">
          ${chips.map(chip => `
            <span class="task-action-chip ${chip.active ? 'is-active' : ''} ${chip.muted ? 'is-muted' : ''}">
              ${escapeHtml(chip.label)}
            </span>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderTaskActionGraph(detailData) {
  const actionGraph = buildTaskActionGraphData(detailData);
  return `
    <div class="task-thinking-graph">
      <section class="task-thinking-section">
        <div class="task-thinking-section-title">行动图</div>
        <div class="task-action-hero">
          <div class="task-action-hero-head">
            <div>
              <div class="task-action-hero-title">${escapeHtml(actionGraph.headline.stage)}</div>
              <div class="task-action-hero-summary">${escapeHtml(actionGraph.headline.summary)}</div>
            </div>
            <div class="task-thinking-chip status-active">${escapeHtml(actionGraph.headline.currentTool)}</div>
          </div>
          <div class="task-action-hero-focus">${escapeHtml(actionGraph.headline.focus)}</div>
          <div class="task-action-path">
            ${actionGraph.headline.currentPath.map(item => `<span class="task-action-path-chip">${escapeHtml(item)}</span>`).join('')}
          </div>
          <div class="task-thinking-metrics">
            ${renderThinkingGraphMetric('当前阶段', actionGraph.headline.stage)}
            ${renderThinkingGraphMetric('当前工具', actionGraph.headline.currentTool)}
            ${renderThinkingGraphMetric('当前模型', actionGraph.headline.model)}
          </div>
        </div>
      </section>
      <section class="task-thinking-section">
        <div class="task-thinking-section-title">结构视图</div>
        <div class="task-action-map">
          ${actionGraph.sections.map((section, index) => `
            <div class="task-action-column ${index < actionGraph.sections.length - 1 ? 'has-connector' : ''}">
              <div class="task-action-column-title">${escapeHtml(section.title)}</div>
              <div class="task-action-column-body">
                ${section.nodes.map(node => renderTaskActionGraphNode(node)).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    </div>
  `;
}

function truncateThinkingGraphText(text, maxLength = 84) {
  const normalized = String(text || '').trim();
  if (!normalized) return '';
  const chars = Array.from(normalized);
  return chars.length > maxLength ? `${chars.slice(0, maxLength - 1).join('')}…` : normalized;
}

function wrapThinkingGraphLabel(text, maxCharsPerLine = 16, maxLines = 2) {
  const chars = Array.from(String(text || '').trim());
  if (!chars.length) return ['未命名节点'];
  const lines = [];
  while (chars.length && lines.length < maxLines) {
    lines.push(chars.splice(0, maxCharsPerLine).join(''));
  }
  if (chars.length && lines.length) {
    const lastLineChars = Array.from(lines[lines.length - 1]);
    lines[lines.length - 1] = `${lastLineChars.slice(0, Math.max(maxCharsPerLine - 1, 1)).join('')}…`;
  }
  return lines;
}

function formatThinkingGraphConfidence(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00';
}

function getThinkingGraphStatusVisual(status = 'open') {
  if (status === 'supported' || status === 'resolved' || status === 'solved') {
    return { fill: '#166534', stroke: '#86efac', text: '#f0fdf4', radius: 36 };
  }
  if (status === 'blocked') {
    return { fill: '#b45309', stroke: '#fcd34d', text: '#fffbeb', radius: 36 };
  }
  if (status === 'failed' || status === 'canceled') {
    return { fill: '#be123c', stroke: '#fda4af', text: '#fff1f2', radius: 36 };
  }
  if (status === 'rejected') {
    return { fill: '#4338ca', stroke: '#a5b4fc', text: '#eef2ff', radius: 36 };
  }
  return null;
}

function getThinkingGraphNodeVisual(kind, status = 'open') {
  const statusVisual = getThinkingGraphStatusVisual(status);
  if (kind === 'focus') {
    return { fill: '#0f766e', stroke: '#67e8f9', text: '#ecfeff', radius: 42 };
  }
  if (kind === 'hypothesis') {
    return statusVisual || { fill: '#7c3aed', stroke: '#c4b5fd', text: '#f5f3ff', radius: 36 };
  }
  if (kind === 'branch') {
    return statusVisual || { fill: '#2563eb', stroke: '#93c5fd', text: '#eef6ff', radius: 38 };
  }
  if (kind === 'fact') {
    return { fill: '#ea580c', stroke: '#fdba74', text: '#fff7ed', radius: 34 };
  }
  if (kind === 'question') {
    return { fill: '#475569', stroke: '#cbd5e1', text: '#f8fafc', radius: 34 };
  }
  return statusVisual || { fill: '#6b7280', stroke: '#cbd5e1', text: '#f8fafc', radius: 36 };
}

function getThinkingGraphEdgeVisual(relation) {
  switch (relation) {
    case 'supports':
      return { color: '#34d399', marker: 'thinking-graph-arrow-supports' };
    case 'opposes':
      return { color: '#fb7185', marker: 'thinking-graph-arrow-opposes' };
    case 'forks':
      return { color: '#a78bfa', marker: 'thinking-graph-arrow-informs' };
    case 'drives':
      return { color: '#2dd4bf', marker: 'thinking-graph-arrow-informs' };
    case 'leads_to':
      return { color: '#fb923c', marker: 'thinking-graph-arrow-leads-to' };
    case 'tests':
    case 'evaluates':
      return { color: '#60a5fa', marker: 'thinking-graph-arrow-tests' };
    case 'blocks':
      return { color: '#94a3b8', marker: 'thinking-graph-arrow-blocks' };
    default:
      return { color: '#9ca3af', marker: 'thinking-graph-arrow-informs' };
  }
}

function assignThinkingGraphArcPositions(nodes, centerX, centerY, radius, startDeg, endDeg) {
  if (!nodes.length) return;
  const singleAngle = (startDeg + endDeg) / 2;
  nodes.forEach((node, index) => {
    const ratio = nodes.length === 1 ? 0.5 : index / (nodes.length - 1);
    const angleDeg = nodes.length === 1 ? singleAngle : startDeg + ((endDeg - startDeg) * ratio);
    const angle = (Math.PI / 180) * angleDeg;
    node.x = centerX + (Math.cos(angle) * radius);
    node.y = centerY + (Math.sin(angle) * radius);
  });
}

function distributeThinkingGraphColumn(nodes, x, top, bottom, options = {}) {
  if (!nodes.length) return;
  const startY = Number.isFinite(top) ? top : 120;
  const endY = Number.isFinite(bottom) ? bottom : startY + 400;
  const span = Math.max(endY - startY, 1);
  const minGap = Math.max(Number(options.minGap) || 0, 1);
  const defaultGap = span / Math.max(nodes.length - 1, 1);
  const step = nodes.length === 1
    ? 0
    : Math.max(defaultGap, minGap);
  const contentHeight = step * Math.max(nodes.length - 1, 0);
  const offsetY = nodes.length === 1
    ? span / 2
    : Math.max((span - contentHeight) / 2, 0);
  nodes.forEach((node, index) => {
    node.x = x;
    node.y = startY + offsetY + (nodes.length === 1 ? 0 : step * index);
  });
}

function getThinkingGraphNodeLabelLayout(node, model) {
  const BOUNDS_PADDING = 14;
  const laneTop = Array.isArray(model?.lanes) && model.lanes.length
    ? Math.min(...model.lanes.map(lane => Number(lane?.y) || 0))
    : BOUNDS_PADDING;
  const SAFE_TOP_PADDING = Math.max(BOUNDS_PADDING, laneTop + 54);
  const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
  const labelLines = wrapThinkingGraphLabel(
    node.fullLabel || node.label,
    node.kind === 'focus' ? 22 : 18,
    node.kind === 'focus' ? 3 : 3,
  );
  const metaText = node.meta ? truncateThinkingGraphText(node.meta, 40) : '';
  const longestLineLength = labelLines.reduce((max, line) => Math.max(max, Array.from(line).length), 0);
  const metaLength = Array.from(metaText).length;
  const estimatedWidth = Math.max(longestLineLength, metaLength) * 7 + 26;
  const boxWidth = Math.max(126, Math.min(node.kind === 'focus' ? 320 : 240, estimatedWidth));
  const boxHeight = 12 + (labelLines.length * 17) + (metaText ? 18 : 0) + 12;

  let boxX = 0;
  let boxY = 0;
  let textAnchor = 'start';
  let textX = 0;
  let labelY = 0;
  let metaY = 0;
  let connectorX1 = node.x;
  let connectorY1 = node.y;
  let connectorX2 = node.x;
  let connectorY2 = node.y;

  if (node.kind === 'focus') {
    boxX = node.x - (boxWidth / 2);
    boxY = node.y + node.radius + 18;
    textAnchor = 'middle';
    textX = node.x;
    labelY = boxY + 22;
    metaY = boxY + boxHeight - 14;
    connectorY1 = node.y + node.radius;
    connectorY2 = boxY;

    if (boxY + boxHeight > model.height - BOUNDS_PADDING) {
      boxY = node.y - node.radius - 18 - boxHeight;
      labelY = boxY + 22;
      metaY = boxY + boxHeight - 14;
      connectorY1 = node.y - node.radius;
      connectorY2 = boxY + boxHeight;
    }
  } else if (node.x <= model.centerX) {
    const leftX = node.x - node.radius - 18 - boxWidth;
    const rightX = node.x + node.radius + 18;
    boxX = leftX;
    boxY = node.y - (boxHeight / 2);
    textAnchor = 'start';
    connectorX1 = node.x - node.radius;
    connectorX2 = boxX + boxWidth;

    if (boxX < BOUNDS_PADDING && rightX <= model.width - boxWidth - BOUNDS_PADDING) {
      boxX = rightX;
      connectorX1 = node.x + node.radius;
      connectorX2 = boxX;
    }

    textX = boxX + 14;
    labelY = boxY + 22;
    metaY = boxY + boxHeight - 14;
  } else {
    const rightX = node.x + node.radius + 18;
    const leftX = node.x - node.radius - 18 - boxWidth;
    boxX = rightX;
    boxY = node.y - (boxHeight / 2);
    textAnchor = 'start';
    connectorX1 = node.x + node.radius;
    connectorX2 = boxX;

    if (boxX + boxWidth > model.width - BOUNDS_PADDING && leftX >= BOUNDS_PADDING) {
      boxX = leftX;
      connectorX1 = node.x - node.radius;
      connectorX2 = boxX + boxWidth;
    }

    textX = boxX + 14;
    labelY = boxY + 22;
    metaY = boxY + boxHeight - 14;
  }

  boxX = clamp(boxX, BOUNDS_PADDING, Math.max(BOUNDS_PADDING, model.width - boxWidth - BOUNDS_PADDING));
  boxY = clamp(boxY, SAFE_TOP_PADDING, Math.max(SAFE_TOP_PADDING, model.height - boxHeight - BOUNDS_PADDING));
  textX = boxX + 14;
  labelY = boxY + 22;
  metaY = boxY + boxHeight - 14;

  if (node.kind === 'focus') {
    const isBelowNode = boxY >= node.y;
    connectorY1 = isBelowNode ? node.y + node.radius : node.y - node.radius;
    connectorY2 = isBelowNode ? boxY : boxY + boxHeight;
  } else if (boxX >= node.x) {
    connectorX1 = node.x + node.radius;
    connectorX2 = boxX;
  } else {
    connectorX1 = node.x - node.radius;
    connectorX2 = boxX + boxWidth;
  }

  return {
    labelLines,
    metaText,
    boxWidth,
    boxHeight,
    boxX,
    boxY,
    textAnchor,
    textX,
    labelY,
    metaY,
    connectorX1,
    connectorY1,
    connectorX2,
    connectorY2,
  };
}

function buildThinkingGraphVisualModel(thinkingGraph) {
  const PADDING = 110;
  const COLUMN_GAP = 320;
  const ROW_GAP = 118;
  const nodes = [];
  const edges = [];
  const nodeMap = new Map();
  let edgeCounter = 0;
  const lowSignalFactPrefixes = [
    '任务类型:',
    '目标:',
    '附件:',
    '附件相对路径:',
    '工作空间:',
    '任务类型为',
    '工作空间路径为',
    '附件相对路径未提供',
    '当前处于 swarm',
  ];
  const lowSignalFactKeywords = [
    '工作空间根目录包含',
    '标准附件路径',
    'inputs/目录',
    '无附件',
  ];
  const isLowSignalFact = (text) => {
    const value = String(text || '').trim();
    if (!value) return true;
    return lowSignalFactPrefixes.some(prefix => value.startsWith(prefix))
      || lowSignalFactKeywords.some(keyword => value.includes(keyword));
  };
  const uniqueByLabel = (items) => {
    const seen = new Set();
    return items.filter((item) => {
      const key = String(item?.label || '').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const addNode = (key, label, kind, options = {}) => {
    const normalizedLabel = truncateThinkingGraphText(label, options.maxLength || 70);
    if (!normalizedLabel) return null;
    if (nodeMap.has(key)) return nodeMap.get(key);
    const visual = getThinkingGraphNodeVisual(kind, options.status);
    const node = {
      id: key,
      displayIndex: nodes.length + 1,
      refId: String(options.refId || '').trim(),
      label: normalizedLabel,
      fullLabel: String(label || '').trim(),
      kind,
      detailKind: String(options.detailKind || kind).trim() || kind,
      status: options.status || 'open',
      meta: String(options.meta || '').trim(),
      detailLines: Array.isArray(options.detailLines)
        ? options.detailLines.map(item => String(item || '').trim()).filter(Boolean)
        : [],
      radius: visual.radius,
      fill: visual.fill,
      stroke: visual.stroke,
      textColor: visual.text,
      isActive: Boolean(options.isActive),
      x: 0,
      y: 0,
      gridX: options.gridX || 0,
      gridY: options.gridY || 0,
    };
    nodes.push(node);
    nodeMap.set(key, node);
    return node;
  };

  const addEdge = (source, target, relation, options = {}) => {
    if (!source || !target || source.id === target.id) return;
    edges.push({
      id: `edge-${edgeCounter++}`,
      source: source.id,
      target: target.id,
      relation,
      label: options.label || relation,
      curvature: typeof options.curvature === 'number' ? options.curvature : 0.12,
    });
  };

  const placeColumn = (items, x, startY) => {
    items.forEach((node, index) => {
      node.x = x;
      node.y = startY + (index * ROW_GAP);
    });
  };

  const latestExecution = Array.isArray(thinkingGraph.executions) && thinkingGraph.executions.length
    ? thinkingGraph.executions[thinkingGraph.executions.length - 1]
    : null;
  const runningWorkers = Array.isArray(thinkingGraph.swarmWorkers)
    ? thinkingGraph.swarmWorkers.filter(item => item && typeof item === 'object' && String(item.status || '').trim() === 'running')
    : [];
  const parkedWorkers = Array.isArray(thinkingGraph.swarmWorkers)
    ? thinkingGraph.swarmWorkers.filter(item => item && typeof item === 'object' && ['parked', 'queued'].includes(String(item.status || '').trim()))
    : [];
  const endedWorkers = Array.isArray(thinkingGraph.swarmWorkers)
    ? thinkingGraph.swarmWorkers.filter(item => item && typeof item === 'object' && ['finished', 'destroyed'].includes(String(item.status || '').trim()))
    : [];
  const activeBranch = getThinkingGraphMostRecentItem(thinkingGraph.branches, ['open', 'blocked', 'resolved']);
  const supportedHypotheses = Array.isArray(thinkingGraph.hypotheses)
    ? thinkingGraph.hypotheses
        .filter(item => item && typeof item === 'object' && String(item.status || '').trim() === 'supported' && String(item.content || '').trim())
        .slice()
        .sort((a, b) => Number(b.confidence ?? 0) - Number(a.confidence ?? 0))
    : [];
  const openHypotheses = Array.isArray(thinkingGraph.hypotheses)
    ? thinkingGraph.hypotheses
        .filter(item => item && typeof item === 'object' && ['open', 'pending'].includes(String(item.status || '').trim()) && String(item.content || '').trim())
        .slice()
        .sort((a, b) => Number(b.confidence ?? 0) - Number(a.confidence ?? 0))
    : [];
  const rejectedHypotheses = Array.isArray(thinkingGraph.hypotheses)
    ? thinkingGraph.hypotheses
        .filter(item => item && typeof item === 'object' && String(item.status || '').trim() === 'rejected' && String(item.content || '').trim())
        .slice()
        .sort((a, b) => Number(b.confidence ?? 0) - Number(a.confidence ?? 0))
    : [];
  const prioritizedBranches = Array.isArray(thinkingGraph.branches)
    ? thinkingGraph.branches
        .slice()
        .sort((a, b) => {
          const aActive = activeBranch && ((a.id && a.id === activeBranch.id) || a.title === activeBranch.title) ? 1 : 0;
          const bActive = activeBranch && ((b.id && b.id === activeBranch.id) || b.title === activeBranch.title) ? 1 : 0;
          return bActive - aActive;
        })
    : [];
  const evidenceCandidates = uniqueByLabel([
    ...supportedHypotheses.map((item, index) => ({
      id: item.id || `supported-${index}`,
      label: item.content,
      kind: 'supported_hypothesis',
      status: item.status || 'supported',
      meta: `支持度 ${(Number(item.confidence ?? 0) * 100).toFixed(0)}%`,
      detailLines: [
        '已被当前执行支持的关键判断',
        item.evidence?.length ? `证据片段 ${item.evidence.length} 条` : '暂无证据片段',
        item.updatedAt ? `更新时间: ${item.updatedAt}` : '',
      ],
    })),
    ...(Array.isArray(thinkingGraph.facts) ? thinkingGraph.facts : [])
      .filter(item => !isLowSignalFact(item))
      .map((item, index) => ({
        id: `fact-${index}`,
        label: item,
        kind: 'fact',
        status: 'fact',
        meta: '已验证事实',
        detailLines: [
          '来自思考图谱中的高价值事实',
        ],
      })),
  ]);
  const visibleEvidence = evidenceCandidates.slice(0, 4);
  const hiddenEvidence = evidenceCandidates.slice(4);

  const planCandidates = uniqueByLabel([
    ...openHypotheses.map((item, index) => ({
      id: item.id || `open-${index}`,
      label: item.content,
      sourceKind: 'hypothesis',
      status: item.status || 'open',
      meta: `待验证假设 · ${(Number(item.confidence ?? 0) * 100).toFixed(0)}%`,
      detailLines: [
        '当前仍在推进的假设',
        item.evidence?.length ? `已有证据 ${item.evidence.length} 条` : '尚无直接证据',
        item.updatedAt ? `更新时间: ${item.updatedAt}` : '',
      ],
    })),
    ...prioritizedBranches.map((item, index) => ({
      id: item.id || `branch-${index}`,
      label: item.title,
      sourceKind: 'branch',
      status: item.status || 'open',
      meta: item.goal || item.lastAction || '',
      detailLines: [
        item.goal ? `目标: ${item.goal}` : '',
        item.lastAction ? `最近动作: ${item.lastAction}` : '',
        Array.isArray(item.linkedHypotheses) && item.linkedHypotheses.length ? `关联假设: ${item.linkedHypotheses.length}` : '',
      ],
    })),
  ]);
  const visiblePlans = planCandidates.slice(0, 3);
  const hiddenPlans = planCandidates.slice(3);

  const rejectedCandidates = uniqueByLabel([
    ...rejectedHypotheses.map((item, index) => ({
      id: item.id || `rejected-h-${index}`,
      label: item.content,
      detailLines: [
        '该假设已经被证伪或放弃',
        item.evidence?.length ? `关联证据 ${item.evidence.length} 条` : '',
      ],
    })),
    ...(Array.isArray(thinkingGraph.rejectedItems) ? thinkingGraph.rejectedItems : []).map((item, index) => ({
      id: `rejected-${index}`,
      label: item,
      detailLines: ['来自 rejected_items 的历史否定项'],
    })),
  ]);
  const visibleRejected = rejectedCandidates.slice(0, 2);
  const hiddenRejected = rejectedCandidates.slice(2);

  const focusLabel = thinkingGraph.focus
    || thinkingGraph.graphSummary
    || (thinkingGraph.currentNode ? `当前节点 ${thinkingGraph.currentNode}` : '思考焦点');
  const focusNode = addNode('focus', focusLabel, 'focus', {
    status: thinkingGraph.terminationReason ? 'resolved' : 'active',
    meta: `${thinkingGraph.currentNode || 'observe'} · Round ${thinkingGraph.roundIndex || 0}`,
    maxLength: 90,
    isActive: !thinkingGraph.terminationReason,
    detailLines: [
      thinkingGraph.graphSummary ? `图摘要: ${thinkingGraph.graphSummary}` : '',
      thinkingGraph.terminationReason ? `收束原因: ${thinkingGraph.terminationReason}` : '',
      latestExecution?.commentary ? `最近执行: ${latestExecution.commentary}` : '',
    ],
  });

  const factNodes = visibleEvidence.map((item, index) => addNode(
    `fact:${item.id || index}`,
    item.label,
    'fact',
    {
      status: item.status || 'fact',
      maxLength: 48,
      meta: item.meta || '',
      detailKind: item.kind === 'supported_hypothesis' ? 'supported-evidence' : 'fact',
      detailLines: [
        ...(Array.isArray(item.detailLines) ? item.detailLines : []),
        hiddenEvidence.length ? `其余证据已折叠 ${hiddenEvidence.length} 条` : '',
      ],
    },
  )).filter(Boolean);
  const factAggregateNode = hiddenEvidence.length ? addNode(
    'fact:aggregate',
    `更多证据 +${hiddenEvidence.length}`,
    'fact',
    {
      status: 'fact',
      maxLength: 40,
      detailKind: 'aggregate',
      meta: '已折叠次级证据',
      detailLines: hiddenEvidence.slice(0, 8).map(item => item.label),
    },
  ) : null;

  const branchNodes = visiblePlans.map((item, index) => addNode(
    `branch:${item.id || index}`,
    item.label,
    'branch',
    {
      refId: item.id,
      status: item.status || 'open',
      meta: item.meta || '',
      maxLength: 44,
      detailKind: item.sourceKind === 'hypothesis' ? 'hypothesis' : 'branch',
      isActive: Boolean(activeBranch) && item.sourceKind === 'branch' && (
        (item.id && activeBranch?.id && item.id === activeBranch.id)
        || (!activeBranch?.id && item.label === activeBranch?.title)
      ),
      detailLines: Array.isArray(item.detailLines) ? item.detailLines : [],
    },
  )).filter(Boolean);
  const branchAggregateNode = hiddenPlans.length ? addNode(
    'branch:aggregate',
    `更多推进项 +${hiddenPlans.length}`,
    'branch',
    {
      status: 'open',
      detailKind: 'aggregate',
      meta: '已折叠次级假设/分支',
      detailLines: hiddenPlans.slice(0, 8).map(item => `${item.label}${item.meta ? ` · ${item.meta}` : ''}`),
    },
  ) : null;

  const actionLabel = thinkingGraph.arbitration?.tool
    ? `${thinkingGraph.arbitration.selectedExpertTitle || '仲裁动作'}`
    : latestExecution?.tool
      ? `${latestExecution.tool}`
      : '等待下一步动作';
  const actionMeta = thinkingGraph.arbitration?.reason
    || latestExecution?.reason
    || latestExecution?.commentary
    || '';
  const actionNode = addNode(
    'action:current',
    actionLabel,
    'branch',
    {
      status: latestExecution?.outcome === 'solved' ? 'resolved' : 'active',
      detailKind: 'action',
      meta: actionMeta || '当前主线动作',
      maxLength: 48,
      isActive: true,
      detailLines: [
        thinkingGraph.arbitration?.branchTitle ? `目标分支: ${thinkingGraph.arbitration.branchTitle}` : '',
        thinkingGraph.arbitration?.summary ? `仲裁摘要: ${thinkingGraph.arbitration.summary}` : '',
        thinkingGraph.arbitration?.tool ? `工具: ${thinkingGraph.arbitration.tool}` : '',
        latestExecution?.resultPreview ? `结果: ${latestExecution.resultPreview}` : '',
      ],
    },
  );

  const swarmNodes = [];
  if (runningWorkers.length) {
    swarmNodes.push(addNode('swarm:running', `运行中的 Swarm +${runningWorkers.length}`, 'question', {
      status: 'active',
      detailKind: 'swarm',
      meta: '当前并行执行层',
      detailLines: runningWorkers.slice(0, 8).map(item => `${item.branchTitle || item.expertTitle || item.id}${item.tool ? ` · ${item.tool}` : ''}`),
      isActive: true,
    }));
  }
  if (parkedWorkers.length || endedWorkers.length) {
    swarmNodes.push(addNode('swarm:archive', `背景 Worker ${parkedWorkers.length + endedWorkers.length}`, 'question', {
      status: 'open',
      detailKind: 'aggregate',
      meta: `停放 ${parkedWorkers.length} · 已结束 ${endedWorkers.length}`,
      detailLines: [
        parkedWorkers.length ? `停放: ${parkedWorkers.slice(0, 6).map(item => item.branchTitle || item.expertTitle || item.id).join('、')}` : '',
        endedWorkers.length ? `已结束: ${endedWorkers.slice(0, 6).map(item => item.branchTitle || item.expertTitle || item.id).join('、')}` : '',
      ],
    }));
  }

  const rejectedNodes = visibleRejected.map((item, index) => addNode(
    `rejected:${item.id || index}`,
    item.label,
    'hypothesis',
    {
      status: 'rejected',
      maxLength: 46,
      detailLines: Array.isArray(item.detailLines) && item.detailLines.length ? item.detailLines : ['已被证伪或淘汰'],
    },
  )).filter(Boolean);
  const rejectedAggregateNode = hiddenRejected.length ? addNode(
    'rejected:aggregate',
    `更多已否定 +${hiddenRejected.length}`,
    'hypothesis',
    {
      status: 'rejected',
      detailKind: 'aggregate',
      meta: '已折叠历史否定项',
      detailLines: hiddenRejected.slice(0, 8).map(item => item.label),
    },
  ) : null;

  if (focusNode) {
    focusNode.x = PADDING + COLUMN_GAP;
    focusNode.y = PADDING + 170;
  }

  placeColumn(factNodes, PADDING, PADDING + 40);
  if (factAggregateNode) {
    factAggregateNode.x = PADDING;
    factAggregateNode.y = PADDING + 40 + (factNodes.length * ROW_GAP);
  }
  placeColumn(branchNodes, PADDING + (COLUMN_GAP * 2), PADDING + 36);
  if (branchAggregateNode) {
    branchAggregateNode.x = PADDING + (COLUMN_GAP * 2);
    branchAggregateNode.y = PADDING + 36 + (branchNodes.length * ROW_GAP);
  }
  if (actionNode) {
    actionNode.x = PADDING + (COLUMN_GAP * 2);
    actionNode.y = PADDING + 36 + ((branchNodes.length + (branchAggregateNode ? 1 : 0)) * ROW_GAP) + 18;
  }
  swarmNodes.forEach((node, index) => {
    node.x = PADDING + (COLUMN_GAP * 3);
    node.y = PADDING + 110 + (index * ROW_GAP);
  });
  placeColumn(rejectedNodes, PADDING + (COLUMN_GAP * 3), PADDING + 110 + ((swarmNodes.length + 0.6) * ROW_GAP));
  if (rejectedAggregateNode) {
    rejectedAggregateNode.x = PADDING + (COLUMN_GAP * 3);
    rejectedAggregateNode.y = PADDING + 110 + ((swarmNodes.length + 0.6 + rejectedNodes.length) * ROW_GAP);
  }

  const maxX = Math.max(...nodes.map(n => n.x), PADDING + (COLUMN_GAP * 3));
  const maxY = Math.max(...nodes.map(n => n.y), PADDING + 620);

  const width = Math.max(1680, maxX + PADDING + 300);
  const height = Math.max(1080, maxY + PADDING + 120);
  const centerX = focusNode ? focusNode.x : width / 2;
  const centerY = focusNode ? focusNode.y : height / 2;

  factNodes.forEach((node, index) => {
    addEdge(node, focusNode, 'supports', {
      curvature: index % 2 === 0 ? -0.08 : 0.08,
    });
  });
  if (factAggregateNode) {
    addEdge(factAggregateNode, focusNode, 'supports', { curvature: 0.04 });
  }
  branchNodes.forEach((node, index) => {
    addEdge(focusNode, node, 'forks', {
      label: node.detailKind === 'hypothesis' ? '活跃假设' : index === 0 ? '主分支' : '活跃分支',
      curvature: index % 2 === 0 ? 0.05 : -0.05,
    });
    if (actionNode) {
      addEdge(node, actionNode, 'tests', {
        label: node.detailKind === 'hypothesis' ? '待验证' : '推进',
        curvature: index % 2 === 0 ? -0.04 : 0.04,
      });
    }
  });
  if (branchAggregateNode) {
    addEdge(focusNode, branchAggregateNode, 'forks', { label: '更多分支', curvature: 0.02 });
  }
  if (actionNode) {
    addEdge(focusNode, actionNode, 'drives', { label: '当前动作', curvature: -0.02 });
  }
  swarmNodes.forEach((node, index) => {
    addEdge(actionNode || focusNode, node, 'leads_to', {
      label: index === 0 ? '并行执行' : '背景执行',
      curvature: index === 0 ? 0.06 : -0.06,
    });
  });
  rejectedNodes.forEach((node, index) => {
    addEdge(node, focusNode, 'opposes', {
      label: '已否定',
      curvature: index % 2 === 0 ? 0.06 : -0.06,
    });
  });
  if (rejectedAggregateNode) {
    addEdge(rejectedAggregateNode, focusNode, 'opposes', { label: '更多否定项', curvature: 0.03 });
  }

  const lanes = [];
  if (factNodes.length || factAggregateNode) {
    lanes.push({
      key: 'evidence',
      x: PADDING - 60,
      y: PADDING - 50,
      width: 240,
      height: Math.max(430, ((factNodes.length + (factAggregateNode ? 1 : 0)) * ROW_GAP) + 80),
      title: '证据层',
      subtitle: '已支持证据',
    });
  }
  lanes.push({
    key: 'focus',
    x: focusNode ? focusNode.x - 170 : PADDING + COLUMN_GAP,
    y: PADDING - 30,
    width: 340,
    height: 620,
    title: '焦点层',
    subtitle: '当前主焦点',
  });
  if (branchNodes.length || branchAggregateNode || actionNode) {
    lanes.push({
      key: 'planning',
      x: PADDING + (COLUMN_GAP * 2) - 70,
      y: PADDING - 50,
      width: 300,
      height: Math.max(560, ((branchNodes.length + (actionNode ? 1 : 0) + (branchAggregateNode ? 1 : 0)) * ROW_GAP) + 170),
      title: '推进层',
      subtitle: '活跃假设 / 分支 / 当前动作',
    });
  }
  if (swarmNodes.length || rejectedNodes.length || rejectedAggregateNode) {
    lanes.push({
      key: 'execution',
      x: PADDING + (COLUMN_GAP * 3) - 70,
      y: PADDING - 50,
      width: 300,
      height: Math.max(520, ((swarmNodes.length + rejectedNodes.length + (rejectedAggregateNode ? 1 : 0)) * ROW_GAP) + 180),
      title: '执行与收束层',
      subtitle: '并行执行 / 已否定',
    });
  }

  return {
    width,
    height,
    centerX,
    centerY,
    lanes,
    nodes,
    edges,
    counts: {
      hypothesis: thinkingGraph.hypotheses.length,
      branch: thinkingGraph.branches.length,
      fact: thinkingGraph.facts.length,
      question: thinkingGraph.openQuestions.length,
      rejected: thinkingGraph.rejectedItems.length,
    },
    hiddenCounts: {
      fact: hiddenEvidence.length,
      branch: hiddenPlans.length,
      rejected: hiddenRejected.length,
      worker: parkedWorkers.length + endedWorkers.length,
      hypothesis: Math.max(openHypotheses.length + supportedHypotheses.length - visibleEvidence.length - visiblePlans.length, 0),
    },
  };
}

function buildThinkingGraphVisualNodeDetail(node, model, nodeLookup) {
  if (!node) {
    return {
      title: '图谱概览',
      subtitle: '从左到右依次查看证据、主焦点、推进项，以及执行与收束结果。',
      metrics: [
        ['主图节点', String(model.nodes.length)],
        ['主图连线', String(model.edges.length)],
        ['折叠证据', String(model.hiddenCounts.fact || 0)],
        ['折叠推进项', String(model.hiddenCounts.branch || 0)],
      ],
      lines: [
        '证据层只保留高价值事实和已支持判断，不再混入任务类型、附件等元信息。',
        '推进层会同时展示活跃假设、分支和当前动作，执行与收束层承接 swarm 与已否定项。',
      ],
      related: [],
    };
  }

  const related = model.edges
    .filter(edge => edge.source === node.id || edge.target === node.id)
    .map(edge => {
      const peerId = edge.source === node.id ? edge.target : edge.source;
      const peer = nodeLookup.get(peerId);
      return `${edge.label} -> ${peer?.fullLabel || peer?.label || peerId}`;
    })
    .slice(0, 8);

  return {
    title: node.fullLabel || node.label || '未命名节点',
    subtitle: node.meta || '当前节点没有额外摘要。',
    metrics: [
      ['类型', node.detailKind || node.kind || 'node'],
      ['状态', node.status || 'open'],
      ['关联边', String(model.edges.filter(edge => edge.source === node.id || edge.target === node.id).length)],
      ['高亮', node.isActive ? '是' : '否'],
    ],
    lines: node.detailLines && node.detailLines.length ? node.detailLines : ['当前节点没有补充细节。'],
    related,
  };
}

function renderThinkingGraphVisualCompact(thinkingGraph, options = {}) {
  const { taskId = '', zoom = 1, standalone = false } = options;
  const model = buildThinkingGraphVisualModel(thinkingGraph);
  const nodeLookup = new Map(model.nodes.map(node => [node.id, node]));
  const selectedNodeId = taskId ? resolveTaskThinkingGraphSelectedNode(taskId) : '';
  const selectedNode = selectedNodeId ? nodeLookup.get(selectedNodeId) : null;
  const selectedDetail = buildThinkingGraphVisualNodeDetail(selectedNode, model, nodeLookup);
  const currentPan = taskId ? resolveTaskThinkingGraphPan(taskId) : { x: 0, y: 0 };
  const normalizedZoom = Math.max(0.5, Math.min(Number(zoom) || 1, 2.5));
  const zoomPercent = Math.round(normalizedZoom * 100);
  const stageWidth = Math.round(model.width * normalizedZoom);
  const stageHeight = Math.round(model.height * normalizedZoom);
  const markerDefs = [
    ['supports', '#34d399'],
    ['opposes', '#fb7185'],
    ['leads-to', '#fb923c'],
    ['tests', '#60a5fa'],
    ['blocks', '#94a3b8'],
    ['informs', '#9ca3af'],
    ['selected-incoming', '#fbbf24'],
    ['selected-outgoing', '#22d3ee'],
  ].map(([suffix, color]) => `
      <marker id="thinking-graph-arrow-${suffix}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="${color}"></path>
      </marker>
    `).join('');

  const edgeSvg = model.edges.map((edge) => {
    const source = nodeLookup.get(edge.source);
    const target = nodeLookup.get(edge.target);
    if (!source || !target) return '';
    const visual = getThinkingGraphEdgeVisual(edge.relation);
    const isIncoming = Boolean(selectedNodeId) && edge.target === selectedNodeId;
    const isOutgoing = Boolean(selectedNodeId) && edge.source === selectedNodeId;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.hypot(dx, dy) || 1;
    const ux = dx / distance;
    const uy = dy / distance;
    const startX = source.x + (ux * source.radius);
    const startY = source.y + (uy * source.radius);
    const endX = target.x - (ux * target.radius);
    const endY = target.y - (uy * target.radius);
    const perpX = -uy;
    const perpY = ux;
    const offset = distance * edge.curvature;
    const controlX = ((startX + endX) / 2) + (perpX * offset);
    const controlY = ((startY + endY) / 2) + (perpY * offset);
    const labelX = ((startX + endX) / 2) + (perpX * offset * 0.3);
    const labelY = ((startY + endY) / 2) + (perpY * offset * 0.3);
    return `
      <g class="task-thinking-visual-edge-group ${isIncoming ? 'is-incoming' : ''} ${isOutgoing ? 'is-outgoing' : ''}" data-source="${escapeHtml(edge.source)}" data-target="${escapeHtml(edge.target)}">
        <path
          class="task-thinking-visual-edge"
          d="M ${startX.toFixed(1)} ${startY.toFixed(1)} Q ${controlX.toFixed(1)} ${controlY.toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}"
          stroke="${visual.color}"
          marker-end="url(#${isIncoming ? 'thinking-graph-arrow-selected-incoming' : isOutgoing ? 'thinking-graph-arrow-selected-outgoing' : visual.marker})"
        ></path>
        <text class="task-thinking-visual-edge-label" x="${labelX.toFixed(1)}" y="${(labelY - 6).toFixed(1)}">${escapeHtml(edge.label)}</text>
      </g>
    `;
  }).join('');

  const renderNodeSvg = (node) => {
    const layout = getThinkingGraphNodeLabelLayout(node, model);
    const isSelected = selectedNodeId === node.id;
    return {
      layout,
      svg: `
        <g
          class="task-thinking-visual-node-group ${isSelected ? 'is-selected' : ''}"
          data-node-id="${escapeHtml(node.id)}"
          data-kind="${escapeHtml(node.kind)}"
          data-status="${escapeHtml(node.status)}"
          data-active="${node.isActive ? 'true' : 'false'}"
          ${taskId ? `onmousedown="event.stopPropagation()" onclick="event.stopPropagation();setTaskThinkingGraphSelectedNode('${taskId}', '${escapeHtml(node.id)}')"` : ''}
        >
          ${node.isActive ? `<circle class="task-thinking-visual-node-outline ${isSelected ? 'is-selected' : ''}" cx="${node.x.toFixed(1)}" cy="${node.y.toFixed(1)}" r="${(node.radius + 8).toFixed(1)}"></circle>` : ''}
          <circle class="task-thinking-visual-node ${node.isActive ? 'is-active' : ''}" cx="${node.x.toFixed(1)}" cy="${node.y.toFixed(1)}" r="${node.radius}" fill="${node.fill}" stroke="${node.stroke}"></circle>
          <text
            class="task-thinking-visual-node-index ${isSelected ? 'is-selected' : ''}"
            x="${node.x.toFixed(1)}"
            y="${(node.y + node.radius + 18).toFixed(1)}"
            text-anchor="middle"
          >
            #${escapeHtml(String(node.displayIndex))}
          </text>
        </g>
      `,
    };
  };

  const regularNodes = model.nodes.filter(node => selectedNodeId !== node.id);
  const selectedNodes = model.nodes.filter(node => selectedNodeId === node.id);
  const regularNodeSvg = regularNodes.map(node => renderNodeSvg(node).svg).join('');
  const selectedNodeSvg = selectedNodes.map(node => renderNodeSvg(node).svg).join('');

  const nodeLegendHtml = [
    { label: '焦点', kind: 'focus' },
    { label: '动作/分支', kind: 'branch' },
    { label: '事实', kind: 'fact' },
    { label: '并行/聚合', kind: 'question' },
    { label: '已否定', kind: 'hypothesis', status: 'rejected' },
  ].map((item) => {
    const visual = getThinkingGraphNodeVisual(item.kind, item.status);
    return `
      <div class="task-thinking-legend-item">
        <span class="task-thinking-legend-dot" style="background:${visual.fill};border-color:${visual.stroke}"></span>
        <span>${escapeHtml(item.label)}</span>
      </div>
    `;
  }).join('');

  const relationLegendHtml = [
    ['supports', '支持主线'],
    ['forks', '分叉'],
    ['drives', '驱动动作'],
    ['tests', '验证'],
    ['opposes', '已否定'],
  ].map(([relation, label]) => {
    const visual = getThinkingGraphEdgeVisual(relation);
    return `<div class="task-thinking-legend-item"><span class="task-thinking-legend-line" style="background:${visual.color}"></span><span>${escapeHtml(label)}</span></div>`;
  }).join('');

  const laneSvg = (model.lanes || []).map((lane) => `
      <g class="task-thinking-visual-lane-group">
        <rect class="task-thinking-visual-lane" x="${lane.x}" y="${lane.y}" width="${lane.width}" height="${lane.height}" rx="28"></rect>
        <text class="task-thinking-visual-lane-title" x="${lane.x + 24}" y="${lane.y + 34}">${escapeHtml(lane.title)}</text>
        <text class="task-thinking-visual-lane-subtitle" x="${lane.x + 24}" y="${lane.y + 56}">${escapeHtml(lane.subtitle)}</text>
      </g>
    `).join('');

  const hiddenSummary = [
    model.hiddenCounts.fact ? `事实 +${model.hiddenCounts.fact}` : '',
    model.hiddenCounts.branch ? `分支 +${model.hiddenCounts.branch}` : '',
    model.hiddenCounts.rejected ? `已否定 +${model.hiddenCounts.rejected}` : '',
    model.hiddenCounts.worker ? `背景 worker ${model.hiddenCounts.worker}` : '',
  ].filter(Boolean).join(' · ');
  const detailMetricsHtml = selectedDetail.metrics.map(([label, value]) => renderThinkingGraphMetric(label, value)).join('');
  const detailLinesHtml = selectedDetail.lines.map(line => `<div class="task-thinking-item">${escapeHtml(line)}</div>`).join('');
  const relatedHtml = selectedDetail.related.length
    ? selectedDetail.related.map(line => `<div class="task-thinking-item">${escapeHtml(line)}</div>`).join('')
    : '<div class="task-thinking-empty">当前节点没有额外关联边。</div>';

  return `
    <div class="task-thinking-visual-root" data-task-id="${escapeHtml(taskId)}">
      <section class="task-thinking-section">
        <div class="task-thinking-section-title">图谱说明</div>
        <div class="task-thinking-visual-stats">
          ${renderThinkingGraphMetric('展示节点', String(model.nodes.length))}
          ${renderThinkingGraphMetric('展示连线', String(model.edges.length))}
          ${renderThinkingGraphMetric('折叠摘要', hiddenSummary || '无')}
          ${renderThinkingGraphMetric('分支总数', String(model.counts.branch))}
          ${renderThinkingGraphMetric('事实总数', String(model.counts.fact))}
          ${renderThinkingGraphMetric('问题总数', String(model.counts.question))}
          ${renderThinkingGraphMetric('已否定总数', String(model.counts.rejected))}
        </div>
      </section>
      <section class="task-thinking-section">
        <div class="task-thinking-section-title">图例</div>
        <div class="task-thinking-legend-stack">
          <div class="task-thinking-legend-row">
            <div class="task-thinking-legend-label">节点颜色</div>
            <div class="task-thinking-legend-grid">${nodeLegendHtml}</div>
          </div>
          <div class="task-thinking-legend-row">
            <div class="task-thinking-legend-label">连接线意义</div>
            <div class="task-thinking-legend-grid">${relationLegendHtml}</div>
          </div>
        </div>
      </section>
      <section class="task-thinking-section">
        <div class="task-thinking-section-title">关系图谱</div>
        <div class="task-thinking-visual-toolbar">
          <div class="task-thinking-visual-toolbar-group">
            <button class="task-thinking-zoom-btn" type="button" onclick="adjustTaskThinkingGraphZoom('${taskId}', -0.1)">-</button>
            <div class="task-thinking-zoom-indicator">${zoomPercent}%</div>
            <button class="task-thinking-zoom-btn" type="button" onclick="adjustTaskThinkingGraphZoom('${taskId}', 0.1)">+</button>
            <button class="task-thinking-zoom-btn reset" type="button" onclick="setTaskThinkingGraphZoom('${taskId}', 1)">重置</button>
            ${standalone ? '' : `<button class="task-thinking-zoom-btn reset" type="button" onclick="openThinkingGraphModal('${taskId}')">独立浮窗</button>`}
          </div>
          <div class="task-thinking-visual-toolbar-hint">${standalone ? '按住鼠标左键可拖动画布' : '支持 Ctrl/⌘ + 滚轮缩放，或打开独立浮窗拖动查看'}</div>
        </div>
        <div class="task-thinking-visual-layout">
          <div style="position:relative;min-width:0;">
            <div class="task-thinking-visual-canvas-shell" data-task-id="${escapeHtml(taskId)}" onwheel="onTaskThinkingGraphWheel(event, '${taskId}')" onmousedown="startThinkingGraphPan(event, '${taskId}')" ${standalone ? '' : `ondblclick="openThinkingGraphModal('${taskId}')"`}>
              <div class="task-thinking-visual-stage" data-task-id="${escapeHtml(taskId)}" style="width:${stageWidth}px;height:${stageHeight}px;transform:translate(${currentPan.x}px, ${currentPan.y}px)" ${taskId ? `onclick="clearTaskThinkingGraphSelection('${taskId}')"` : ''}>
                <svg class="task-thinking-visual-canvas" viewBox="0 0 ${model.width} ${model.height}" style="width:${stageWidth}px;height:${stageHeight}px" role="img" aria-label="任务思考图谱" ${taskId ? `onclick="clearTaskThinkingGraphSelection('${taskId}')"` : ''}>
                  <defs>
                    <linearGradient id="thinking-graph-bg" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stop-color="#0f172a" stop-opacity="0.96"></stop>
                      <stop offset="100%" stop-color="#1e293b" stop-opacity="0.86"></stop>
                    </linearGradient>
                    ${markerDefs}
                  </defs>
                  <rect x="0" y="0" width="${model.width}" height="${model.height}" rx="28" fill="url(#thinking-graph-bg)"></rect>
                  <g class="task-thinking-visual-lanes">${laneSvg}</g>
                  <g class="task-thinking-visual-grid">
                    <line x1="360" y1="90" x2="360" y2="${model.height - 90}" stroke="rgba(148,163,184,0.05)" stroke-width="1" stroke-dasharray="8 8"></line>
                    <line x1="680" y1="90" x2="680" y2="${model.height - 90}" stroke="rgba(148,163,184,0.05)" stroke-width="1" stroke-dasharray="8 8"></line>
                    <line x1="1000" y1="90" x2="1000" y2="${model.height - 90}" stroke="rgba(148,163,184,0.05)" stroke-width="1" stroke-dasharray="8 8"></line>
                  </g>
                  <g class="task-thinking-visual-edges">${edgeSvg}</g>
                  <g class="task-thinking-visual-nodes">${regularNodeSvg}${selectedNodeSvg}</g>
                </svg>
              </div>
            </div>
          </div>
          <aside class="task-thinking-visual-detail-panel">
            <div class="task-thinking-visual-detail-head">
              <div class="task-thinking-visual-detail-title">${escapeHtml(selectedDetail.title)}</div>
              <div class="task-thinking-visual-detail-subtitle">${escapeHtml(selectedDetail.subtitle)}</div>
            </div>
            <div class="task-thinking-metrics">${detailMetricsHtml}</div>
            <div class="task-thinking-subsection" style="margin-top:12px;">
              <div class="task-thinking-subtitle">节点详情</div>
              <div class="task-thinking-stack compact">${detailLinesHtml}</div>
            </div>
            <div class="task-thinking-subsection" style="margin-top:12px;">
              <div class="task-thinking-subtitle">直接关系</div>
              <div class="task-thinking-stack compact">${relatedHtml}</div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  `;
}

function renderThinkingGraphVisual(thinkingGraph, options = {}) {
  return renderThinkingGraphVisualCompact(thinkingGraph, options);
}

/**
 * 渲染任务展开后的详情区域。
 */
function renderTaskDetails(detailData) {
  const { task, progressPercent, llmOutputs, activeOutputIndex, engineeringLogs, filesLabel, modulesLabel, payloadLabel, workspaceLabel } = detailData;
  const metaHtml = [
    ['状态', task.status],
    ['进度', `${progressPercent}%`],
    ['目标', task.target || '无'],
    ['GZCTF ID', task.gzctfChallengeId || '未设置'],
    ['模块', modulesLabel],
    ['文件', filesLabel],
    ['Payload', payloadLabel],
    ['工作空间', workspaceLabel]
  ].map(([label, value]) => `
    <div class="task-meta-chip">
      <span class="task-meta-chip-label">${escapeHtml(label)}</span>
      <span class="task-meta-chip-value">${escapeHtml(value)}</span>
    </div>
  `).join('');

  const engineeringLogHtml = engineeringLogs.length
    ? engineeringLogs.map(log => `<div class="task-engineering-log">${escapeHtml(log)}</div>`).join('')
    : '<div class="task-engineering-log">暂无工程日志</div>';

  const activeOutput = llmOutputs[activeOutputIndex];
  const llmHtml = activeOutput
    ? `<div class="markdown-content">${renderMarkdown(activeOutput.content)}</div>`
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
 * Render the full task detail modal, including all tab pages and action areas.
 *
 * @param {Object} detailData - Normalized task detail model from `buildTaskDetailData`.
 * @returns {string} HTML string for the task detail modal body.
 */
function renderTaskDetailModal(detailData) {
  // Unpack all normalized detail-view inputs once so later sections stay declarative.
  const {
    task,
    llmOutputs,
    activeOutputIndex,
    activeTab,
    activeThinkingGraphPage,
    thinkingGraphZoom,
    toolLogs,
    verboseLogs,
    thinkingGraph,
    swarmRuns,
    autonomousWorkflow,
    knowledgeHarvestState,
    contextSnapshot,
    pendingNewInput,
    newInputFeedback,
    newInputHistory,
    progressPercent,
    filesLabel,
    modulesLabel,
    payloadLabel,
    workspaceLabel,
    skillsLabel
  } = detailData;

  // Clamp invalid tab state to tabs that the current task configuration actually supports.
  const effectiveActiveTab = activeTab === 'graph' && !isTaskThinkingGraphModeEnabled(task)
    ? 'progress'
    : activeTab === 'swarm' && task.executionMode !== 'swarm'
      ? 'progress'
      : activeTab;
  const actionButtons = renderTaskActionButtons(task);
  
  // 编辑按钮（只在非运行状态显示）
  const editButton = getTaskStatusKey(task) !== 'running'
    ? `<button class="task-btn" onclick="openEditTaskModal('${task.id}')">编辑</button>`
    : '';
  
  // 状态标签和颜色
  const statusMap = {
    'idle': { text: '闲置', color: '#a1a1aa' },
    'running': { text: '运行中', color: '#4ade80' },
    'done': { text: '已完成', color: '#60a5fa' },
    'error': { text: '失败', color: '#f87171' },
    'canceled': { text: '已中止', color: '#f87171' }
  };
  const statusInfo = statusMap[getTaskStatusKey(task)] || statusMap['idle'];
  
  const swarmSubagentAutoEnabled = Boolean(task.swarmSubagentAutoCount);
  const swarmSubagentConfigLabel = task.executionMode === 'swarm'
    ? `${swarmSubagentAutoEnabled ? 'LLM 自动决定' : '固定建议值'} · ${task.swarmSubagentCountMin ?? '-'} / ${task.swarmSubagentCountSuggested ?? '-'} / ${task.swarmSubagentCountMax ?? '-'}`
    : '<span style="color:var(--text-muted)">仅 Swarm 模式显示</span>';

  // 工程块元数据
  const metaItems = [
    ['状态', `<span style="color:${statusInfo.color}">${statusInfo.text}</span>`],
    ['进度', `${progressPercent}%`],
    ['类型', getTaskTypeLabel(task.type)],
    ['任务模式', isLearningWorkflowTask(task) ? 'Luna-333 / 月天使（学习专用）' : task.taskMode === 'luna_333' ? 'Luna-333 / 月天使' : 'Classic Agent'],
    ['执行模式', isLearningWorkflowTask(task) ? (task.executionMode === 'swarm' ? 'Swarm 学习' : '单代理学习') : task.executionMode === 'swarm' ? 'Swarm 并行测试' : '单代理'],
    ['学习策略', isLearningWorkflowTask(task) ? (task.learningMode === 'self_search' ? 'Self Search / 自搜索学习' : 'Focused / 定向学习') : '<span style="color:var(--text-muted)">仅学习任务显示</span>'],
    ['学习轮数', isLearningWorkflowTask(task) ? String(task.learningSearchRounds ?? '-') : '<span style="color:var(--text-muted)">仅学习任务显示</span>'],
    ['每轮候选', isLearningWorkflowTask(task) ? String(task.learningResultsPerQuery ?? '-') : '<span style="color:var(--text-muted)">仅学习任务显示</span>'],
    ['最大来源', isLearningWorkflowTask(task) ? String(task.learningMaxSources ?? '-') : '<span style="color:var(--text-muted)">仅学习任务显示</span>'],
    ['聚焦关键词', isLearningWorkflowTask(task) ? escapeHtml((task.learningFocusKeywords || []).join(' / ') || '无') : '<span style="color:var(--text-muted)">仅学习任务显示</span>'],
    ['排除关键词', isLearningWorkflowTask(task) ? escapeHtml((task.learningExcludeKeywords || []).join(' / ') || '无') : '<span style="color:var(--text-muted)">仅学习任务显示</span>'],
    ['Swarm 子 Agent', swarmSubagentConfigLabel],
    ['求解器', getTaskSolverEngineLabel(task.solverEngine)],
    ['初始方案', getTaskSolverInitialStrategyLabel(task.solverInitialStrategy)],
    ['目标', task.target || (isLearningWorkflowTask(task) ? '未填写学习主题' : '无')],
    ['GZCTF 任务ID', task.gzctfChallengeId || '未设置'],
    ['模块', modulesLabel],
    ['文件', filesLabel],
    ['Payload', payloadLabel],
    ['Skills', skillsLabel],
    ['工作空间', workspaceLabel],
    ['创建时间', formatDateTime(task.created_at)]
  ];
  
  // 每条元数据做成独立的小卡片
  const metaHtml = metaItems.map(([label, value]) => `
    <div class="task-meta-chip">
      <div class="task-meta-chip-label">${escapeHtml(label)}</div>
      <div class="task-meta-chip-value">${value}</div>
    </div>
  `).join('');
  
  const toolLogsHtml = toolLogs.length
    ? toolLogs.map(log => `<div class="task-log-entry">${escapeHtml(log)}</div>`).join('')
    : '<div class="task-log-entry task-log-entry-empty">暂无工具日志</div>';

  const verboseLogsHtml = verboseLogs.length
    ? verboseLogs.map(log => `<div class="task-log-entry">${escapeHtml(log)}</div>`).join('')
    : '<div class="task-log-entry task-log-entry-empty">暂无 Agent verbose 日志</div>';
  
  // LLM 输出
  const activeOutput = llmOutputs[activeOutputIndex];
  const llmHtml = activeOutput
    ? `
      <div class="llm-output-shell">
        <div class="llm-output-caption">${escapeHtml(activeOutput.title)}</div>
        <div class="markdown-content">${renderMarkdown(activeOutput.content)}</div>
      </div>
    `
    : '<div class="llm-empty-state">暂无 LLM 输出<br>等待任务完成后，这里会展示渲染后的 Markdown 报告</div>';
  const llmPagerHtml = renderLlmOutputPager(task.id, llmOutputs, activeOutputIndex);

  // Build the top-level task detail tabs, including the structured context snapshot view.
  const tabsHtml = `
    <div class="task-detail-tabs">
      <button
        class="task-detail-tab ${effectiveActiveTab === 'progress' ? 'active' : ''}"
        type="button"
        onclick="setTaskDetailTab('${task.id}', 'progress')"
      >
        当前进度
      </button>
      <button
        class="task-detail-tab ${effectiveActiveTab === 'llm' ? 'active' : ''}"
        type="button"
        onclick="setTaskDetailTab('${task.id}', 'llm')"
      >
        LLM 输出
      </button>
      <button
        class="task-detail-tab ${effectiveActiveTab === 'context' ? 'active' : ''}"
        type="button"
        onclick="setTaskDetailTab('${task.id}', 'context')"
      >
        上下文
      </button>
      ${isLearningWorkflowTask(task) ? `
        <button
          class="task-detail-tab ${effectiveActiveTab === 'learning' ? 'active' : ''}"
          type="button"
          onclick="setTaskDetailTab('${task.id}', 'learning')"
        >
          学习流水线
        </button>
      ` : ''}
      ${isTaskThinkingGraphModeEnabled(task) ? `
        <button
          class="task-detail-tab ${effectiveActiveTab === 'graph' ? 'active' : ''}"
          type="button"
          onclick="setTaskDetailTab('${task.id}', 'graph')"
        >
          思考图
        </button>
      ` : ''}
      ${task.executionMode === 'swarm' ? `
        <button
          class="task-detail-tab ${effectiveActiveTab === 'swarm' ? 'active' : ''}"
          type="button"
          onclick="setTaskDetailTab('${task.id}', 'swarm')"
        >
          Swarm 输出
        </button>
      ` : ''}
    </div>
  `;

  // Render the progress page with status, config, and streamed engineering logs.
  const progressPageHtml = `
    <div class="task-progress-root">
      <div class="task-progress-hero">
        <div class="task-progress-badge" style="color:${statusInfo.color};border-color:${statusInfo.color}">
          ${statusInfo.text}
        </div>
        <div class="task-progress-bar-wrap">
          <div class="task-progress-bar-bg">
              <div class="task-progress-bar-fill" style="width:${progressPercent}%;background:${statusInfo.color}"></div>
            </div>
          <div class="task-progress-percent">${progressPercent}% 完成</div>
        </div>
        <div class="task-progress-type-badge">${escapeHtml(getTaskTypeLabel(task.type))}</div>
      </div>
      <div class="task-progress-body">
        <div class="task-progress-col">
          <div class="task-progress-section">
            <div class="task-progress-section-title">执行状态</div>
            <div class="task-progress-info-grid">
              <div class="task-progress-info-item">
                <div class="task-progress-info-label">状态</div>
                <div class="task-progress-info-value" style="color:${statusInfo.color}">${statusInfo.text}</div>
              </div>
              <div class="task-progress-info-item">
                <div class="task-progress-info-label">进度</div>
                <div class="task-progress-info-value">${progressPercent}%</div>
              </div>
              <div class="task-progress-info-item">
                <div class="task-progress-info-label">类型</div>
                <div class="task-progress-info-value">${escapeHtml(getTaskTypeLabel(task.type))}</div>
              </div>
            </div>
          </div>
          <div class="task-progress-section">
            <div class="task-progress-section-title">任务配置</div>
            <div class="task-progress-info-grid">
              <div class="task-progress-info-item wide">
                <div class="task-progress-info-label">目标</div>
                <div class="task-progress-info-value">${escapeHtml(task.target || '无')}</div>
              </div>
              <div class="task-progress-info-item wide">
                <div class="task-progress-info-label">模块</div>
                <div class="task-progress-info-value">${escapeHtml(modulesLabel)}</div>
              </div>
              <div class="task-progress-info-item wide">
                <div class="task-progress-info-label">文件</div>
                <div class="task-progress-info-value">${escapeHtml(filesLabel)}</div>
              </div>
              <div class="task-progress-info-item">
                <div class="task-progress-info-label">Payload</div>
                <div class="task-progress-info-value">${escapeHtml(payloadLabel)}</div>
              </div>
              <div class="task-progress-info-item wide">
                <div class="task-progress-info-label">Skills</div>
                <div class="task-progress-info-value">${skillsLabel}</div>
              </div>
            </div>
          </div>
          <div class="task-progress-section">
            <div class="task-progress-section-title">环境信息</div>
            <div class="task-progress-info-grid">
              <div class="task-progress-info-item wide">
                <div class="task-progress-info-label">工作空间</div>
                <div class="task-progress-info-value code">${escapeHtml(workspaceLabel)}</div>
              </div>
              <div class="task-progress-info-item wide">
                <div class="task-progress-info-label">创建时间</div>
                <div class="task-progress-info-value">${escapeHtml(formatDateTime(task.created_at))}</div>
              </div>
            </div>
          </div>
        </div>
        <div class="task-progress-col task-progress-logs">
          <div class="task-progress-log-panels">
            <div class="task-progress-log-panel">
              <div class="task-progress-log-panel-header" onclick="openLogPanelModal('${task.id}', 'tool')">
                <div class="task-progress-log-panel-title">🧰 工具块</div>
                <div class="task-progress-log-panel-count">${toolLogs.length} 条</div>
              </div>
              <div class="task-progress-log-panel-body" data-scroll-key="toolLogs">
                ${toolLogsHtml}
              </div>
            </div>
            <div class="task-progress-log-panel">
              <div class="task-progress-log-panel-header" onclick="openLogPanelModal('${task.id}', 'verbose')">
                <div class="task-progress-log-panel-title">🛰 Agent Verbose</div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <div class="task-progress-log-panel-count">${verboseLogs.length} 条</div>
                  <button
                    class="task-btn primary"
                    type="button"
                    onclick="event.stopPropagation();exportTaskVerboseLogs('${task.id}')"
                  >
                    导出TXT
                  </button>
                </div>
              </div>
              <div class="task-progress-log-panel-body" data-scroll-key="verboseLogs">
                ${verboseLogsHtml}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Render the LLM output page with markdown output and pagination controls.
  const llmPageHtml = `
    <div class="task-detail-page">
      <div class="task-detail-panel task-detail-llm task-detail-panel-full">
        <div class="task-detail-panel-header" onclick="openLogPanelModal('${task.id}', 'llm')" style="cursor:pointer">
          <div class="task-detail-panel-title">🤖 LLM 输出块</div>
          <button class="task-btn primary" type="button" onclick="event.stopPropagation();exportTaskLlmOutput('${task.id}')">导出输出</button>
        </div>
        ${llmPagerHtml}
        <div class="task-detail-panel-body" data-scroll-key="llmOutput">
          ${llmHtml}
        </div>
      </div>
    </div>
  `;

  // Render the structured context snapshot page from backend-persisted Agent state.
  const contextMetricsHtml = [
    ['未压缩', String(contextSnapshot.stats.uncompactedCount)],
    ['压缩', String(contextSnapshot.stats.compactedCount)],
    ['记忆', String(contextSnapshot.stats.memoryCount)],
  ].map(([label, value]) => renderThinkingGraphMetric(label, value)).join('');
  const contextPageHtml = `
    <div class="task-detail-page task-detail-page-compact">
      <div class="task-detail-panel task-detail-panel-full">
        <div class="task-detail-panel-header">
          <div class="task-detail-panel-title">🧠 当前上下文</div>
          <div style="font-size:11px;color:var(--text-3)">展示 Agent 当前持有的未压缩、压缩和记忆快照</div>
        </div>
        <div class="task-detail-panel-body task-thinking-graph task-context-body" data-scroll-key="contextSnapshot">
          <section class="task-thinking-section">
            <div class="task-thinking-section-title">上下文概览</div>
            <div class="task-thinking-metrics">${contextMetricsHtml}</div>
          </section>
          ${renderTaskContextSection('未压缩', contextSnapshot.uncompacted, 'uncompacted')}
          ${renderTaskContextSection('压缩', contextSnapshot.compacted, 'compacted')}
          ${renderTaskContextSection('记忆', contextSnapshot.memories, 'memory')}
        </div>
      </div>
    </div>
  `;

  // Normalize learning-pipeline state into metric cards and collection sections.
  const discoveryCandidates = Array.isArray(knowledgeHarvestState.discovery_candidates) ? knowledgeHarvestState.discovery_candidates : [];
  const sourceDocuments = Array.isArray(knowledgeHarvestState.source_documents) ? knowledgeHarvestState.source_documents : [];
  const replayArtifacts = Array.isArray(knowledgeHarvestState.replay_artifacts) ? knowledgeHarvestState.replay_artifacts : [];
  const compressedTraces = Array.isArray(knowledgeHarvestState.compressed_traces) ? knowledgeHarvestState.compressed_traces : [];
  const patternCards = Array.isArray(knowledgeHarvestState.pattern_cards) ? knowledgeHarvestState.pattern_cards : [];
  const curatorReviews = Array.isArray(knowledgeHarvestState.curator_reviews) ? knowledgeHarvestState.curator_reviews : [];
  const vectorChunks = Array.isArray(knowledgeHarvestState.vector_chunks) ? knowledgeHarvestState.vector_chunks : [];
  const vectorUpdatePlan = knowledgeHarvestState.vector_update_plan && typeof knowledgeHarvestState.vector_update_plan === 'object'
    ? knowledgeHarvestState.vector_update_plan
    : {};
  const learningConfig = knowledgeHarvestState.config && typeof knowledgeHarvestState.config === 'object'
    ? knowledgeHarvestState.config
    : {
        mode: task.learningMode,
        execution_mode: task.executionMode,
        search_rounds: task.learningSearchRounds,
        results_per_query: task.learningResultsPerQuery,
      max_sources: task.learningMaxSources,
      max_chars_per_source: task.learningMaxCharsPerSource,
      focus_keywords: task.learningFocusKeywords,
      exclude_keywords: task.learningExcludeKeywords,
      };
  const learningSearchRounds = Array.isArray(knowledgeHarvestState.search_rounds) ? knowledgeHarvestState.search_rounds : [];
  const acceptedPatternCount = curatorReviews.filter(item => item.status === 'accept').length;
  const reviewNeededPatternCount = curatorReviews.filter(item => item.status === 'needs_human_review').length;
  const rejectedPatternCount = curatorReviews.filter(item => item.status === 'reject').length;
  const learningMetricsHtml = [
    ['Query', String(knowledgeHarvestState.query || task.target || '未记录')],
    ['候选来源', String(discoveryCandidates.length)],
    ['已抓取来源', String(sourceDocuments.length)],
    ['Replay', String(replayArtifacts.length)],
    ['压缩轨迹', String(compressedTraces.length)],
    ['Pattern', String(patternCards.length)],
    ['待人工复核', String(reviewNeededPatternCount)],
    ['已通过', String(acceptedPatternCount)],
    ['向量块', String(vectorChunks.length)],
  ].map(([label, value]) => renderThinkingGraphMetric(label, value)).join('');
  const learningConfigMetricsHtml = [
    ['策略', String(learningConfig.mode === 'self_search' ? 'Self Search / 自搜索学习' : 'Focused / 定向学习')],
    ['执行模式', String(learningConfig.execution_mode === 'swarm' ? 'Swarm' : 'Single')],
    ['搜索轮数', String(learningConfig.search_rounds ?? '-')],
    ['每轮候选', String(learningConfig.results_per_query ?? '-')],
    ['最大来源', String(learningConfig.max_sources ?? '-')],
    ['单来源字符', String(learningConfig.max_chars_per_source ?? '-')],
    ['聚焦关键词', String((learningConfig.focus_keywords || []).join(' / ') || '无')],
    ['排除关键词', String((learningConfig.exclude_keywords || []).join(' / ') || '无')],
  ].map(([label, value]) => renderThinkingGraphMetric(label, value)).join('');
  const learningDiscoveryHtml = renderLearningPipelineCollection(
    discoveryCandidates.slice(0, 8),
    item => `
      <div class="task-thinking-item">
        <strong>${escapeHtml(item.title || item.url || '未命名候选')}</strong><br>
        <span style="color:var(--text-3)">${escapeHtml(item.url || '无 URL')}</span><br>
        <span>trust=${escapeHtml(Number(item.trust_hint ?? 0).toFixed(2))} · ${escapeHtml(item.source_type || 'unknown')}</span>
      </div>
    `,
    'Discover 阶段还没有候选来源。'
  );
  const learningSourcesHtml = renderLearningPipelineCollection(
    sourceDocuments.slice(0, 6),
    item => `
        <div class="task-thinking-item">
          <strong>${escapeHtml(item.title || item.url || '未命名来源')}</strong><br>
          <span style="color:var(--text-3)">${escapeHtml(item.url || item.domain || '无 URL')}</span><br>
          <span>${escapeHtml(item.domain || 'unknown domain')} · ${escapeHtml(item.language || 'unknown')}</span>
        </div>
      `,
    '还没有来源文档。'
  );
  const learningReplayHtml = renderLearningPipelineCollection(
    replayArtifacts.slice(0, 6),
    item => `
      <div class="task-thinking-item">
        <strong>${escapeHtml(item.id || '未知 Replay')}</strong><br>
        <span>${escapeHtml(item.replay_summary || '暂无 Replay 摘要')}</span><br>
        <span style="color:var(--text-3)">steps=${escapeHtml(String((item.steps || []).length))} · signals=${escapeHtml(String((item.extracted_signals || []).length))} · pitfalls=${escapeHtml(String((item.pitfalls || []).length))}</span>
      </div>
    `,
    '还没有 replay artifact。'
  );
  const learningCompressionHtml = renderLearningPipelineCollection(
    compressedTraces.slice(0, 6),
    item => `
      <div class="task-thinking-item">
        <strong>${escapeHtml((item.steps || [])[0] || '压缩轨迹')}</strong><br>
        <span>${escapeHtml(item.compression_notes || '暂无压缩说明')}</span><br>
        <span style="color:var(--text-3)">steps=${escapeHtml(String((item.steps || []).length))} · branch=${escapeHtml(String((item.branch_conditions || []).length))} · stop=${escapeHtml(String((item.stop_conditions || []).length))}</span>
      </div>
    `,
    '还没有 compressed trace。'
  );
  const learningPatternsHtml = renderLearningPipelineCollection(
    patternCards.slice(0, 6),
    item => `
        <div class="task-thinking-item">
          <strong>${escapeHtml(item.title || item.id || '未命名策略')}</strong><br>
          <span>${escapeHtml(item.summary || '暂无摘要')}</span><br>
          <span style="color:var(--text-3)">quality=${escapeHtml(String(item.quality?.aggregate ?? 'n/a'))} · steps=${escapeHtml(String((item.strategy?.steps || []).length))}</span>
        </div>
      `,
    '还没有蒸馏出的 PatternCard。'
  );
  const learningReviewsHtml = renderLearningPipelineCollection(
    curatorReviews.slice(0, 6),
    item => `
        <div class="task-thinking-item">
          <strong>${escapeHtml(item.pattern_id || 'unknown')}</strong> · ${escapeHtml(getLearningReviewStatusLabel(item.status))}<br>
          <span>${escapeHtml((item.reasons || []).join('；') || '无说明')}</span>
        </div>
      `,
    '还没有 curator review。'
  );
  const learningVectorHtml = `
    <div class="task-thinking-stack compact">
      <div class="task-thinking-item">
        <strong>更新模式</strong><br>
        <span>${escapeHtml(vectorUpdatePlan.mode || '未记录')}</span>
      </div>
      <div class="task-thinking-item">
        <strong>目标索引</strong><br>
        <span>${escapeHtml((vectorUpdatePlan.target_index_names || []).join(' · ') || '无')}</span>
      </div>
      <div class="task-thinking-item">
        <strong>待写入 Chunk</strong><br>
        <span>${escapeHtml(String((vectorUpdatePlan.upsert_chunk_ids || []).length))} 个</span>
      </div>
      <div class="task-thinking-item">
        <strong>被拒绝 Pattern</strong><br>
        <span>${escapeHtml(String(rejectedPatternCount))} 个</span>
      </div>
    </div>
  `;
  const learningSearchRoundsHtml = renderLearningPipelineCollection(
    learningSearchRounds,
    item => `
      <div class="task-thinking-item">
        <strong>Round ${escapeHtml(String(item.round || '?'))}</strong><br>
        <span>${escapeHtml(item.intent || '未记录搜索意图')}</span><br>
        <span style="color:var(--text-3)">queries=${escapeHtml(String((item.queries || []).length))} · raw=${escapeHtml(String(item.raw_result_count ?? 0))} · candidates=${escapeHtml(String(item.candidate_count ?? 0))}</span>
      </div>
    `,
    '还没有记录搜索轮次。'
  );
  const learningSummaryHtml = String(knowledgeHarvestState.summary_markdown || '').trim()
    ? `<div class="markdown-content">${renderMarkdown(String(knowledgeHarvestState.summary_markdown || ''))}</div>`
    : '<div class="task-thinking-empty">还没有最终学习摘要。</div>';
  const learningPageHtml = `
    <div class="task-detail-page task-detail-page-compact">
      <div class="task-detail-panel task-detail-panel-full">
        <div class="task-detail-panel-header">
          <div class="task-detail-panel-title">📚 Learning Pipeline</div>
          <div style="font-size:11px;color:var(--text-3)">Discover → Ingest → Replay → Compression → Distillation → Curation → Vectorization</div>
        </div>
        <div class="task-detail-panel-body task-thinking-graph" data-scroll-key="learningPipeline">
          <section class="task-thinking-section">
            <div class="task-thinking-section-title">流水线概览</div>
            <div class="task-thinking-metrics">${learningMetricsHtml}</div>
          </section>
          <section class="task-thinking-section">
            <div class="task-thinking-section-title">学习配置</div>
            <div class="task-thinking-metrics">${learningConfigMetricsHtml}</div>
          </section>
          <section class="task-thinking-section">
            <div class="task-thinking-section-title">最终学习摘要</div>
            <div class="task-thinking-summary">${learningSummaryHtml}</div>
          </section>
          <section class="task-thinking-section">
            <div class="task-thinking-section-title">搜索轮次</div>
            <div class="task-thinking-stack compact">${learningSearchRoundsHtml}</div>
          </section>
          <section class="task-thinking-section">
            <div class="task-thinking-section-title">Discover 候选来源</div>
            <div class="task-thinking-stack compact">${learningDiscoveryHtml}</div>
          </section>
          <section class="task-thinking-section">
            <div class="task-thinking-section-title">来源文档</div>
            <div class="task-thinking-stack compact">${learningSourcesHtml}</div>
          </section>
          <section class="task-thinking-section">
            <div class="task-thinking-section-title">Replay Artifacts</div>
            <div class="task-thinking-stack compact">${learningReplayHtml}</div>
          </section>
          <section class="task-thinking-section">
            <div class="task-thinking-section-title">Compressed Traces</div>
            <div class="task-thinking-stack compact">${learningCompressionHtml}</div>
          </section>
          <section class="task-thinking-section">
            <div class="task-thinking-section-title">Pattern Cards</div>
            <div class="task-thinking-stack compact">${learningPatternsHtml}</div>
          </section>
          <section class="task-thinking-section">
            <div class="task-thinking-section-title">Curator Reviews</div>
            <div class="task-thinking-stack compact">${learningReviewsHtml}</div>
          </section>
          <section class="task-thinking-section">
            <div class="task-thinking-section-title">Vectorization</div>
            ${learningVectorHtml}
          </section>
        </div>
      </div>
    </div>
  `;

  const graphMetricsHtml = [
    ['当前节点', thinkingGraph.currentNode || '未记录'],
    ['轮次', thinkingGraph.roundIndex ? String(thinkingGraph.roundIndex) : '0'],
    ['任务模式', task.taskMode === 'luna_333' ? 'Luna-333 / 月天使' : 'Classic Agent'],
    ['求解器', getTaskSolverEngineLabel(task.solverEngine)],
    ['初始方案', getTaskSolverInitialStrategyLabel(task.solverInitialStrategy)],
    ['焦点', resolveTaskFocus(thinkingGraph, autonomousWorkflow)],
    ['工作流', thinkingGraph.workflowMode || 'thinking_graph'],
    ['更新时间', thinkingGraph.updatedAt ? (formatDateTime(thinkingGraph.updatedAt) || thinkingGraph.updatedAt) : '未记录'],
    ['工作空间', thinkingGraph.workspaceDir || workspaceLabel || '未记录'],
  ].map(([label, value]) => renderThinkingGraphMetric(label, value)).join('');
  const graphFocusHtml = renderThinkingGraphFocusCard(thinkingGraph, autonomousWorkflow);
  const graphCurrentActionHtml = renderThinkingGraphCurrentActionCard(thinkingGraph);
  const graphModeEnabled = isTaskThinkingGraphModeEnabled(task);
  // 所有求解器都支持思考图页面
  const thinkingGraphPage = activeThinkingGraphPage || 'overview';

  const graphSubtabsHtml = `
    <div class="task-thinking-subtabs">
      <button
        class="task-thinking-subtab ${thinkingGraphPage === 'overview' ? 'active' : ''}"
        type="button"
        onclick="setTaskThinkingGraphPage('${task.id}', 'overview')"
      >
        结构视图
      </button>
      <button
        class="task-thinking-subtab ${thinkingGraphPage === 'visual' ? 'active' : ''}"
        type="button"
        onclick="setTaskThinkingGraphPage('${task.id}', 'visual')"
      >
        图谱视图
      </button>
      <button
        class="task-thinking-subtab ${thinkingGraphPage === 'action' ? 'active' : ''}"
        type="button"
        onclick="setTaskThinkingGraphPage('${task.id}', 'action')"
      >
        行动图
      </button>
    </div>
  `;

  const hasGraphData = hasThinkingGraphData(task);
  
  const graphOverviewHtml = hasGraphData
    ? `
    <div class="task-thinking-graph">
      ${graphFocusHtml}
      ${graphCurrentActionHtml}
      <section class="task-thinking-section">
        <div class="task-thinking-section-title">图概览</div>
        <div class="task-thinking-metrics">${graphMetricsHtml}</div>
      </section>
      <section class="task-thinking-section">
        <div class="task-thinking-section-title">图摘要</div>
        <div class="task-thinking-summary">${escapeHtml(thinkingGraph.graphSummary || '当前还没有思考图摘要。')}</div>
      </section>
      ${renderThinkingGraphOrchestration(thinkingGraph)}
      ${renderThinkingGraphTextList('运行时新输入', thinkingGraph.runtimeInputs, '当前还没有注入到思考图的新输入。')}
      ${renderThinkingGraphTextList('已验证事实', thinkingGraph.facts, '当前还没有结构化事实。')}
      ${renderThinkingGraphHypotheses(thinkingGraph.hypotheses)}
      ${renderThinkingGraphTextList('已否定内容', thinkingGraph.rejectedItems, '当前还没有被明确否定或淘汰的内容。')}
      ${renderThinkingGraphBranches(thinkingGraph.branches)}
      ${renderThinkingGraphTextList('未解问题', thinkingGraph.openQuestions, '当前没有挂起问题。')}
      ${renderThinkingGraphExecutions(thinkingGraph.executions)}
      <section class="task-thinking-section">
        <div class="task-thinking-section-title">检查点文件</div>
        <div class="task-thinking-summary">${escapeHtml(thinkingGraph.checkpointPath || '尚未生成 checkpoint 文件。')}</div>
      </section>
      <section class="task-thinking-section">
        <div class="task-thinking-section-title">最近工具</div>
        <div class="task-thinking-stack">
          <div class="task-thinking-entity">
            <div class="task-thinking-entity-head">
              <div class="task-thinking-entity-title">${escapeHtml(thinkingGraph.lastTool || '尚未记录工具动作')}</div>
              ${thinkingGraph.terminationReason ? '<div class="task-thinking-chip status-resolved">收束</div>' : ''}
            </div>
            ${thinkingGraph.lastToolArguments ? `
              <div class="task-thinking-subsection">
                <div class="task-thinking-subtitle">参数</div>
                <pre class="task-thinking-code">${escapeHtml(thinkingGraph.lastToolArguments)}</pre>
              </div>
            ` : ''}
            ${thinkingGraph.lastToolResult ? `
              <div class="task-thinking-subsection">
                <div class="task-thinking-subtitle">结果</div>
                <pre class="task-thinking-code">${escapeHtml(thinkingGraph.lastToolResult)}</pre>
              </div>
            ` : ''}
          </div>
        </div>
      </section>
      <section class="task-thinking-section">
        <div class="task-thinking-section-title">收束信息</div>
        <div class="task-thinking-summary">${escapeHtml(thinkingGraph.terminationReason || '当前还没有收束原因。')}</div>
        ${thinkingGraph.finalAnswer ? `
          <div class="task-thinking-subsection" style="margin-top:12px;">
            <div class="task-thinking-subtitle">最终结论快照</div>
            <pre class="task-thinking-code">${escapeHtml(thinkingGraph.finalAnswer)}</pre>
          </div>
        ` : ''}
      </section>
    </div>
  `
  : `
    <div class="task-thinking-graph">
      <section class="task-thinking-section">
        <div class="task-thinking-empty" style="padding: 48px 24px; text-align: center;">
          <div style="font-size: 48px; margin-bottom: 16px;">🕸</div>
          <div style="font-size: 16px; font-weight: 600; color: var(--text); margin-bottom: 8px;">尚未生成思考图</div>
          <div style="font-size: 13px; color: var(--text-muted); line-height: 1.6;">
            当前任务使用的是 ${getTaskSolverEngineLabel(task.solverEngine)} 求解器，<br>
            暂时还没有产生思考图数据。任务运行后相关内容会在这里显示。
          </div>
        </div>
      </section>
    </div>
  `;

  const shouldRenderThinkingGraphVisual = effectiveActiveTab === 'graph' && thinkingGraphPage === 'visual' && graphModeEnabled;
  const graphVisualHtml = shouldRenderThinkingGraphVisual
    ? hasGraphData
      ? `
          ${graphFocusHtml}
          ${graphCurrentActionHtml}
          ${renderThinkingGraphVisual(thinkingGraph, {
            taskId: task.id,
            zoom: thinkingGraphZoom,
          })}
        `
      : `
          <div class="task-thinking-graph" style="padding: 48px 24px; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 16px;">🕸</div>
            <div style="font-size: 16px; font-weight: 600; color: var(--text); margin-bottom: 8px;">尚未生成思考图</div>
            <div style="font-size: 13px; color: var(--text-muted); line-height: 1.6;">
              当前任务使用的是 ${getTaskSolverEngineLabel(task.solverEngine)} 求解器，<br>
              暂时还没有产生思考图数据。任务运行后图谱会在这里显示。
            </div>
          </div>
        `
    : '';
  const graphActionHtml = effectiveActiveTab === 'graph' && thinkingGraphPage === 'action'
    ? renderTaskActionGraph({
        task,
        thinkingGraph,
        autonomousWorkflow,
        filesLabel,
        modulesLabel,
        workspaceLabel,
      })
    : '';

  const graphPageHtml = `
    <div class="task-detail-page task-detail-page-compact">
      <div class="task-detail-panel task-detail-panel-full">
        <div class="task-detail-panel-header">
          <div class="task-detail-panel-title">🕸 思考图</div>
          <div style="display:flex;align-items:center;gap:10px;">
            <button class="task-btn primary" type="button" onclick="event.stopPropagation();exportTaskThinkingResult('${task.id}')">导出思考</button>
            <div style="font-size:11px;color:var(--text-3)">${thinkingGraph.updatedAt ? escapeHtml(formatDateTime(thinkingGraph.updatedAt) || thinkingGraph.updatedAt) : '等待图状态落盘'}</div>
          </div>
        </div>
        ${graphSubtabsHtml}
        <div
          class="task-detail-panel-body ${activeThinkingGraphPage === 'visual' ? 'task-thinking-visual-body' : 'task-thinking-graph'}"
          data-scroll-key="${
            activeThinkingGraphPage === 'visual'
              ? 'thinkingGraphVisual'
              : thinkingGraphPage === 'action'
                ? 'thinkingGraphAction'
                : 'thinkingGraphOverview'
          }"
        >
          ${thinkingGraphPage === 'visual' ? graphVisualHtml : thinkingGraphPage === 'action' ? graphActionHtml : graphOverviewHtml}
        </div>
      </div>
    </div>
  `;

  const swarmMetricsHtml = [
    ['任务模式', task.taskMode === 'luna_333' ? 'Luna-333 / 月天使' : 'Classic Agent'],
    ['求解器', getTaskSolverEngineLabel(task.solverEngine)],
    ['初始方案', getTaskSolverInitialStrategyLabel(task.solverInitialStrategy)],
    ['数量策略', swarmSubagentAutoEnabled ? 'LLM 自动决定' : '固定建议值'],
    ['子 Agent 下限', String(task.swarmSubagentCountMin ?? '-')],
    ['子 Agent 建议值', String(task.swarmSubagentCountSuggested ?? '-')],
    ['子 Agent 上限', String(task.swarmSubagentCountMax ?? '-')],
    ['实例数', String(swarmRuns.length)],
    ['运行中', String(swarmRuns.filter(item => item.status === 'running').length)],
    ['已结束', String(swarmRuns.filter(item => item.destroyedAt).length)],
    ['执行模式', task.executionMode === 'swarm' ? 'thinking_graph_swarm' : 'single'],
  ].map(([label, value]) => renderThinkingGraphMetric(label, value)).join('');

  const swarmPageHtml = `
    <div class="task-detail-page task-detail-page-compact">
      <div class="task-detail-panel task-detail-panel-full">
        <div class="task-detail-panel-header">
          <div class="task-detail-panel-title">🐝 Swarm 输出</div>
          <div style="font-size:11px;color:var(--text-3)">展示每次并行分支尝试对应的 swarm 实例生命周期</div>
        </div>
        <div class="task-detail-panel-body task-thinking-graph" data-scroll-key="swarmRuns">
          <section class="task-thinking-section">
            <div class="task-thinking-section-title">Swarm 概览</div>
            <div class="task-thinking-metrics">${swarmMetricsHtml}</div>
          </section>
          <section class="task-thinking-section">
            <div class="task-thinking-section-title">实例列表</div>
            ${renderSwarmRuns(task.id, swarmRuns)}
          </section>
        </div>
      </div>
    </div>
  `;

  // Render the continuation input panel that injects extra user guidance into later runs.
  const newInputHistoryHtml = newInputHistory.length
    ? newInputHistory.map(item => `
        <div class="task-new-input-history-item">
          <div class="task-new-input-history-time">${escapeHtml(formatDateTime(item.usedAt) || item.usedAt)}</div>
          <div>${escapeHtml(item.content)}</div>
        </div>
      `).join('')
    : '<div class="task-log-entry task-log-entry-empty">还没有被任务消费过的新输入。</div>';

  const newInputPanelHtml = `
    <div class="task-new-input-panel">
      <div class="task-new-input-head">
        <div>
          <div class="task-detail-panel-title">✍️ 新输入</div>
          <div class="task-new-input-subtitle">继续或重试任务时，会把这里的内容注入本轮上下文。</div>
        </div>
        <button class="task-btn" type="button" onclick="onTaskSaveNewInput('${task.id}')">保存新输入</button>
      </div>
      ${newInputFeedback ? `
        <div class="task-new-input-feedback ${newInputFeedback.type === 'error' ? 'is-error' : 'is-success'}">
          <div class="task-new-input-feedback-title">${newInputFeedback.type === 'error' ? '保存失败' : '已保存'}</div>
          <div class="task-new-input-feedback-message">${escapeHtml(newInputFeedback.message)}</div>
          <div class="task-new-input-feedback-time">${escapeHtml(formatDateTime(newInputFeedback.updatedAt) || newInputFeedback.updatedAt || '')}</div>
        </div>
      ` : ''}
      <textarea
        class="form-input task-new-input-textarea"
        placeholder="输入新的提示、线索、已知结果或想让 Agent 优先验证的方向..."
        oninput="onTaskNewInputDraftChange('${task.id}', this.value)"
      >${escapeHtml(pendingNewInput)}</textarea>
      <div class="task-new-input-history" data-scroll-key="newInputHistory">
        ${newInputHistoryHtml}
      </div>
    </div>
  `;
  
  // Choose the active detail page and keep the footer actions outside tab-specific content.
  return `
    ${tabsHtml}
    ${effectiveActiveTab === 'llm'
      ? llmPageHtml
      : effectiveActiveTab === 'context'
        ? contextPageHtml
      : effectiveActiveTab === 'learning'
        ? learningPageHtml
      : effectiveActiveTab === 'graph'
          ? graphPageHtml
          : effectiveActiveTab === 'swarm' && task.executionMode === 'swarm'
            ? swarmPageHtml
            : progressPageHtml}
    ${newInputPanelHtml}
    <div class="task-detail-panel task-detail-panel-actions">
      <div class="task-detail-panel-body">
        <div class="task-actions" style="justify-content:flex-end">
          ${editButton}
          ${actionButtons || '<span style="color:var(--text-3);font-size:12px">当前状态下没有可执行操作</span>'}
        </div>
      </div>
    </div>
  `;
}

function renderTaskActionButtons(task, options = {}) {
  const { fromCard = false } = options;
  const stopPropagationPrefix = fromCard ? 'event.stopPropagation();' : '';
  const isAgentTask = task.type !== 'Scan';
  const statusKey = getTaskStatusKey(task);

  if (statusKey === 'running') {
    return `<button class="task-btn danger" onclick="${stopPropagationPrefix}onTaskStopById('${task.id}')">中止</button>`;
  }

  if (statusKey === 'idle') {
    return `<button class="task-btn primary" onclick="${stopPropagationPrefix}onTaskStartById('${task.id}')">开始</button>`;
  }

  if (!isAgentTask) {
    return '';
  }

  if (statusKey === 'done' || statusKey === 'error' || statusKey === 'canceled') {
    return `
      <button class="task-btn" onclick="${stopPropagationPrefix}onTaskContinueById('${task.id}')">继续</button>
      <button class="task-btn" onclick="${stopPropagationPrefix}onTaskRetryById('${task.id}')">重试</button>
    `;
  }

  return '';
}

function renderLlmOutputPager(taskId, outputs, activeOutputIndex) {
  if (!outputs.length) return '';

  const chips = outputs.map((output, index) => `
    <button
      class="llm-page-chip ${index === activeOutputIndex ? 'active' : ''}"
      onclick="setTaskDetailOutputPage('${taskId}', ${index})"
      type="button"
    >
      <span class="llm-page-chip-index">${index + 1}</span>
      <span class="llm-page-chip-label">${escapeHtml(output.title)}</span>
    </button>
  `).join('');

  return `
    <div class="llm-page-toolbar">
      <button
        class="llm-page-nav"
        type="button"
        onclick="setTaskDetailOutputPage('${taskId}', ${activeOutputIndex - 1})"
        ${activeOutputIndex <= 0 ? 'disabled' : ''}
      >
        上一页
      </button>
      <div class="llm-page-track">${chips}</div>
      <div class="llm-page-status">${activeOutputIndex + 1} / ${outputs.length}</div>
      <button
        class="llm-page-nav"
        type="button"
        onclick="setTaskDetailOutputPage('${taskId}', ${activeOutputIndex + 1})"
        ${activeOutputIndex >= outputs.length - 1 ? 'disabled' : ''}
      >
        下一页
      </button>
    </div>
  `;
}

function exportTaskLlmOutput(taskId) {
  const task = latestTaskPayload.find(item => item.id === taskId);
  if (!task) return;

  const outputs = collectFormalOutputs(task.logs);
  if (!outputs.length) {
    addLog('warn', `任务 ${taskId} 当前没有可导出的 LLM 输出`);
    return;
  }

  const activeOutputIndex = resolveActiveOutputIndex(taskId, outputs.length);
  const activeOutput = outputs[activeOutputIndex];
  const sanitizedTitle = String(activeOutput.title || 'llm-output')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80);
  const filename = `${taskId}-${sanitizedTitle || 'llm-output'}.md`;
  const blob = new Blob([activeOutput.content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  addLog('ok', `任务 ${taskId} 的 LLM 输出已导出为 ${filename}`);
}

/**
 * 切换手风琴折叠状态
 */
function toggleAccordion(id) {
  const body = document.getElementById(id);
  const icon = document.getElementById(id + '-icon');
  if (!body || !icon) return;
  
  const isCollapsed = body.classList.toggle('collapsed');
  icon.textContent = isCollapsed ? '▶' : '▼';
  icon.style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(0deg)';
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
 * 使用引用计数，支持嵌套调用（如同时打开详情和日志浮窗）。
 */
function getTaskRefreshLockFloor() {
  const modalIds = ['taskDetailModal', 'logPanelModal', 'thinkingGraphModal', 'swarmRunModal'];
  return modalIds.reduce((count, modalId) => {
    const modal = document.getElementById(modalId);
    return count + (modal?.classList?.contains('show') ? 1 : 0);
  }, 0);
}

function pauseTaskRefresh() {
  taskRefreshPauseDepth++;
  taskRefreshPauseDepth = Math.max(taskRefreshPauseDepth, getTaskRefreshLockFloor());
  isTaskRefreshPaused = taskRefreshPauseDepth > 0;
  document.body.classList.toggle('task-refresh-paused', isTaskRefreshPaused);
}

/**
 * 恢复任务列表自动重绘，并应用拖动期间积压的最新任务快照。
 */
function resumeTaskRefresh() {
  taskRefreshPauseDepth = Math.max(0, taskRefreshPauseDepth - 1);
  taskRefreshPauseDepth = Math.max(taskRefreshPauseDepth, getTaskRefreshLockFloor());
  isTaskRefreshPaused = taskRefreshPauseDepth > 0;
  document.body.classList.toggle('task-refresh-paused', isTaskRefreshPaused);

  if (!isTaskRefreshPaused && queuedTaskPayload) {
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
