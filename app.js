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
      basePos: { x: 750, y: 300 },
    },
    {
      id: "thanh",
      name: "Thanh",
      role: "Lead Solution Architect",
      tag: "presales",
      specialties: ["presales", "analysis", "design_review", "design"],
      spriteKey: "minh",
      color: "#22d3ee",
      basePos: { x: 210, y: 355 },
    },
    {
      id: "tuan",
      name: "Tuấn",
      role: "Delivery Architect",
      tag: "delivery",
      specialties: ["delivery", "execution", "implementation", "validation"],
      spriteKey: "linh",
      color: "#60a5fa",
      basePos: { x: 390, y: 340 },
    },
    {
      id: "phu",
      name: "Phú",
      role: "Security Review Specialist",
      tag: "review",
      specialties: ["review", "approval", "design_review"],
      spriteKey: "nam",
      color: "#a78bfa",
      basePos: { x: 555, y: 336 },
    },
    {
      id: "an",
      name: "An",
      role: "Approval Coordinator",
      tag: "approvals",
      specialties: ["approval", "at_risk", "blocked"],
      spriteKey: "vy",
      color: "#f59e0b",
      basePos: { x: 680, y: 352 },
    },
  ];

  const ASSET_PATHS = {
    house: "./assets/pixel/map/housemap.png",
    sun: "./assets/pixel/map/sun.png",
    moon: "./assets/pixel/map/moon.png",
  };

  const ZONES = {
    intake: { x: 160, y: 360 },
    analysis: { x: 250, y: 350 },
    design_review: { x: 335, y: 335 },
    design: { x: 335, y: 335 },
    review: { x: 470, y: 335 },
    approval: { x: 610, y: 340 },
    execution: { x: 510, y: 390 },
    implementation: { x: 510, y: 390 },
    validation: { x: 690, y: 385 },
    handover: { x: 780, y: 315 },
    closed: { x: 808, y: 250 },
    idle: { x: 140, y: 250 },
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
    filters: {
      projectType: "all",
      stage: "all",
      healthStatus: "all",
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
    filterProjectType: document.getElementById("filterProjectType"),
    filterStage: document.getElementById("filterStage"),
    filterHealth: document.getElementById("filterHealth"),
    resetFiltersBtn: document.getElementById("resetFiltersBtn"),
    projectCounter: document.getElementById("projectCounter"),
    activeExpertBadge: document.getElementById("activeExpertBadge"),
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

  function healthRank(project) {
    const map = { blocked: 0, delayed: 1, at_risk: 2, on_track: 3 };
    return map[String(project?.health_status || "on_track")] ?? 4;
  }

  function fetchJson(path, options = {}) {
    const url = `${API_BASE}${path}`;
    const headers = { ...(options.headers || {}) };
    let body = options.body;

    if (body !== undefined && typeof body !== "string") {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }

    return fetch(url, {
      method: options.method || "GET",
      headers,
      body,
    }).then(async (response) => {
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
    });
  }

  function normalizeProject(project) {
    return {
      id: project.id,
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

  function projectMatchesFilters(project) {
    const f = state.filters;
    if (f.projectType !== "all" && project.type !== f.projectType) return false;
    if (f.stage !== "all" && project.stage !== f.stage) return false;
    if (f.healthStatus !== "all" && project.health_status !== f.healthStatus) return false;
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
      .map(([label, value]) => `
        <article class="card">
          <div class="card-label">${escapeHtml(label)}</div>
          <div class="card-value">${escapeHtml(String(value))}</div>
        </article>
      `)
      .join("");
  }

  function projectHandledBySelectedExpert(project) {
    if (!state.selectedExpertId) return false;
    const assignment = state.expertAssignments.find((expert) => expert.id === state.selectedExpertId);
    return !!assignment && assignment.projectIds.includes(Number(project.id));
  }

  function renderProjects(projects) {
    if (!projects.length) {
      el.projectList.innerHTML = '<div class="empty-state">Không có project nào khớp bộ lọc hiện tại.</div>';
      return;
    }

    el.projectCounter.textContent = `${projects.length} project(s)`;

    el.projectList.innerHTML = projects
      .map((project) => {
        const isSelected = projectHandledBySelectedExpert(project);
        const anySelected = !!state.selectedExpertId;
        const classes = [
          "project-card",
          `status-${project.health_status}`,
          isSelected ? "project-highlighted" : "",
          anySelected && !isSelected ? "project-dimmed" : "",
        ].filter(Boolean).join(" ");

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
              <div><strong>Owner:</strong> ${escapeHtml(project.owner)}</div>
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
  }

  function resolveProjectOwnerAssignment(project) {
    const owner = String(project.owner || "").toLowerCase().trim();
    if (!owner || owner === "unassigned") return null;
    return EXPERTS.find((expert) => owner.includes(expert.name.toLowerCase())) || null;
  }

  function findExpertForProject(project, expertUsage) {
    const byOwner = resolveProjectOwnerAssignment(project);
    if (byOwner) return byOwner;

    const candidates = EXPERTS.filter((expert) =>
      expert.specialties.includes(project.type) || expert.specialties.includes(project.stage) || expert.specialties.includes(project.health_status)
    );

    const pool = candidates.length ? candidates : EXPERTS;
    return pool
      .slice()
      .sort((a, b) => (expertUsage[a.id] || 0) - (expertUsage[b.id] || 0))[0];
  }


  function projectHandledBySelectedExpert(project) {
    if (!state.selectedExpertId) return false;
    const assignment = state.expertAssignments.find((expert) => expert.id === state.selectedExpertId);
    return !!assignment && assignment.projectIds.includes(Number(project.id));
  }

  function buildExpertAssignments(projects, workload, approvals) {
    const usage = Object.fromEntries(EXPERTS.map((expert) => [expert.id, 0]));
    const assignmentsByExpert = Object.fromEntries(EXPERTS.map((expert) => [expert.id, []]));
    const projectPool = projects.slice().sort((a, b) => {
      const byRank = healthRank(a) - healthRank(b);
      if (byRank !== 0) return byRank;
      return a.health_score - b.health_score;
    });

    for (const project of projectPool) {
      const expert = findExpertForProject(project, usage);
      assignmentsByExpert[expert.id].push(project);
      usage[expert.id] += 1;
    }

    return EXPERTS.map((expert, index) => {
      const projectsForExpert = assignmentsByExpert[expert.id] || [];
      const focusProject = projectsForExpert[0] || null;
      const ownerRow = workload.find((item) => String(item.owner || "").toLowerCase().includes(expert.name.toLowerCase()));
      const pendingCount = asArray(approvals).filter((item) => projectsForExpert.some((project) => Number(project.id) === Number(item.project_id))).length;
      const zoneTarget = focusProject ? (ZONES[focusProject.stage] || ZONES.idle) : ZONES.idle;
      return {
        ...expert,
        order: index,
        projects: projectsForExpert,
        projectIds: projectsForExpert.map((project) => Number(project.id)),
        focusProject,
        focusText: focusProject ? `${focusProject.code} • ${focusProject.name}` : "Đang chờ assignment",
        healthStatus: focusProject ? focusProject.health_status : "on_track",
        activeTasks: Number(ownerRow?.active_tasks || 0),
        pendingApprovals: pendingCount,
        targetPos: zoneTarget,
      };
    });
  }

  function renderExpertsBoard(assignments) {
    const anySelected = !!state.selectedExpertId;
    el.activeExpertBadge.textContent = anySelected
      ? `Selected: ${assignments.find((item) => item.id === state.selectedExpertId)?.name || "-"}`
      : "No expert selected";

    el.expertsBoard.innerHTML = assignments
      .map((expert) => {
        const isActive = state.selectedExpertId === expert.id;
        return `
          <article class="expert-card ${isActive ? "is-active" : ""}" data-expert-id="${escapeHtml(expert.id)}">
            <div class="expert-card__top">
              <div class="expert-identity">
                <div class="expert-avatar">
                  <img src="./assets/pixel/experts/${escapeHtml(expert.spriteKey)}/body.png" alt="${escapeHtml(expert.name)}" />
                </div>
                <div>
                  <div class="expert-code">${escapeHtml(expert.tag)}</div>
                  <div class="expert-name">${escapeHtml(expert.name)}</div>
                  <div class="expert-role">${escapeHtml(expert.role)}</div>
                </div>
              </div>
              <div class="type-chip">${escapeHtml(expert.healthStatus)}</div>
            </div>
            <div class="expert-metrics">
              <div><strong>Projects:</strong> ${expert.projects.length}</div>
              <div><strong>Tasks:</strong> ${expert.activeTasks}</div>
              <div><strong>Approvals:</strong> ${expert.pendingApprovals}</div>
              <div><strong>Zone:</strong> ${escapeHtml(expert.focusProject ? expert.focusProject.stage : "idle")}</div>
            </div>
            <div class="expert-focus">${escapeHtml(expert.focusText)}</div>
            <div class="expert-projects">
              ${expert.projects.length
                ? expert.projects.map((project) => `<span class="expert-project-chip">${escapeHtml(project.code)}</span>`).join("")
                : '<span class="expert-project-chip">Idle</span>'}
            </div>
          </article>
        `;
      })
      .join("");

    el.expertsBoard.querySelectorAll("[data-expert-id]").forEach((node) => {
      node.addEventListener("click", () => {
        const nextId = node.getAttribute("data-expert-id");
        state.selectedExpertId = state.selectedExpertId === nextId ? null : nextId;
        syncDerivedViews();
      });
    });
  }

  function renderInsights(projects, workload, approvals) {
    const filtered = projects;
    const riskiest = filtered.slice().sort((a, b) => healthRank(a) - healthRank(b) || a.health_score - b.health_score)[0] || null;
    const busiest = workload.slice().sort((a, b) => Number(b.active_tasks || 0) - Number(a.active_tasks || 0))[0] || null;
    const pending = approvals.length;

    el.overviewNotes.innerHTML = [
      {
        title: "Project nguy hiểm nhất",
        value: riskiest ? riskiest.code : "N/A",
        body: riskiest ? `${riskiest.name} • ${riskiest.health_status} • score ${riskiest.health_score}` : "Chưa có dữ liệu",
      },
      {
        title: "Owner quá tải nhất",
        value: busiest ? busiest.owner : "N/A",
        body: busiest ? `${busiest.active_tasks} active task(s)` : "Chưa có dữ liệu workload",
      },
      {
        title: "Số approval đang pending",
        value: pending,
        body: pending ? "Cần ưu tiên xử lý trong ngày." : "Không có approval pending.",
      },
    ]
      .map(
        (item) => `
          <article class="insight-card">
            <div class="insight-card__top">
              <div class="insight-title">${escapeHtml(item.title)}</div>
              <div class="insight-value">${escapeHtml(String(item.value))}</div>
            </div>
            <div class="subtext">${escapeHtml(item.body)}</div>
          </article>
        `
      )
      .join("");
  }

  function renderWorkload(workload) {
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

  function renderHeatmap(heatmap) {
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

  function renderApprovals(approvals) {
    if (!approvals.length) {
      el.approvalList.innerHTML = '<div class="empty-state">Không có approval đang chờ.</div>';
      return;
    }
    el.approvalList.innerHTML = approvals
      .map(
        (item) => `
        <div class="list-item">
          <div>
            <div class="list-item__title">#${escapeHtml(String(item.id))} • Project ID ${escapeHtml(String(item.project_id || "-"))}</div>
            <div class="subtext">Approver: ${escapeHtml(item.approver || "-")} • Created: ${escapeHtml(formatDate(item.created_at))}</div>
          </div>
          <div class="type-chip">${escapeHtml(item.status || "pending")}</div>
        </div>
      `
      )
      .join("");
  }

  function renderKanban(projects) {
    const stages = ["intake", "analysis", "design_review", "review", "approval", "execution", "validation", "handover", "closed"];
    const groups = new Map(stages.map((stage) => [stage, []]));

    projects.forEach((project) => {
      const stage = String(project.stage || "intake").toLowerCase();
      if (!groups.has(stage)) groups.set(stage, []);
      groups.get(stage).push(project);
    });

    const anySelected = !!state.selectedExpertId;

    el.kanbanBoard.innerHTML = Array.from(groups.entries())
      .map(
        ([stage, items]) => `
        <div class="kanban-column">
          <h3>${escapeHtml(stage)}</h3>
          <div class="kanban-count">${items.length} item(s)</div>
          <div class="kanban-cards">
            ${
              items.length
                ? items
                    .map((project) => {
                      const isSelected = projectHandledBySelectedExpert(project);
                      const classes = [
                        "kanban-card",
                        `status-${project.health_status}`,
                        isSelected ? "kanban-highlighted" : "",
                        anySelected && !isSelected ? "kanban-dimmed" : "",
                      ].filter(Boolean).join(" ");
                      return `
                        <div class="${classes}">
                          <strong>${escapeHtml(project.code)}</strong>
                          <div>${escapeHtml(project.name)}</div>
                          <div class="subtext">${escapeHtml(project.owner)} • ${escapeHtml(project.health_status)} • due ${escapeHtml(formatDate(project.due_date))}</div>
                        </div>
                      `;
                    })
                    .join("")
                : '<div class="empty-state">Không có item</div>'
            }
          </div>
        </div>
      `
      )
      .join("");
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
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
    const bubbleY = y - 62;
    ctx.fillStyle = "rgba(6, 16, 29, 0.92)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bubbleX, bubbleY, width, 28, 8);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 6, bubbleY + 28);
    ctx.lineTo(x, bubbleY + 36);
    ctx.lineTo(x + 6, bubbleY + 28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f3f8ff";
    ctx.font = "16px VT323";
    ctx.textAlign = "center";
    ctx.fillText(text, x, bubbleY + 18);
  }

  function drawSprite(ctx, assets, x, y, bobOffset = 0) {
    const frame = 0;
    const sx = frame * 32;
    const drawX = x - 24;
    const drawY = y - 48 + bobOffset;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(assets.body, sx, 0, 32, 32, drawX, drawY, 48, 48);
    ctx.drawImage(assets.outfit, sx, 0, 32, 32, drawX, drawY, 48, 48);
    ctx.drawImage(assets.hair, sx, 0, 32, 32, drawX, drawY, 48, 48);
  }

  function renderPixelWorldFrame(timestamp) {
    if (!el.pixelCanvas || !state.pixelAssets) return;
    if (!state.animationStart) state.animationStart = timestamp;

    const ctx = el.pixelCanvas.getContext("2d");
    if (!ctx) return;

    const { house, sun, moon, expertImages } = state.pixelAssets;
    const canvas = el.pixelCanvas;
    const seconds = (timestamp - state.animationStart) / 1000;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(house, 0, 0, canvas.width, canvas.height);

    const currentHour = new Date().getHours();
    const skyAsset = currentHour >= 6 && currentHour < 18 ? sun : moon;
    ctx.drawImage(skyAsset, 38, 32, 70, 70);

    ctx.fillStyle = "rgba(5, 12, 24, 0.78)";
    ctx.fillRect(18, 18, 290, 52);
    ctx.strokeStyle = "rgba(96, 165, 250, 0.28)";
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, 290, 52);
    ctx.fillStyle = "#f3f8ff";
    ctx.font = "28px VT323";
    ctx.textAlign = "left";
    ctx.fillText("PIXEL OPERATIONS FLOOR", 30, 48);

    state.expertAssignments.forEach((expert, index) => {
      const assets = expertImages[expert.id];
      if (!assets) return;
      const phase = index * 0.9;
      const targetX = expert.targetPos?.x || expert.basePos.x;
      const targetY = expert.targetPos?.y || expert.basePos.y;
      const roamX = Math.sin(seconds * 0.7 + phase) * 12;
      const roamY = Math.cos(seconds * 0.9 + phase) * 5;
      const bob = Math.sin(seconds * 2.4 + phase) * 2;
      const x = targetX + roamX;
      const y = targetY + roamY;
      const isActive = state.selectedExpertId === expert.id;

      ctx.fillStyle = isActive ? "rgba(34,211,238,.22)" : "rgba(0,0,0,.18)";
      ctx.beginPath();
      ctx.ellipse(x, y, isActive ? 16 : 12, isActive ? 7 : 6, 0, 0, Math.PI * 2);
      ctx.fill();
      drawSprite(ctx, assets, x, y, bob);

      if (isActive) {
        ctx.strokeStyle = expert.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y - 26, 20 + Math.sin(seconds * 3) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = expert.color;
      ctx.font = "20px VT323";
      ctx.textAlign = "center";
      ctx.fillText(expert.name.toUpperCase(), x, y - 58);

      const bubbleText = expert.focusProject ? expert.focusProject.code : "IDLE";
      drawBubble(ctx, x, y - 2, Math.max(90, bubbleText.length * 10), bubbleText, expert.color);
    });

    el.pixelRoster.innerHTML = state.expertAssignments
      .map(
        (expert) => `
          <div class="pixel-roster-item ${state.selectedExpertId === expert.id ? "is-active" : ""}">
            <div class="pixel-roster-item__name">${escapeHtml(expert.name)}</div>
            <div class="pixel-roster-item__meta">${escapeHtml(expert.role)} • ${escapeHtml(expert.tag)}</div>
            <div class="pixel-roster-item__focus">${escapeHtml(expert.focusText)}</div>
          </div>
        `
      )
      .join("");

    state.animationFrame = requestAnimationFrame(renderPixelWorldFrame);
  }

  function startPixelAnimation() {
    if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
    state.animationFrame = requestAnimationFrame(renderPixelWorldFrame);
  }

  function renderFilters() {
    const projects = state.projects;
    const types = [...new Set(projects.map((p) => p.type))].sort();
    const stages = [...new Set(projects.map((p) => p.stage))].sort();

    const renderOptions = (select, values, current) => {
      if (!select) return;
      select.innerHTML = ['<option value="all">All</option>']
        .concat(values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`))
        .join("");
      select.value = values.includes(current) ? current : "all";
    };

    renderOptions(el.filterProjectType, types, state.filters.projectType);
    renderOptions(el.filterStage, stages, state.filters.stage);
    if (el.filterHealth) el.filterHealth.value = state.filters.healthStatus;
  }

  function syncDerivedViews() {
    const filteredProjects = getFilteredProjects();
    state.expertAssignments = buildExpertAssignments(filteredProjects, state.workload, state.approvals);
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
      if (!payload.project_name) {
        throw new Error("Vui lòng nhập Project Name.");
      }
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
      state.filters.projectType = el.filterProjectType?.value || "all";
      state.filters.stage = el.filterStage?.value || "all";
      state.filters.healthStatus = el.filterHealth?.value || "all";
      syncDerivedViews();
    };

    el.filterProjectType?.addEventListener("change", onFilterChange);
    el.filterStage?.addEventListener("change", onFilterChange);
    el.filterHealth?.addEventListener("change", onFilterChange);
    el.resetFiltersBtn?.addEventListener("click", () => {
      state.filters = { projectType: "all", stage: "all", healthStatus: "all" };
      renderFilters();
      syncDerivedViews();
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
    await refreshAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
