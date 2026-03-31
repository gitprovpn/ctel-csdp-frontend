(function () {
  "use strict";

  const APP_CONFIG = window.APP_CONFIG || {};
  const API_BASE = String(APP_CONFIG.apiBaseUrl || "").replace(/\/$/, "");

  const MEMBERS = [
    { id: "phuc", userId: 1, name: "Phúc", aliases: ["phúc", "phuc"], role: "Lead / Presales", color: "#22d3ee", zone: "presales", basePos: { x: 158, y: 350 } },
    { id: "thanh", userId: 2, name: "Thanh", aliases: ["thanh"], role: "Architecture", color: "#a78bfa", zone: "delivery", basePos: { x: 293, y: 335 } },
    { id: "tuan", userId: 3, name: "Tuấn", aliases: ["tuấn", "tuan"], role: "Delivery", color: "#60a5fa", zone: "delivery", basePos: { x: 322, y: 382 } },
    { id: "phu", userId: 4, name: "Phú", aliases: ["phú", "phu"], role: "Security Review", color: "#f59e0b", zone: "review", basePos: { x: 416, y: 331 } },
    { id: "an", userId: 5, name: "An", aliases: ["an"], role: "Support / Coordination", color: "#34d399", zone: "support", basePos: { x: 562, y: 295 } }
  ];

  const ZONES = {
    presales: { label: "Presales", x: 158, y: 350 },
    delivery: { label: "Delivery", x: 293, y: 335 },
    delivery_2: { label: "Delivery", x: 322, y: 382 },
    meeting: { label: "Meeting", x: 336, y: 176 },
    review: { label: "Review", x: 416, y: 331 },
    support: { label: "Support", x: 562, y: 295 },
    other: { label: "Other", x: 120, y: 354 },
    intake: { label: "Intake", x: 120, y: 354 },
    analysis: { label: "Analysis", x: 188, y: 345 },
    design_review: { label: "Design review", x: 251, y: 330 },
    approval: { label: "Approval", x: 458, y: 335 },
    execution: { label: "Execution", x: 383, y: 384 },
    validation: { label: "Validation", x: 518, y: 379 },
    handover: { label: "Handover", x: 585, y: 310 },
    closed: { label: "Closed", x: 606, y: 246 },
    unknown: { label: "Other", x: 120, y: 354 }
  };

  const STAGE_OPTIONS = [["presales","Presales"],["meeting","Meeting"],["intake","Intake"],["analysis","Analysis"],["design_review","Design review"],["execution","Execution / Delivery"],["review","Review"],["validation","Validation"],["support","Support"],["handover","Handover"],["approval","Approval"],["closed","Closed"]];
  const STATUS_OPTIONS = [["on_track","On track"],["at_risk","At risk"],["delayed","Delayed"],["blocked","Blocked"],["done","Done"]];
  const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS);

  const els = {
    summaryCards: document.getElementById("summaryCards"),
    memberBoard: document.getElementById("memberBoard"),
    projectList: document.getElementById("projectList"),
    projectCount: document.getElementById("projectCount"),
    activeFilterText: document.getElementById("activeFilterText"),
    pixelLegend: document.getElementById("pixelLegend"),
    pixelCanvas: document.getElementById("pixelCanvas"),
    refreshBtn: document.getElementById("refreshBtn"),
    apiBadge: document.getElementById("apiBadge"),
    apiStatusText: document.getElementById("apiStatusText"),
    assignSheet: document.getElementById("assignSheet"),
    assignForm: document.getElementById("assignForm"),
    assignMemberName: document.getElementById("assignMemberName"),
    assignProjectSelect: document.getElementById("assignProjectSelect"),
    assignStageSelect: document.getElementById("assignStageSelect"),
    assignStatusSelect: document.getElementById("assignStatusSelect"),
    assignReasonInput: document.getElementById("assignReasonInput"),
    assignFeedback: document.getElementById("assignFeedback"),
    assignSheetTitle: document.getElementById("assignSheetTitle"),
    assignSheetSubtitle: document.getElementById("assignSheetSubtitle"),
    assignSaveBtn: document.getElementById("assignSaveBtn"),
    sheetCloseBtn: document.getElementById("sheetCloseBtn"),
    assignCancelBtn: document.getElementById("assignCancelBtn")
  };

  const ctx = els.pixelCanvas.getContext("2d");
  const ASSET_PATHS = { house: "./assets/pixel/map/housemap.png", sun: "./assets/pixel/map/sun.png", moon: "./assets/pixel/map/moon.png" };
  const SPRITE_KEYS = { phuc: "phuc", thanh: "minh", tuan: "linh", phu: "nam", an: "vy" };
  const LABEL_LAYOUT = {
    phuc: { dx: -8, dy: -104, minW: 124, maxW: 200, align: "center" },
    thanh: { dx: -96, dy: -114, minW: 126, maxW: 196, align: "right" },
    tuan: { dx: 92, dy: -98, minW: 126, maxW: 196, align: "left" },
    phu: { dx: 0, dy: -108, minW: 124, maxW: 196, align: "center" },
    an: { dx: 0, dy: -104, minW: 126, maxW: 200, align: "center" },
    unknown: { dx: 0, dy: -100, minW: 122, maxW: 188, align: "center" }
  };

  const state = {
    projects: [], users: [], projectOptions: [], activeMemberId: null, connectionOk: false, connectionMessage: "", tick: 0,
    pixelAssets: null, animationFrame: null, placedLabels: [], spriteHitboxes: [], selectedProjectId: null,
    assignPanel: { open: false, memberId: null, projectId: null },
    simulation: { startedAt: 0, lastFrameAt: 0, members: new Map(), chats: [] }
  };

  init();

  async function init() {
    bindEvents();
    populateStaticSelects();
    initSimulation();
    await loadPixelAssets();
    await refreshData();
  }

  function bindEvents() {
    els.refreshBtn.addEventListener("click", refreshData);
    window.addEventListener("resize", render);
    els.pixelCanvas.addEventListener("click", handleCanvasClick);
    if (els.assignForm) els.assignForm.addEventListener("submit", handleAssignSubmit);
    if (els.sheetCloseBtn) els.sheetCloseBtn.addEventListener("click", closeAssignPanel);
    if (els.assignCancelBtn) els.assignCancelBtn.addEventListener("click", closeAssignPanel);
    if (els.assignSheet) els.assignSheet.addEventListener("click", (event) => { if (event.target === els.assignSheet) closeAssignPanel(); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && state.assignPanel.open) closeAssignPanel(); });
    if (els.assignProjectSelect) els.assignProjectSelect.addEventListener("change", handleProjectSelectChange);
  }

  function initSimulation() {
    state.simulation.startedAt = performance.now();
    state.simulation.lastFrameAt = performance.now();
    state.simulation.members = new Map();
    state.simulation.chats = [];
    MEMBERS.forEach((member) => state.simulation.members.set(member.id, createSimMember(member)));
  }

  function createSimMember(member) {
    return {
      memberId: member.id,
      x: member.basePos.x,
      y: member.basePos.y,
      targetX: member.basePos.x,
      targetY: member.basePos.y,
      speed: 34 + (member.userId || 1) * 2,
      mode: "working",
      facing: "down",
      timer: randomRange(1.4, 3.6),
      projectId: null
    };
  }

  function ensureSimulationMembers() {
    MEMBERS.forEach((member) => {
      if (!state.simulation.members.has(member.id)) state.simulation.members.set(member.id, createSimMember(member));
    });
  }

  function getWorkAnchor(memberId, projectCount) {
    const member = findMember(memberId) || MEMBERS[0];
    const seats = [
      { x: member.basePos.x, y: member.basePos.y },
      { x: member.basePos.x + 10, y: member.basePos.y - 8 },
      { x: member.basePos.x - 9, y: member.basePos.y + 6 }
    ];
    return seats[Math.max(0, Math.min(seats.length - 1, projectCount > 1 ? 1 : 0))];
  }

  function getStageAnchor(zone, memberId) {
    const member = findMember(memberId) || MEMBERS[0];
    const base = ZONES[zone] || ZONES[member.zone] || ZONES.unknown;
    const offsets = {
      presales: { x: -8, y: 16 }, intake: { x: -10, y: 12 }, analysis: { x: -8, y: 10 },
      design_review: { x: -10, y: 12 }, meeting: { x: 0, y: 16 }, execution: { x: -3, y: 16 },
      review: { x: 0, y: 14 }, validation: { x: 4, y: 14 }, support: { x: 2, y: 14 },
      handover: { x: 4, y: 16 }, approval: { x: 0, y: 16 }, closed: { x: 6, y: 12 }, unknown: { x: 0, y: 16 }
    };
    const offset = offsets[zone] || offsets.unknown;
    return { x: base.x + offset.x, y: base.y + offset.y };
  }

  function scheduleSimulationIntent(sim, dt) {
    sim.timer -= dt;
    if (sim.timer > 0) return;

    const ownProjects = state.projects.filter((project) => project.ownerId === sim.memberId);
    const leadProject = pickLeadProject(ownProjects);
    const activityBias = ownProjects.length ? 0.78 : 0.42;

    if (leadProject && Math.random() < activityBias) {
      const anchor = getStageAnchor(leadProject.zone, sim.memberId);
      setSimTarget(sim, anchor.x, anchor.y, 'project_follow');
      sim.projectId = leadProject.id;
      sim.timer = randomRange(2.4, 4.8);
      return;
    }

    const canChat = !state.simulation.chats.some((chat) => chat.memberIds.includes(sim.memberId));
    if (canChat && Math.random() < 0.28) {
      const partner = pickChatPartner(sim.memberId);
      if (partner) {
        startChat(sim.memberId, partner.memberId);
        sim.timer = randomRange(3.4, 5.2);
        return;
      }
    }

    const anchor = getWorkAnchor(sim.memberId, ownProjects.length);
    setSimTarget(sim, anchor.x, anchor.y, ownProjects.length ? 'working' : 'idle');
    sim.projectId = leadProject ? leadProject.id : null;
    sim.timer = randomRange(2.2, 4.6);
  }

  function pickChatPartner(memberId) {
    const self = state.simulation.members.get(memberId);
    if (!self) return null;
    const pool = MEMBERS
      .filter((member) => member.id !== memberId)
      .map((member) => state.simulation.members.get(member.id))
      .filter(Boolean)
      .filter((sim) => !state.simulation.chats.some((chat) => chat.memberIds.includes(sim.memberId)));
    if (!pool.length) return null;
    pool.sort((a, b) => distance(self.x, self.y, a.x, a.y) - distance(self.x, self.y, b.x, b.y));
    return pool[0] || null;
  }

  function startChat(memberIdA, memberIdB) {
    const simA = state.simulation.members.get(memberIdA);
    const simB = state.simulation.members.get(memberIdB);
    if (!simA || !simB) return;
    const meeting = ZONES.meeting || { x: 336, y: 176 };
    setSimTarget(simA, meeting.x - 20, meeting.y + 20, 'chatting');
    setSimTarget(simB, meeting.x + 20, meeting.y + 20, 'chatting');
    simA.timer = randomRange(3.2, 4.8);
    simB.timer = simA.timer;
    const project = pickLeadProject(state.projects.filter((project) => project.ownerId === memberIdA || project.ownerId === memberIdB));
    const text = project ? `Trao đổi: ${truncateText(project.name, 20)}` : 'Đang trao đổi';
    state.simulation.chats.push({ memberIds: [memberIdA, memberIdB], until: performance.now() + randomRange(2200, 3600), text });
  }

  function updateSimulation(dt) {
    ensureSimulationMembers();
    state.simulation.chats = state.simulation.chats.filter((chat) => chat.until > performance.now());
    state.simulation.members.forEach((sim) => {
      scheduleSimulationIntent(sim, dt);
      moveSimMember(sim, dt);
    });
  }

  function setSimTarget(sim, x, y, mode) {
    sim.targetX = x;
    sim.targetY = y;
    sim.mode = mode;
  }

  function moveSimMember(sim, dt) {
    const dx = sim.targetX - sim.x;
    const dy = sim.targetY - sim.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.8) {
      sim.x = sim.targetX;
      sim.y = sim.targetY;
      return true;
    }
    const step = Math.min(dist, sim.speed * dt);
    sim.x += (dx / dist) * step;
    sim.y += (dy / dist) * step;
    sim.facing = Math.abs(dx) > Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up');
    return false;
  }

  async function refreshData() {
    setConnectionState("checking", "Đang kiểm tra backend và tải dữ liệu…");
    try {
      await checkHealth();
      const [projectsRaw, usersRaw, optionsRaw] = await Promise.all([fetchJson("/api/projects"), fetchJson("/api/users").catch(() => []), fetchJson("/api/projects/options").catch(() => [])]);
      state.users = Array.isArray(usersRaw) ? usersRaw : [];
      state.projectOptions = Array.isArray(optionsRaw) ? optionsRaw : [];
      state.projects = Array.isArray(projectsRaw) ? projectsRaw.map(normalizeProject) : [];
      syncMemberUserIds();
      syncProjectOptionsFromProjects();
      populateProjectSelect();
      setConnectionState("good", `Kết nối backend thành công • ${state.projects.length} dự án đã tải.`);
      render();
      startPixelAnimation();
    } catch (error) {
      state.projects = [];
      state.users = [];
      state.projectOptions = [];
      setConnectionState("bad", `Không thể tải dữ liệu từ backend. ${error.message || error}`);
      render();
      startPixelAnimation();
    }
  }

  async function checkHealth() {
    const health = await fetchJson("/health");
    if (!health || health.ok !== true) throw new Error("Backend health check failed");
    return health;
  }

  async function fetchJson(path, options = {}) {
    if (!API_BASE) throw new Error("Thiếu apiBaseUrl trong config.js");
    const response = await fetch(`${API_BASE}${path}`, { headers: { Accept: "application/json", ...(options.headers || {}) }, ...options });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`${response.status} ${response.statusText}${text ? ` • ${text.slice(0, 160)}` : ""}`);
    }
    return await response.json();
  }

  function setConnectionState(type, message) {
    state.connectionOk = type === "good";
    state.connectionMessage = message;
    els.apiBadge.textContent = type === "good" ? "Connected" : type === "bad" ? "Offline" : "Checking…";
    els.apiBadge.className = `chip ${type === "good" ? "good" : type === "bad" ? "bad" : "neutral"}`;
    els.apiStatusText.textContent = message;
  }

  function syncMemberUserIds() {
    MEMBERS.forEach((member) => {
      const found = state.users.find((user) => normalizeText(user.display_name || user.name) === normalizeText(member.name));
      if (found?.id) member.userId = found.id;
    });
  }

  function syncProjectOptionsFromProjects() {
    const byId = new Map();
    state.projectOptions.forEach((item) => byId.set(String(item.id), item));
    state.projects.forEach((project) => {
      if (!byId.has(String(project.id))) byId.set(String(project.id), { id: project.id, name: project.name, owner_user_id: project.ownerUserId, stage: project.stage, health_status: project.status, health_reason: project.reason || "" });
    });
    state.projectOptions = [...byId.values()];
  }

  function normalizeProject(raw) {
    const ownerId = matchMemberId(raw.owner_name || raw.owner || "", raw.owner_user_id);
    const status = normalizeStatus(raw.health_status || raw.status);
    const zone = mapZone(raw.stage, ownerId);
    return { id: raw.id ?? raw.project_code ?? cryptoRandom(), name: raw.project_name || raw.name || raw.project_code || "Untitled Project", code: raw.project_code || raw.code || null, ownerId, ownerUserId: raw.owner_user_id ?? findMember(ownerId)?.userId ?? null, ownerName: findMember(ownerId)?.name || raw.owner_name || raw.owner || "Unassigned", projectType: raw.project_type || raw.type || "GENERAL", stage: raw.stage || "intake", status, score: safeNumber(raw.health_score, 0), reason: raw.health_reason || "", dueDate: raw.due_date || null, createdAt: raw.created_at || null, updatedAt: raw.updated_at || raw.modified_at || raw.last_updated || null, zone };
  }

  function render() { renderSummary(); renderMembers(); renderProjects(); renderLegend(); drawPixelMap(); }

  async function loadPixelAssets() {
    try {
      const [house, sun, moon] = await Promise.all([loadImage(ASSET_PATHS.house), loadImage(ASSET_PATHS.sun), loadImage(ASSET_PATHS.moon)]);
      const expertImages = {};
      const spriteEntries = await Promise.all(MEMBERS.map(async (member) => { const key = SPRITE_KEYS[member.id]; const [body, outfit, hair] = await Promise.all([loadImage(`./assets/pixel/experts/${key}/body.png`), loadImage(`./assets/pixel/experts/${key}/outfit.png`), loadImage(`./assets/pixel/experts/${key}/hair.png`)]); return [member.id, { body, outfit, hair }]; }));
      spriteEntries.forEach(([id, assets]) => { expertImages[id] = assets; });
      state.pixelAssets = { house, sun, moon, expertImages };
    } catch (error) {
      console.warn("Pixel assets could not be loaded", error);
      state.pixelAssets = null;
    }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
  }

  function renderSummary() {
    const total = state.projects.length;
    const active = state.projects.filter((p) => p.status !== "done").length;
    const risk = state.projects.filter((p) => ["at_risk", "delayed", "blocked"].includes(p.status)).length;
    const done = state.projects.filter((p) => p.status === "done").length;
    const busyMembers = new Set(state.projects.filter((p) => p.status !== "done").map((p) => p.ownerId)).size;
    const avgScore = total ? Math.round(state.projects.reduce((sum, p) => sum + safeNumber(p.score, 0), 0) / total) : 0;
    const cards = [["Tổng dự án", total],["Đang active", active],["Cần chú ý", risk],["Đã xong", done],["Người đang bận", busyMembers],["Avg health", `${avgScore}%`]];
    els.summaryCards.innerHTML = cards.map(([label, value]) => `
      <article class="summary-card">
        <div class="summary-label">${label}</div>
        <div class="summary-value">${value}</div>
      </article>
    `).join("");
  }

  function renderMembers() {
    els.activeFilterText.textContent = state.activeMemberId ? `Đang lọc: ${findMember(state.activeMemberId)?.name || state.activeMemberId}` : "Tất cả thành viên";
    els.memberBoard.innerHTML = MEMBERS.map((member) => {
      const items = state.projects.filter((p) => p.ownerId === member.id);
      const active = items.filter((p) => p.status !== "done").length;
      const risky = items.filter((p) => ["at_risk", "delayed", "blocked"].includes(p.status)).length;
      const done = items.filter((p) => p.status === "done").length;
      const lead = pickLeadProject(items);
      return `
        <article class="member-card ${state.activeMemberId === member.id ? "active" : ""}" data-member-id="${member.id}">
          <div class="member-top">
            <div>
              <div class="member-name">${member.name}</div>
              <div class="member-role">${member.role}</div>
            </div>
            <div class="chip">${items.length} dự án</div>
          </div>
          <div class="member-stats">
            <div class="stat-pill"><strong>${active}</strong><span class="mini-text">Active</span></div>
            <div class="stat-pill"><strong>${risky}</strong><span class="mini-text">Risk</span></div>
            <div class="stat-pill"><strong>${done}</strong><span class="mini-text">Done</span></div>
          </div>
          <div class="mini-text">${lead ? `Gần nhất: ${escapeHtml(lead.name)}` : "Chưa có dự án"}</div>
          <div class="member-actions">
            <button class="btn-lite" type="button" data-action="filter" data-member-id="${member.id}">${state.activeMemberId === member.id ? "Bỏ lọc" : "Lọc"}</button>
            <button class="btn-lite primary" type="button" data-action="assign" data-member-id="${member.id}">Assign / Update</button>
          </div>
        </article>
      `;
    }).join("");
    els.memberBoard.querySelectorAll("[data-action='filter']").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); const id = button.dataset.memberId; state.activeMemberId = state.activeMemberId === id ? null : id; render(); }));
    els.memberBoard.querySelectorAll("[data-action='assign']").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); openAssignPanel(button.dataset.memberId); }));
    els.memberBoard.querySelectorAll(".member-card").forEach((card) => card.addEventListener("click", () => openAssignPanel(card.dataset.memberId)));
  }

  function renderProjects() {
    const visibleProjects = state.activeMemberId ? state.projects.filter((p) => p.ownerId === state.activeMemberId) : state.projects;
    els.projectCount.textContent = `${visibleProjects.length} dự án`;
    if (!visibleProjects.length) { els.projectList.innerHTML = `<div class="empty">Chưa có dữ liệu dự án phù hợp hoặc backend chưa trả về dữ liệu.</div>`; return; }
    els.projectList.innerHTML = visibleProjects.map((project) => `
      <article class="project-card ${state.selectedProjectId === project.id ? "is-selected" : ""}">
        <div class="project-top">
          <div>
            <div class="project-name">${escapeHtml(project.name)}</div>
            <div class="mini-text">${escapeHtml(project.ownerName)} • ${escapeHtml(getZoneLabel(project.zone))} • ${escapeHtml(project.projectType)}</div>
          </div>
          <div class="chip status-${project.status}">${STATUS_LABELS[project.status] || project.status}</div>
        </div>
        <div class="project-meta">
          ${project.code ? `<div class="chip">Code: ${escapeHtml(project.code)}</div>` : ""}
          <div class="chip">Stage: ${escapeHtml(project.stage)}</div>
          <div class="chip">PIC: ${escapeHtml(project.ownerName)}</div>
          <div class="chip">Health: ${safeNumber(project.score, 0)}%</div>
          ${project.dueDate ? `<div class="chip">Due: ${escapeHtml(project.dueDate)}</div>` : ""}
        </div>
        <div class="project-note">${escapeHtml(project.reason || "Chưa có ghi chú health_reason từ backend.")}</div>
        <div class="project-actions">
          <button class="btn-lite" type="button" data-project-edit="${project.id}">Đổi PIC / status</button>
        </div>
      </article>
    `).join("");
    els.projectList.querySelectorAll("[data-project-edit]").forEach((button) => button.addEventListener("click", () => { const projectId = button.getAttribute("data-project-edit"); const project = state.projects.find((item) => String(item.id) === String(projectId)); openAssignPanel(project?.ownerId || MEMBERS[0].id, projectId); }));
  }

  function renderLegend() { els.pixelLegend.innerHTML = MEMBERS.map((member) => `
      <div class="legend-item">
        <span class="legend-dot" style="background:${member.color}"></span>
        <span>${member.name}</span>
      </div>
    `).join("") + `<div class="canvas-hint">Tip: chạm trực tiếp vào nhân vật trên map để mở panel assign / update.</div>`; }

  function populateStaticSelects() {
    if (els.assignStageSelect) els.assignStageSelect.innerHTML = STAGE_OPTIONS.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
    if (els.assignStatusSelect) els.assignStatusSelect.innerHTML = STATUS_OPTIONS.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  }

  function populateProjectSelect(selectedProjectId = null) {
    if (!els.assignProjectSelect) return;
    const items = [...state.projectOptions].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi"));
    els.assignProjectSelect.innerHTML = items.length ? items.map((item) => `<option value="${escapeHtml(String(item.id))}" ${String(selectedProjectId ?? "") === String(item.id) ? "selected" : ""}>${escapeHtml(item.name || item.project_name || `Project ${item.id}`)}</option>`).join("") : `<option value="">Chưa có dự án</option>`;
  }

  function openAssignPanel(memberId, projectId = null) {
    const member = findMember(memberId) || MEMBERS[0];
    state.assignPanel.open = true; state.assignPanel.memberId = member.id; state.assignPanel.projectId = projectId ? String(projectId) : null;
    if (els.assignSheet) { els.assignSheet.classList.remove("hidden"); els.assignSheet.setAttribute("aria-hidden", "false"); }
    els.assignMemberName.value = member.name; els.assignSheetTitle.textContent = `Assign project cho ${member.name}`; els.assignSheetSubtitle.textContent = `Chọn dự án có sẵn rồi cập nhật PIC, stage và health status cho ${member.name}.`; els.assignFeedback.textContent = ""; populateProjectSelect(projectId);
    if (projectId) els.assignProjectSelect.value = String(projectId); else { const currentLead = pickLeadProject(state.projects.filter((item) => item.ownerId === member.id)); if (currentLead) els.assignProjectSelect.value = String(currentLead.id); }
    handleProjectSelectChange();
  }

  function closeAssignPanel() {
    state.assignPanel.open = false; if (els.assignSheet) { els.assignSheet.classList.add("hidden"); els.assignSheet.setAttribute("aria-hidden", "true"); } if (els.assignForm) els.assignForm.reset(); els.assignFeedback.textContent = "";
  }

  function handleProjectSelectChange() {
    const selectedId = els.assignProjectSelect?.value;
    const project = state.projects.find((item) => String(item.id) === String(selectedId)) || state.projectOptions.find((item) => String(item.id) === String(selectedId));
    const member = findMember(state.assignPanel.memberId) || MEMBERS[0];
    if (project) { state.selectedProjectId = project.id; els.assignStageSelect.value = normalizeStage(project.stage || member.zone || "intake"); els.assignStatusSelect.value = normalizeStatus(project.health_status || project.status || "on_track"); els.assignReasonInput.value = project.health_reason || project.reason || ""; }
    else { els.assignStageSelect.value = member.zone || "intake"; els.assignStatusSelect.value = "on_track"; els.assignReasonInput.value = ""; }
    renderProjects();
  }

  async function handleAssignSubmit(event) {
    event.preventDefault();
    const member = findMember(state.assignPanel.memberId) || MEMBERS[0];
    const projectId = els.assignProjectSelect.value;
    if (!projectId) { els.assignFeedback.textContent = "Chưa có dự án để cập nhật."; return; }
    els.assignSaveBtn.disabled = true; els.assignFeedback.textContent = "Đang gửi cập nhật lên backend…";
    try {
      await fetchJson(`/api/projects/${projectId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner_user_id: member.userId, owner_name: member.name, stage: els.assignStageSelect.value, health_status: els.assignStatusSelect.value, health_reason: els.assignReasonInput.value.trim() }) });
      await refreshData(); state.activeMemberId = member.id; closeAssignPanel(); render();
    } catch (error) {
      els.assignFeedback.textContent = `Cập nhật thất bại: ${error.message || error}`;
    } finally { els.assignSaveBtn.disabled = false; }
  }

  function handleCanvasClick(event) {
    const rect = els.pixelCanvas.getBoundingClientRect(); const scaleX = els.pixelCanvas.width / rect.width; const scaleY = els.pixelCanvas.height / rect.height; const x = (event.clientX - rect.left) * scaleX; const y = (event.clientY - rect.top) * scaleY; const hit = [...state.spriteHitboxes].reverse().find((item) => x >= item.x && x <= item.x + item.w && y >= item.y && y <= item.y + item.h); if (hit) openAssignPanel(hit.memberId);
  }

  function drawPixelMap() {
    const canvas = els.pixelCanvas;
    if (!canvas || !ctx) return;
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.012, (now - (state.simulation.lastFrameAt || now)) / 1000));
    state.simulation.lastFrameAt = now;
    updateSimulation(dt);
    state.tick += 1;
    state.spriteHitboxes = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (state.pixelAssets?.house) { drawPixelSceneWithAssets(canvas.width, canvas.height); return; }
    drawFallbackPixelScene(canvas.width, canvas.height);
  }

  function drawPixelSceneWithAssets(width, height) {
    const { house, sun, moon } = state.pixelAssets; ctx.imageSmoothingEnabled = false; ctx.drawImage(house, 0, 0, width, height); const hour = new Date().getHours(); const skyAsset = hour >= 6 && hour < 18 ? sun : moon; ctx.drawImage(skyAsset, 40, 28, 72, 72); ctx.fillStyle = "rgba(6, 16, 29, 0.80)"; ctx.fillRect(14, 14, 230, 38); ctx.strokeStyle = "rgba(96, 165, 250, 0.28)"; ctx.lineWidth = 2; ctx.strokeRect(14, 14, 230, 38); ctx.fillStyle = "#f3f8ff"; ctx.font = "20px VT323"; ctx.textAlign = "left"; ctx.fillText("SA CTEL PROJECT MAP", 24, 38); drawProjectedMarkers();
  }

  function drawFallbackPixelScene(width, height) { drawBackground(width, height); drawZones(); drawRoads(); drawProjectedMarkers(); }

  function drawProjectedMarkers() {
    state.placedLabels = [];
    const visibleProjects = state.activeMemberId ? state.projects.filter((p) => p.ownerId === state.activeMemberId) : state.projects;
    const labelQueue = [];
    MEMBERS.forEach((member, index) => {
      const own = visibleProjects.filter((p) => p.ownerId === member.id);
      const sim = state.simulation.members.get(member.id) || createSimMember(member);
      const wobbleX = Math.sin((state.tick + index * 10) / 18) * 0.6;
      const wobbleY = Math.cos((state.tick + index * 8) / 24) * 0.6;
      const baseX = sim.x + wobbleX;
      const baseY = sim.y + wobbleY;
      state.spriteHitboxes.push({ x: Math.round(baseX - 24), y: Math.round(baseY - 42), w: 48, h: 48, memberId: member.id });
      if (state.pixelAssets?.expertImages?.[member.id]) drawCompositeSprite(baseX, baseY, member.id, sim); else drawFallbackSprite(baseX - 12, baseY - 6, member.color, sim);
      const isActive = state.activeMemberId === member.id || state.assignPanel.memberId === member.id;
      if (isActive) {
        ctx.strokeStyle = member.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(baseX, baseY - 24, 18 + Math.sin(state.tick / 4) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      own.forEach((project, itemIndex) => {
        const markerZone = ZONES[project.zone] || ZONES[member.zone] || ZONES.unknown;
        const cols = 3;
        const offsetX = (itemIndex % cols) * 11;
        const offsetY = Math.floor(itemIndex / cols) * 11;
        const px = markerZone.x - 10 + offsetX;
        const py = markerZone.y - 32 - offsetY;
        fillRect(px, py, 8, 8, member.color);
        strokeRect(px, py, 8, 8, project.status === "blocked" ? "#fecdd3" : "#07111f");
      });
      const leadProject = pickLeadProject(own);
      labelQueue.push({ member, baseX, baseY, project: leadProject, count: own.length, sim });
    });
    drawChatLinks();
    labelQueue.forEach((item) => drawMemberLabel(item));
  }

  function drawChatLinks() {
    state.simulation.chats.forEach((chat) => {
      const [aId, bId] = chat.memberIds;
      const simA = state.simulation.members.get(aId);
      const simB = state.simulation.members.get(bId);
      if (!simA || !simB) return;
      ctx.save();
      ctx.strokeStyle = 'rgba(96, 165, 250, 0.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(simA.x, simA.y - 24);
      ctx.lineTo(simB.x, simB.y - 24);
      ctx.stroke();
      ctx.restore();
      const midX = (simA.x + simB.x) / 2;
      const midY = (simA.y + simB.y) / 2 - 42;
      ctx.font = '10px Inter';
      const bubbleW = clamp(ctx.measureText(chat.text).width + 18, 82, 160);
      fillRect(midX - bubbleW / 2, midY - 10, bubbleW, 20, 'rgba(7,17,31,.9)');
      strokeRect(midX - bubbleW / 2, midY - 10, bubbleW, 20, '#60a5fa');
      ctx.fillStyle = '#dbeafe';
      ctx.textAlign = 'center';
      ctx.fillText(chat.text, midX, midY + 4);
      ctx.textAlign = 'left';
    });
  }

  function drawMemberLabel({ member, baseX, baseY, project, count, sim }) {
    const layout = LABEL_LAYOUT[member.id] || LABEL_LAYOUT.unknown;
    const title = member.name;
    const modeLabel = sim?.mode === "chatting" ? "Đang trao đổi" : sim?.mode === "project_follow" ? "Đang follow" : sim?.mode === "idle" ? "Đang rảnh" : "Đang làm việc";
    const subtitle = project ? `${modeLabel}: ${project.name}` : (count ? `${modeLabel}: ${count} dự án` : modeLabel);
    const innerPaddingX = 10;
    const innerPaddingTop = 8;
    const titleLineHeight = 14;
    const bodyLineHeight = 12;
    const maxBodyWidth = layout.maxW - innerPaddingX * 2;

    ctx.textAlign = "left";
    ctx.font = "bold 12px Inter";
    const titleWidth = Math.ceil(ctx.measureText(title).width);

    ctx.font = "10px Inter";
    const subtitleLines = wrapText(subtitle, maxBodyWidth, 3);
    const subtitleWidth = subtitleLines.reduce((max, line) => Math.max(max, Math.ceil(ctx.measureText(line).width)), 0);

    const bubbleWidth = clamp(
      Math.max(layout.minW, titleWidth + innerPaddingX * 2, subtitleWidth + innerPaddingX * 2),
      layout.minW,
      layout.maxW
    );
    const bubbleHeight = innerPaddingTop + titleLineHeight + (subtitleLines.length * bodyLineHeight) + 8;

    const preferredX = Math.round(baseX + layout.dx - bubbleWidth / 2);
    const preferredY = Math.round(baseY + layout.dy - bubbleHeight / 2);
    const placed = placeLabelRect(preferredX, preferredY, bubbleWidth, bubbleHeight, baseX, baseY);
    const boxX = placed.x;
    const boxY = placed.y;

    const anchorX = clamp(baseX, boxX + 12, boxX + bubbleWidth - 12);
    const anchorY = boxY + bubbleHeight;

    fillRect(boxX, boxY, bubbleWidth, bubbleHeight, "rgba(7,17,31,0.94)");
    strokeRect(boxX, boxY, bubbleWidth, bubbleHeight, member.color);

    ctx.fillStyle = member.color;
    ctx.beginPath();
    ctx.moveTo(anchorX - 5, anchorY - 1);
    ctx.lineTo(anchorX + 5, anchorY - 1);
    ctx.lineTo(Math.round(baseX), Math.round(baseY - 28));
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#f8fbff";
    ctx.font = "bold 12px Inter";
    ctx.fillText(title, boxX + innerPaddingX, boxY + innerPaddingTop + 10);

    ctx.fillStyle = "#b9d5ff";
    ctx.font = "10px Inter";
    subtitleLines.forEach((line, index) => {
      ctx.fillText(line, boxX + innerPaddingX, boxY + innerPaddingTop + titleLineHeight + 10 + (index * bodyLineHeight));
    });
  }

  function placeLabelRect(preferredX, preferredY, width, height, baseX, baseY) {
    const positions = [
      { x: preferredX, y: preferredY },
      { x: preferredX, y: preferredY - 14 },
      { x: preferredX, y: preferredY + 14 },
      { x: preferredX - 18, y: preferredY },
      { x: preferredX + 18, y: preferredY },
      { x: preferredX - 26, y: preferredY - 12 },
      { x: preferredX + 26, y: preferredY - 12 },
      { x: preferredX - 26, y: preferredY + 12 },
      { x: preferredX + 26, y: preferredY + 12 }
    ];

    let best = null;

    positions.forEach((candidate) => {
      const x = clamp(Math.round(candidate.x), 8, els.pixelCanvas.width - width - 8);
      const y = clamp(Math.round(candidate.y), 8, els.pixelCanvas.height - height - 8);
      const rect = { x, y, width, height };
      const overlapArea = getTotalOverlapArea(rect);
      const distance = Math.abs((x + width / 2) - baseX) + Math.abs((y + height / 2) - (baseY - 44));
      const score = overlapArea * 10000 + distance;
      if (!best || score < best.score) {
        best = { x, y, score };
      }
    });

    rememberPlacedLabel({ x: best.x, y: best.y, width, height });
    return best;
  }

  function getTotalOverlapArea(rect) {
    return state.placedLabels.reduce((total, other) => total + getOverlapArea(rect, other), 0);
  }

  function getOverlapArea(a, b) {
    const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    return xOverlap * yOverlap;
  }

  function rememberPlacedLabel(rect) {
    state.placedLabels.push(rect);
  }

  function wrapText(text, maxWidth, maxLines) {
    const words = String(text || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [""];

    const lines = [];
    let current = words[0];

    for (let i = 1; i < words.length; i += 1) {
      const next = `${current} ${words[i]}`;
      if (ctx.measureText(next).width <= maxWidth) {
        current = next;
      } else {
        lines.push(current);
        current = words[i];
        if (lines.length === maxLines - 1) break;
      }
    }

    if (lines.length < maxLines) {
      const usedWords = lines.join(" ").split(/\s+/).filter(Boolean).length;
      const remainingWords = words.slice(usedWords);
      if (remainingWords.length) {
        let lastLine = remainingWords.join(" ");
        while (ctx.measureText(lastLine).width > maxWidth && lastLine.length > 1) {
          lastLine = lastLine.slice(0, -1).trim();
        }
        if (lastLine !== remainingWords.join(" ")) {
          lastLine = `${lastLine.replace(/[\s.,;:-]+$/,'')}…`;
        }
        lines.push(lastLine);
      }
    }

    return lines.slice(0, maxLines);
  }

  function pickLeadProject(projects) {
    if (!projects.length) return null;
    const sorted = [...projects].sort((a, b) => {
      const aActive = a.status === "done" ? 1 : 0;
      const bActive = b.status === "done" ? 1 : 0;
      if (aActive !== bActive) return aActive - bActive;
      return parseProjectTime(b) - parseProjectTime(a);
    });
    return sorted[0];
  }

  function parseProjectTime(project) {
    const candidates = [project.updatedAt, project.createdAt, project.dueDate];
    for (const value of candidates) {
      const time = Date.parse(value || "");
      if (Number.isFinite(time)) return time;
    }
    return 0;
  }

  function truncateText(text, max) {
    const value = String(text || "").trim();
    return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function randomRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function distance(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
  }

  function drawCompositeSprite(x, y, memberId, sim) {
    const assets = state.pixelAssets?.expertImages?.[memberId];
    if (!assets) return;
    const frame = sim && distance(sim.x, sim.y, sim.targetX, sim.targetY) > 2 ? Math.floor(state.tick / 8) % 4 : 0;
    const sx = frame * 32;
    const drawX = Math.round(x - 24);
    const drawY = Math.round(y - 42);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(assets.body, sx, 0, 32, 32, drawX, drawY, 48, 48);
    ctx.drawImage(assets.outfit, sx, 0, 32, 32, drawX, drawY, 48, 48);
    ctx.drawImage(assets.hair, sx, 0, 32, 32, drawX, drawY, 48, 48);
  }

  function drawFallbackSprite(x, y, color, sim) {
    const walking = sim && distance(sim.x, sim.y, sim.targetX, sim.targetY) > 2;
    const legOffset = walking ? (Math.floor(state.tick / 8) % 2 === 0 ? 1 : -1) : 0;
    fillRect(x + 4, y, 8, 8, "#f8d7b5");
    fillRect(x + 2, y + 8, 12, 10, color);
    fillRect(x + legOffset, y + 18, 6, 8, color);
    fillRect(x + 10 - legOffset, y + 18, 6, 8, color);
  }

  function drawBackground(width, height) {
    fillRect(0, 0, width, height, "#091423");
    fillRect(0, 380, width, 140, "#0c1b2c");
    for (let i = 0; i < 80; i += 1) {
      fillRect((i * 47) % width, (i * 31) % 180, 2, 2, i % 5 === 0 ? "#203854" : "#15263e");
    }
  }

  function drawZones() {
    Object.entries(ZONES).forEach(([key, zone]) => {
      drawPanel(zone.x - 78, zone.y - 42, 156, 84, key === "meeting" ? "#18304a" : "#11253b");
      pixelText(zone.label.toUpperCase(), zone.x - 54, zone.y - 8, "#b9d5ff");
    });
  }

  function drawRoads() {
    const lines = [
      [160, 150, 430, 310],
      [430, 310, 650, 170],
      [430, 310, 760, 330],
      [430, 310, 460, 120]
    ];
    lines.forEach(([x1, y1, x2, y2]) => drawLine(x1, y1, x2, y2, "#1f3858"));
  }

  function drawPanel(x, y, w, h, color) {
    fillRect(x, y, w, h, color);
    strokeRect(x, y, w, h, "#2a466a");
  }

  function fillRect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function strokeRect(x, y, w, h, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h));
  }

  function drawLine(x1, y1, x2, y2, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function pixelText(text, x, y, color) {
    ctx.fillStyle = color;
    ctx.font = "24px VT323";
    ctx.fillText(text, x, y);
  }

  function startPixelAnimation() {
    if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
    const tick = () => {
      drawPixelMap();
      state.animationFrame = requestAnimationFrame(tick);
    };
    state.animationFrame = requestAnimationFrame(tick);
  }

  function matchMemberId(owner, ownerUserId = null) {
    if (ownerUserId != null) {
      const byUserId = MEMBERS.find((member) => Number(member.userId) === Number(ownerUserId));
      if (byUserId) return byUserId.id;
    }
    const normalized = normalizeText(owner || "");
    const found = MEMBERS.find((member) => member.aliases.some((alias) => normalized.includes(normalizeText(alias))));
    return found ? found.id : "unknown";
  }

  function mapZone(stage, ownerId) {
    const normalized = normalizeText(stage || "");
    if (normalized.includes("presale") || normalized.includes("proposal")) return "presales";
    if (normalized.includes("intake")) return "intake";
    if (normalized.includes("analysis")) return "analysis";
    if (normalized.includes("design")) return "design_review";
    if (normalized.includes("review") || normalized.includes("assessment")) return "review";
    if (normalized.includes("meeting") || normalized.includes("sync")) return "meeting";
    if (normalized.includes("approval")) return "approval";
    if (normalized.includes("support")) return "support";
    if (normalized.includes("handover")) return "handover";
    if (normalized.includes("closed") || normalized.includes("done")) return "closed";
    if (normalized.includes("delivery") || normalized.includes("implement") || normalized.includes("deploy") || normalized.includes("rollout") || normalized.includes("execution")) return "execution";
    if (normalized.includes("validat") || normalized.includes("uat") || normalized.includes("test")) return "validation";
    return findMember(ownerId)?.zone || "unknown";
  }

  function normalizeStage(value) {
    const mapped = mapZone(value || "intake", "unknown");
    return ZONES[mapped] ? mapped : "intake";
  }

  function normalizeStatus(value) {
    const normalized = normalizeText(value || "");
    if (["done", "completed", "closed", "resolved"].some((x) => normalized.includes(x))) return "done";
    if (normalized.includes("block")) return "blocked";
    if (normalized.includes("delay")) return "delayed";
    if (normalized.includes("risk")) return "at_risk";
    return "on_track";
  }

  function getZoneLabel(zone) {
    return ZONES[zone]?.label || "Other";
  }

  function findMember(id) {
    return MEMBERS.find((member) => member.id === id) || null;
  }

  function normalizeText(input) {
    return String(input || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function safeNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function cryptoRandom() {
    return (crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
})();
