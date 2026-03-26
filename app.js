(function () {
  "use strict";

  const API_BASE = ((window.APP_CONFIG && window.APP_CONFIG.apiBaseUrl) || "").replace(/\/+$/, "");

  const EXPERTS = [
    {
      id: "minh",
      name: "Anh Minh",
      role: "Lead Solution Architect",
      specialty: ["presales", "design_review", "analysis"],
      tag: "Lead SA",
      sprite: {
        body: "./assets/pixel/experts/minh/body.png",
        outfit: "./assets/pixel/experts/minh/outfit.png",
        hair: "./assets/pixel/experts/minh/hair.png",
      },
      color: "#22d3ee",
      pos: { x: 210, y: 355 },
    },
    {
      id: "linh",
      name: "Chị Linh",
      role: "Secure Delivery Architect",
      specialty: ["delivery", "execution", "implementation", "validation"],
      tag: "Delivery",
      sprite: {
        body: "./assets/pixel/experts/linh/body.png",
        outfit: "./assets/pixel/experts/linh/outfit.png",
        hair: "./assets/pixel/experts/linh/hair.png",
      },
      color: "#60a5fa",
      pos: { x: 375, y: 340 },
    },
    {
      id: "nam",
      name: "Anh Nam",
      role: "Security Review Specialist",
      specialty: ["review", "design", "review_stage"],
      tag: "Review",
      sprite: {
        body: "./assets/pixel/experts/nam/body.png",
        outfit: "./assets/pixel/experts/nam/outfit.png",
        hair: "./assets/pixel/experts/nam/hair.png",
      },
      color: "#a78bfa",
      pos: { x: 535, y: 338 },
    },
    {
      id: "vy",
      name: "Chị Vy",
      role: "Approval Coordinator",
      specialty: ["approval", "pending_approvals"],
      tag: "Approvals",
      sprite: {
        body: "./assets/pixel/experts/vy/body.png",
        outfit: "./assets/pixel/experts/vy/outfit.png",
        hair: "./assets/pixel/experts/vy/hair.png",
      },
      color: "#f59e0b",
      pos: { x: 678, y: 352 },
    },
    {
      id: "phuc",
      name: "Anh Phúc",
      role: "Handover & Closure Specialist",
      specialty: ["handover", "closed", "validation"],
      tag: "Handover",
      sprite: {
        body: "./assets/pixel/experts/phuc/body.png",
        outfit: "./assets/pixel/experts/phuc/outfit.png",
        hair: "./assets/pixel/experts/phuc/hair.png",
      },
      color: "#22c55e",
      pos: { x: 785, y: 298 },
    },
  ];

  const ASSET_PATHS = {
    house: "./assets/pixel/map/housemap.png",
    sun: "./assets/pixel/map/sun.png",
    moon: "./assets/pixel/map/moon.png",
  };

  const state = {
    projects: [],
    workload: [],
    heatmap: [],
    approvals: [],
    summary: {},
    expertAssignments: [],
    pixelAssets: null,
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

  function formatNumber(value, fallback = "0") {
    const num = Number(value);
    return Number.isFinite(num) ? String(num) : fallback;
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
      type: project.project_type || project.type || "GENERAL",
      stage: project.stage || "intake",
      owner: project.owner || project.owner_name || "Unassigned",
      health_status: project.health_status || "on_track",
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

  function renderSummaryCards(summary) {
    const s = summary || {};
    const cards = [
      ["Total Projects", s.total_projects || 0],
      ["On Track", s.on_track || 0],
      ["At Risk", s.at_risk || 0],
      ["Delayed", s.delayed || 0],
      ["Blocked", s.blocked || 0],
      ["Avg Health Score", s.avg_health_score || 0],
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

  function renderProjects(projects) {
    if (!projects.length) {
      el.projectList.innerHTML = '<div class="empty-state">Chưa có project nào.</div>';
      return;
    }

    el.projectList.innerHTML = projects
      .map(
        (project) => `
        <article class="project-card status-${escapeHtml(project.health_status)}">
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
      `
      )
      .join("");
  }

  function buildExpertAssignments(projects, workload, approvals) {
    const sortedProjects = projects.slice().sort((a, b) => {
      const byRank = healthRank(a) - healthRank(b);
      if (byRank !== 0) return byRank;
      return a.health_score - b.health_score;
    });

    const pendingProjects = new Set(asArray(approvals).map((a) => Number(a.project_id)));

    return EXPERTS.map((expert) => {
      let currentProject = null;

      if (expert.id === "vy") {
        currentProject = sortedProjects.find((p) => pendingProjects.has(Number(p.id))) || sortedProjects[0] || null;
      } else if (expert.id === "phuc") {
        currentProject =
          sortedProjects.find((p) => ["handover", "validation", "closed"].includes(String(p.stage).toLowerCase())) ||
          sortedProjects[sortedProjects.length - 1] ||
          null;
      } else {
        currentProject =
          sortedProjects.find((p) => {
            const type = String(p.type || "").toLowerCase();
            const stage = String(p.stage || "").toLowerCase();
            return expert.specialty.includes(type) || expert.specialty.includes(stage);
          }) ||
          sortedProjects.find((p) => p.health_status !== "on_track") ||
          sortedProjects[0] ||
          null;
      }

      const ownerRow = workload.find((item) => String(item.owner || "").toLowerCase() === expert.name.toLowerCase());
      const activeTasks = Number(ownerRow?.active_tasks || 0);
      const focusText = currentProject
        ? `${currentProject.code} • ${currentProject.name}`
        : "Đang chờ assignment mới";

      return {
        ...expert,
        currentProject,
        activeTasks,
        pendingApprovals: currentProject ? currentProject.pending_approvals : 0,
        focusText,
      };
    });
  }

  function renderExpertsBoard(assignments) {
    el.expertsBoard.innerHTML = assignments
      .map(
        (expert) => `
        <article class="expert-card">
          <div class="expert-card__top">
            <div class="expert-identity">
              <div class="expert-avatar">
                <img src="${escapeHtml(expert.sprite.body)}" alt="${escapeHtml(expert.name)}" />
              </div>
              <div>
                <div class="expert-tag">${escapeHtml(expert.tag)}</div>
                <div class="expert-name">${escapeHtml(expert.name)}</div>
                <div class="expert-role">${escapeHtml(expert.role)}</div>
              </div>
            </div>
            <div class="type-chip">${escapeHtml(expert.currentProject?.health_status || "idle")}</div>
          </div>
          <div class="expert-focus">${escapeHtml(expert.focusText)}</div>
          <div class="expert-metrics">
            <div><strong>Project:</strong> ${escapeHtml(expert.currentProject?.code || "-")}</div>
            <div><strong>Stage:</strong> ${escapeHtml(expert.currentProject?.stage || "idle")}</div>
            <div><strong>Type:</strong> ${escapeHtml(expert.currentProject?.type || "-")}</div>
            <div><strong>My active tasks:</strong> ${escapeHtml(String(expert.activeTasks))}</div>
            <div><strong>Pending approvals:</strong> ${escapeHtml(String(expert.pendingApprovals))}</div>
            <div><strong>Due:</strong> ${escapeHtml(formatDate(expert.currentProject?.due_date))}</div>
          </div>
        </article>
      `
      )
      .join("");
  }

  function renderInsights(projects, workload, approvals) {
    const riskiestProject =
      projects.slice().sort((a, b) => {
        const rank = healthRank(a) - healthRank(b);
        if (rank !== 0) return rank;
        return a.health_score - b.health_score;
      })[0] || null;

    const busiestOwner =
      workload.slice().sort((a, b) => Number(b.active_tasks || 0) - Number(a.active_tasks || 0))[0] || null;

    const insights = [
      {
        title: "Project nguy hiểm nhất",
        value: riskiestProject ? riskiestProject.code : "N/A",
        detail: riskiestProject
          ? `${riskiestProject.name} • ${riskiestProject.health_status} • score ${riskiestProject.health_score}`
          : "Chưa có dữ liệu",
      },
      {
        title: "Owner quá tải nhất",
        value: busiestOwner ? busiestOwner.owner : "N/A",
        detail: busiestOwner ? `${busiestOwner.active_tasks} active task(s)` : "Chưa có dữ liệu workload",
      },
      {
        title: "Approval đang pending",
        value: String(approvals.length),
        detail: approvals.length ? `${approvals.length} item cần xử lý ngay` : "Không có approval chờ xử lý",
      },
    ];

    el.overviewNotes.innerHTML = insights
      .map(
        (item) => `
        <article class="insight-card">
          <div class="insight-card__top">
            <div class="insight-title">${escapeHtml(item.title)}</div>
            <div class="insight-value">${escapeHtml(item.value)}</div>
          </div>
          <div class="subtext">${escapeHtml(item.detail)}</div>
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
                    .map(
                      (project) => `
                  <div class="kanban-card status-${escapeHtml(project.health_status)}">
                    <strong>${escapeHtml(project.code)}</strong>
                    <div>${escapeHtml(project.name)}</div>
                    <div class="subtext">${escapeHtml(project.owner)} • ${escapeHtml(project.health_status)} • due ${escapeHtml(formatDate(project.due_date))}</div>
                  </div>
                `
                    )
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
      const [body, outfit, hair] = await Promise.all([
        loadImage(expert.sprite.body),
        loadImage(expert.sprite.outfit),
        loadImage(expert.sprite.hair),
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

  function drawSprite(ctx, assets, x, y) {
    const frame = 0;
    const sx = frame * 32;
    const drawX = x - 24;
    const drawY = y - 48;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(assets.body, sx, 0, 32, 32, drawX, drawY, 48, 48);
    ctx.drawImage(assets.outfit, sx, 0, 32, 32, drawX, drawY, 48, 48);
    ctx.drawImage(assets.hair, sx, 0, 32, 32, drawX, drawY, 48, 48);
  }

  function renderPixelWorld(assignments) {
    if (!el.pixelCanvas || !state.pixelAssets) return;
    const ctx = el.pixelCanvas.getContext("2d");
    if (!ctx) return;

    const { house, sun, moon, expertImages } = state.pixelAssets;
    const canvas = el.pixelCanvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(house, 0, 0, canvas.width, canvas.height);

    const currentHour = new Date().getHours();
    const skyAsset = currentHour >= 6 && currentHour < 18 ? sun : moon;
    ctx.drawImage(skyAsset, 38, 32, 70, 70);

    ctx.fillStyle = "rgba(5, 12, 24, 0.78)";
    ctx.fillRect(18, 18, 270, 52);
    ctx.strokeStyle = "rgba(96, 165, 250, 0.28)";
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, 270, 52);
    ctx.fillStyle = "#f3f8ff";
    ctx.font = "28px VT323";
    ctx.textAlign = "left";
    ctx.fillText("PIXEL OPERATIONS FLOOR", 30, 48);

    assignments.forEach((expert) => {
      const assets = expertImages[expert.id];
      if (!assets) return;
      const { x, y } = expert.pos;
      ctx.fillStyle = "rgba(0,0,0,.18)";
      ctx.beginPath();
      ctx.ellipse(x, y, 12, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      drawSprite(ctx, assets, x, y);

      ctx.fillStyle = expert.color;
      ctx.font = "20px VT323";
      ctx.textAlign = "center";
      ctx.fillText(expert.name.toUpperCase(), x, y - 58);

      const bubbleText = expert.currentProject ? expert.currentProject.code : "IDLE";
      drawBubble(ctx, x, y - 2, Math.max(90, bubbleText.length * 10), bubbleText, expert.color);
    });

    el.pixelRoster.innerHTML = assignments
      .map(
        (expert) => `
        <div class="pixel-roster-item">
          <div class="pixel-roster-item__name">${escapeHtml(expert.name)}</div>
          <div class="pixel-roster-item__meta">${escapeHtml(expert.role)} • ${escapeHtml(expert.tag)}</div>
          <div class="pixel-roster-item__focus">${escapeHtml(expert.focusText)}</div>
        </div>
      `
      )
      .join("");
  }

  async function loadSummary() {
    state.summary = await fetchJson("/api/dashboard/summary");
    renderSummaryCards(state.summary);
  }

  async function loadProjects() {
    const data = await fetchJson("/api/projects");
    state.projects = asArray(data).map(normalizeProject);
    renderProjects(state.projects);
    renderKanban(state.projects);
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

  function syncExpertPanels() {
    state.expertAssignments = buildExpertAssignments(state.projects, state.workload, state.approvals);
    renderExpertsBoard(state.expertAssignments);
    renderInsights(state.projects, state.workload, state.approvals);
    renderPixelWorld(state.expertAssignments);
  }

  async function refreshAll() {
    try {
      setAppStatus("Đang tải dữ liệu...", "loading");
      await Promise.all([loadSummary(), loadProjects(), loadWorkload(), loadHeatmap(), loadApprovals()]);
      syncExpertPanels();
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
    await refreshAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
