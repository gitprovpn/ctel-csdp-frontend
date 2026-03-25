(function () {
  "use strict";

  const API_BASE =
    (window.APP_CONFIG && window.APP_CONFIG.apiBaseUrl
      ? String(window.APP_CONFIG.apiBaseUrl)
      : "").replace(/\/+$/, "");

  const SELECTORS = {
    summary: {
      total: "#total-projects",
      onTrack: "#on-track",
      atRisk: "#at-risk",
      delayed: "#delayed",
      blocked: "#blocked",
      avgHealth: "#avg-health-score",
    },
    projects: "#project-list",
    workload: "#workload-list",
    heatmap: "#heatmap-list",
    approvals: "#approval-list",
    kanban: "#kanban-board",
    status: "#app-status",
    refreshButtons: '[data-action="refresh"]',
    createProjectForm: "#create-project-form",
    createProjectButton: "#create-project-btn",
    createProjectMessage: "#create-project-message",
    overviewPanel: ".section.grid.two-col-equal .panel:last-child .panel-body",
  };

  function $(selector) {
    return document.querySelector(selector);
  }

  function $all(selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function safeText(value, fallback = "-") {
    if (value === null || value === undefined || value === "") return fallback;
    return String(value);
  }

  function formatNumber(value, fallback = "0") {
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : fallback;
  }

  function formatDate(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString("vi-VN");
  }

  function getStatusClass(status) {
    const s = String(status || "").toLowerCase();
    if (s === "blocked") return "status-blocked";
    if (s === "delayed") return "status-delayed";
    if (s === "at_risk") return "status-at-risk";
    return "status-on-track";
  }

  function setStatus(message, type = "info") {
    const el = $(SELECTORS.status);
    if (!el) return;
    el.textContent = message || "";
    el.dataset.state = type;
  }

  async function fetchJson(path, options = {}) {
    if (!API_BASE) {
      throw new Error("Thiếu APP_CONFIG.apiBaseUrl trong config.js");
    }

    const url = `${API_BASE}${path}`;
    const method = options.method || "GET";
    const headers = {
      ...(options.headers || {}),
    };

    let body;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    const response = await fetch(url, {
      method,
      headers,
      body,
    });

    const raw = await response.text();
    let data = null;

    try {
      data = raw ? JSON.parse(raw) : null;
    } catch (err) {
      throw new Error(`API không trả JSON hợp lệ (${response.status}): ${raw}`);
    }

    if (!response.ok) {
      const apiError =
        (data && typeof data === "object" && (data.error || data.message)) ||
        `HTTP ${response.status}`;
      throw new Error(apiError);
    }

    return data;
  }

  function renderEmpty(el, message) {
    if (!el) return;
    el.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  function renderSummary(summary) {
    const data = asObject(summary);

    const totalEl = $(SELECTORS.summary.total);
    const onTrackEl = $(SELECTORS.summary.onTrack);
    const atRiskEl = $(SELECTORS.summary.atRisk);
    const delayedEl = $(SELECTORS.summary.delayed);
    const blockedEl = $(SELECTORS.summary.blocked);
    const avgHealthEl = $(SELECTORS.summary.avgHealth);

    if (totalEl) totalEl.textContent = formatNumber(data.total_projects, "0");
    if (onTrackEl) onTrackEl.textContent = formatNumber(data.on_track, "0");
    if (atRiskEl) atRiskEl.textContent = formatNumber(data.at_risk, "0");
    if (delayedEl) delayedEl.textContent = formatNumber(data.delayed, "0");
    if (blockedEl) blockedEl.textContent = formatNumber(data.blocked, "0");
    if (avgHealthEl) avgHealthEl.textContent = formatNumber(data.avg_health_score, "0");
  }

  function renderProjects(projects) {
    const el = $(SELECTORS.projects);
    if (!el) return;

    const rows = asArray(projects);

    if (!rows.length) {
      renderEmpty(el, "Chưa có project.");
      return;
    }

    el.innerHTML = rows
      .map((p) => {
        const healthStatus = safeText(p.health_status, "on_track");
        const healthScore = formatNumber(p.health_score, "100");
        return `
          <div class="project-card ${escapeHtml(getStatusClass(healthStatus))}">
            <div class="project-card__header">
              <div class="project-card__code">${escapeHtml(safeText(p.project_code))}</div>
              <div class="project-card__badge">${escapeHtml(healthStatus)}</div>
            </div>
            <div class="project-card__title">${escapeHtml(safeText(p.project_name))}</div>
            <div class="project-card__meta">
              <div><strong>Type:</strong> ${escapeHtml(safeText(p.project_type, "GENERAL"))}</div>
              <div><strong>Stage:</strong> ${escapeHtml(safeText(p.stage, "intake"))}</div>
              <div><strong>Owner:</strong> ${escapeHtml(safeText(p.owner, "Unassigned"))}</div>
              <div><strong>Health:</strong> ${escapeHtml(healthScore)}</div>
              <div><strong>Due:</strong> ${escapeHtml(formatDate(p.due_date))}</div>
            </div>
            <div class="project-card__metrics">
              <span>Tasks: ${escapeHtml(formatNumber(p.task_count, "0"))}</span>
              <span>Overdue: ${escapeHtml(formatNumber(p.overdue_tasks, "0"))}</span>
              <span>Risks: ${escapeHtml(formatNumber(p.risk_count, "0"))}</span>
              <span>Blockers: ${escapeHtml(formatNumber(p.blocker_count, "0"))}</span>
              <span>Approvals: ${escapeHtml(formatNumber(p.pending_approvals, "0"))}</span>
            </div>
            <div class="project-card__reason">${escapeHtml(safeText(p.health_reason, "Healthy baseline"))}</div>
          </div>
        `;
      })
      .join("");
  }

  function renderWorkload(workload) {
    const el = $(SELECTORS.workload);
    if (!el) return;

    const rows = asArray(workload);

    if (!rows.length) {
      renderEmpty(el, "Chưa có dữ liệu workload.");
      return;
    }

    el.innerHTML = rows
      .map(
        (item) => `
          <div class="list-row">
            <div class="list-row__title">${escapeHtml(safeText(item.owner, "Unassigned"))}</div>
            <div class="list-row__value">${escapeHtml(formatNumber(item.active_tasks, "0"))}</div>
          </div>
        `
      )
      .join("");
  }

  function renderHeatmap(heatmap) {
    const el = $(SELECTORS.heatmap);
    if (!el) return;

    const rows = asArray(heatmap);

    if (!rows.length) {
      renderEmpty(el, "Chưa có dữ liệu heatmap.");
      return;
    }

    el.innerHTML = rows
      .map(
        (item) => `
          <div class="list-row">
            <div class="list-row__title">
              ${escapeHtml(safeText(item.type, "-"))} / ${escapeHtml(safeText(item.category, "-"))}
            </div>
            <div class="list-row__value">${escapeHtml(formatNumber(item.count, "0"))}</div>
          </div>
        `
      )
      .join("");
  }

  function renderApprovals(approvals) {
    const el = $(SELECTORS.approvals);
    if (!el) return;

    const rows = asArray(approvals);

    if (!rows.length) {
      renderEmpty(el, "Không có approval đang chờ.");
      return;
    }

    el.innerHTML = rows
      .map(
        (item) => `
          <div class="approval-card">
            <div class="approval-card__top">
              <strong>#${escapeHtml(safeText(item.id))}</strong>
              <span>${escapeHtml(safeText(item.status, "pending"))}</span>
            </div>
            <div><strong>Project ID:</strong> ${escapeHtml(safeText(item.project_id))}</div>
            <div><strong>Approver:</strong> ${escapeHtml(safeText(item.approver, "-"))}</div>
            <div><strong>Created:</strong> ${escapeHtml(formatDate(item.created_at))}</div>
            <div><strong>Comment:</strong> ${escapeHtml(safeText(item.comment, "-"))}</div>
          </div>
        `
      )
      .join("");
  }

  function renderKanban(projects) {
    const el = $(SELECTORS.kanban);
    if (!el) return;

    const rows = asArray(projects);
    const stages = [
      "intake",
      "analysis",
      "design",
      "review",
      "approval",
      "execution",
      "validation",
      "handover",
      "closed",
    ];

    const groups = new Map(stages.map((stage) => [stage, []]));

    for (const project of rows) {
      const stage = String(project.stage || "intake").toLowerCase();
      if (!groups.has(stage)) groups.set(stage, []);
      groups.get(stage).push(project);
    }

    el.innerHTML = Array.from(groups.entries())
      .map(([stage, items]) => {
        const cards = asArray(items)
          .map(
            (p) => `
              <div class="kanban-card ${escapeHtml(getStatusClass(p.health_status))}">
                <div class="kanban-card__code">${escapeHtml(safeText(p.project_code))}</div>
                <div class="kanban-card__title">${escapeHtml(safeText(p.project_name))}</div>
                <div class="kanban-card__meta">
                  ${escapeHtml(safeText(p.owner, "Unassigned"))} • ${escapeHtml(safeText(p.health_status, "on_track"))}
                </div>
              </div>
            `
          )
          .join("");

        return `
          <div class="kanban-column">
            <div class="kanban-column__title">${escapeHtml(stage)}</div>
            <div class="kanban-column__count">${items.length}</div>
            <div class="kanban-column__body">
              ${cards || '<div class="empty-state">Không có item</div>'}
            </div>
          </div>
        `;
      })
      .join("");
  }

  function buildInsights(projects, workload, approvals) {
    const safeProjects = asArray(projects);
    const safeWorkload = asArray(workload);
    const safeApprovals = asArray(approvals);

    const mostDangerousProject =
      safeProjects
        .slice()
        .sort((a, b) => {
          const scoreDiff = Number(a.health_score || 0) - Number(b.health_score || 0);
          if (scoreDiff !== 0) return scoreDiff;
          return Number(b.blocker_count || 0) - Number(a.blocker_count || 0);
        })[0] || null;

    const busiestOwner =
      safeWorkload
        .slice()
        .sort((a, b) => Number(b.active_tasks || 0) - Number(a.active_tasks || 0))[0] || null;

    return {
      mostDangerousProject,
      busiestOwner,
      pendingApprovalsCount: safeApprovals.length,
    };
  }

  function renderOverviewNotes(projects, workload, approvals) {
    const el = $(SELECTORS.overviewPanel);
    if (!el) return;

    const insights = buildInsights(projects, workload, approvals);
    const danger = insights.mostDangerousProject;
    const busiest = insights.busiestOwner;

    el.innerHTML = `
      <div class="project-list">
        <div class="project-card ${escapeHtml(getStatusClass(danger?.health_status || "on_track"))}">
          <div class="project-card__header">
            <div class="project-card__code">Project nguy hiểm nhất</div>
            <div class="project-card__badge">${escapeHtml(safeText(danger?.health_status, "N/A"))}</div>
          </div>
          <div class="project-card__title">${escapeHtml(safeText(danger?.project_name, "Chưa có dữ liệu"))}</div>
          <div class="project-card__meta">
            <div><strong>Code:</strong> ${escapeHtml(safeText(danger?.project_code))}</div>
            <div><strong>Health:</strong> ${escapeHtml(formatNumber(danger?.health_score, "0"))}</div>
            <div><strong>Stage:</strong> ${escapeHtml(safeText(danger?.stage))}</div>
            <div><strong>Owner:</strong> ${escapeHtml(safeText(danger?.owner, "Unassigned"))}</div>
          </div>
          <div class="project-card__reason">${escapeHtml(safeText(danger?.health_reason, "Không có insight."))}</div>
        </div>

        <div class="list-row">
          <div class="list-row__title">
            Owner quá tải nhất<br />
            <span style="color: var(--muted); font-size: 12px;">
              ${escapeHtml(safeText(busiest?.owner, "Chưa có dữ liệu"))}
            </span>
          </div>
          <div class="list-row__value">${escapeHtml(formatNumber(busiest?.active_tasks, "0"))}</div>
        </div>

        <div class="list-row">
          <div class="list-row__title">
            Approval đang pending<br />
            <span style="color: var(--muted); font-size: 12px;">Tổng số approval chờ xử lý</span>
          </div>
          <div class="list-row__value">${escapeHtml(formatNumber(insights.pendingApprovalsCount, "0"))}</div>
        </div>
      </div>
    `;
  }

  async function loadSummary() {
    const summary = await fetchJson("/api/dashboard/summary");
    renderSummary(summary);
    return summary;
  }

  async function loadProjects() {
    const projects = await fetchJson("/api/projects");
    const rows = asArray(projects);
    renderProjects(rows);
    renderKanban(rows);
    return rows;
  }

  async function loadWorkload() {
    const workload = await fetchJson("/api/dashboard/workload");
    const rows = asArray(workload);
    renderWorkload(rows);
    return rows;
  }

  async function loadHeatmap() {
    const heatmap = await fetchJson("/api/dashboard/heatmap");
    const rows = asArray(heatmap);
    renderHeatmap(rows);
    return rows;
  }

  async function loadApprovals() {
    const approvals = await fetchJson("/api/approvals/pending");
    const rows = asArray(approvals);
    renderApprovals(rows);
    return rows;
  }

  async function refreshAll() {
    try {
      setStatus("Đang tải dữ liệu...", "loading");

      const [summary, projects, workload, heatmap, approvals] = await Promise.all([
        loadSummary(),
        loadProjects(),
        loadWorkload(),
        loadHeatmap(),
        loadApprovals(),
      ]);

      renderOverviewNotes(projects, workload, approvals);

      setStatus("Đã tải dữ liệu thành công.", "success");
      return { summary, projects, workload, heatmap, approvals };
    } catch (err) {
      console.error("refreshAll error:", err);
      setStatus(`Lỗi tải dữ liệu: ${err.message}`, "error");
      throw err;
    }
  }

  function readFormData(form) {
    const formData = new FormData(form);
    return {
      project_code: String(formData.get("project_code") || "").trim() || undefined,
      project_name: String(formData.get("project_name") || formData.get("name") || "").trim(),
      project_type: String(formData.get("project_type") || "GENERAL").trim(),
      stage: String(formData.get("stage") || "intake").trim(),
      owner: String(formData.get("owner") || "Unassigned").trim(),
      due_date: String(formData.get("due_date") || "").trim() || undefined,
    };
  }

  async function handleCreateProject(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const msgEl = $(SELECTORS.createProjectMessage);
    const submitBtn =
      form.querySelector('button[type="submit"]') || $(SELECTORS.createProjectButton);

    try {
      if (submitBtn) submitBtn.disabled = true;
      if (msgEl) {
        msgEl.textContent = "Đang tạo project...";
        msgEl.dataset.state = "loading";
      }

      const payload = readFormData(form);

      if (!payload.project_name) {
        throw new Error("Vui lòng nhập Project Name.");
      }

      const result = await fetchJson("/api/projects", {
        method: "POST",
        body: payload,
      });

      if (msgEl) {
        msgEl.textContent = `Tạo thành công: ${result.project_code || payload.project_name}`;
        msgEl.dataset.state = "success";
      }

      form.reset();
      await refreshAll();
    } catch (err) {
      console.error("handleCreateProject error:", err);
      if (msgEl) {
        msgEl.textContent = `Tạo project thất bại: ${err.message}`;
        msgEl.dataset.state = "error";
      } else {
        setStatus(`Tạo project thất bại: ${err.message}`, "error");
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  function bindEvents() {
    const form = $(SELECTORS.createProjectForm);
    if (form) {
      form.addEventListener("submit", handleCreateProject);
    }

    $all(SELECTORS.refreshButtons).forEach((btn) => {
      btn.addEventListener("click", function () {
        refreshAll();
      });
    });
  }

  function bootstrap() {
    bindEvents();
    refreshAll().catch((err) => {
      console.error("bootstrap error:", err);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
