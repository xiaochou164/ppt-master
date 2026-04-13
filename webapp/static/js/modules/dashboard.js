import { state, getState, setState, subscribe } from "../state.js";
import { FLOW_STEPS } from "../constants.js";
import { apiFetch } from "../api.js";
import * as ui from "./ui.js";

export function initDashboard() {
  setupEventListeners();
  subscribe(renderDashboard);
  renderDashboard(getState());
}

function setupEventListeners() {
  const stageBody = document.getElementById("stageBody");
  if (stageBody) {
    stageBody.addEventListener("click", handleStageClick);
    stageBody.addEventListener("change", handleStageChange);
    stageBody.addEventListener("submit", handleStageSubmit);
  }
}

function renderDashboard(s) {
  renderStats(s);
  renderProjectContext(s);
  renderStepRail(s);
  renderStage(s);
}

function renderStats(s) {
  const projectCount = document.getElementById("projectCount");
  const formatCount = document.getElementById("formatCount");
  const stepCount = document.getElementById("stepCount");

  if (projectCount) projectCount.textContent = s.projects?.length || 0;
  if (formatCount) formatCount.textContent = s.formats?.length || 0;
  if (stepCount) stepCount.textContent = FLOW_STEPS.length;
}

function renderProjectContext(s) {
  const ctx = document.getElementById("projectContext");
  if (!ctx) return;

  const project = s.selectedProject;
  if (!project) {
    ctx.innerHTML = `<p class="helper">请先创建或选择一个项目</p>`;
    return;
  }

  const blockers = getProjectBlockers(project);
  const health = blockers.length === 0 ? "healthy" : "blocked";

  ctx.innerHTML = `
    <div class="project-context-card ${health}">
      <div class="project-context-info">
        <strong>${escapeHtml(project.name)}</strong>
        <span class="project-context-format">${escapeHtml(project.format || "")}</span>
      </div>
      ${blockers.length > 0 ? `
        <div class="project-context-blockers">
          ${blockers.map(b => `<span class="blocker-tag">${escapeHtml(b)}</span>`).join("")}
        </div>
      ` : ""}
      <div class="project-context-actions">
        <button class="button button-ghost button-small" data-action="refresh">刷新</button>
        <button class="button button-ghost button-small" data-action="validate">校验</button>
      </div>
    </div>
  `;
}

function getProjectBlockers(project) {
  const blockers = [];
  if (!project.svg_output_path) blockers.push("缺少 SVG 输出");
  if (!project.design_spec_path) blockers.push("缺少设计规范");
  return blockers;
}

function renderStepRail(s) {
  const rail = document.getElementById("stepRail");
  if (!rail) return;

  const steps = s.steps || FLOW_STEPS;
  const currentId = s.activeStepId || "project";
  const project = s.selectedProject;

  rail.innerHTML = steps
    .map((step) => {
      const isActive = step.id === currentId;
      const isCompleted = isStepCompleted(step.id, project);
      const isLocked = isStepLocked(step.id, project, s);

      return `
        <button
          class="step-item ${isActive ? "active" : ""} ${isCompleted ? "completed" : ""} ${isLocked ? "locked" : ""}"
          data-step="${step.id}"
          ${isLocked ? "disabled" : ""}
        >
          <span class="step-number">${step.kicker}</span>
          <span class="step-title">${escapeHtml(step.title)}</span>
        </button>
      `;
    })
    .join("");
}

function isStepCompleted(stepId, project) {
  if (!project) return false;
  switch (stepId) {
    case "project": return !!project.name;
    case "sources": return project.source_count > 0;
    case "template": return !!project.template_id || project.free_design;
    case "strategist": return !!project.design_spec_path;
    case "images": return true;
    case "executor": return project.executor_done;
    case "post": return project.exported;
    default: return false;
  }
}

function isStepLocked(stepId, project, s) {
  if (!project) return stepId !== "project";
  switch (stepId) {
    case "project": return false;
    case "sources": return !project.name;
    case "template": return !project.name || project.source_count === 0;
    case "strategist": return !project.template_id && !project.free_design;
    case "images": return !project.design_spec_path;
    case "executor": return !project.design_spec_path;
    case "post": return !project.executor_done;
    default: return true;
  }
}

function renderStage(s) {
  const kicker = document.getElementById("stageKicker");
  const title = document.getElementById("stageTitle");
  const description = document.getElementById("stageDescription");
  const body = document.getElementById("stageBody");

  const stepId = s.activeStepId || "project";
  const step = (s.steps || FLOW_STEPS).find((st) => st.id === stepId) || FLOW_STEPS[0];

  if (kicker) kicker.textContent = step.kicker;
  if (title) title.textContent = step.title;
  if (description) description.textContent = step.description;

  if (!s.selectedProject && stepId !== "project") {
    if (body) {
      body.innerHTML = `<p class="helper">请先创建或选择一个项目</p>`;
    }
    return;
  }

  switch (stepId) {
    case "project": renderProjectStep(s, body); break;
    case "sources": renderSourcesStep(s, body); break;
    case "template": renderTemplateStep(s, body); break;
    case "strategist": renderStrategistStep(s, body); break;
    case "images": renderImagesStep(s, body); break;
    case "executor": renderExecutorStep(s, body); break;
    case "post": renderPostStep(s, body); break;
    default: if (body) body.innerHTML = "";
  }
}

function renderProjectStep(s, body) {
  if (!body) return;
  const recentProjects = s.projects?.slice(0, 5) || [];

  body.innerHTML = `
    <form id="createProjectForm" class="stack">
      <div class="two-col">
        <label class="field">
          <span>项目名称</span>
          <input type="text" name="project_name" placeholder="例如：Q1 产品汇报" required>
        </label>
        <label class="field">
          <span>画布格式</span>
          <select name="format">
            ${(s.formats || []).map(f => `<option value="${f}">${f}</option>`).join("")}
          </select>
        </label>
      </div>
      <button type="submit" class="button button-primary">创建项目</button>
    </form>
    ${recentProjects.length > 0 ? `
      <div class="recent-projects">
        <h3>最近项目</h3>
        <div class="recent-list">
          ${recentProjects.map(p => `
            <button class="recent-item" data-project="${escapeHtml(p.name)}">
              <span class="recent-name">${escapeHtml(p.name)}</span>
              <span class="recent-format">${escapeHtml(p.format || "")}</span>
            </button>
          `).join("")}
        </div>
      </div>
    ` : ""}
  `;
}

function renderSourcesStep(s, body) {
  if (!body) return;
  body.innerHTML = `
    <p class="helper">功能开发中，敬请期待。</p>
  `;
}

function renderTemplateStep(s, body) {
  if (!body) return;
  body.innerHTML = `
    <p class="helper">功能开发中，敬请期待。</p>
  `;
}

function renderStrategistStep(s, body) {
  if (!body) return;
  body.innerHTML = `
    <p class="helper">功能开发中，敬请期待。</p>
  `;
}

function renderImagesStep(s, body) {
  if (!body) return;
  body.innerHTML = `
    <p class="helper">功能开发中，敬请期待。</p>
  `;
}

function renderExecutorStep(s, body) {
  if (!body) return;
  body.innerHTML = `
    <p class="helper">功能开发中，敬请期待。</p>
  `;
}

function renderPostStep(s, body) {
  if (!body) return;
  body.innerHTML = `
    <p class="helper">功能开发中，敬请期待。</p>
  `;
}

function handleStageClick(e) {
  const stepBtn = e.target.closest("[data-step]");
  if (stepBtn && !stepBtn.disabled) {
    state.setState("activeStepId", stepBtn.dataset.step);
    return;
  }

  const projectBtn = e.target.closest("[data-project]");
  if (projectBtn) {
    selectProject(projectBtn.dataset.project);
    return;
  }
}

function handleStageChange(e) {
  // Handle form changes
}

function handleStageSubmit(e) {
  if (e.target.id === "createProjectForm") {
    e.preventDefault();
    createProject(e.target);
  }
}

async function createProject(form) {
  const formData = new FormData(form);
  const projectName = formData.get("project_name");
  const format = formData.get("format");

  if (!projectName) {
    ui.showFlash("请输入项目名称", "error");
    return;
  }

  try {
    const data = await apiFetch("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name: projectName, format }),
    });
    state.setState("selectedProject", data.project);
    ui.showFlash("项目已创建");
    state.setState("activeStepId", "sources");
  } catch (error) {
    ui.showFlash(error.message, "error");
  }
}

async function selectProject(projectName) {
  try {
    const data = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}`);
    state.setState("selectedProject", data.project);
  } catch (error) {
    ui.showFlash(error.message, "error");
  }
}

function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
