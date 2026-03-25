const apiBase = window.APP_CONFIG.apiBaseUrl.replace(/\/$/, '');
const summaryCards = document.getElementById('summaryCards');
const projectRows = document.getElementById('projectRows');
const workloadList = document.getElementById('workloadList');
const heatmapList = document.getElementById('heatmapList');
const approvalList = document.getElementById('approvalList');
const kanbanBoard = document.getElementById('kanbanBoard');
const projectForm = document.getElementById('projectForm');
const formStatus = document.getElementById('formStatus');

async function fetchJson(path, options = {}) {
  const res = await fetch(`${apiBase}${path}`, {
    headers: { 'content-type': 'application/json' },
    ...options
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function loadSummary() {
  const { data } = await fetchJson('/api/dashboard/summary');
  summaryCards.innerHTML = [
    card('Active Projects', data.activeProjects),
    card('Overdue Tasks', data.overdueTasks),
    card('Pending Approvals', data.pendingApprovals),
    card('Open Risks', data.openRisks),
    card('Open Blockers', data.openBlockers),
    card('Red Projects', data.redProjects)
  ].join('');
}

async function loadProjects() {
  const { data } = await fetchJson('/api/projects');
  projectRows.innerHTML = data.map(p => `
    <tr>
      <td>${escapeHtml(p.code)}</td>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.customer_name || '')}</td>
      <td>${escapeHtml(p.stage || '')}</td>
      <td><span class="badge badge-${escapeHtml(p.status)}">${escapeHtml(p.status)}</span></td>
      <td><span class="health health-${escapeHtml(p.health_status || 'green')}">${escapeHtml((p.health_status || 'green').toUpperCase())} ${escapeHtml(String(p.health_score ?? ''))}</span><div class="subtext">${escapeHtml(p.health_reason || '')}</div></td>
      <td>${escapeHtml(p.due_date || '')}</td>
      <td>${escapeHtml(p.owner_name || '')}</td>
    </tr>
  `).join('');
}

async function loadWorkload() {
  const { data } = await fetchJson('/api/dashboard/workload');
  workloadList.innerHTML = data.map(item => `
    <div class="list-item">
      <div><strong>${escapeHtml(item.display_name)}</strong></div>
      <div class="subtext">Open: ${escapeHtml(String(item.open_tasks))} • Overdue: ${escapeHtml(String(item.overdue_tasks))} • Pending approvals: ${escapeHtml(String(item.pending_approvals))}</div>
    </div>
  `).join('');
}

async function loadHeatmap() {
  const { data } = await fetchJson('/api/dashboard/heatmap');
  heatmapList.innerHTML = data.map(item => `
    <div class="list-item heat-${escapeHtml(item.health_status)}">
      <div><strong>${escapeHtml(item.code)}</strong> — ${escapeHtml(item.name)}</div>
      <div class="subtext">Stage: ${escapeHtml(item.stage)} • Health: ${escapeHtml(item.health_status.toUpperCase())} ${escapeHtml(String(item.health_score))} • Risks: ${escapeHtml(String(item.open_risks))} • Blockers: ${escapeHtml(String(item.open_blockers))}</div>
    </div>
  `).join('');
}

async function loadApprovals() {
  const { data } = await fetchJson('/api/approvals/pending');
  approvalList.innerHTML = data.map(item => `
    <div class="list-item approval-item">
      <div><strong>#${escapeHtml(String(item.id))}</strong> ${escapeHtml(item.title)}</div>
      <div class="subtext">${escapeHtml(item.code)} • expires ${escapeHtml(item.expires_at || 'n/a')}</div>
      <div class="actions-inline">
        <button data-id="${escapeHtml(String(item.id))}" data-status="approved">Approve</button>
        <button data-id="${escapeHtml(String(item.id))}" data-status="rejected">Reject</button>
      </div>
    </div>
  `).join('') || '<div class="list-item">No pending approvals.</div>';
}

async function loadKanban() {
  const projectData = await fetchJson('/api/projects');
  const firstProject = projectData.data?.[0];
  if (!firstProject) {
    kanbanBoard.innerHTML = '<div class="kanban-column"><h3>No data</h3></div>';
    return;
  }
  const detail = await fetchJson(`/api/projects/${firstProject.id}`);
  const buckets = ['backlog', 'in_progress', 'review', 'blocked', 'done'];
  kanbanBoard.innerHTML = buckets.map(bucket => {
    const items = detail.data.tasks.filter(t => (t.bucket || '').toLowerCase() === bucket);
    return `
      <div class="kanban-column">
        <h3>${escapeHtml(bucket.replace('_', ' ').toUpperCase())}</h3>
        ${items.map(item => `<div class="kanban-card"><strong>${escapeHtml(item.title)}</strong><div class="subtext">${escapeHtml(item.status)} • ${escapeHtml(item.assignee_name || '')} • due ${escapeHtml(item.due_date || 'n/a')}</div></div>`).join('') || '<div class="kanban-card empty">No items</div>'}
      </div>
    `;
  }).join('');
}

function card(label, value) {
  return `<article class="card"><div class="card-label">${escapeHtml(label)}</div><div class="card-value">${escapeHtml(String(value))}</div></article>`;
}

function escapeHtml(str) {
  return String(str).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

projectForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(projectForm).entries());
  try {
    formStatus.textContent = 'Submitting...';
    await fetchJson('/api/projects', { method: 'POST', body: JSON.stringify(payload) });
    formStatus.textContent = 'Project created successfully.';
    projectForm.reset();
    await refreshAll();
  } catch (err) {
    formStatus.textContent = err.message;
  }
});

approvalList.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;
  const payload = { status: btn.dataset.status, actor_source: 'web' };
  try {
    await fetchJson(`/api/approvals/${btn.dataset.id}/decision`, { method: 'POST', body: JSON.stringify(payload) });
    await refreshAll();
  } catch (err) {
    formStatus.textContent = err.message;
  }
});

async function refreshAll() {
  await Promise.all([loadSummary(), loadProjects(), loadWorkload(), loadHeatmap(), loadApprovals(), loadKanban()]);
}

document.getElementById('refreshBtn').addEventListener('click', refreshAll);
refreshAll().catch(err => { formStatus.textContent = err.message; });
