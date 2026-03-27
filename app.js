(function () {
  "use strict";

  const API_BASE =
    (window.APP_CONFIG && window.APP_CONFIG.apiBaseUrl
      ? String(window.APP_CONFIG.apiBaseUrl)
      : "").replace(/\/+$/, "");

  const EXPERTS = ["Phúc", "Thanh", "Tuấn", "Phú", "An"];

  const SELECTORS = {
    summary: {
      total: "#total-projects",
      onTrack: "#on-track",
      atRisk: "#at-risk",
      delayed: "#delayed",
      blocked: "#blocked",
      avgHealth: "#avg-health-score",
    },
    status: "#app-status",
    refreshButtons: '[data-action="refresh"]',

    projects: "#project-list",
    heatmap: "#heatmap-list",
    overviewNotes: "#overview-notes",

    expertBoard: "#expert-board",
    expertList: "#expert-list",
    pixelFloor: "#pixel-floor",
    assignmentQueue: "#assignment-queue",

    projectSearch: "#project-search",
    ownerFilter: "#owner-filter",
  };

  const state = {
    projects: [],
    heatmap: [],
    summary: {},
    activeExpert: null,
    activeProjectId: null,
    search: "",
    owner: "",
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
    return d.toLocaleDateString("vi-VN");
  }

  function shortProjectCode(code) {
    const raw = safeText(code, "");
    const match = raw.match(/(\d{3})$/);
    return match ? `#${match[1]}` : raw.slice(-6) || "-";
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

    const response = await fetch(url, { method, headers, body });
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

  function getDerivedOwner(project, index) {
    if (project && project.owner) return String(project.owner);
    return EXPERTS[index % EXPERTS.length];
  }

  function normalizeProjects(projects) {
    return asArray(projects).map((p, index) => ({
      ...p,
      owner: getDerivedOwner(p, index),
      health_score: Number(p.health_score ?? 100),
      task_count: Number(p.task_count ?? 0),
      overdue_tasks: Number(p.overdue_tasks ?? 0),
      risk_count: Number(p.risk_count ?? 0),
      blocker_count: Number(p.blocker_count ?? 0),
      pending_approvals: Number(p.pending_approvals ?? 0),
    }));
  }

  function getFilteredProjects() {
    let rows = state.projects.slice();

    if (state.search) {
      const q = state.search.toLowerCase();
      rows = rows.filter((p) => {
        const code = safeText(p.project_code, "").toLowerCase();
        const name = safeText(p.project_name, "").toLowerCase();
        return code.includes(q) || name.includes(q);
      });
    }

    if (state.owner) {
      rows = rows.filter((p) => safeText(p.owner, "") === state.owner);
    }

    if (state.activeExpert) {
      rows = rows.filter((p) => safeText(p.owner, "") === state.activeExpert);
    }

    return rows;
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
        const isActive =
          state.activeProjectId !== null && String(state.activeProjectId) === String(p.id);

        return `
          <div class="project-card ${escapeHtml(getStatusClass(healthStatus))} ${isActive ? "is-active" : ""}"
               data-project-id="${escapeHtml(safeText(p.id, ""))}">
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

  function buildInsights(projects) {
    const rows = asArray(projects);

    const mostDangerousProject =
      rows
        .slice()
        .sort((a, b) => {
          const scoreDiff = Number(a.health_score || 0) - Number(b.health_score || 0);
          if (scoreDiff !== 0) return scoreDiff;
          return Number(b.blocker_count || 0) - Number(a.blocker_count || 0);
        })[0] || null;

    const ownerLoadMap = new Map();
    rows.forEach((p) => {
      const owner = safeText(p.owner, "Unassigned");
      const current = ownerLoadMap.get(owner) || 0;
      ownerLoadMap.set(owner, current + Number(p.task_count || 0));
    });

    let busiestOwner = null;
    for (const [owner, activeTasks] of ownerLoadMap.entries()) {
      if (!busiestOwner || activeTasks > busiestOwner.active_tasks) {
        busiestOwner = { owner, active_tasks: activeTasks };
      }
    }

    const pendingApprovalsCount = rows.reduce(
      (sum, p) => sum + Number(p.pending_approvals || 0),
      0
    );

    return { mostDangerousProject, busiestOwner, pendingApprovalsCount };
  }

  function renderOverviewNotes(projects) {
    const el = $(SELECTORS.overviewNotes);
    if (!el) return;

    const { mostDangerousProject, busiestOwner, pendingApprovalsCount } = buildInsights(projects);

    el.innerHTML = `
      <div class="project-list">
        <div class="project-card ${escapeHtml(getStatusClass(mostDangerousProject?.health_status || "on_track"))}">
          <div class="project-card__header">
            <div class="project-card__code">Project nguy hiểm nhất</div>
            <div class="project-card__badge">${escapeHtml(safeText(mostDangerousProject?.health_status, "N/A"))}</div>
          </div>
          <div class="project-card__title">${escapeHtml(safeText(mostDangerousProject?.project_name, "Chưa có dữ liệu"))}</div>
          <div class="project-card__meta">
            <div><strong>Code:</strong> ${escapeHtml(safeText(mostDangerousProject?.project_code))}</div>
            <div><strong>Health:</strong> ${escapeHtml(formatNumber(mostDangerousProject?.health_score, "0"))}</div>
            <div><strong>Stage:</strong> ${escapeHtml(safeText(mostDangerousProject?.stage))}</div>
            <div><strong>Owner:</strong> ${escapeHtml(safeText(mostDangerousProject?.owner, "Unassigned"))}</div>
          </div>
          <div class="project-card__reason">${escapeHtml(safeText(mostDangerousProject?.health_reason, "Không có insight."))}</div>
        </div>

        <div class="list-row">
          <div class="list-row__title">
            Owner quá tải nhất<br />
            <span style="color: var(--muted); font-size: 12px;">
              ${escapeHtml(safeText(busiestOwner?.owner, "Chưa có dữ liệu"))}
            </span>
          </div>
          <div class="list-row__value">${escapeHtml(formatNumber(busiestOwner?.active_tasks, "0"))}</div>
        </div>

        <div class="list-row">
          <div class="list-row__title">
            Approval đang pending<br />
            <span style="color: var(--muted); font-size: 12px;">Tổng số approval chờ xử lý</span>
          </div>
          <div class="list-row__value">${escapeHtml(formatNumber(pendingApprovalsCount, "0"))}</div>
        </div>
      </div>
    `;
  }

  function getExpertAssignments(projects) {
    return EXPERTS.map((expert) => {
      const assigned = projects.filter((p) => safeText(p.owner, "") === expert);
      const highestRiskProject =
        assigned
          .slice()
          .sort((a, b) => Number(a.health_score || 0) - Number(b.health_score || 0))[0] || null;

      return {
        name: expert,
        projects: assigned,
        primaryProject: highestRiskProject || assigned[0] || null,
      };
    });
  }

  function renderExpertBoard(projects) {
    const listEl = $(SELECTORS.expertList) || $(SELECTORS.expertBoard);
    if (!listEl) return;

    const experts = getExpertAssignments(projects);

    listEl.innerHTML = experts
      .map((expert) => {
        const isActive = state.activeExpert === expert.name;
        return `
          <button
            type="button"
            class="project-card ${isActive ? "is-active" : ""}"
            data-expert-name="${escapeHtml(expert.name)}"
            style="text-align:left; cursor:pointer; width:100%; background:rgba(255,255,255,0.03);">
            <div class="project-card__header">
              <div class="project-card__code">Expert</div>
              <div class="project-card__badge">${escapeHtml(String(expert.projects.length))} project</div>
            </div>
            <div class="project-card__title">${escapeHtml(expert.name)}</div>
            <div class="project-card__meta">
              <div><strong>Main:</strong> ${escapeHtml(safeText(expert.primaryProject?.project_code, "-"))}</div>
              <div><strong>Status:</strong> ${escapeHtml(safeText(expert.primaryProject?.health_status, "-"))}</div>
            </div>
          </button>
        `;
      })
      .join("");
  }

  function routePointsByType(projectType) {
    const type = String(projectType || "").toLowerCase();
    if (type === "presales") return ["12%", "30%", "20%"];
    if (type === "delivery") return ["60%", "52%", "72%"];
    if (type === "review") return ["34%", "68%", "48%"];
    if (type === "handover") return ["78%", "22%", "84%"];
    return ["18%", "48%", "28%"];
  }

  function renderPixelFloor(projects) {
    const floorEl = $(SELECTORS.pixelFloor);
    if (!floorEl) return;

    const assignments = getExpertAssignments(projects);

    if (!assignments.some((a) => a.primaryProject)) {
      floorEl.innerHTML = `<div class="empty-state">Chưa có assignment để mô phỏng pixel floor.</div>`;
      return;
    }

    floorEl.innerHTML = `
      <div class="pixel-floor-scene">
        <div class="pixel-zone pixel-zone-a"></div>
        <div class="pixel-zone pixel-zone-b"></div>
        <div class="pixel-zone pixel-zone-c"></div>

        ${assignments
          .map((expert, index) => {
            const project = expert.primaryProject;
            if (!project) return "";

            const points = routePointsByType(project.project_type);
            const left = points[index % points.length];
            const top = `${18 + (index % 3) * 22}%`;
            const isActiveExpert = state.activeExpert === expert.name;
            const isActiveProject =
              state.activeProjectId !== null &&
              String(state.activeProjectId) === String(project.id);

            return `
              <div
                class="pixel-agent ${isActiveExpert || isActiveProject ? "is-active" : ""}"
                data-expert-name="${escapeHtml(expert.name)}"
                data-project-id="${escapeHtml(safeText(project.id, ""))}"
                style="left:${left}; top:${top}; --patrol-x:${points[(index + 1) % points.length]}; --patrol-y:${top}; animation-delay:${index * 0.4}s;">
                <div class="pixel-project-badge ${escapeHtml(getStatusClass(project.health_status))}">
                  ${escapeHtml(shortProjectCode(project.project_code))}
                </div>
                <div class="pixel-character" aria-hidden="true"></div>
                <div class="pixel-nameplate">${escapeHtml(expert.name)}</div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderAssignmentQueue(projects) {
    const el = $(SELECTORS.assignmentQueue);
    if (!el) return;

    const assignments = getExpertAssignments(projects)
      .filter((x) => x.primaryProject)
      .map((x) => ({
        expert: x.name,
        project: x.primaryProject,
      }));

    if (!assignments.length) {
      renderEmpty(el, "Chưa có assignment queue.");
      return;
    }

    el.innerHTML = assignments
      .map(
        ({ expert, project }) => `
          <div class="list-row">
            <div class="list-row__title">
              ${escapeHtml(expert)}<br />
              <span style="color: var(--muted); font-size: 12px;">
                ${escapeHtml(safeText(project.project_name, "-"))}
              </span>
            </div>
            <div class="list-row__value">${escapeHtml(shortProjectCode(project.project_code))}</div>
          </div>
        `
      )
      .join("");
  }

  function renderAll() {
    const filteredProjects = getFilteredProjects();

    renderSummary(state.summary);
    renderProjects(filteredProjects);
    renderHeatmap(state.heatmap);
    renderOverviewNotes(filteredProjects);
    renderExpertBoard(filteredProjects);
    renderPixelFloor(filteredProjects);
    renderAssignmentQueue(filteredProjects);
  }

  async function loadSummary() {
    const summary = await fetchJson("/api/dashboard/summary");
    state.summary = asObject(summary);
    return state.summary;
  }

  async function loadProjects() {
    const projects = await fetchJson("/api/projects");
    state.projects = normalizeProjects(projects);
    return state.projects;
  }

  async function loadHeatmap() {
    const heatmap = await fetchJson("/api/dashboard/heatmap");
    state.heatmap = asArray(heatmap);
    return state.heatmap;
  }

  async function refreshAll() {
    try {
      setStatus("Đang tải dữ liệu...", "loading");

      await Promise.all([loadSummary(), loadProjects(), loadHeatmap()]);

      renderAll();
      setStatus("Đã tải dữ liệu thành công.", "success");
    } catch (err) {
      console.error("refreshAll error:", err);
      setStatus(`Lỗi tải dữ liệu: ${err.message}`, "error");
    }
  }

  function handleProjectCardClick(event) {
    const card = event.target.closest("[data-project-id]");
    if (!card) return;

    const projectId = card.getAttribute("data-project-id");
    const project = state.projects.find((p) => String(p.id) === String(projectId));
    if (!project) return;

    state.activeProjectId = state.activeProjectId === projectId ? null : projectId;
    state.activeExpert = state.activeProjectId ? safeText(project.owner, null) : null;

    renderAll();
  }

  function handleExpertClick(event) {
    const item = event.target.closest("[data-expert-name]");
    if (!item) return;

    const expertName = item.getAttribute("data-expert-name");
    state.activeExpert = state.activeExpert === expertName ? null : expertName;
    state.activeProjectId = null;
    renderAll();
  }

  function bindSearchAndFilters() {
    const searchEl = $(SELECTORS.projectSearch);
    if (searchEl) {
      searchEl.addEventListener("input", (e) => {
        state.search = String(e.target.value || "").trim();
        renderAll();
      });
    }

    const ownerEl = $(SELECTORS.ownerFilter);
    if (ownerEl) {
      ownerEl.addEventListener("change", (e) => {
        state.owner = String(e.target.value || "");
        renderAll();
      });
    }
  }

  function bindEvents() {
    $all(SELECTORS.refreshButtons).forEach((btn) => {
      btn.addEventListener("click", () => {
        refreshAll();
      });
    });

    const projectListEl = $(SELECTORS.projects);
    if (projectListEl) {
      projectListEl.addEventListener("click", handleProjectCardClick);
    }

    const expertBoardEl = $(SELECTORS.expertBoard) || $(SELECTORS.expertList);
    if (expertBoardEl) {
      expertBoardEl.addEventListener("click", handleExpertClick);
    }

    const pixelFloorEl = $(SELECTORS.pixelFloor);
    if (pixelFloorEl) {
      pixelFloorEl.addEventListener("click", handleExpertClick);
    }

    bindSearchAndFilters();
  }

  function bootstrap() {
    bindEvents();
    refreshAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
