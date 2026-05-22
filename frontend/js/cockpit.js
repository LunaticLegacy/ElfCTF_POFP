let cockpitJobs = [];
let activeCockpitJobId = '';
let knowledgeItems = [];
let activeKnowledgeId = '';
let activeKnowledgeTab = 'approved';

function getActiveCockpitJobRecord() {
  if (!activeCockpitJobId) return null;
  return cockpitJobs.find(job => job.id === activeCockpitJobId) || null;
}

function upsertCockpitJob(job) {
  if (!job || !job.id) return;
  const index = cockpitJobs.findIndex(item => item.id === job.id);
  if (index >= 0) {
    cockpitJobs[index] = { ...cockpitJobs[index], ...job };
  } else {
    cockpitJobs.unshift(job);
  }
}

function renderCockpitJobMetrics(job, stdout = '', stderr = '') {
  if (!job) return;
  document.getElementById('cockpitMetrics').innerHTML = [
    ['任务 ID', job.id],
    ['状态', job.status],
    ['PID', job.pid ?? '未知'],
    ['任务上下文', job.task_id || 'global'],
    ['开始时间', job.started_at || job.created_at],
    ['返回码', job.returncode ?? '运行中'],
  ].map(([label, value]) => `
    <div class="detail-metric">
      <div class="detail-metric-label">${escapeHtml(label)}</div>
      <div class="detail-metric-value">${escapeHtml(String(value))}</div>
    </div>
  `).join('');
  document.getElementById('cockpitStdout').textContent = stdout || '暂无 stdout';
  document.getElementById('cockpitStderr').textContent = stderr || '暂无 stderr';
}

function openCockpitModal() {
  if (!ensureAuthenticated()) return;
  document.getElementById('cockpitModal')?.classList.add('show');
  refreshCockpitJobs();
  refreshCockpitTaskOptions();
}

function closeCockpitModal(event) {
  if (!event || event.target === document.getElementById('cockpitModal')) {
    document.getElementById('cockpitModal')?.classList.remove('show');
  }
}

function refreshCockpitTaskOptions() {
  const select = document.getElementById('cockpitTaskSelect');
  if (!select) return;
  const options = ['<option value="">无任务上下文（全局）</option>'];
  latestTaskPayload.forEach(task => {
    options.push(`<option value="${escapeHtml(task.id)}">${escapeHtml(task.name)} [${escapeHtml(task.type)}]</option>`);
  });
  select.innerHTML = options.join('');
}

async function refreshCockpitJobs() {
  const result = await apiRequest(`${API_BASE}/background-jobs`);
  if (!result.success || !Array.isArray(result.data)) {
    addLog('warn', `Cockpit 刷新失败: ${result.message}`);
    return;
  }
  cockpitJobs = result.data;
  renderCockpitJobs();
  if (activeCockpitJobId) {
    const activeJob = getActiveCockpitJobRecord();
    await loadCockpitJobDetail(activeCockpitJobId, activeJob?.task_id || '');
  }
}

function renderCockpitJobs() {
  const container = document.getElementById('cockpitJobList');
  if (!container) return;
  if (!cockpitJobs.length) {
    container.innerHTML = '<div class="panel-subtitle">当前没有后台任务。</div>';
    return;
  }
  container.innerHTML = cockpitJobs.map(job => `
    <div class="cockpit-item ${job.id === activeCockpitJobId ? 'active' : ''}" onclick="loadCockpitJobDetail('${escapeHtml(job.id)}')">
      <div class="cockpit-item-title">${escapeHtml(job.name || job.command)}</div>
      <div><span class="status-chip ${escapeHtml(job.status)}">${escapeHtml(job.status)}</span></div>
      <div class="cockpit-item-meta">${escapeHtml(job.id)} · ${escapeHtml(job.task_id || 'global')}</div>
      <div class="cockpit-item-meta">${escapeHtml(job.command)}</div>
    </div>
  `).join('');
}

async function startCockpitJob() {
  const name = document.getElementById('cockpitJobName')?.value.trim() || '';
  const command = document.getElementById('cockpitCommand')?.value.trim() || '';
  const taskId = document.getElementById('cockpitTaskSelect')?.value || '';
  if (!command) {
    addLog('warn', '请输入后台命令');
    return;
  }
  const result = await apiRequest(`${API_BASE}/background-jobs`, {
    method: 'POST',
    body: JSON.stringify({ name, command, taskId, interactive: true }),
  });
  if (!result.success) {
    addLog('err', `后台任务启动失败: ${result.message}`);
    return;
  }
  addLog('ok', `后台任务已启动: ${result.data.id}`);
  document.getElementById('cockpitCommand').value = '';
  await refreshCockpitJobs();
  await loadCockpitJobDetail(result.data.id);
}

async function loadCockpitJobDetail(jobId, taskId = '') {
  activeCockpitJobId = jobId;
  renderCockpitJobs();
  const resolvedTaskId = taskId || getActiveCockpitJobRecord()?.task_id || '';
  const query = resolvedTaskId ? `?task_id=${encodeURIComponent(resolvedTaskId)}` : '';
  const result = await apiRequest(`${API_BASE}/background-jobs/${encodeURIComponent(jobId)}${query}`);
  if (!result.success || !result.data) {
    addLog('warn', `读取后台任务失败: ${result.message}`);
    return;
  }
  const { job, stdout, stderr } = result.data;
  upsertCockpitJob(job);
  renderCockpitJobs();
  renderCockpitJobMetrics(job, stdout, stderr);
}

async function sendCockpitInput() {
  if (!activeCockpitJobId) {
    addLog('warn', '请先选择后台任务');
    return;
  }
  const activeJob = getActiveCockpitJobRecord();
  const input = document.getElementById('cockpitInput')?.value || '';
  if (!input.trim()) {
    addLog('warn', '请输入要发送的内容');
    return;
  }
  const result = await apiRequest(`${API_BASE}/background-jobs/${encodeURIComponent(activeCockpitJobId)}/input`, {
    method: 'POST',
    body: JSON.stringify({ input, appendNewline: true, taskId: activeJob?.task_id || '' }),
  });
  if (!result.success) {
    addLog('err', `发送后台输入失败: ${result.message}`);
    return;
  }
  document.getElementById('cockpitInput').value = '';
  await loadCockpitJobDetail(activeCockpitJobId, activeJob?.task_id || '');
}

async function stopCockpitJob(force = false) {
  if (!activeCockpitJobId) {
    addLog('warn', '请先选择后台任务');
    return;
  }
  const activeJob = getActiveCockpitJobRecord();
  const result = await apiRequest(`${API_BASE}/background-jobs/${encodeURIComponent(activeCockpitJobId)}/stop`, {
    method: 'POST',
    body: JSON.stringify({ force, taskId: activeJob?.task_id || '' }),
  });
  if (!result.success) {
    addLog('err', `停止后台任务失败: ${result.message}`);
    return;
  }
  const jobLabel = activeJob?.name || activeCockpitJobId;
  upsertCockpitJob(result.data);
  renderCockpitJobs();
  renderCockpitJobMetrics(
    { ...(activeJob || {}), ...result.data },
    document.getElementById('cockpitStdout')?.textContent || '',
    document.getElementById('cockpitStderr')?.textContent || '',
  );
  addLog('ok', `${force ? '已强制停止' : '已停止'}后台任务: ${jobLabel} (${activeCockpitJobId})`);
  await refreshCockpitJobs();
  await loadCockpitJobDetail(activeCockpitJobId, activeJob?.task_id || '');
}

function openKnowledgeModal() {
  if (!ensureAuthenticated()) return;
  document.getElementById('knowledgeModal')?.classList.add('show');
  refreshKnowledgeList();
}

function closeKnowledgeModal(event) {
  if (!event || event.target === document.getElementById('knowledgeModal')) {
    document.getElementById('knowledgeModal')?.classList.remove('show');
  }
}

function switchKnowledgeTab(status) {
  activeKnowledgeTab = status;
  document.getElementById('knowledgeTabApproved')?.classList.toggle('active', status === 'approved');
  document.getElementById('knowledgeTabPending')?.classList.toggle('active', status === 'pending');
  document.getElementById('knowledgeTabRejected')?.classList.toggle('active', status === 'rejected');
  refreshKnowledgeList();
}

async function refreshKnowledgeList() {
  const result = await apiRequest(`${API_BASE}/knowledge/reviews?status=${encodeURIComponent(activeKnowledgeTab)}`);
  if (!result.success || !Array.isArray(result.data)) {
    addLog('warn', `知识列表刷新失败: ${result.message}`);
    return;
  }
  knowledgeItems = result.data;
  renderKnowledgeList();
  if (activeKnowledgeId) {
    await loadKnowledgeDetail(activeKnowledgeId);
  }
}

function renderKnowledgeList() {
  const container = document.getElementById('knowledgeList');
  if (!container) return;
  if (!knowledgeItems.length) {
    container.innerHTML = '<div class="panel-subtitle">当前标签下暂无知识记录。</div>';
    return;
  }
  container.innerHTML = knowledgeItems.map(item => `
    <div class="knowledge-item ${item.id === activeKnowledgeId ? 'active' : ''}" onclick="loadKnowledgeDetail('${escapeHtml(item.id)}')">
      <div class="knowledge-item-title">${escapeHtml(item.title)}</div>
      <div><span class="status-chip ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></div>
      <div class="knowledge-item-meta">${escapeHtml(item.task_id)} · ${escapeHtml(item.task_type)}</div>
      <div class="knowledge-item-meta">${escapeHtml(normalizeKnowledgeSummary(item.summary || ''))}</div>
    </div>
  `).join('');
}

function normalizeBrokenKnowledgeMarkdown(markdown) {
  const content = String(markdown || '').replace(/\r\n/g, '\n');
  if (!content.trim()) {
    return '';
  }
  return content
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (/^[-*]\s+(#{1,6}\s+)/.test(trimmed)) {
        return line.replace(/^(\s*)[-*]\s+/, '$1');
      }
      if (/^[-*]\s+\|.*\|\s*$/.test(trimmed)) {
        return line.replace(/^(\s*)[-*]\s+/, '$1');
      }
      return line;
    })
    .join('\n');
}

function normalizeKnowledgeSummary(summary) {
  return String(summary || '')
    .replace(/\s*[；;]\s*/g, '；')
    .split('；')
    .map(item => item.trim())
    .filter(item => item && !/^(#{1,6}\s+|\|.*\|\s*$)/.test(item))
    .slice(0, 3)
    .join('；');
}

function renderKnowledgeMarkdown(markdown, emptyText) {
  const content = normalizeBrokenKnowledgeMarkdown(markdown).trim();
  if (!content) {
    return `<div class="knowledge-markdown-empty">${escapeHtml(emptyText)}</div>`;
  }
  if (typeof renderMarkdown === 'function') {
    return `<div class="markdown-content">${renderMarkdown(content)}</div>`;
  }
  return `<pre class="knowledge-markdown-fallback">${escapeHtml(content)}</pre>`;
}

async function loadKnowledgeDetail(reviewId) {
  activeKnowledgeId = reviewId;
  renderKnowledgeList();
  const result = await apiRequest(`${API_BASE}/knowledge/reviews/${encodeURIComponent(reviewId)}`);
  if (!result.success || !result.data) {
    addLog('warn', `读取知识详情失败: ${result.message}`);
    return;
  }
  const item = result.data;
  document.getElementById('knowledgeMetrics').innerHTML = [
    ['标题', item.title],
    ['状态', item.status],
    ['来源任务', `${item.task_name} (${item.task_id})`],
    ['题型', item.task_type],
    ['入库路径', item.kb_path || '尚未入库'],
    ['更新时间', item.updated_at],
  ].map(([label, value]) => `
    <div class="detail-metric">
      <div class="detail-metric-label">${escapeHtml(label)}</div>
      <div class="detail-metric-value">${escapeHtml(String(value))}</div>
    </div>
  `).join('');
  document.getElementById('knowledgeContent').innerHTML = renderKnowledgeMarkdown(
    item.final_markdown || item.preview_markdown,
    '暂无内容'
  );
  document.getElementById('knowledgeReviewContent').innerHTML = renderKnowledgeMarkdown(
    item.review_markdown,
    '暂无审核单'
  );
  document.getElementById('knowledgeReviewNotes').value = item.review_notes || '';
}

async function approveKnowledgeReview() {
  if (!activeKnowledgeId) {
    addLog('warn', '请先选择知识记录');
    return;
  }
  const reviewNotes = document.getElementById('knowledgeReviewNotes')?.value || '';
  const result = await apiRequest(`${API_BASE}/knowledge/reviews/${encodeURIComponent(activeKnowledgeId)}/approve`, {
    method: 'POST',
    body: JSON.stringify({ reviewNotes }),
  });
  if (!result.success) {
    addLog('err', `批准入库失败: ${result.message}`);
    return;
  }
  addLog('ok', `知识已入库: ${result.data.kb_path}`);
  await refreshKnowledgeList();
  await loadKnowledgeDetail(activeKnowledgeId);
}

async function rejectKnowledgeReview() {
  if (!activeKnowledgeId) {
    addLog('warn', '请先选择知识记录');
    return;
  }
  const reviewNotes = document.getElementById('knowledgeReviewNotes')?.value || '';
  const result = await apiRequest(`${API_BASE}/knowledge/reviews/${encodeURIComponent(activeKnowledgeId)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reviewNotes }),
  });
  if (!result.success) {
    addLog('err', `拒绝知识草稿失败: ${result.message}`);
    return;
  }
  addLog('ok', `知识草稿已拒绝: ${activeKnowledgeId}`);
  activeKnowledgeTab = 'rejected';
  switchKnowledgeTab('rejected');
  await loadKnowledgeDetail(activeKnowledgeId);
}
