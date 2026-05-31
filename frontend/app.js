const FLOW_STEPS = [
  ["任务规划", "框选区域 / 参数确认"],
  ["自主巡检", "S 型航线 / 定点拍摄"],
  ["影像回传", "本地照片 / 顺序绑定"],
  ["AI 检测", "虫害识别 / 位置追溯"],
  ["预警报告", "风险等级 / 处置建议"],
];

const state = {
  config: {},
  appState: "idle",
  phaseIndex: 0,
  selectedDetectionModel: "Ours",
  selectedLlmModel: "DS",
  detectionModels: ["Ours", "YOLOv8-N", "YOLOv12-S", "RT-DETR-S"],
  llmModels: ["DS", "Minimax", "国产大模型 API", "自定义 API 接入"],
  canvas: null,
  ctx: null,
  field: { width: 200, height: 200, backgroundUrl: "/static/assets/wheat-field-200m.png" },
  mapImage: null,
  mapImageReady: false,
  view: { scale: 4, panX: 0, panY: 0 },
  selectionRect: null,
  draftRect: null,
  waypoints: [],
  selectedFiles: [],
  results: [],
  report: null,
  selectedResult: null,
  drag: { type: null, lastX: 0, lastY: 0, startWorld: null },
};

const els = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  bindEvents();
  renderWorkflow();

  try {
    state.config = await fetchJson("/api/config");
  } catch (error) {
    showModal("配置加载失败", `<p>${escapeHtml(error.message || "无法读取后端配置")}</p>`);
  }

  applyConfig();
  setupCanvas();
  loadMapBackground();
  setAppState("idle");
  renderAllPanels();
}

function cacheElements() {
  [
    "mainView", "detailView", "tabWorkbench", "tabAi", "tabReport", "pageWorkbench", "pageAi", "pageReport",
    "workflowSteps", "stateBadge", "routeStatus", "detectStatus", "mapTitle", "mapSubtitle", "missionCanvas",
    "canvasShell", "selectionState", "cursorCoord", "configPanel", "selectionSize", "altitudeInput",
    "spacingInput", "confirmPlanBtn", "methodLabel", "detectionModelSelect", "llmModelSelect", "startBtn",
    "stopBtn", "timedBtn", "trendBtn", "distributionBtn", "goReportBtn", "fileInput", "fileQueue",
    "detectBtn", "riskBadge", "analysisCards", "preprocessList", "riskGauge", "typeShareChart",
    "heatmapChart", "topRiskList", "alertBadge", "alertPanel", "priorityList", "llmBadge",
    "llmAnalysisPanel", "llmSuggestionPanel", "coverageChart", "reportBadge", "reportCards", "reportCharts", "trendChart",
    "confidenceChart", "ratioChart", "modelComparisonChart", "advancedTrendChart", "riskRadarChart",
    "priorityMatrixChart", "missionTimelineChart", "spatialProjectionChart", "exportWordBtn", "exportPdfBtn",
    "backBtn", "detailTitle", "detailSubtitle", "detailMethodTabs", "detailRawImage", "detailOutputImage",
    "detailSeverity", "detailCards", "trendBars", "modal", "modalTitle", "modalBody", "modalCloseBtn",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  on(els.startBtn, "click", beginPlanning);
  on(els.stopBtn, "click", stopMission);
  on(els.confirmPlanBtn, "click", confirmPlanning);
  on(els.detectBtn, "click", runDetection);
  on(els.backBtn, "click", closeDetailView);
  on(els.timedBtn, "click", () => showModal("定时检测", "<p>当前版本保留本地照片上传检测，定时自动回传可在接入无人机端后启用。</p>"));
  on(els.trendBtn, "click", openAreaTrend);
  on(els.distributionBtn, "click", openDistribution);
  on(els.goReportBtn, "click", () => setActivePage("report"));
  on(els.exportPdfBtn, "click", () => window.print());
  on(els.exportWordBtn, "click", exportWordReport);
  on(els.modalCloseBtn, "click", () => {
    els.modal.hidden = true;
  });

  on(els.fileInput, "change", (event) => {
    state.selectedFiles = Array.from(event.target.files || []).map((file) => ({ file, name: file.name }));
    state.phaseIndex = Math.max(state.phaseIndex, 2);
    renderWorkflow();
    renderFileQueue();
  });

  on(els.detectionModelSelect, "change", () => {
    state.selectedDetectionModel = els.detectionModelSelect.value;
    updateModelLabels();
    renderAllPanels();
    renderDetail();
  });

  on(els.llmModelSelect, "change", () => {
    state.selectedLlmModel = els.llmModelSelect.value;
    updateModelLabels();
    renderAllPanels();
  });

  document.querySelectorAll(".page-tabs button").forEach((button) => {
    button.addEventListener("click", () => setActivePage(button.dataset.page));
  });
}

function on(element, event, handler) {
  if (element) element.addEventListener(event, handler);
}

function applyConfig() {
  const defaultField = state.config.defaultField || {};
  state.detectionModels = state.config.detectionModels || state.config.methods || state.detectionModels;
  state.llmModels = state.config.llmModels || state.llmModels;
  state.selectedDetectionModel = state.config.defaultDetectionModel || state.detectionModels[0] || "Ours";
  state.selectedLlmModel = state.config.defaultLlmModel || state.llmModels[0] || "DS";
  state.field.width = Number(state.config.fieldWidthM || defaultField.widthM || 200);
  state.field.height = Number(state.config.fieldHeightM || defaultField.heightM || 200);
  state.field.backgroundUrl = state.config.mapBackgroundUrl || state.field.backgroundUrl;
  state.view.scale = Number(state.config.defaultCanvasScale || 4);
  if (els.altitudeInput) els.altitudeInput.value = String(state.config.defaultAltitudeM || 1);
  if (els.spacingInput) els.spacingInput.value = String(state.config.defaultSpacingM || 30);
  fillSelect(els.detectionModelSelect, state.detectionModels, state.selectedDetectionModel);
  fillSelect(els.llmModelSelect, state.llmModels, state.selectedLlmModel);
  renderDetailMethodTabs();
  updateModelLabels();
}

function fillSelect(select, values, selected) {
  if (!select) return;
  select.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    option.selected = value === selected;
    select.appendChild(option);
  });
}

function setupCanvas() {
  state.canvas = els.missionCanvas;
  if (!state.canvas) return;
  state.ctx = state.canvas.getContext("2d");
  window.addEventListener("resize", resizeCanvas);
  state.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  state.canvas.addEventListener("pointerdown", handlePointerDown);
  state.canvas.addEventListener("pointermove", handlePointerMove);
  state.canvas.addEventListener("pointerup", handlePointerUp);
  state.canvas.addEventListener("pointercancel", handlePointerUp);
  state.canvas.addEventListener("wheel", handleWheel, { passive: false });
  resizeCanvas();
  resetView();
}

function loadMapBackground() {
  const image = new Image();
  image.onload = () => {
    state.mapImage = image;
    state.mapImageReady = true;
    drawCanvas();
  };
  image.onerror = () => {
    state.mapImageReady = false;
    drawCanvas();
  };
  image.src = state.field.backgroundUrl;
}

function resizeCanvas() {
  if (!state.canvas || !state.ctx) return;
  const rect = els.canvasShell.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  state.canvas.width = Math.max(1, Math.round(rect.width * dpr));
  state.canvas.height = Math.max(1, Math.round(rect.height * dpr));
  state.canvas.style.width = `${rect.width}px`;
  state.canvas.style.height = `${rect.height}px`;
  state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawCanvas();
}

function resetView() {
  if (!state.canvas) return;
  const rect = state.canvas.getBoundingClientRect();
  const margin = 56;
  state.view.scale = clamp(
    Math.min((rect.width - margin * 2) / state.field.width, (rect.height - margin * 2) / state.field.height),
    1,
    9,
  );
  state.view.panX = rect.width / 2 - (state.field.width / 2) * state.view.scale;
  state.view.panY = rect.height / 2 + (state.field.height / 2) * state.view.scale;
  drawCanvas();
}

function setAppState(nextState) {
  state.appState = nextState;
  const labels = { idle: "Idle", planning: "Planning", configured: "Configured", running: "Running", stopped: "Stopped" };
  setText(els.stateBadge, labels[nextState] || nextState);
  setText(els.mapTitle, nextState === "planning" || nextState === "configured" ? "任务规划" : "任务地图");
  setText(els.mapSubtitle, subtitleForState(nextState));
  if (els.startBtn) els.startBtn.disabled = nextState === "planning" || nextState === "running";
  if (els.stopBtn) els.stopBtn.disabled = nextState !== "running" && nextState !== "configured";
  if (els.configPanel) els.configPanel.hidden = !(nextState === "configured" && state.selectionRect);
  renderWorkflow();
  renderAllPanels();
  drawCanvas();
}

function subtitleForState(appState) {
  if (appState === "planning") return "左键框选 200m x 200m 麦田中的巡检区域";
  if (appState === "configured") return "确认 1m 飞行高度与 30m 定点间距后生成航线";
  if (appState === "running") return "轨迹、检测结果、预警与报告已生成";
  if (appState === "stopped") return "任务已停止";
  return "等待任务开始";
}

function beginPlanning() {
  state.phaseIndex = 0;
  state.selectionRect = null;
  state.draftRect = null;
  state.waypoints = [];
  state.results = [];
  state.report = null;
  state.selectedResult = null;
  setText(els.selectionState, "未选择区域");
  setText(els.selectionSize, "0m x 0m");
  setStatus("routeStatus", "等待框选");
  setStatus("detectStatus", "等待影像");
  setAppState("planning");
  renderFileQueue();
}

function stopMission() {
  setAppState("stopped");
  setStatus("detectStatus", "任务已停止");
}

async function confirmPlanning() {
  if (!state.selectionRect) {
    setStatus("routeStatus", "未选择区域");
    return;
  }
  const spacing = Number(els.spacingInput?.value || 30);
  if (!Number.isFinite(spacing) || spacing <= 0) {
    setStatus("routeStatus", "定点间距无效");
    return;
  }

  try {
    const data = await fetchJson("/api/plan-route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ polygon: rectToPolygon(state.selectionRect), spacing_m: spacing }),
    });
    state.waypoints = data.waypoints || [];
    state.results = [];
    state.report = null;
    state.phaseIndex = 1;
    setStatus("routeStatus", `已生成 ${state.waypoints.length} 个 spot`);
    setAppState("configured");
  } catch (error) {
    setStatus("routeStatus", "航线生成失败");
    showModal("航线生成失败", `<p>${escapeHtml(error.message)}</p>`);
  }
}

function handlePointerDown(event) {
  const world = screenToWorld(event.offsetX, event.offsetY);
  if (event.button === 2) {
    state.drag = { type: "pan", lastX: event.clientX, lastY: event.clientY, startWorld: world };
    state.canvas.setPointerCapture(event.pointerId);
    return;
  }
  if (event.button !== 0) return;

  const hit = findProblemAt(event.offsetX, event.offsetY);
  if (hit) {
    openDetailView(hit);
    return;
  }

  if (state.appState === "planning") {
    const start = clampWorldToField(world);
    state.drag = { type: "select", lastX: event.clientX, lastY: event.clientY, startWorld: start };
    state.draftRect = makeRect(start, start);
    state.canvas.setPointerCapture(event.pointerId);
  }
}

function handlePointerMove(event) {
  const world = clampWorldToField(screenToWorld(event.offsetX, event.offsetY));
  setText(els.cursorCoord, formatLocation(world));

  if (state.drag.type === "pan") {
    state.view.panX += event.clientX - state.drag.lastX;
    state.view.panY += event.clientY - state.drag.lastY;
    state.drag.lastX = event.clientX;
    state.drag.lastY = event.clientY;
    drawCanvas();
  } else if (state.drag.type === "select") {
    state.draftRect = makeRect(state.drag.startWorld, world);
    drawCanvas();
  }
}

function handlePointerUp(event) {
  if (state.drag.type === "select" && state.draftRect) {
    if (state.draftRect.width >= 8 && state.draftRect.height >= 8) {
      state.selectionRect = state.draftRect;
      state.waypoints = [];
      state.results = [];
      state.report = null;
      updateSelectionPanel();
      setStatus("routeStatus", "区域已保存");
      setAppState("configured");
    }
    state.draftRect = null;
  }
  if (state.drag.type) {
    try {
      state.canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
  }
  state.drag = { type: null, lastX: 0, lastY: 0, startWorld: null };
  drawCanvas();
}

function handleWheel(event) {
  event.preventDefault();
  const before = screenToWorld(event.offsetX, event.offsetY);
  state.view.scale = clamp(state.view.scale * (event.deltaY > 0 ? 0.88 : 1.14), 0.9, 18);
  state.view.panX = event.offsetX - before.x * state.view.scale;
  state.view.panY = event.offsetY + before.y * state.view.scale;
  drawCanvas();
}

function updateSelectionPanel() {
  if (!state.selectionRect) return;
  setText(els.selectionState, "区域已保存");
  setText(els.selectionSize, `${state.selectionRect.width.toFixed(1)}m x ${state.selectionRect.height.toFixed(1)}m`);
}

function renderFileQueue() {
  if (!els.fileQueue) return;
  els.fileQueue.innerHTML = "";
  state.selectedFiles.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "file-chip";
    row.innerHTML = `<b>${index + 1}</b><span title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "x";
    remove.title = "移除";
    remove.addEventListener("click", () => {
      state.selectedFiles.splice(index, 1);
      renderFileQueue();
      renderAllPanels();
    });
    row.appendChild(remove);
    els.fileQueue.appendChild(row);
  });
  renderAllPanels();
}

async function runDetection() {
  if (!state.selectedFiles.length) {
    setStatus("detectStatus", "未选择照片");
    return;
  }
  if (!state.waypoints.length) {
    setStatus("detectStatus", "缺少 spot");
    return;
  }

  const formData = new FormData();
  state.selectedFiles.forEach((item) => formData.append("files", item.file, item.name));
  formData.append("waypoints_json", JSON.stringify(state.waypoints));
  formData.append("detection_model", state.selectedDetectionModel);
  formData.append("llm_model", state.selectedLlmModel);

  state.phaseIndex = 3;
  setStatus("detectStatus", "检测中");
  renderWorkflow();
  try {
    const data = await fetchJson("/api/detect", { method: "POST", body: formData });
    state.results = data.results || [];
    state.report = data;
    state.selectedResult = state.results.find((item) => item.pestFound) || null;
    state.phaseIndex = 4;
    setStatus("detectStatus", `完成 ${state.results.length} 张`);
    setAppState("running");
    setActivePage(state.selectedResult ? "ai" : "report");
  } catch (error) {
    setStatus("detectStatus", "检测失败");
    showModal("检测失败", `<p>${escapeHtml(error.message)}</p>`);
  }
}

function setActivePage(page) {
  document.querySelectorAll(".page-tabs button").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });
  document.querySelectorAll(".page-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.page === page);
  });
  if (page === "workbench") {
    setTimeout(() => {
      resizeCanvas();
      resetView();
    }, 0);
  }
}

function renderWorkflow() {
  if (!els.workflowSteps) return;
  els.workflowSteps.innerHTML = FLOW_STEPS.map(([title, subtitle], index) => {
    const cls = index < state.phaseIndex ? "done" : index === state.phaseIndex ? "active" : "";
    return `<div class="workflow-step ${cls}"><b>${index + 1}</b><span>${escapeHtml(title)}</span><small>${escapeHtml(subtitle)}</small></div>`;
  }).join("");
}

function renderAllPanels() {
  renderAnalysis();
  renderPreprocess();
  renderRiskGauge();
  renderTypeShare();
  renderHeatmap();
  renderTopRiskList();
  renderAlert();
  renderPriorityList();
  renderLlmAnalysis();
  renderLlmSuggestion();
  renderCoverageStats();
  renderReport();
  renderTrendChart();
  renderConfidenceHistogram();
  renderRatioChart();
  renderModelComparison();
  renderAdvancedTrend();
  renderRiskRadar();
  renderPriorityMatrix();
  renderMissionTimeline();
  renderSpatialProjection();
  updateModelLabels();
}

function renderAnalysis() {
  const total = state.results.length;
  const pests = state.results.filter((item) => item.pestFound);
  const risk = state.report?.summary?.riskLevel || riskFromResults();
  setText(els.riskBadge, risk);
  if (els.riskBadge) els.riskBadge.className = `pill ${severityClass(risk)}`;
  if (!els.analysisCards) return;

  const selection = state.selectionRect ? `${state.selectionRect.width.toFixed(1)}m x ${state.selectionRect.height.toFixed(1)}m` : "未选择";
  const progress = state.waypoints.length ? `${Math.min(total, state.waypoints.length)} / ${state.waypoints.length}` : "0 / 0";
  const topPest = countPests()[0]?.name || "无";
  els.analysisCards.innerHTML = [
    ["任务区域", selection],
    ["飞行高度", `${Number(els.altitudeInput?.value || 1).toFixed(1)} m`],
    ["定点间距", `${Number(els.spacingInput?.value || 30).toFixed(1)} m`],
    ["执行进度", progress],
    ["异常 Spot", `${pests.length} 个`],
    ["主导虫害", topPest],
    ["当前预警", risk],
  ].map(([title, body]) => statCard(title, body)).join("");
}

function renderPreprocess() {
  if (!els.preprocessList) return;
  const steps = ["畸变校正", "尺度归一化", "光照增强"];
  els.preprocessList.innerHTML = steps.map((step, index) => (
    `<div class="process-item ${state.selectedFiles.length || state.results.length ? "done" : ""}"><b>${index + 1}</b><span>${step}</span></div>`
  )).join("");
}

function renderRiskGauge() {
  if (!els.riskGauge) return;
  const summary = state.report?.summary || {};
  const ratio = Number(summary.pestRatio || 0);
  const risk = summary.riskLevel || riskFromResults();
  const degrees = clamp(Math.round(ratio * 360), 0, 360);
  els.riskGauge.innerHTML = `
    <div class="gauge-ring ${severityClass(risk)}" style="--value:${degrees}deg">
      <strong>${Math.round(ratio * 100)}%</strong>
      <span>${escapeHtml(risk)}</span>
    </div>
    <div class="gauge-meta">
      <span>总影像 <b>${summary.total || 0}</b></span>
      <span>异常 <b>${summary.pestCount || 0}</b></span>
      <span>正常 <b>${summary.noPestCount || 0}</b></span>
    </div>
  `;
}

function renderTypeShare() {
  if (!els.typeShareChart) return;
  const items = state.report?.chartData?.distribution || [];
  const total = items.reduce((sum, item) => sum + Number(item.count || 0), 0);
  if (!items.length) {
    els.typeShareChart.innerHTML = emptyState("暂无虫害类型数据");
    return;
  }
  const colors = ["#16a085", "#f5c542", "#ef4444", "#3b82f6", "#8b5cf6"];
  let cursor = 0;
  const stops = items.map((item, index) => {
    const percent = total ? (Number(item.count || 0) / total) * 100 : 0;
    const from = cursor;
    cursor += percent;
    return `${colors[index % colors.length]} ${from.toFixed(2)}% ${cursor.toFixed(2)}%`;
  }).join(", ");
  const legend = items.map((item, index) => {
    const percent = total ? Math.round((Number(item.count || 0) / total) * 100) : 0;
    return `
      <div class="pie-legend-row">
        <i style="background:${colors[index % colors.length]}"></i>
        <span>${escapeHtml(item.name)}</span>
        <b>${percent}%</b>
      </div>
    `;
  }).join("");
  els.typeShareChart.innerHTML = `
    <div class="pie-wrap">
      <div class="pie-ring" style="background: conic-gradient(${stops})">
        <strong>${total}</strong>
        <span>异常</span>
      </div>
      <div class="pie-legend">${legend}</div>
    </div>
  `;
}

function renderHeatmap() {
  if (!els.heatmapChart) return;
  const cells = state.report?.chartData?.spatialHeatmap || [];
  const cellMap = new Map(cells.map((cell) => [`${cell.xBin}-${cell.yBin}`, cell]));
  let html = "";
  for (let y = 4; y >= 0; y -= 1) {
    for (let x = 0; x < 5; x += 1) {
      const cell = cellMap.get(`${x}-${y}`);
      const count = Number(cell?.count || 0);
      html += `<span class="heat-cell heat-${Math.min(3, count)}" title="x${x}, y${y}: ${count}">${count || ""}</span>`;
    }
  }
  els.heatmapChart.innerHTML = `${html}<small>按 200m x 200m 田块划分为 5 x 5 网格</small>`;
}

function renderTopRiskList() {
  if (!els.topRiskList) return;
  const items = state.report?.chartData?.topRiskSpots || [];
  if (!items.length) {
    els.topRiskList.innerHTML = emptyState("暂无异常点");
    return;
  }
  const maxConfidence = Math.max(0.01, ...items.map((item) => Number(item.confidence || 0)));
  els.topRiskList.innerHTML = items.map((item, index) => {
    const confidence = Number(item.confidence || 0);
    const width = Math.max(6, Math.round((confidence / maxConfidence) * 100));
    return `
      <div class="top-risk-bar">
        <span>${escapeHtml(item.spotId || `SPOT-${index + 1}`)}</span>
        <i style="width:${width}%"></i>
        <b>${Math.round(confidence * 100)}%</b>
        <em>${escapeHtml(item.pestType || "-")} · ${formatLocation(item.location)}</em>
      </div>
    `;
  }).join("");
}

function renderPriorityList() {
  if (!els.priorityList) return;
  const recommendations = state.report?.summary?.recommendations || [];
  const top = state.report?.chartData?.topRiskSpots || [];
  const items = recommendations.length ? recommendations : ["等待检测结果生成处置优先级。"];
  els.priorityList.innerHTML = items.map((item, index) => `
    <article>
      <b>${index + 1}</b>
      <span>${escapeHtml(item)}</span>
      <em>${top[index]?.spotId ? `关联 ${escapeHtml(top[index].spotId)}` : "全局建议"}</em>
    </article>
  `).join("");
}

function renderAlert() {
  const pests = state.results.filter((item) => item.pestFound);
  setText(els.alertBadge, pests.length ? "已触发" : "未触发");
  if (els.alertBadge) els.alertBadge.className = `pill ${pests.length ? "danger" : "neutral"}`;
  if (!els.alertPanel) return;
  if (!state.results.length) {
    els.alertPanel.innerHTML = "<p>等待检测结果。发现虫害后会显示异常点、虫害种类和位置。</p>";
    return;
  }
  els.alertPanel.innerHTML = pests.length
    ? pests.slice(0, 3).map((item) => `<p>${escapeHtml(item.spotId)}：${escapeHtml(item.pestType)}，${escapeHtml(formatLocation(item.location))}</p>`).join("")
    : "<p>本次巡检未触发虫害预警。</p>";
}

function renderLlmAnalysis() {
  setText(els.llmBadge, state.selectedLlmModel);
  if (!els.llmAnalysisPanel) return;
  const analysis = state.report?.llmAnalysis;
  if (!analysis) {
    els.llmAnalysisPanel.innerHTML = `<p>当前选择：${escapeHtml(state.selectedLlmModel)}。检测完成后生成趋势、风险和处置建议。</p>`;
    return;
  }
  els.llmAnalysisPanel.innerHTML = `
    <p>${escapeHtml(analysis.narrative || "")}</p>
    <p>${escapeHtml(analysis.trendAssessment || "")}</p>
    <p>${escapeHtml(analysis.riskAssessment || "")}</p>
  `;
}

function renderLlmSuggestion() {
  if (!els.llmSuggestionPanel) return;
  const summary = state.report?.summary || {};
  const top = state.report?.chartData?.topRiskSpots || [];
  const heatmap = state.report?.chartData?.spatialHeatmap || [];
  const coverage = state.report?.chartData?.coverageStats || {};
  const dominant = countPests()[0]?.name || "未发现明确主导虫害";
  const risk = summary.riskLevel || "未生成";
  const ratio = Math.round(Number(summary.pestRatio || 0) * 100);
  const firstSpot = top[0];
  const scope = firstSpot ? `${firstSpot.spotId} 附近，${formatLocation(firstSpot.location)}` : "当前巡检区域";
  const denseCell = [...heatmap].sort((a, b) => Number(b.count || 0) - Number(a.count || 0))[0];
  const denseArea = denseCell
    ? `田块分区 x${denseCell.xBin + 1}-y${denseCell.yBin + 1}，累计异常 ${denseCell.count} 处`
    : "暂未形成明显空间聚集区";
  const missing = Number(coverage.missing || 0);
  const recommendations = summary.recommendations?.length
    ? summary.recommendations
    : ["完成影像回传后，系统将根据异常点分布生成处置建议。"];

  els.llmSuggestionPanel.innerHTML = `
    <article class="llm-report-block">
      <h3>巡检结论</h3>
      <p>本次无人机巡检共分析 ${summary.total || 0} 张影像，发现异常 ${summary.pestCount || 0} 张，异常率 ${ratio}%，综合判定为 <strong>${escapeHtml(risk)}</strong>。当前主导虫害为 <strong>${escapeHtml(dominant)}</strong>。</p>
    </article>
    <article class="llm-report-block">
      <h3>风险研判</h3>
      <p>系统认为异常影像主要集中在 ${escapeHtml(denseArea)}。若该区域与田垄边缘、灌溉沟渠或长势偏弱区域重合，应优先判断为虫害扩散早期信号。</p>
    </article>
    <article class="llm-report-block">
      <h3>重点复核区域</h3>
      <p>建议优先复核 ${escapeHtml(scope)}。复核时记录虫态、虫口密度、危害叶位和周边 5-10m 扩散情况，避免仅凭单张影像做最终处置。</p>
    </article>
    <article class="llm-report-block">
      <h3>分区处置建议</h3>
      <ol>${recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
    </article>
    <article class="llm-report-block">
      <h3>绿色防控建议</h3>
      <p>低风险区域建议以诱捕、清除虫源和加强田间通风为主；中高风险点位建议先小范围定点防治，再根据人工复核结果决定是否扩大处理范围。</p>
    </article>
    <article class="llm-report-block">
      <h3>后续监测计划</h3>
      <p>建议保持 30m 定点间隔复飞监测，重点异常点 24-48 小时内复拍一次；若漏传航点数为 ${missing}，应优先补拍漏传位置，保证趋势分析连续性。</p>
    </article>
  `;
}

function renderReport() {
  if (!els.reportBadge || !els.reportCards || !els.reportCharts) return;
  setText(els.reportBadge, state.report ? "已生成" : "未生成");
  els.reportBadge.className = `pill ${state.report ? "ok" : "neutral"}`;
  if (!state.report) {
    els.reportCards.innerHTML = [
      ["在线浏览", "检测完成后自动生成"],
      ["导出 Word", "生成兼容 .doc 文件"],
      ["导出 PDF", "调用浏览器打印"],
    ].map(([title, body]) => statCard(title, body)).join("");
    els.reportCharts.innerHTML = "";
    return;
  }

  const summary = state.report.summary || {};
  els.reportCards.innerHTML = [
    ["总照片数", String(summary.total || 0)],
    ["虫害照片数", String(summary.pestCount || 0)],
    ["虫害占比", `${Math.round(Number(summary.pestRatio || 0) * 100)}%`],
    ["风险等级", summary.riskLevel || "未生成"],
  ].map(([title, body]) => statCard(title, body)).join("");

  const distribution = state.report.chartData?.distribution || [];
  els.reportCharts.innerHTML = `
    <h3>类型分布</h3>
    <div class="chart-bars">
      ${distribution.map((item) => chartRow(item.name, Number(item.count || 0) / Math.max(1, summary.pestCount || 1), item.count)).join("") || "<p>暂无虫害类型分布。</p>"}
    </div>
  `;
}

function renderTrendChart() {
  if (!els.trendChart) return;
  const items = state.report?.chartData?.trend || [
    { label: "上月", value: 0.12 },
    { label: "两周前", value: 0.18 },
    { label: "上周", value: 0.23 },
    { label: "本次", value: 0 },
  ];
  els.trendChart.innerHTML = `<h3>历史趋势</h3><div class="chart-bars">${items.map((item) => chartRow(item.label, Number(item.value || 0))).join("")}</div>`;
}

function renderConfidenceHistogram() {
  if (!els.confidenceChart) return;
  const items = state.report?.chartData?.confidenceHistogram || [
    { label: "0-60%", count: 0 },
    { label: "60-80%", count: 0 },
    { label: "80-90%", count: 0 },
    { label: "90-100%", count: 0 },
  ];
  const maxCount = Math.max(1, ...items.map((item) => Number(item.count || 0)));
  els.confidenceChart.innerHTML = `<h3>置信度分布</h3><div class="histogram">${items.map((item) => `
    <div><i style="height:${Math.max(4, Math.round((Number(item.count || 0) / maxCount) * 100))}%"></i><span>${escapeHtml(item.label)}</span><b>${item.count}</b></div>
  `).join("")}</div>`;
}

function renderRatioChart() {
  if (!els.ratioChart) return;
  const items = state.report?.chartData?.ratio || [
    { name: "虫害影像", value: 0 },
    { name: "正常影像", value: 0 },
  ];
  const total = Math.max(1, items.reduce((sum, item) => sum + Number(item.value || 0), 0));
  els.ratioChart.innerHTML = `<h3>正常/异常比例</h3><div class="chart-bars">${items.map((item) => chartRow(item.name, Number(item.value || 0) / total, item.value)).join("")}</div>`;
}

function renderCoverageStats() {
  if (!els.coverageChart) return;
  const stats = state.report?.chartData?.coverageStats || {
    waypoints: state.waypoints.length,
    uploaded: state.selectedFiles.length,
    coverageRatio: state.waypoints.length ? state.selectedFiles.length / state.waypoints.length : 0,
    missing: Math.max(0, state.waypoints.length - state.selectedFiles.length),
  };
  const percent = clamp(Math.round(Number(stats.coverageRatio || 0) * 100), 0, 100);
  els.coverageChart.innerHTML = `
    <h3>巡检覆盖摘要</h3>
    <div class="coverage-meter"><i style="width:${percent}%"></i><b>${percent}%</b></div>
    <div class="coverage-stats">
      <span>航点 ${stats.waypoints || 0}</span>
      <span>回传 ${stats.uploaded || 0}</span>
      <span>漏传 ${stats.missing || 0}</span>
    </div>
  `;
}

function renderModelComparison() {
  if (!els.modelComparisonChart) return;
  const items = state.report?.chartData?.modelComparison || [
    { model: "Ours", score: 0.92, latencyMs: 120 },
    { model: "YOLOv8-N", score: 0.86, latencyMs: 78 },
    { model: "YOLOv12-S", score: 0.89, latencyMs: 96 },
    { model: "RT-DETR-S", score: 0.87, latencyMs: 104 },
  ];
  els.modelComparisonChart.innerHTML = `
    <h3>模型对比</h3>
    <div class="model-bars">
      ${items.map((item) => `
        <div>
          <span>${escapeHtml(item.model)}</span>
          <i style="width:${Math.round(Number(item.score || 0) * 100)}%"></i>
          <b>${Math.round(Number(item.score || 0) * 100)}% · ${item.latencyMs}ms</b>
        </div>
      `).join("")}
    </div>
  `;
}

function renderAdvancedTrend() {
  if (!els.advancedTrendChart) return;
  const items = state.report?.chartData?.historySeries || [
    { label: "T-5", abnormalRate: 0.08, coverage: 0.66, confidence: 0.78 },
    { label: "T-4", abnormalRate: 0.11, coverage: 0.72, confidence: 0.8 },
    { label: "T-3", abnormalRate: 0.13, coverage: 0.79, confidence: 0.83 },
    { label: "T-2", abnormalRate: 0.16, coverage: 0.85, confidence: 0.86 },
    { label: "T-1", abnormalRate: 0.18, coverage: 0.9, confidence: 0.88 },
    { label: "本次", abnormalRate: state.report?.summary?.pestRatio || 0, coverage: 0.96, confidence: 0.91 },
  ];
  const series = [
    { key: "abnormalRate", label: "异常率", color: "#ef4444" },
    { key: "coverage", label: "覆盖率", color: "#16a085" },
    { key: "confidence", label: "置信度", color: "#3b82f6" },
  ];
  els.advancedTrendChart.innerHTML = `
    <h3>历史多指标趋势</h3>
    <svg class="line-svg" viewBox="0 0 520 190" role="img" aria-label="历史多指标趋势">
      ${lineGrid(520, 190)}
      ${series.map((item) => linePath(items, item.key, item.color, 520, 190)).join("")}
      ${items.map((item, index) => `<text x="${40 + index * 88}" y="178">${escapeHtml(item.label)}</text>`).join("")}
    </svg>
    <div class="chart-legend">${series.map((item) => `<span><i style="background:${item.color}"></i>${item.label}</span>`).join("")}</div>
  `;
}

function renderRiskRadar() {
  if (!els.riskRadarChart) return;
  const items = state.report?.chartData?.riskRadar || [
    { axis: "异常率", value: 0 },
    { axis: "置信度", value: 0 },
    { axis: "类型复杂度", value: 0 },
    { axis: "空间扩散", value: 0 },
    { axis: "覆盖完整度", value: 0 },
  ];
  const cx = 120;
  const cy = 104;
  const radius = 72;
  const points = radarPoints(items, cx, cy, radius, 1);
  const valuePoints = radarPoints(items, cx, cy, radius, null);
  els.riskRadarChart.innerHTML = `
    <h3>综合风险雷达</h3>
    <svg class="radar-svg" viewBox="0 0 240 210" role="img" aria-label="综合风险雷达">
      <polygon class="radar-grid" points="${points}" />
      <polygon class="radar-grid radar-mid" points="${radarPoints(items, cx, cy, radius * 0.62, 1)}" />
      <polygon class="radar-area" points="${valuePoints}" />
      ${items.map((item, index) => radarAxis(item, index, items.length, cx, cy, radius)).join("")}
    </svg>
  `;
}

function renderPriorityMatrix() {
  if (!els.priorityMatrixChart) return;
  const items = state.report?.chartData?.priorityMatrix || [];
  const points = items.length ? items : [{ spotId: "待检测", pestType: "暂无数据", impact: 0.12, urgency: 0.14 }];
  els.priorityMatrixChart.innerHTML = `
    <h3>处置优先矩阵</h3>
    <svg class="matrix-svg" viewBox="0 0 260 180" role="img" aria-label="处置优先矩阵">
      <line x1="34" y1="18" x2="34" y2="150" />
      <line x1="34" y1="150" x2="240" y2="150" />
      <line class="matrix-guide" x1="137" y1="18" x2="137" y2="150" />
      <line class="matrix-guide" x1="34" y1="84" x2="240" y2="84" />
      <text x="42" y="28">高紧急</text>
      <text x="180" y="166">高影响</text>
      ${points.map((item, index) => matrixPoint(item, index)).join("")}
    </svg>
  `;
}

function renderMissionTimeline() {
  if (!els.missionTimelineChart) return;
  const items = state.report?.chartData?.missionTimeline || [];
  if (!items.length) {
    els.missionTimelineChart.innerHTML = `<h3>巡检事件时间轴</h3>${emptyState("完成检测后展示每个 spot 的回传与异常状态")}`;
    return;
  }
  els.missionTimelineChart.innerHTML = `
    <h3>巡检事件时间轴</h3>
    <div class="timeline-strip">
      ${items.map((item) => `
        <article class="${item.status === "abnormal" ? "bad" : "good"}">
          <b>${escapeHtml(item.label)}</b>
          <i></i>
          <span>${item.status === "abnormal" ? escapeHtml(item.pestType || "异常") : "正常"}</span>
        </article>
      `).join("")}
    </div>
  `;
}

function renderSpatialProjection() {
  if (!els.spatialProjectionChart) return;
  const data = state.report?.chartData?.spatialProjection || { xBins: [], yBins: [] };
  const xBins = data.xBins?.length ? data.xBins : Array.from({ length: 5 }, (_, index) => ({ label: `${index * 40}-${(index + 1) * 40}m`, count: 0 }));
  const yBins = data.yBins?.length ? data.yBins : Array.from({ length: 5 }, (_, index) => ({ label: `${index * 40}-${(index + 1) * 40}m`, count: 0 }));
  const maxCount = Math.max(1, ...xBins.map((item) => item.count), ...yBins.map((item) => item.count));
  els.spatialProjectionChart.innerHTML = `
    <h3>空间风险投影</h3>
    <div class="projection-grid">
      <div><b>X 方向聚集</b>${xBins.map((item) => projectionRow(item, maxCount)).join("")}</div>
      <div><b>Y 方向聚集</b>${yBins.map((item) => projectionRow(item, maxCount)).join("")}</div>
    </div>
  `;
}

function lineGrid(width, height) {
  const lines = [0.25, 0.5, 0.75, 1].map((ratio) => {
    const y = 18 + ratio * (height - 48);
    return `<line class="line-grid" x1="34" y1="${y}" x2="${width - 20}" y2="${y}" />`;
  }).join("");
  return `${lines}<line class="line-axis" x1="34" y1="18" x2="34" y2="${height - 34}" /><line class="line-axis" x1="34" y1="${height - 34}" x2="${width - 20}" y2="${height - 34}" />`;
}

function linePath(items, key, color, width, height) {
  const left = 40;
  const right = width - 40;
  const top = 18;
  const bottom = height - 38;
  const step = items.length > 1 ? (right - left) / (items.length - 1) : 0;
  const points = items.map((item, index) => {
    const value = clamp(Number(item[key] || 0), 0, 1);
    const x = left + index * step;
    const y = bottom - value * (bottom - top);
    return { x, y };
  });
  return `
    <polyline fill="none" stroke="${color}" stroke-width="3" points="${points.map((point) => `${point.x},${point.y}`).join(" ")}" />
    ${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="4" fill="${color}" />`).join("")}
  `;
}

function radarPoints(items, cx, cy, radius, fixedValue) {
  return items.map((item, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / items.length;
    const value = fixedValue === null ? clamp(Number(item.value || 0), 0, 1) : fixedValue;
    const r = radius * value;
    return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`;
  }).join(" ");
}

function radarAxis(item, index, total, cx, cy, radius) {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / total;
  const x = cx + Math.cos(angle) * radius;
  const y = cy + Math.sin(angle) * radius;
  const labelX = cx + Math.cos(angle) * (radius + 20);
  const labelY = cy + Math.sin(angle) * (radius + 20);
  return `
    <line class="radar-axis" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" />
    <text x="${labelX}" y="${labelY}">${escapeHtml(item.axis)}</text>
  `;
}

function matrixPoint(item, index) {
  const x = 34 + clamp(Number(item.impact || 0), 0, 1) * 206;
  const y = 150 - clamp(Number(item.urgency || 0), 0, 1) * 132;
  const colors = ["#ef4444", "#f97316", "#f5c542", "#3b82f6", "#16a085"];
  return `
    <circle cx="${x}" cy="${y}" r="7" fill="${colors[index % colors.length]}" />
    <text x="${x + 9}" y="${y - 5}">${escapeHtml(item.spotId || "")}</text>
  `;
}

function projectionRow(item, maxCount) {
  const percent = Math.round((Number(item.count || 0) / maxCount) * 100);
  return `
    <p>
      <span>${escapeHtml(item.label)}</span>
      <i style="width:${Math.max(3, percent)}%"></i>
      <em>${item.count || 0}</em>
    </p>
  `;
}

function openAreaTrend() {
  const items = state.report?.chartData?.trend || [
    { label: "上月", value: 0.12 },
    { label: "两周前", value: 0.18 },
    { label: "上周", value: 0.23 },
    { label: "本次", value: 0 },
  ];
  showModal("区域历史趋势", `<div class="modal-bars">${items.map((item) => {
    const value = Math.round(Number(item.value || 0) * 100);
    return `<div><span>${escapeHtml(item.label)}</span><i style="width:${value}%"></i><b>${value}%</b></div>`;
  }).join("")}</div>`);
}

function openDistribution() {
  const counts = countPests();
  const html = counts.length
    ? counts.map((item) => `<p><strong>${escapeHtml(item.name)}</strong>：${item.count} 个异常点</p>`).join("")
    : "<p>暂无虫害分布数据。</p>";
  showModal("虫害分布", html);
}

function exportWordReport() {
  if (!state.report) {
    showModal("报告未生成", "<p>请先完成检测，再导出 Word 报告。</p>");
    return;
  }
  const rows = state.report.results.map((item) => `
    <tr><td>${item.order}</td><td>${escapeHtml(item.fileName)}</td><td>${escapeHtml(item.pestType)}</td><td>${escapeHtml(item.severity)}</td><td>${escapeHtml(formatLocation(item.location))}</td></tr>
  `).join("");
  const html = `<html><head><meta charset="UTF-8"><title>虫害巡检报告</title></head><body><h1>智慧农林无人机虫害巡检报告</h1><table border="1" cellspacing="0" cellpadding="6">${rows}</table></body></html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = state.report.exportMeta?.wordFileName || `pest-report-${state.report.sessionId}.doc`;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
}

function renderDetailMethodTabs() {
  if (!els.detailMethodTabs) return;
  els.detailMethodTabs.innerHTML = "";
  state.detectionModels.forEach((method) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.method = method;
    button.textContent = method;
    button.addEventListener("click", () => {
      state.selectedDetectionModel = method;
      if (els.detectionModelSelect) els.detectionModelSelect.value = method;
      updateModelLabels();
      renderDetail();
    });
    els.detailMethodTabs.appendChild(button);
  });
}

function openDetailView(result) {
  if (!result || !result.pestFound) return;
  state.selectedResult = result;
  if (els.mainView) els.mainView.hidden = true;
  if (els.detailView) els.detailView.hidden = false;
  renderDetail();
}

function closeDetailView() {
  if (els.detailView) els.detailView.hidden = true;
  if (els.mainView) els.mainView.hidden = false;
  drawCanvas();
}

function renderDetail() {
  const result = state.selectedResult;
  if (!result) return;
  const output = result.methodOutputs?.[state.selectedDetectionModel] || result.outputUrl;
  setText(els.detailTitle, `${result.spotId} | ${result.pestType}`);
  setText(els.detailSubtitle, `${formatLocation(result.location)} | ${result.fileName}`);
  if (els.detailRawImage) els.detailRawImage.src = result.rawUrl;
  if (els.detailOutputImage) els.detailOutputImage.src = output;
  setText(els.detailSeverity, result.severity || "异常");
  if (els.detailSeverity) els.detailSeverity.className = `pill ${severityClass(result.severity)}`;
  if (els.detailCards) {
    els.detailCards.innerHTML = [
      ["检测模型", result.detectionModel || state.selectedDetectionModel],
      ["虫害类型", result.pestType],
      ["风险等级", result.severity || "异常"],
      ["局部坐标", formatLocation(result.location)],
      ["GPS 定位", formatGps(result.gps)],
      ["拍摄顺序", String(result.order)],
      ["置信度", `${Math.round((result.confidence || 0) * 100)}%`],
    ].map(([title, body]) => statCard(title, body)).join("");
  }
  renderTrendBars();
  updateModelLabels();
}

function renderTrendBars() {
  if (!els.trendBars) return;
  const base = state.selectedResult?.confidence || 0.2;
  els.trendBars.innerHTML = [base * 0.45, base * 0.58, base * 0.76, base].map((value, index) => `
    <div class="trend-row"><span>${index + 1}月</span><i style="width:${Math.round(value * 100)}%"></i><b>${value.toFixed(2)}</b></div>
  `).join("");
}

function updateModelLabels() {
  setText(els.methodLabel, state.selectedDetectionModel);
  setText(els.llmBadge, state.selectedLlmModel);
  document.querySelectorAll(".method-tabs button").forEach((button) => {
    button.classList.toggle("active", button.dataset.method === state.selectedDetectionModel);
  });
}

function drawCanvas() {
  if (!state.ctx || !state.canvas) return;
  const rect = state.canvas.getBoundingClientRect();
  const ctx = state.ctx;
  ctx.clearRect(0, 0, rect.width, rect.height);
  drawBackground(ctx, rect);
  drawSelection(ctx, state.selectionRect, false);
  drawSelection(ctx, state.draftRect, true);
  drawRoute(ctx);
  drawProblemSpots(ctx);
}

function drawBackground(ctx, rect) {
  ctx.fillStyle = "#08100d";
  ctx.fillRect(0, 0, rect.width, rect.height);
  const topLeft = worldToScreen({ x: 0, y: state.field.height });
  const bottomRight = worldToScreen({ x: state.field.width, y: 0 });
  const width = bottomRight.x - topLeft.x;
  const height = bottomRight.y - topLeft.y;

  if (state.mapImageReady && state.mapImage) {
    ctx.drawImage(state.mapImage, topLeft.x, topLeft.y, width, height);
  } else {
    const gradient = ctx.createLinearGradient(topLeft.x, topLeft.y, bottomRight.x, bottomRight.y);
    gradient.addColorStop(0, "#7d9828");
    gradient.addColorStop(1, "#3f6f21");
    ctx.fillStyle = gradient;
    ctx.fillRect(topLeft.x, topLeft.y, width, height);
  }
  drawGrid(ctx);
  ctx.strokeStyle = "rgba(255,255,255,0.76)";
  ctx.lineWidth = 2;
  ctx.strokeRect(topLeft.x, topLeft.y, width, height);
  ctx.fillStyle = "rgba(8,16,13,0.72)";
  ctx.font = "13px Microsoft YaHei, Arial, sans-serif";
  ctx.fillText(`${state.field.width}m x ${state.field.height}m 麦田航拍底图`, topLeft.x + 12, topLeft.y + 20);
}

function drawGrid(ctx) {
  const step = gridStepForScale();
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= state.field.width; x += step) {
    const a = worldToScreen({ x, y: 0 });
    const b = worldToScreen({ x, y: state.field.height });
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (let y = 0; y <= state.field.height; y += step) {
    const a = worldToScreen({ x: 0, y });
    const b = worldToScreen({ x: state.field.width, y });
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSelection(ctx, selection, draft) {
  if (!selection) return;
  const a = worldToScreen({ x: selection.x, y: selection.y });
  const b = worldToScreen({ x: selection.x + selection.width, y: selection.y + selection.height });
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const width = Math.abs(b.x - a.x);
  const height = Math.abs(b.y - a.y);
  ctx.fillStyle = draft ? "rgba(93,173,226,0.18)" : "rgba(45,212,191,0.16)";
  ctx.strokeStyle = draft ? "#5dade2" : "#2dd4bf";
  ctx.lineWidth = 2;
  ctx.fillRect(x, y, width, height);
  ctx.strokeRect(x, y, width, height);
}

function drawRoute(ctx) {
  if (!state.waypoints.length) return;
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  state.waypoints.forEach((point, index) => {
    const screen = worldToScreen(point);
    if (index === 0) ctx.moveTo(screen.x, screen.y);
    else ctx.lineTo(screen.x, screen.y);
  });
  ctx.stroke();
  ctx.fillStyle = "#93c5fd";
  state.waypoints.forEach((point) => {
    const screen = worldToScreen(point);
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawProblemSpots(ctx) {
  state.results.filter((item) => item.pestFound && item.location).forEach((result) => {
    const point = worldToScreen(result.location);
    drawWarningTriangle(ctx, point.x, point.y, result === state.selectedResult, result.spotId);
  });
}

function drawWarningTriangle(ctx, x, y, active, label) {
  ctx.beginPath();
  ctx.moveTo(x, y - 16);
  ctx.lineTo(x + 15, y + 13);
  ctx.lineTo(x - 15, y + 13);
  ctx.closePath();
  ctx.fillStyle = active ? "#ffcf5a" : "#ef4444";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = "rgba(8,16,13,0.78)";
  ctx.font = "12px Microsoft YaHei, Arial, sans-serif";
  ctx.fillText(label || "异常", x + 18, y - 6);
}

function findProblemAt(screenX, screenY) {
  return state.results.find((result) => {
    if (!result.pestFound || !result.location) return false;
    const point = worldToScreen(result.location);
    return Math.hypot(point.x - screenX, point.y - screenY) <= 20;
  });
}

function makeRect(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x: round1(x), y: round1(y), width: round1(Math.abs(a.x - b.x)), height: round1(Math.abs(a.y - b.y)) };
}

function rectToPolygon(rect) {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}

function screenToWorld(screenX, screenY) {
  return { x: (screenX - state.view.panX) / state.view.scale, y: (state.view.panY - screenY) / state.view.scale };
}

function worldToScreen(point) {
  return { x: state.view.panX + Number(point.x) * state.view.scale, y: state.view.panY - Number(point.y) * state.view.scale };
}

function clampWorldToField(point) {
  return { x: clamp(point.x, 0, state.field.width), y: clamp(point.y, 0, state.field.height) };
}

function gridStepForScale() {
  const rawMeters = 86 / state.view.scale;
  return [5, 10, 20, 25, 50, 100, 200].find((step) => step >= rawMeters) || 200;
}

function countPests() {
  const map = new Map();
  state.results.filter((item) => item.pestFound).forEach((item) => {
    map.set(item.pestType, (map.get(item.pestType) || 0) + 1);
  });
  return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

function riskFromResults() {
  const pests = state.results.filter((item) => item.pestFound).length;
  if (!state.results.length) return "未生成";
  if (pests >= 4) return "高风险";
  if (pests >= 2) return "中风险";
  if (pests >= 1) return "低风险";
  return "正常";
}

function severityClass(text) {
  if (text === "高风险") return "danger";
  if (text === "中风险" || text === "低风险") return "warn";
  if (text === "正常") return "ok";
  return "neutral";
}

function statCard(title, body) {
  return `<article class="stat-card"><span>${escapeHtml(title)}</span><strong>${escapeHtml(String(body))}</strong></article>`;
}

function chartRow(label, value, count = null) {
  const percent = clamp(Math.round(Number(value || 0) * 100), 0, 100);
  const suffix = count === null ? `${percent}%` : `${count} 个`;
  return `<div><span>${escapeHtml(label)}</span><i style="width:${percent}%"></i><b>${suffix}</b></div>`;
}

function emptyState(text) {
  return `<p class="empty-state">${escapeHtml(text)}</p>`;
}

function formatLocation(point) {
  if (!point) return "未绑定";
  return `x=${Number(point.x).toFixed(1)}m, y=${Number(point.y).toFixed(1)}m`;
}

function formatGps(gps) {
  if (!gps) return "未解析";
  return `${Number(gps.lat).toFixed(6)}, ${Number(gps.lng).toFixed(6)}`;
}

function setStatus(id, text) {
  setText(els[id], text);
}

function setText(element, text) {
  if (element) element.textContent = text;
}

function showModal(title, html) {
  setText(els.modalTitle, title);
  if (els.modalBody) els.modalBody.innerHTML = html;
  if (els.modal) els.modal.hidden = false;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return response.json();
}
