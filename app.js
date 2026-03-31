(function () {
  "use strict";

  const APP_CONFIG = window.APP_CONFIG || {};
  const API_BASE = String(APP_CONFIG.apiBaseUrl || "").replace(/\/$/, "");

  const MEMBERS = [
    { id: "phuc", name: "Phúc", aliases: ["phúc", "phuc"], role: "Lead / Presales", color: "#22d3ee", zone: "presales", basePos: { x: 158, y: 350 } },
    { id: "thanh", name: "Thanh", aliases: ["thanh"], role: "Architecture", color: "#a78bfa", zone: "delivery", basePos: { x: 293, y: 335 } },
    { id: "tuan", name: "Tuấn", aliases: ["tuấn", "tuan"], role: "Delivery", color: "#60a5fa", zone: "delivery", basePos: { x: 322, y: 382 } },
    { id: "phu", name: "Phú", aliases: ["phú", "phu"], role: "Security Review", color: "#f59e0b", zone: "review", basePos: { x: 416, y: 331 } },
    { id: "an", name: "An", aliases: ["an"], role: "Support / Coordination", color: "#34d399", zone: "support", basePos: { x: 562, y: 295 } }
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

  const STATUS_LABELS = {
    on_track: "On track",
    at_risk: "At risk",
    delayed: "Delayed",
    blocked: "Blocked",
    done: "Done"
  };

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
    apiStatusText: document.getElementById("apiStatusText")
  };

  const ctx = els.pixelCanvas.getContext("2d");

  const ASSET_PATHS = {
    house: "./assets/pixel/map/housemap.png",
    sun: "./assets/pixel/map/sun.png",
    moon: "./assets/pixel/map/moon.png"
  };

  const SPRITE_KEYS = {
    phuc: "phuc",
    thanh: "minh",
    tuan: "linh",
    phu: "nam",
    an: "vy"
  };

  const LABEL_LAYOUT = {
    phuc: { dx: -8, dy: -88, w: 120, align: "center" },
    thanh: { dx: -86, dy: -98, w: 120, align: "right" },
    tuan: { dx: 84, dy: -82, w: 120, align: "left" },
    phu: { dx: 0, dy: -92, w: 120, align: "center" },
    an: { dx: 0, dy: -90, w: 126, align: "center" },
    unknown: { dx: 0, dy: -88, w: 118, align: "center" }
  };

  const state = {
    projects: [],
    activeMemberId: null,
    connectionOk: false,
    connectionMessage: "",
    tick: 0,
    pixelAssets: null,
    animationFrame: null
  };

  init();

  async function init() {
    bindEvents();
    await loadPixelAssets();
    refreshData();
  }

  function bindEvents() {
    els.refreshBtn.addEventListener("click", refreshData);
    window.addEventListener("resize", render);
  }

  async function refreshData() {
    setConnectionState("checking", "Đang kiểm tra backend và tải dữ liệu…");
    try {
      await checkHealth();
      const projects = await fetchJson("/api/projects");
      state.projects = Array.isArray(projects) ? projects.map(normalizeProject) : [];
      setConnectionState("good", `Kết nối backend thành công • ${state.projects.length} dự án đã tải.`);
      render();
      startPixelAnimation();
    } catch (error) {
      state.projects = [];
      setConnectionState("bad", `Không thể tải dữ liệu từ backend. ${error.message || error}`);
      render();
      startPixelAnimation();
    }
  }

  async function checkHealth() {
    const health = await fetchJson("/health");
    if (!health || health.ok !== true) {
      throw new Error("Backend health check failed");
    }
    return health;
  }

  async function fetchJson(path) {
    if (!API_BASE) throw new Error("Thiếu apiBaseUrl trong config.js");
    const response = await fetch(`${API_BASE}${path}`, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });
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

  function normalizeProject(raw) {
    const ownerId = matchMemberId(raw.owner);
    const status = normalizeStatus(raw.health_status || raw.status);
    const zone = mapZone(raw.stage, ownerId);
    return {
      id: raw.id ?? raw.project_code ?? cryptoRandom(),
      name: raw.project_name || raw.name || raw.project_code || "Untitled Project",
      code: raw.project_code || null,
      ownerId,
      ownerName: findMember(ownerId)?.name || raw.owner || "Unassigned",
      projectType: raw.project_type || "GENERAL",
      stage: raw.stage || "intake",
      status,
      score: safeNumber(raw.health_score, 0),
      reason: raw.health_reason || "",
      dueDate: raw.due_date || null,
      createdAt: raw.created_at || null,
      updatedAt: raw.updated_at || raw.modified_at || raw.last_updated || null,
      zone
    };
  }

  function render() {
    renderSummary();
    renderMembers();
    renderProjects();
    renderLegend();
    drawPixelMap();
  }

  async function loadPixelAssets() {
    try {
      const [house, sun, moon] = await Promise.all([
        loadImage(ASSET_PATHS.house),
        loadImage(ASSET_PATHS.sun),
        loadImage(ASSET_PATHS.moon)
      ]);

      const expertImages = {};
      const spriteEntries = await Promise.all(MEMBERS.map(async (member) => {
        const key = SPRITE_KEYS[member.id];
        const [body, outfit, hair] = await Promise.all([
          loadImage(`./assets/pixel/experts/${key}/body.png`),
          loadImage(`./assets/pixel/experts/${key}/outfit.png`),
          loadImage(`./assets/pixel/experts/${key}/hair.png`)
        ]);
        return [member.id, { body, outfit, hair }];
      }));

      spriteEntries.forEach(([id, assets]) => {
        expertImages[id] = assets;
      });
      state.pixelAssets = { house, sun, moon, expertImages };
    } catch (error) {
      console.warn("Pixel assets could not be loaded", error);
      state.pixelAssets = null;
    }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function renderSummary() {
    const total = state.projects.length;
    const active = state.projects.filter((p) => p.status !== "done").length;
    const risk = state.projects.filter((p) => ["at_risk", "delayed", "blocked"].includes(p.status)).length;
    const done = state.projects.filter((p) => p.status === "done").length;
    const busyMembers = new Set(state.projects.filter((p) => p.status !== "done").map((p) => p.ownerId)).size;
    const avgScore = total ? Math.round(state.projects.reduce((sum, p) => sum + safeNumber(p.score, 0), 0) / total) : 0;

    const cards = [
      ["Tổng dự án", total],
      ["Đang active", active],
      ["Cần chú ý", risk],
      ["Đã xong", done],
      ["Người đang bận", busyMembers],
      ["Avg health", `${avgScore}%`]
    ];

    els.summaryCards.innerHTML = cards.map(([label, value]) => `
      <article class="summary-card">
        <div class="summary-label">${label}</div>
        <div class="summary-value">${value}</div>
      </article>
    `).join("");
  }

  function renderMembers() {
    els.activeFilterText.textContent = state.activeMemberId
      ? `Đang lọc: ${findMember(state.activeMemberId)?.name || state.activeMemberId}`
      : "Tất cả thành viên";

    els.memberBoard.innerHTML = MEMBERS.map((member) => {
      const items = state.projects.filter((p) => p.ownerId === member.id);
      const active = items.filter((p) => p.status !== "done").length;
      const risky = items.filter((p) => ["at_risk", "delayed", "blocked"].includes(p.status)).length;
      const done = items.filter((p) => p.status === "done").length;
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
        </article>
      `;
    }).join("");

    els.memberBoard.querySelectorAll(".member-card").forEach((card) => {
      card.addEventListener("click", () => {
        const id = card.dataset.memberId;
        state.activeMemberId = state.activeMemberId === id ? null : id;
        render();
      });
    });
  }

  function renderProjects() {
    const visibleProjects = state.activeMemberId
      ? state.projects.filter((p) => p.ownerId === state.activeMemberId)
      : state.projects;

    els.projectCount.textContent = `${visibleProjects.length} dự án`;

    if (!visibleProjects.length) {
      els.projectList.innerHTML = `<div class="empty">Chưa có dữ liệu dự án phù hợp hoặc backend chưa trả về dữ liệu.</div>`;
      return;
    }

    els.projectList.innerHTML = visibleProjects.map((project) => `
      <article class="project-card">
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
          <div class="chip">Health: ${safeNumber(project.score, 0)}%</div>
          ${project.dueDate ? `<div class="chip">Due: ${escapeHtml(project.dueDate)}</div>` : ""}
        </div>
        <div class="project-note">${escapeHtml(project.reason || "Chưa có ghi chú health_reason từ backend.")}</div>
      </article>
    `).join("");
  }

  function renderLegend() {
    els.pixelLegend.innerHTML = MEMBERS.map((member) => `
      <div class="legend-item">
        <span class="legend-dot" style="background:${member.color}"></span>
        <span>${member.name}</span>
      </div>
    `).join("");
  }

  function drawPixelMap() {
    const canvas = els.pixelCanvas;
    if (!canvas || !ctx) return;
    state.tick += 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (state.pixelAssets?.house) {
      drawPixelSceneWithAssets(canvas.width, canvas.height);
      return;
    }

    drawFallbackPixelScene(canvas.width, canvas.height);
  }

  function drawPixelSceneWithAssets(width, height) {
    const { house, sun, moon } = state.pixelAssets;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(house, 0, 0, width, height);

    const hour = new Date().getHours();
    const skyAsset = hour >= 6 && hour < 18 ? sun : moon;
    ctx.drawImage(skyAsset, 40, 28, 72, 72);

    ctx.fillStyle = "rgba(6, 16, 29, 0.80)";
    ctx.fillRect(14, 14, 230, 38);
    ctx.strokeStyle = "rgba(96, 165, 250, 0.28)";
    ctx.lineWidth = 2;
    ctx.strokeRect(14, 14, 230, 38);
    ctx.fillStyle = "#f3f8ff";
    ctx.font = "20px VT323";
    ctx.textAlign = "left";
    ctx.fillText("SA CTEL PROJECT MAP", 24, 38);

    drawProjectedMarkers();
  }

  function drawFallbackPixelScene(width, height) {
    drawBackground(width, height);
    drawZones();
    drawRoads();
    drawProjectedMarkers();
  }

  function drawProjectedMarkers() {
    const visibleProjects = state.activeMemberId
      ? state.projects.filter((p) => p.ownerId === state.activeMemberId)
      : state.projects;

    const labelQueue = [];

    MEMBERS.forEach((member, index) => {
      const own = visibleProjects.filter((p) => p.ownerId === member.id);
      const wobbleX = Math.sin((state.tick + index * 10) / 14) * 2;
      const wobbleY = Math.cos((state.tick + index * 8) / 18) * 1.5;
      const baseX = member.basePos.x + wobbleX;
      const baseY = member.basePos.y + wobbleY;

      if (state.pixelAssets?.expertImages?.[member.id]) {
        drawCompositeSprite(baseX, baseY, member.id);
      } else {
        drawFallbackSprite(baseX - 12, baseY - 6, member.color);
      }

      const isActive = state.activeMemberId === member.id;
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
      labelQueue.push({ member, baseX, baseY, project: leadProject, count: own.length });
    });

    labelQueue.forEach((item) => drawMemberLabel(item));
  }


  function drawMemberLabel({ member, baseX, baseY, project, count }) {
    const layout = LABEL_LAYOUT[member.id] || LABEL_LAYOUT.unknown;
    const title = member.name;
    const subtitle = project ? truncateText(project.name, 18) : (count ? `${count} dự án` : "Chưa có dự án");
    const bubbleWidth = layout.w;
    const bubbleHeight = 30;
    const targetX = Math.round(baseX + layout.dx);
    const targetY = Math.round(baseY + layout.dy);
    let boxX = Math.round(targetX - bubbleWidth / 2);
    let boxY = Math.round(targetY - bubbleHeight / 2);

    boxX = clamp(boxX, 8, els.pixelCanvas.width - bubbleWidth - 8);
    boxY = clamp(boxY, 8, els.pixelCanvas.height - bubbleHeight - 8);

    const anchorX = clamp(baseX, boxX + 10, boxX + bubbleWidth - 10);
    const anchorY = boxY + bubbleHeight;

    fillRect(boxX, boxY, bubbleWidth, bubbleHeight, "rgba(7,17,31,0.92)");
    strokeRect(boxX, boxY, bubbleWidth, bubbleHeight, member.color);

    ctx.fillStyle = member.color;
    ctx.beginPath();
    ctx.moveTo(anchorX - 5, anchorY - 1);
    ctx.lineTo(anchorX + 5, anchorY - 1);
    ctx.lineTo(Math.round(baseX), Math.round(baseY - 28));
    ctx.closePath();
    ctx.fill();

    ctx.textAlign = "left";
    ctx.fillStyle = "#f8fbff";
    ctx.font = "12px Inter";
    ctx.fillText(title, boxX + 8, boxY + 11);

    ctx.fillStyle = "#b9d5ff";
    ctx.font = "10px Inter";
    ctx.fillText(subtitle, boxX + 8, boxY + 23);
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

  function drawCompositeSprite(x, y, memberId) {
    const assets = state.pixelAssets?.expertImages?.[memberId];
    if (!assets) return;
    const sx = 0;
    const drawX = Math.round(x - 24);
    const drawY = Math.round(y - 42);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(assets.body, sx, 0, 32, 32, drawX, drawY, 48, 48);
    ctx.drawImage(assets.outfit, sx, 0, 32, 32, drawX, drawY, 48, 48);
    ctx.drawImage(assets.hair, sx, 0, 32, 32, drawX, drawY, 48, 48);
  }

  function drawFallbackSprite(x, y, color) {
    fillRect(x + 4, y, 8, 8, "#f8d7b5");
    fillRect(x + 2, y + 8, 12, 10, color);
    fillRect(x, y + 18, 6, 8, color);
    fillRect(x + 10, y + 18, 6, 8, color);
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

  function matchMemberId(owner) {
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
