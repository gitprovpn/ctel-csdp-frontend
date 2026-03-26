(function () {
  "use strict";

  const API_BASE = ((window.APP_CONFIG && window.APP_CONFIG.apiBaseUrl) || "").replace(/\/+$/, "");

  const EXPERTS = [
    {
      id: "phuc",
      name: "Phúc",
      role: "Handover & Closure Specialist",
      tag: "handover",
      specialties: ["handover", "validation", "closed"],
      spriteKey: "phuc",
      color: "#22c55e",
      idlePos: { x: 760, y: 292 },
    },
    {
      id: "thanh",
      name: "Thanh",
      role: "Lead Solution Architect",
      tag: "presales",
      specialties: ["presales", "analysis", "design_review", "design", "intake"],
      spriteKey: "thanh",
      color: "#22d3ee",
      idlePos: { x: 190, y: 350 },
    },
    {
      id: "tuan",
      name: "Tuấn",
      role: "Delivery Architect",
      tag: "delivery",
      specialties: ["delivery", "execution", "implementation", "validation"],
      spriteKey: "tuan",
      color: "#60a5fa",
      idlePos: { x: 395, y: 340 },
    },
    {
      id: "phu",
      name: "Phú",
      role: "Security Review Specialist",
      tag: "review",
      specialties: ["review", "approval", "design_review"],
      spriteKey: "phu",
      color: "#a78bfa",
      idlePos: { x: 550, y: 338 },
    },
    {
      id: "an",
      name: "An",
      role: "Approval Coordinator",
      tag: "approvals",
      specialties: ["approval", "at_risk", "blocked"],
      spriteKey: "an",
      color: "#f59e0b",
      idlePos: { x: 650, y: 338 },
    },
  ];

  const ASSET_PATHS = {
    house: "./assets/pixel/map/housemap.png",
    sun: "./assets/pixel/map/sun.png",
    moon: "./assets/pixel/map/moon.png",
  };

  const ZONES = {
    intake: { x: 165, y: 360 },
    analysis: { x: 240, y: 348 },
    design_review: { x: 325, y: 334 },
    design: { x: 335, y: 334 },
    review: { x: 455, y: 333 },
    approval: { x: 610, y: 336 },
    execution: { x: 500, y: 388 },
    implementation: { x: 500, y: 388 },
    validation: { x: 694, y: 381 },
    handover: { x: 778, y: 315 },
    closed: { x: 807, y: 248 },
    idle: { x: 120, y: 250 },
  };

  const ROUTE_TEMPLATES = {
    presales: ["idle", "intake", "analysis", "design_review", "analysis"],
    delivery: ["idle", "execution", "implementation", "validation", "execution"],
    review: ["idle", "review", "approval", "review"],
    handover: ["idle", "validation", "handover", "closed", "handover"],
    general: ["idle", "analysis", "review", "execution"],
    blocked: ["idle", "approval", "review", "approval"],
  };

  const state = {
    projects: [],
    workload: [],
    heatmap: [],
    approvals: [],
    summary: {},
    expertAssignments: [],
    pixelAssets: null,
    selectedExpertId: null,
    focusedProjectId: null,
    pixelHitRegions: [],
    filters: {
      search: "",
      projectType: "all",
      stage: "all",
      healthStatus: "all",
      ownerExpert: "all",
    },
    modal: {
      open: false,
      type: null,
      id: null,
    },
    animationFrame: null,
    animationStart: 0,
  };

  const el = {
    summaryCards: document.getElementById("summaryCards"),
    projectList: document.getElementById("projectList"),
    workloadList: document.getElementById("workloadList"),
    heatmapList: document.getElementById("heatmapList"),
    approvalList: document.getElementById("approvalList"),
    kanbanBoard: document.getElementById("kanbanBoard"),
    expertsBoard: document.getElementById("expertsBoard"),
    overviewNotes: document.getElementById("overviewNotes"),
    pixelCanvas: document.getElementById("pixelCanvas"),
    pixelRoster: document.getElementById("pixelRoster"),
    projectForm: document.getElementById("projectForm"),
    formStatus: document.getElementById("formStatus"),
    appStatus: document.getElementById("appStatus"),
    refreshBtn: document.getElementById("refreshBtn"),
    filterSearch: document.getElementById("filterSearch"),
    filterProjectType: document.getElementById("filterProjectType"),
    filterStage: document.getElementById("filterStage"),
    filterHealth: document.getElementById("filterHealth"),
    filterOwner: document.getElementById("filterOwner"),
    resetFiltersBtn: document.getElementById("resetFiltersBtn"),
    projectCounter: document.getElementById("projectCounter"),
    searchResultMeta: document.getElementById("searchResultMeta"),
    activeExpertBadge: document.getElementById("activeExpertBadge"),
    detailModal: document.getElementById("detailModal"),
    detailModalBody: document.getElementById("detailModalBody"),
    detailModalTitle: document.getElementById("detailModalTitle"),
    detailModalEyebrow: document.getElementById("detailModalEyebrow"),
    detailModalClose: document.getElementById("detailModalClose"),
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function setAppStatus(message, stateName) {
    if (!el.appStatus) return;
    el.appStatus.textContent = message || "";
    el.appStatus.dataset.state = stateName || "idle";
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("vi-VN");
  }

  function titleCase(value) {
    return String(value || "-")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function healthRank(project) {
    const map = { blocked: 0, delayed: 1, at_risk: 2, on_track: 3 };
    return map[String(project?.health_status || "on_track")] ?? 4;
  }

  function number(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function getExpertById(expertId) {
    return state.expertAssignments.find((item) => item.id === expertId) || EXPERTS.find((item) => item.id === expertId) || null;
  }

  function getProjectById(projectId) {
    return state.projects.find((item) => Number(item.id) === Number(projectId)) || null;
  }

  async function fetchJson(path, options = {}) {
    const url = `${API_BASE}${path}`;
    const headers = { ...(options.headers || {}) };
    let body = options.body;

    if (body !== undefined && typeof body !== "string") {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }

    const response = await fetch(url, {
      method: options.method || "GET",
      headers,
      body,
    });
    const text = await response.text();
    let data;

    try {
      data = text ? JSON.parse(text) : null;
    } catch (err) {
      throw new Error(`API không trả JSON hợp lệ (${response.status})`);
    }

    if (!response.ok) {
      throw new Error((data && (data.error || data.message)) || `HTTP ${response.status}`);
    }
    return data;
  }

  function normalizeProject(project) {
    return {
      id: Number(project.id),
      code: project.project_code || project.code || `PROJECT-${project.id}`,
      name: project.project_name || project.name || "Untitled Project",
      type: String(project.project_type || project.type || "GENERAL").toLowerCase(),
      stage: String(project.stage || "intake").toLowerCase(),
      owner: project.owner || project.owner_name || "Unassigned",
      health_status: String(project.health_status || "on_track").toLowerCase(),
      health_score: Number(project.health_score || 0),
      health_reason: project.health_reason || "Healthy baseline",
      due_date: project.due_date || null,
      task_count: Number(project.task_count || 0),
      overdue_tasks: Number(project.overdue_tasks || 0),
      risk_count: Number(project.risk_count || 0),
      blocker_count: Number(project.blocker_count || 0),
      pending_approvals: Number(project.pending_approvals || 0),
    };
  }

  function resolveProjectOwnerAssignment(project) {
    const owner = String(project.owner || "").toLowerCase().trim();
    if (!owner || owner === "unassigned") return null;
    return EXPERTS.find((expert) => owner.includes(expert.name.toLowerCase())) || null;
  }

  function resolveProjectByRules(project) {
    const ownerMatch = resolveProjectOwnerAssignment(project);
    if (ownerMatch) return ownerMatch;

    const byType = EXPERTS.find((expert) => expert.specialties.includes(project.type));
    if (byType) return byType;

    const byStage = EXPERTS.find((expert) => expert.specialties.includes(project.stage));
    if (byStage) return byStage;

    const byHealth = EXPERTS.find((expert) => expert.specialties.includes(project.health_status));
    if (byHealth) return byHealth;

    return EXPERTS[0];
  }

  function projectMatchesFilters(project) {
    const f = state.filters;
    const search = String(f.search || "").trim().toLowerCase();
    if (f.projectType !== "all" && project.type !== f.projectType) return false;
    if (f.stage !== "all" && project.stage !== f.stage) return false;
    if (f.healthStatus !== "all" && project.health_status !== f.healthStatus) return false;
    if (f.ownerExpert !== "all") {
      const assignedExpert = resolveProjectByRules(project);
      const owner = String(project.owner || "").toLowerCase();
      if (f.ownerExpert === "unassigned") {
        if (owner && owner !== "unassigned") return false;
      } else if (assignedExpert?.id !== f.ownerExpert && !owner.includes((getExpertById(f.ownerExpert)?.name || "").toLowerCase())) {
        return false;
      }
    }
    if (search) {
      const haystack = `${project.code} ${project.name}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  }

  function getFilteredProjects() {
    return state.projects.filter(projectMatchesFilters);
  }

  function renderSummaryCards(summary) {
    const cards = [
      ["Total Projects", summary.total_projects || 0],
      ["On Track", summary.on_track || 0],
      ["At Risk", summary.at_risk || 0],
      ["Delayed", summary.delayed || 0],
      ["Blocked", summary.blocked || 0],
      ["Avg Health Score", summary.avg_health_score || 0],
    ];

    el.summaryCards.innerHTML = cards
      .map(
        ([label, value]) => `
        <article class="card">
          <div class="card-label">${escapeHtml(label)}</div>
          <div class="card-value">${escapeHtml(String(value))}</div>
        </article>
      `
      )
      .join("");
  }

  function findExpertForProject(projectId) {
    return state.expertAssignments.find((expert) => expert.projectIds.includes(Number(projectId))) || null;
  }

  function projectHandledBySelectedExpert(project) {
    if (!state.selectedExpertId) return false;
    const assignment = state.expertAssignments.find((expert) => expert.id === state.selectedExpertId);
    return !!assignment && assignment.projectIds.includes(Number(project.id));
  }

  function projectIsFocused(project) {
    return state.focusedProjectId != null && Number(project.id) === Number(state.focusedProjectId);
  }

  function setExpertFocus(expertId, projectId) {
    state.selectedExpertId = expertId || null;
    state.focusedProjectId = projectId != null ? Number(projectId) : null;
  }

  function setProjectFocus(projectId) {
    const expert = findExpertForProject(projectId);
    setExpertFocus(expert ? expert.id : null, projectId);
  }

  function modalStat(label, value) {
    return `<div class="modal-stat"><div class="modal-stat__label">${escapeHtml(label)}</div><div class="modal-stat__value">${escapeHtml(String(value))}</div></div>`;
  }

  function openProjectModal(projectId) {
    const project = getProjectById(projectId);
    if (!project || !el.detailModalBody) return;
    const expert = findExpertForProject(project.id);
    el.detailModalEyebrow.textContent = "PROJECT DETAIL";
    el.detailModalTitle.textContent = project.name;
    el.detailModalBody.innerHTML = `
      <div class="modal-grid">
        ${modalStat("Project Code", project.code)}
        ${modalStat("Health", `${project.health_status} • ${project.health_score}`)}
        ${modalStat("Project Type", titleCase(project.type))}
        ${modalStat("Stage", titleCase(project.stage))}
        ${modalStat("Owner", project.owner || "Unassigned")}
        ${modalStat("Assigned Expert", expert ? expert.name : "No mapping")}
      </div>
      <div class="modal-section">
        <div class="modal-stat__label">Risk Snapshot</div>
        <div class="modal-inline-tags">
          <span>Tasks: ${escapeHtml(String(project.task_count))}</span>
          <span>Overdue: ${escapeHtml(String(project.overdue_tasks))}</span>
          <span>Risks: ${escapeHtml(String(project.risk_count))}</span>
          <span>Blockers: ${escapeHtml(String(project.blocker_count))}</span>
          <span>Approvals: ${escapeHtml(String(project.pending_approvals))}</span>
        </div>
      </div>
      <div class="modal-section">
        <div class="modal-stat__label">Due Date</div>
        <div class="project-reason">${escapeHtml(formatDate(project.due_date))}</div>
      </div>
      <div class="modal-section">
        <div class="modal-stat__label">Health Reason</div>
        <div class="project-reason">${escapeHtml(project.health_reason)}</div>
      </div>
      <div class="modal-section">
        <div class="modal-stat__label">Expert Dispatch Context</div>
        <div class="project-reason">${escapeHtml(expert ? `${expert.name} đang follow-up theo route ${titleCase(project.type)}.` : "Chưa có chuyên gia phụ trách.")}</div>
      </div>
    `;
    state.modal = { open: true, type: "project", id: Number(project.id) };
    el.detailModal.classList.remove("hidden");
    el.detailModal.setAttribute("aria-hidden", "false");
  }

  function openExpertModal(expertId) {
    const expert = getExpertById(expertId);
    if (!expert || !el.detailModalBody) return;
    const topProjects = asArray(expert.projects).slice(0, 6);
    el.detailModalEyebrow.textContent = "EXPERT DETAIL";
    el.detailModalTitle.textContent = expert.name;
    el.detailModalBody.innerHTML = `
      <div class="modal-grid">
        ${modalStat("Role", expert.role)}
        ${modalStat("Tag", titleCase(expert.tag))}
        ${modalStat("Active Tasks", expert.activeTasks || 0)}
        ${modalStat("Pending Approvals", expert.pendingApprovals || 0)}
      </div>
      <div class="modal-section">
        <div class="modal-stat__label">Current Focus</div>
        <div class="project-reason">${escapeHtml(expert.focusText || "Monitoring queue")}</div>
      </div>
      <div class="modal-section">
        <div class="modal-stat__label">Patrol Route Mode</div>
        <div class="project-reason">${escapeHtml(titleCase(expert.routeMode || expert.tag || "general"))} • pixel floor đang mô phỏng tuyến đi riêng cho expert này.</div>
      </div>
      <div class="modal-section">
        <div class="modal-stat__label">Handled Projects</div>
        <div class="modal-list">
          ${topProjects.length ? topProjects.map((project) => `
            <div class="modal-list-item">
              <strong>${escapeHtml(project.code)} • ${escapeHtml(project.name)}</strong>
              <div class="subtext">${escapeHtml(project.health_status)} • ${escapeHtml(project.stage)} • ${escapeHtml(project.owner || "Unassigned")}</div>
            </div>
          `).join("") : '<div class="empty-state">Chưa có project trực tiếp.</div>'}
        </div>
      </div>
    `;
    state.modal = { open: true, type: "expert", id: expert.id };
    el.detailModal.classList.remove("hidden");
    el.detailModal.setAttribute("aria-hidden", "false");
  }

  function closeDetailModal() {
    state.modal = { open: false, type: null, id: null };
    el.detailModal?.classList.add("hidden");
    el.detailModal?.setAttribute("aria-hidden", "true");
  }

  function renderProjects(projects) {
    el.projectCounter.textContent = `${projects.length} project(s)`;
    const bits = [];
    if (state.filters.search) bits.push(`search “${state.filters.search}”`);
    if (state.filters.projectType !== "all") bits.push(`type ${state.filters.projectType}`);
    if (state.filters.stage !== "all") bits.push(`stage ${state.filters.stage}`);
    if (state.filters.healthStatus !== "all") bits.push(`health ${state.filters.healthStatus}`);
    if (state.filters.ownerExpert !== "all") bits.push(`owner/expert ${getExpertById(state.filters.ownerExpert)?.name || state.filters.ownerExpert}`);
    if (el.searchResultMeta) el.searchResultMeta.innerHTML = `<span class="search-result-hit">${escapeHtml(bits.length ? `Filtered by ${bits.join(" • ")}` : "All projects")}</span>`;

    if (!projects.length) {
      el.projectList.innerHTML = '<div class="empty-state">Không có project nào khớp bộ lọc hiện tại.</div>';
      return;
    }

    el.projectList.innerHTML = projects
      .map((project) => {
        const isSelected = projectHandledBySelectedExpert(project);
        const anySelected = !!state.selectedExpertId;
        const classes = [
          "project-card",
          `status-${project.health_status}`,
          isSelected ? "project-highlighted" : "",
          anySelected && !isSelected ? "project-dimmed" : "",
          projectIsFocused(project) ? "project-focused" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return `
          <article class="${classes}" data-project-id="${project.id}">
            <div class="project-card__header">
              <div class="project-code">${escapeHtml(project.code)}</div>
              <div class="status-chip">${escapeHtml(project.health_status)}</div>
            </div>
            <div class="project-title">${escapeHtml(project.name)}</div>
            <div class="project-meta">
              <div><strong>Type:</strong> ${escapeHtml(project.type)}</div>
              <div><strong>Stage:</strong> ${escapeHtml(project.stage)}</div>
              <div><strong>Owner:</strong> ${escapeHtml(project.owner || "Unassigned")}</div>
              <div><strong>Health:</strong> ${escapeHtml(String(project.health_score))}</div>
              <div><strong>Due:</strong> ${escapeHtml(formatDate(project.due_date))}</div>
            </div>
            <div class="project-metrics">
              <div>Tasks: ${escapeHtml(String(project.task_count))}</div>
              <div>Overdue: ${escapeHtml(String(project.overdue_tasks))}</div>
              <div>Risks: ${escapeHtml(String(project.risk_count))}</div>
              <div>Blockers: ${escapeHtml(String(project.blocker_count))}</div>
              <div>Approvals: ${escapeHtml(String(project.pending_approvals))}</div>
            </div>
            <div class="project-reason">${escapeHtml(project.health_reason)}</div>
          </article>
        `;
      })
      .join("");

    el.projectList.querySelectorAll("[data-project-id]").forEach((card) => {
      card.addEventListener("click", () => {
        const projectId = Number(card.dataset.projectId);
        setProjectFocus(projectId);
        syncDerivedViews();
        openProjectModal(projectId);
      });
    });
  }

  function buildPatrolRoute(expert, focusProject) {
    const routeMode = focusProject?.health_status === "blocked"
      ? "blocked"
      : focusProject?.type && ROUTE_TEMPLATES[focusProject.type]
      ? focusProject.type
      : expert.tag === "approvals"
      ? "review"
      : ROUTE_TEMPLATES[expert.tag]
      ? expert.tag
      : "general";

    const template = ROUTE_TEMPLATES[routeMode] || ROUTE_TEMPLATES.general;
    const focusZone = ZONES[focusProject?.stage] || expert.idlePos || ZONES.idle;

    const points = template.map((key) => {
      if (key === "idle") return expert.idlePos || ZONES.idle;
      if (focusProject && (key === focusProject.stage || key === focusProject.type)) return focusZone;
      return ZONES[key] || focusZone;
    });

    const deduped = [];
    points.forEach((point) => {
      const prev = deduped[deduped.length - 1];
      if (!prev || prev.x !== point.x || prev.y !== point.y) deduped.push({ x: point.x, y: point.y });
    });

    return { route: deduped, mode: routeMode };
  }

  function buildExpertAssignments(projects, workload, approvals) {
    const pendingApprovalCount = approvals.length;
    const byExpert = new Map(
      EXPERTS.map((expert) => [
        expert.id,
        {
          ...expert,
          projectIds: [],
          projects: [],
          activeTasks: 0,
          pendingApprovals: 0,
          focusProject: null,
          focusText: "Monitoring queue",
          patrolRoute: [expert.idlePos],
          routeMode: "general",
        },
      ])
    );

    projects.forEach((project) => {
      const expert = resolveProjectByRules(project);
      const record = byExpert.get(expert.id);
      record.projectIds.push(Number(project.id));
      record.projects.push(project);
    });

    workload.forEach((item) => {
      const owner = String(item.owner || "").toLowerCase();
      const match = EXPERTS.find((expert) => owner.includes(expert.name.toLowerCase()));
      if (match) byExpert.get(match.id).activeTasks = Number(item.active_tasks || 0);
    });

    const approvalOwners = new Map();
    approvals.forEach((item) => {
      const match = EXPERTS.find((expert) => String(item.approver || "").toLowerCase().includes(expert.name.toLowerCase()));
      if (match) approvalOwners.set(match.id, (approvalOwners.get(match.id) || 0) + 1);
    });

    return Array.from(byExpert.values()).map((expert) => {
      const sortedProjects = expert.projects.slice().sort((a, b) => healthRank(a) - healthRank(b) || a.health_score - b.health_score);
      const focusProject = sortedProjects[0] || null;
      const routeInfo = buildPatrolRoute(expert, focusProject);
      return {
        ...expert,
        focusProject,
        pendingApprovals: approvalOwners.get(expert.id) || (expert.id === "an" ? pendingApprovalCount : 0),
        focusText: focusProject ? `${focusProject.code} • ${focusProject.stage} • ${focusProject.health_status}` : `No direct assignment • standby`,
        patrolRoute: routeInfo.route,
        routeMode: routeInfo.mode,
      };
    });
  }

  function renderExpertsBoard(assignments) {
    const activeLabel = state.selectedExpertId
      ? `Focused expert: ${assignments.find((x) => x.id === state.selectedExpertId)?.name || "Unknown"}`
      : state.focusedProjectId != null
      ? `Focused project: #${state.focusedProjectId}`
      : "No expert selected";
    el.activeExpertBadge.textContent = activeLabel;

    el.expertsBoard.innerHTML = assignments
      .map((expert) => {
        const isActive = expert.id === state.selectedExpertId;
        const projectChips = expert.projects.length
          ? expert.projects.slice(0, 4).map((project) => `<span class="expert-project-chip">${escapeHtml(project.code)}</span>`).join("")
          : '<span class="expert-project-chip">Idle</span>';

        return `
          <article class="expert-card ${isActive ? "is-active" : ""}" data-expert-id="${expert.id}">
            <div class="expert-card__top">
              <div class="expert-identity">
                <div class="expert-avatar">
                  <img src="./assets/pixel/experts/${escapeHtml(expert.spriteKey)}/body.png" alt="${escapeHtml(expert.name)}" />
                </div>
                <div>
                  <div class="expert-tag">${escapeHtml(expert.tag)}</div>
                  <div class="expert-name">${escapeHtml(expert.name)}</div>
                  <div class="expert-role">${escapeHtml(expert.role)}</div>
                </div>
              </div>
              <div class="type-chip">${escapeHtml(expert.routeMode)}</div>
            </div>
            <div class="expert-metrics">
              <div><strong>Projects:</strong> ${escapeHtml(String(expert.projects.length))}</div>
              <div><strong>Active tasks:</strong> ${escapeHtml(String(expert.activeTasks))}</div>
              <div><strong>Pending approvals:</strong> ${escapeHtml(String(expert.pendingApprovals))}</div>
              <div><strong>Patrol route:</strong> ${escapeHtml(titleCase(expert.routeMode))}</div>
            </div>
            <div class="expert-focus">${escapeHtml(expert.focusText)}</div>
            <div class="expert-projects">${projectChips}</div>
          </article>
        `;
      })
      .join("");

    el.expertsBoard.querySelectorAll("[data-expert-id]").forEach((card) => {
      card.addEventListener("click", () => {
        const expertId = card.dataset.expertId;
        if (state.selectedExpertId === expertId) {
          setExpertFocus(null, null);
        } else {
          const record = state.expertAssignments.find((item) => item.id === expertId);
          setExpertFocus(expertId, record?.focusProject?.id ?? null);
        }
        syncDerivedViews();
        openExpertModal(expertId);
      });
    });
  }

  function renderWorkload(workload) {
    if (!el.workloadList) return;
    if (!workload.length) {
      el.workloadList.innerHTML = '<div class="empty-state">Chưa có dữ liệu workload.</div>';
      return;
    }

    el.workloadList.innerHTML = workload
      .map(
        (item) => `
        <div class="list-item">
          <div class="list-item__title">${escapeHtml(item.owner || "Unassigned")}</div>
          <div class="list-item__value">${escapeHtml(String(item.active_tasks || 0))}</div>
        </div>
      `
      )
      .join("");
  }

  function renderApprovals(approvals) {
    if (!el.approvalList) return;
    if (!approvals.length) {
      el.approvalList.innerHTML = '<div class="empty-state">Không có approval đang chờ.</div>';
      return;
    }

    el.approvalList.innerHTML = approvals
      .map(
        (item) => `
        <div class="list-item">
          <div>
            <div class="list-item__title">#${escapeHtml(String(item.id))} • Project ${escapeHtml(String(item.project_id || "-"))}</div>
            <div class="subtext">${escapeHtml(item.status || "pending")} • ${escapeHtml(formatDate(item.created_at))}</div>
          </div>
          <div class="list-item__value">${escapeHtml(item.approver || "-")}</div>
        </div>
      `
      )
      .join("");
  }

  function renderHeatmap(heatmap) {
    if (!el.heatmapList) return;
    if (!heatmap.length) {
      el.heatmapList.innerHTML = '<div class="empty-state">Chưa có dữ liệu heatmap.</div>';
      return;
    }

    el.heatmapList.innerHTML = heatmap
      .map(
        (item) => `
        <div class="list-item">
          <div class="list-item__title">${escapeHtml(item.type || "-")} / ${escapeHtml(item.category || "-")}</div>
          <div class="list-item__value">${escapeHtml(String(item.count || 0))}</div>
        </div>
      `
      )
      .join("");
  }

  function renderInsights(projects, workload, approvals) {
    if (!el.overviewNotes) return;
    const sortedProjects = projects.slice().sort((a, b) => healthRank(a) - healthRank(b) || a.health_score - b.health_score);
    const riskyProject = sortedProjects[0] || null;
    const busiestOwner = workload.slice().sort((a, b) => Number(b.active_tasks || 0) - Number(a.active_tasks || 0))[0] || null;
    const selectedExpert = state.selectedExpertId ? state.expertAssignments.find((item) => item.id === state.selectedExpertId) : null;

    const cards = [
      {
        title: "Project nguy hiểm nhất",
        value: riskyProject ? riskyProject.code : "-",
        meta: riskyProject ? `${riskyProject.name} • ${riskyProject.health_status} • score ${riskyProject.health_score}` : "No data",
      },
      {
        title: "Owner quá tải nhất",
        value: busiestOwner ? busiestOwner.owner : "-",
        meta: busiestOwner ? `${busiestOwner.active_tasks} active task(s)` : "No workload",
      },
      {
        title: "Approval đang pending",
        value: String(approvals.length),
        meta: approvals.length ? `Cần follow-up trong approval queue` : "Không có approval chờ",
      },
      {
        title: "Expert đang focus",
        value: selectedExpert ? selectedExpert.name : "None",
        meta: selectedExpert ? `${selectedExpert.focusText} • route ${titleCase(selectedExpert.routeMode)}` : "Click chuyên gia hoặc project để focus",
      },
    ];

    el.overviewNotes.innerHTML = cards
      .map(
        (card) => `
        <article class="insight-card">
          <div class="insight-card__top">
            <div class="insight-title">${escapeHtml(card.title)}</div>
            <div class="insight-value">${escapeHtml(card.value)}</div>
          </div>
          <div class="project-reason">${escapeHtml(card.meta)}</div>
        </article>
      `
      )
      .join("");
  }

  function renderKanban(projects) {
    if (!el.kanbanBoard) return;
    const stages = ["intake", "analysis", "design_review", "review", "approval", "execution", "validation", "handover", "closed"];
    const groups = new Map(stages.map((stage) => [stage, []]));
    projects.forEach((project) => {
      if (!groups.has(project.stage)) groups.set(project.stage, []);
      groups.get(project.stage).push(project);
    });

    el.kanbanBoard.innerHTML = Array.from(groups.entries())
      .map(([stage, items]) => {
        const cards = items
          .map((project) => {
            const classes = [
              "kanban-card",
              `status-${project.health_status}`,
              projectHandledBySelectedExpert(project) ? "kanban-highlighted" : "",
              state.selectedExpertId && !projectHandledBySelectedExpert(project) ? "kanban-dimmed" : "",
              projectIsFocused(project) ? "kanban-focused" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return `
              <article class="${classes}" data-project-id="${project.id}">
                <strong>${escapeHtml(project.code)}</strong>
                <div>${escapeHtml(project.name)}</div>
                <div class="subtext">${escapeHtml(project.owner)} • ${escapeHtml(project.health_status)}</div>
              </article>
            `;
          })
          .join("");

        return `
          <section class="kanban-column">
            <h3>${escapeHtml(stage)}</h3>
            <div class="kanban-count">${items.length} item(s)</div>
            <div class="kanban-cards">${cards || '<div class="empty-state">Không có item</div>'}</div>
          </section>
        `;
      })
      .join("");

    el.kanbanBoard.querySelectorAll("[data-project-id]").forEach((card) => {
      card.addEventListener("click", () => {
        const projectId = Number(card.dataset.projectId);
        setProjectFocus(projectId);
        syncDerivedViews();
        openProjectModal(projectId);
      });
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  async function loadPixelAssets() {
    const [house, sun, moon] = await Promise.all([
      loadImage(ASSET_PATHS.house),
      loadImage(ASSET_PATHS.sun),
      loadImage(ASSET_PATHS.moon),
    ]);

    const expertImages = {};
    for (const expert of EXPERTS) {
      const key = expert.spriteKey;
      const [body, outfit, hair] = await Promise.all([
        loadImage(`./assets/pixel/experts/${key}/body.png`),
        loadImage(`./assets/pixel/experts/${key}/outfit.png`),
        loadImage(`./assets/pixel/experts/${key}/hair.png`),
      ]);
      expertImages[expert.id] = { body, outfit, hair };
    }

    return { house, sun, moon, expertImages };
  }

  function drawBubble(ctx, x, y, width, text, color) {
    const bubbleX = x - width / 2;
    const bubbleY = y - 82;
    ctx.fillStyle = "rgba(6, 16, 29, 0.96)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bubbleX, bubbleY, width, 24, 8);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 5, bubbleY + 24);
    ctx.lineTo(x, bubbleY + 30);
    ctx.lineTo(x + 5, bubbleY + 24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f3f8ff";
    ctx.font = "15px VT323";
    ctx.textAlign = "center";
    ctx.fillText(text, x, bubbleY + 16);
  }

  function drawNameplate(ctx, x, y, text, color, active) {
    const width = Math.max(44, text.length * 9 + 12);
    const plateX = x - width / 2;
    const plateY = y + 10;
    ctx.fillStyle = active ? "rgba(8, 18, 34, 0.96)" : "rgba(8, 18, 34, 0.88)";
    ctx.strokeStyle = active ? color : "rgba(255,255,255,0.18)";
    ctx.lineWidth = active ? 2 : 1.5;
    ctx.beginPath();
    ctx.roundRect(plateX, plateY, width, 18, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f3f8ff";
    ctx.font = "14px VT323";
    ctx.textAlign = "center";
    ctx.fillText(text, x, plateY + 12);
  }

  function drawSprite(ctx, assets, x, y, bobOffset = 0) {
    const sx = 0;
    const drawX = x - 24;
    const drawY = y - 48 + bobOffset;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(assets.body, sx, 0, 32, 32, drawX, drawY, 48, 48);
    ctx.drawImage(assets.outfit, sx, 0, 32, 32, drawX, drawY, 48, 48);
    ctx.drawImage(assets.hair, sx, 0, 32, 32, drawX, drawY, 48, 48);
  }

  function getPointOnRoute(route, t) {
    const points = route && route.length ? route : [ZONES.idle];
    if (points.length === 1) return points[0];
    const segmentCount = points.length - 1;
    const scaled = (t % 1) * segmentCount;
    const index = Math.min(segmentCount - 1, Math.floor(scaled));
    const localT = scaled - index;
    const from = points[index];
    const to = points[index + 1];
    return {
      x: from.x + (to.x - from.x) * localT,
      y: from.y + (to.y - from.y) * localT,
    };
  }

  function drawRoute(ctx, route, color, active) {
    if (!route || route.length < 2) return;
    ctx.strokeStyle = active ? color : "rgba(255,255,255,0.08)";
    ctx.lineWidth = active ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(route[0].x, route[0].y);
    for (let i = 1; i < route.length; i += 1) ctx.lineTo(route[i].x, route[i].y);
    ctx.stroke();
    route.forEach((point) => {
      ctx.fillStyle = active ? color : "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.arc(point.x, point.y, active ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function renderPixelWorldFrame(timestamp) {
    if (!el.pixelCanvas || !state.pixelAssets) return;
    if (!state.animationStart) state.animationStart = timestamp;

    const ctx = el.pixelCanvas.getContext("2d");
    if (!ctx) return;

    const { house, sun, moon, expertImages } = state.pixelAssets;
    const canvas = el.pixelCanvas;
    const seconds = (timestamp - state.animationStart) / 1000;
    state.pixelHitRegions = [];

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(house, 0, 0, canvas.width, canvas.height);

    const currentHour = new Date().getHours();
    const skyAsset = currentHour >= 6 && currentHour < 18 ? sun : moon;
    ctx.drawImage(skyAsset, 38, 32, 70, 70);

    ctx.fillStyle = "rgba(5, 12, 24, 0.78)";
    ctx.fillRect(18, 18, 340, 52);
    ctx.strokeStyle = "rgba(96, 165, 250, 0.28)";
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, 340, 52);
    ctx.fillStyle = "#f3f8ff";
    ctx.font = "28px VT323";
    ctx.textAlign = "left";
    ctx.fillText("PIXEL OPERATIONS FLOOR V2.3", 30, 48);

    state.expertAssignments.forEach((expert, index) => {
      const assets = expertImages[expert.id];
      if (!assets) return;
      const phase = index * 0.7;
      const speed = expert.routeMode === "delivery" ? 0.08 : expert.routeMode === "blocked" ? 0.05 : 0.06;
      const routeT = ((seconds * speed) + phase * 0.08) % 1;
      const point = getPointOnRoute(expert.patrolRoute, routeT);
      const bob = Math.sin(seconds * 4 + phase) * 2;
      const isActive = state.selectedExpertId === expert.id || (expert.focusProject && Number(expert.focusProject.id) === Number(state.focusedProjectId));

      drawRoute(ctx, expert.patrolRoute, expert.color, isActive);

      ctx.fillStyle = isActive ? "rgba(34,211,238,.22)" : "rgba(0,0,0,.18)";
      ctx.beginPath();
      ctx.ellipse(point.x, point.y, isActive ? 16 : 12, isActive ? 7 : 6, 0, 0, Math.PI * 2);
      ctx.fill();
      drawSprite(ctx, assets, point.x, point.y, bob);

      if (isActive) {
        ctx.strokeStyle = expert.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(point.x, point.y - 26, 20 + Math.sin(seconds * 3) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      const bubbleText = expert.focusProject ? abbreviateProjectCode(expert.focusProject.code) : "STBY";
      drawBubble(ctx, point.x, point.y - 2, Math.max(52, bubbleText.length * 10 + 8), bubbleText, expert.color);
      drawNameplate(ctx, point.x, point.y, expert.name.toUpperCase(), expert.color, isActive);

      state.pixelHitRegions.push({
        type: "expert",
        id: expert.id,
        x: point.x - 24,
        y: point.y - 54,
        w: 48,
        h: 70,
      });
    });

    if (el.pixelRoster) el.pixelRoster.innerHTML = state.expertAssignments
      .map(
        (expert) => `
          <div class="pixel-roster-item ${state.selectedExpertId === expert.id ? "is-active" : ""}" data-expert-id="${expert.id}">
            <div class="pixel-roster-item__name">${escapeHtml(expert.name)}</div>
            <div class="pixel-roster-item__meta">${escapeHtml(expert.role)} • ${escapeHtml(expert.tag)} • ${escapeHtml(expert.routeMode)}</div>
            <div class="pixel-roster-item__focus">${escapeHtml(expert.focusText)}</div>
          </div>
        `
      )
      .join("");

    el.pixelRoster?.querySelectorAll("[data-expert-id]").forEach((item) => {
      item.addEventListener("click", () => {
        const expertId = item.dataset.expertId;
        const record = getExpertById(expertId);
        setExpertFocus(expertId, record?.focusProject?.id ?? null);
        syncDerivedViews();
        openExpertModal(expertId);
      });
    });

    state.animationFrame = requestAnimationFrame(renderPixelWorldFrame);
  }

  function startPixelAnimation() {
    if (!state.pixelAssets) return;
    if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
    state.animationFrame = requestAnimationFrame(renderPixelWorldFrame);
  }

  function renderFilters() {
    if (!el.filterProjectType && !el.filterStage && !el.filterOwner && !el.filterHealth && !el.filterSearch) return;
    const projects = state.projects;
    const types = [...new Set(projects.map((p) => p.type))].sort();
    const stages = [...new Set(projects.map((p) => p.stage))].sort();
    const owners = [
      ...EXPERTS.map((expert) => ({ value: expert.id, label: expert.name })),
      { value: "unassigned", label: "Unassigned" },
    ];

    function renderOptions(select, values, current, mapper) {
      if (!select) return;
      const options = ['<option value="all">All</option>']
        .concat(values.map((value) => {
          const mapped = mapper ? mapper(value) : { value, label: value };
          return `<option value="${escapeHtml(mapped.value)}">${escapeHtml(mapped.label)}</option>`;
        }))
        .join("");
      select.innerHTML = options;
      const rawValues = values.map((value) => (mapper ? mapper(value).value : value));
      select.value = rawValues.includes(current) ? current : "all";
    }

    renderOptions(el.filterProjectType, types, state.filters.projectType, (value) => ({ value, label: titleCase(value) }));
    renderOptions(el.filterStage, stages, state.filters.stage, (value) => ({ value, label: titleCase(value) }));
    renderOptions(el.filterOwner, owners, state.filters.ownerExpert, (value) => value);
    if (el.filterHealth) el.filterHealth.value = state.filters.healthStatus;
    if (el.filterSearch) el.filterSearch.value = state.filters.search;
  }

  function syncDerivedViews() {
    const filteredProjects = getFilteredProjects();
    state.expertAssignments = buildExpertAssignments(filteredProjects, state.workload, state.approvals);

    if (state.selectedExpertId && !state.expertAssignments.some((item) => item.id === state.selectedExpertId)) {
      state.selectedExpertId = null;
    }
    if (state.focusedProjectId != null && !filteredProjects.some((item) => Number(item.id) === Number(state.focusedProjectId))) {
      state.focusedProjectId = null;
    }

    renderProjects(filteredProjects);
    renderExpertsBoard(state.expertAssignments);
    renderInsights(filteredProjects, state.workload, state.approvals);
    renderKanban(filteredProjects);
    startPixelAnimation();
  }

  async function loadSummary() {
    state.summary = await fetchJson("/api/dashboard/summary");
    renderSummaryCards(state.summary);
  }

  async function loadProjects() {
    const data = await fetchJson("/api/projects");
    state.projects = asArray(data).map(normalizeProject);
    renderFilters();
  }

  async function loadWorkload() {
    state.workload = asArray(await fetchJson("/api/dashboard/workload"));
    renderWorkload(state.workload);
  }

  async function loadHeatmap() {
    state.heatmap = asArray(await fetchJson("/api/dashboard/heatmap"));
    renderHeatmap(state.heatmap);
  }

  async function loadApprovals() {
    state.approvals = asArray(await fetchJson("/api/approvals/pending"));
    renderApprovals(state.approvals);
  }

  async function refreshAll() {
    try {
      setAppStatus("Đang tải dữ liệu...", "loading");
      await Promise.all([loadSummary(), loadProjects(), loadWorkload(), loadHeatmap(), loadApprovals()]);
      syncDerivedViews();
      setAppStatus("Đã đồng bộ dashboard thành công.", "success");
    } catch (err) {
      console.error(err);
      setAppStatus(`Lỗi tải dữ liệu: ${err.message}`, "error");
    }
  }

  function readFormData(form) {
    const formData = new FormData(form);
    return {
      project_code: (formData.get("project_code") || "").toString().trim() || undefined,
      project_name: (formData.get("project_name") || "").toString().trim(),
      project_type: (formData.get("project_type") || "GENERAL").toString().trim(),
      stage: (formData.get("stage") || "intake").toString().trim(),
      owner: (formData.get("owner") || "Unassigned").toString().trim(),
      due_date: (formData.get("due_date") || "").toString().trim() || undefined,
    };
  }

  async function handleCreateProject(event) {
    event.preventDefault();
    const submitBtn = document.getElementById("createProjectBtn");
    try {
      submitBtn.disabled = true;
      el.formStatus.textContent = "Đang tạo project...";
      const payload = readFormData(el.projectForm);
      if (!payload.project_name) throw new Error("Vui lòng nhập Project Name.");
      const result = await fetchJson("/api/projects", { method: "POST", body: payload });
      el.formStatus.textContent = `Tạo thành công: ${result.project_code || payload.project_name}`;
      el.projectForm.reset();
      await refreshAll();
    } catch (err) {
      console.error(err);
      el.formStatus.textContent = `Tạo project thất bại: ${err.message}`;
    } finally {
      submitBtn.disabled = false;
    }
  }

  function bindFilters() {
    const onFilterChange = () => {
      state.filters.search = el.filterSearch?.value || "";
      state.filters.projectType = el.filterProjectType?.value || "all";
      state.filters.stage = el.filterStage?.value || "all";
      state.filters.healthStatus = el.filterHealth?.value || "all";
      state.filters.ownerExpert = el.filterOwner?.value || "all";
      syncDerivedViews();
    };

    el.filterSearch?.addEventListener("input", onFilterChange);
    el.filterProjectType?.addEventListener("change", onFilterChange);
    el.filterStage?.addEventListener("change", onFilterChange);
    el.filterHealth?.addEventListener("change", onFilterChange);
    el.filterOwner?.addEventListener("change", onFilterChange);
    el.resetFiltersBtn?.addEventListener("click", () => {
      state.filters = { search: "", projectType: "all", stage: "all", healthStatus: "all", ownerExpert: "all" };
      renderFilters();
      setExpertFocus(null, null);
      syncDerivedViews();
    });
  }

  function bindModalEvents() {
    el.detailModalClose?.addEventListener("click", closeDetailModal);
    el.detailModal?.addEventListener("click", (event) => {
      const target = event.target;
      if (target && target.dataset && target.dataset.closeModal === "true") closeDetailModal();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && state.modal.open) closeDetailModal();
    });
  }

  function bindPixelEvents() {
    if (!el.pixelCanvas) return;
    el.pixelCanvas.addEventListener("click", (event) => {
      const rect = el.pixelCanvas.getBoundingClientRect();
      const scaleX = el.pixelCanvas.width / rect.width;
      const scaleY = el.pixelCanvas.height / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;
      const hit = state.pixelHitRegions.find((item) => x >= item.x && x <= item.x + item.w && y >= item.y && y <= item.y + item.h);
      if (!hit) return;
      if (hit.type === "expert") {
        const record = getExpertById(hit.id);
        setExpertFocus(hit.id, record?.focusProject?.id ?? null);
        syncDerivedViews();
        openExpertModal(hit.id);
      }
    });
  }

  async function bootstrap() {
    if (!API_BASE) {
      setAppStatus("Thiếu APP_CONFIG.apiBaseUrl trong config.js", "error");
      return;
    }

    try {
      state.pixelAssets = await loadPixelAssets();
    } catch (err) {
      console.warn("Không thể tải pixel assets đầy đủ", err);
    }

    el.projectForm?.addEventListener("submit", handleCreateProject);
    el.refreshBtn?.addEventListener("click", refreshAll);
    bindFilters();
    bindModalEvents();
    bindPixelEvents();
    await refreshAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
