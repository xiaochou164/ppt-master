const FLOW_STEPS = [
  {
    id: "project",
    kicker: "第 1 步",
    title: "创建项目",
    description: "先建一个演示文稿项目，并选好页面比例。",
  },
  {
    id: "sources",
    kicker: "第 2 步",
    title: "添加内容",
    description: "上传资料，或直接粘贴你要整理的内容。",
  },
  {
    id: "template",
    kicker: "第 3 步",
    title: "选择外观",
    description: "挑一个模板，或让系统自由生成版式。",
  },
  {
    id: "strategist",
    kicker: "第 4 步",
    title: "确认方案",
    description: "确认页数、风格、配色和图片需求。",
  },
  {
    id: "images",
    kicker: "第 5 步",
    title: "补充图片",
    description: "按需生成插图，这一步可以跳过。",
  },
  {
    id: "executor",
    kicker: "第 6 步",
    title: "生成内容",
    description: "生成页面内容，并补齐讲稿备注。",
  },
  {
    id: "post",
    kicker: "第 7 步",
    title: "导出 PPT",
    description: "整理最终文件，并导出可编辑的 PPT。",
  },
];

const PIPELINE_GUIDE = {
  "split-notes": {
    description: "拆分 total.md 为逐页备注。",
    command: "python3 skills/ppt-master/scripts/total_md_split.py <project_path>",
  },
  "finalize-svg": {
    description: "整理最终页面文件，供导出使用。",
    command: "python3 skills/ppt-master/scripts/finalize_svg.py <project_path>",
  },
  "export-pptx": {
    description: "导出可编辑的 PPT 文件。",
    command: "python3 skills/ppt-master/scripts/svg_to_pptx.py <project_path> -s final",
  },
};

function createEmptyModelConfig() {
  return {
    profiles: [],
    selected_profile_id: null,
    active_profile: null,
    configured: false,
  };
}

function createDraft(profile = {}) {
  return {
    id: profile.id || "",
    source: profile.source || "profiles",
    name: profile.name || "",
    backend: profile.backend || "openai",
    base_url: profile.base_url || "",
    api_key_masked: profile.api_key_masked || "",
    selected_model: profile.model || "",
    manual_model: "",
  };
}

const state = {
  user: null,
  admin: {
    users: [],
    logs: [],
    isOpen: false,
    selectedUserId: null,
    userQuery: "",
    roleFilter: "",
    statusFilter: "",
    providerFilter: "",
    page: 1,
    pageSize: 20,
    totalUsers: 0,
    auditAction: "",
    auditResource: "",
    auditStart: "",
    auditEnd: "",
    auditPage: 1,
    auditPageSize: 50,
    totalLogs: 0,
    userDetail: null,
  },
  formats: [],
  steps: [],
  projects: [],
  selectedProject: null,
  projectFilter: "",
  activeStepId: "project",
  validation: null,
  activityLogs: [],
  modelConfig: createEmptyModelConfig(),
  modal: {
    draft: createDraft(),
    fetchedModels: [],
    fetchMessage: "默认用下拉选择模型，也可以手动输入。",
    fetchError: false,
    testMessage: "测试会发送一条极短文本请求，验证当前配置是否可用。",
    testError: false,
    testOutput: "",
    isOpen: false,
    scrollY: 0,
  },
  // Template selection state
  templates: [],
  templateCategories: {},
  selectedTemplateId: null,
  templatesLoading: false,
  templateApplyLoading: false,
  latestAction: "",
  latestDetail: "",
  latestTime: "",
  // Strategist state
  strategistAnalysis: null,
  strategistLoading: false,
  strategistSaving: false,
  eightConfirmations: {
    canvas_format: null,
    page_count_min: null,
    page_count_max: null,
    target_audience: null,
    style_objective: null,
    color_primary: null,
    color_secondary: null,
    color_accent: null,
    icon_approach: null,
    title_font: null,
    body_font: null,
    body_size: null,
    image_approach: null,
  },
  // SVG generation state
  svgGeneration: {
    inProgress: false,
    totalPages: 0,
    generatedPages: 0,
    currentPage: 0,
    currentTitle: "",
    errors: [],
    log: [],
    mode: "generate", // "generate" | "regenerate"
  },
  // Image model config state
  imageModelConfig: {
    profiles: [],
    selected_profile_id: null,
    active_profile: null,
    configured: false,
    aspect_ratios: [],
    sizes: [],
  },
  // Image generation state
  imageGeneration: {
    inProgress: false,
    status: "",
    prompt: "",
    filename: "",
    aspectRatio: "16:9",
    imageSize: "1K",
    lastResult: null,
    error: null,
  },
  // SVG preview state
  svgPreview: {
    slides: [],
    currentIndex: 0,
  },
  // Document preview state
  docPreview: {
    isOpen: false,
    title: "",
    content: "",
    url: "",
  },
  // Project manager state
  projectManager: {
    isOpen: false,
    selectedProject: null,
    searchQuery: "",
    deleteConfirm: null,
  },
  // Image model modal state
  imageModal: {
    isOpen: false,
    draft: {
      id: "",
      name: "",
      backend: "gemini",
      model: "",
      base_url: "",
      api_key_masked: "",
    },
    testMessage: "",
    testError: false,
    testOutput: "",
  },
  // Template manager state
  templateManager: {
    isOpen: false,
    templates: [],
    categories: {},
    selectedTemplate: null,
    searchQuery: "",
    filterCategory: "",
    deleteConfirm: null,
    uploadMode: false,
    uploadFiles: [],
  },
  busy: false,
};

const elements = {
  heroStatusPill: document.getElementById("heroStatusPill"),
  heroTitle: document.getElementById("heroTitle"),
  heroText: document.getElementById("heroText"),
  heroProgress: document.getElementById("heroProgress"),
  heroProgressBar: document.getElementById("heroProgressBar"),
  heroProgressText: document.getElementById("heroProgressText"),
  projectCount: document.getElementById("projectCount"),
  formatCount: document.getElementById("formatCount"),
  stepCount: document.getElementById("stepCount"),
  openModelConfigButton: document.getElementById("openModelConfigButton"),
  closeModelConfigButton: document.getElementById("closeModelConfigButton"),
  clearLogButton: document.getElementById("clearLogButton"),
  jumpToLatestLogButton: document.getElementById("jumpToLatestLogButton"),
  modelConfigModal: document.getElementById("modelConfigModal"),
  modelConfigBackdrop: document.getElementById("modelConfigBackdrop"),
  modelConfigForm: document.getElementById("modelConfigForm"),
  modalProfileSummary: document.getElementById("modalProfileSummary"),
  modelProfileList: document.getElementById("modelProfileList"),
  createProfileButton: document.getElementById("createProfileButton"),
  modalProfileNameInput: document.getElementById("modalProfileNameInput"),
  modalBackendSelect: document.getElementById("modalBackendSelect"),
  modalFetchedModelSelect: document.getElementById("modalFetchedModelSelect"),
  fetchModelsButton: document.getElementById("fetchModelsButton"),
  testModelButton: document.getElementById("testModelButton"),
  modalManualModelInput: document.getElementById("modalManualModelInput"),
  modalBaseUrlInput: document.getElementById("modalBaseUrlInput"),
  modalApiKeyInput: document.getElementById("modalApiKeyInput"),
  modalApiKeyLabel: document.getElementById("modalApiKeyLabel"),
  modelFetchHint: document.getElementById("modelFetchHint"),
  modelTestHint: document.getElementById("modelTestHint"),
  modalTestOutput: document.getElementById("modalTestOutput"),
  projectContext: document.getElementById("projectContext"),
  flash: document.getElementById("flash"),
  stepRail: document.getElementById("stepRail"),
  stageKicker: document.getElementById("stageKicker"),
  stageTitle: document.getElementById("stageTitle"),
  stageDescription: document.getElementById("stageDescription"),
  stageBody: document.getElementById("stageBody"),
  logOutput: document.getElementById("logOutput"),
  // SVG Preview modal elements
  svgPreviewModal: document.getElementById("svgPreviewModal"),
  svgPreviewBackdrop: document.getElementById("svgPreviewBackdrop"),
  closeSvgPreviewButton: document.getElementById("closeSvgPreviewButton"),
  svgPreviewObject: document.getElementById("svgPreviewObject"),
  svgPreviewImg: document.getElementById("svgPreviewImg"),
  svgPrevButton: document.getElementById("svgPrevButton"),
  svgNextButton: document.getElementById("svgNextButton"),
  svgPageIndicator: document.getElementById("svgPageIndicator"),
  svgOpenNewButton: document.getElementById("svgOpenNewButton"),
  // Document Preview modal elements
  docPreviewModal: document.getElementById("docPreviewModal"),
  docPreviewBackdrop: document.getElementById("docPreviewBackdrop"),
  closeDocPreviewButton: document.getElementById("closeDocPreviewButton"),
  docPreviewTitle: document.getElementById("docPreviewTitle"),
  docPreviewText: document.getElementById("docPreviewText"),
  docPreviewOpenButton: document.getElementById("docPreviewOpenButton"),
  // Project Manager modal elements
  openProjectManagerButton: document.getElementById("openProjectManagerButton"),
  closeProjectManagerButton: document.getElementById("closeProjectManagerButton"),
  projectManagerModal: document.getElementById("projectManagerModal"),
  projectManagerBackdrop: document.getElementById("projectManagerBackdrop"),
  pmSearchInput: document.getElementById("pmSearchInput"),
  pmProjectList: document.getElementById("pmProjectList"),
  pmProjectDetail: document.getElementById("pmProjectDetail"),
  // Image model modal elements
  imageModelModal: document.getElementById("imageModelModal"),
  imageModelBackdrop: document.getElementById("imageModelBackdrop"),
  closeImageModelButton: document.getElementById("closeImageModelButton"),
  imageModelForm: document.getElementById("imageModelForm"),
  imageModalProfileSummary: document.getElementById("imageModalProfileSummary"),
  imageModelProfileList: document.getElementById("imageModelProfileList"),
  createImageProfileButton: document.getElementById("createImageProfileButton"),
  imageProfileNameInput: document.getElementById("imageProfileNameInput"),
  imageBackendSelect: document.getElementById("imageBackendSelect"),
  imageModelSelect: document.getElementById("imageModelSelect"),
  imageManualModelInput: document.getElementById("imageManualModelInput"),
  imageBaseUrlInput: document.getElementById("imageBaseUrlInput"),
  imageApiKeyInput: document.getElementById("imageApiKeyInput"),
  imageApiKeyLabel: document.getElementById("imageApiKeyLabel"),
  testImageButton: document.getElementById("testImageButton"),
  imageTestHint: document.getElementById("imageTestHint"),
  imageTestOutput: document.getElementById("imageTestOutput"),
  copyFromGlobalConfigButton: document.getElementById("copyFromGlobalConfigButton"),
  userBadge: document.getElementById("userBadge"),
  openAccountSettingsButton: document.getElementById("openAccountSettingsButton"),
  accountSettingsModal: document.getElementById("accountSettingsModal"),
  accountSettingsBackdrop: document.getElementById("accountSettingsBackdrop"),
  closeAccountSettingsButton: document.getElementById("closeAccountSettingsButton"),
  accountSettingsForm: document.getElementById("accountSettingsForm"),
  accountSummaryName: document.getElementById("accountSummaryName"),
  accountSummaryMeta: document.getElementById("accountSummaryMeta"),
  accountSummaryBadge: document.getElementById("accountSummaryBadge"),
  accountDisplayNameInput: document.getElementById("accountDisplayNameInput"),
  accountEmailInput: document.getElementById("accountEmailInput"),
  accountPasswordFields: document.getElementById("accountPasswordFields"),
  accountCurrentPasswordInput: document.getElementById("accountCurrentPasswordInput"),
  accountNewPasswordInput: document.getElementById("accountNewPasswordInput"),
  accountProviderHint: document.getElementById("accountProviderHint"),
  logoutButton: document.getElementById("logoutButton"),
  openAdminPanelButton: document.getElementById("openAdminPanelButton"),
  adminUsersList: document.getElementById("adminUsersList"),
  adminAuditLog: document.getElementById("adminAuditLog"),
  adminUserSearchInput: document.getElementById("adminUserSearchInput"),
  adminUsersSummary: document.getElementById("adminUsersSummary"),
  adminRoleFilter: document.getElementById("adminRoleFilter"),
  adminStatusFilter: document.getElementById("adminStatusFilter"),
  adminProviderFilter: document.getElementById("adminProviderFilter"),
  adminPrevPage: document.getElementById("adminPrevPage"),
  adminNextPage: document.getElementById("adminNextPage"),
  adminPageIndicator: document.getElementById("adminPageIndicator"),
  adminUserDetail: document.getElementById("adminUserDetail"),
  adminAuditActionInput: document.getElementById("adminAuditActionInput"),
  adminAuditResourceInput: document.getElementById("adminAuditResourceInput"),
  adminAuditStartInput: document.getElementById("adminAuditStartInput"),
  adminAuditEndInput: document.getElementById("adminAuditEndInput"),
  adminAuditSummary: document.getElementById("adminAuditSummary"),
  adminAuditQuick24h: document.getElementById("adminAuditQuick24h"),
  adminAuditQuick7d: document.getElementById("adminAuditQuick7d"),
  adminAuditClear: document.getElementById("adminAuditClear"),
  adminAuditCopy: document.getElementById("adminAuditCopy"),
  adminAuditExport: document.getElementById("adminAuditExport"),
  adminAuditPrevPage: document.getElementById("adminAuditPrevPage"),
  adminAuditNextPage: document.getElementById("adminAuditNextPage"),
  adminAuditPageIndicator: document.getElementById("adminAuditPageIndicator"),
  adminOverviewUsers: document.getElementById("adminOverviewUsers"),
  adminOverviewLogs: document.getElementById("adminOverviewLogs"),
  adminOverviewSelected: document.getElementById("adminOverviewSelected"),
  adminCreateUserForm: document.getElementById("adminCreateUserForm"),
  adminCreateEmail: document.getElementById("adminCreateEmail"),
  adminCreateDisplayName: document.getElementById("adminCreateDisplayName"),
  adminCreatePassword: document.getElementById("adminCreatePassword"),
  adminCreateRole: document.getElementById("adminCreateRole"),
  // Template manager elements
  openTemplateManagerButton: document.getElementById("openTemplateManagerButton"),
  closeTemplateManagerButton: document.getElementById("closeTemplateManagerButton"),
  templateManagerModal: document.getElementById("templateManagerModal"),
  templateManagerBackdrop: document.getElementById("templateManagerBackdrop"),
  tmSearchInput: document.getElementById("tmSearchInput"),
  tmCategoryFilter: document.getElementById("tmCategoryFilter"),
  tmTemplateList: document.getElementById("tmTemplateList"),
  tmTemplateDetail: document.getElementById("tmTemplateDetail"),
  tmShowUploadButton: document.getElementById("tmShowUploadButton"),
};

const isAdminPage = document.body?.dataset.page === "admin";
const DEFAULT_HERO_TITLE = "PPT Master Web";
const DEFAULT_HERO_TEXT = "把项目上下文、关键步骤和导出状态收拢到一个清晰的工作台里，减少跳转和流程迷失。";

function normalizeErrorMessage(message, path = "") {
  const text = String(message || "").trim();
  if (!text) return "操作失败，请稍后重试。";
  const lower = text.toLowerCase();
  if (lower.includes("failed to fetch") || lower.includes("networkerror")) {
    return "网络连接失败，请检查服务是否可用后重试。";
  }
  if (lower.includes("another task is already running")) {
    return "当前项目还有任务在运行，请稍后再试。";
  }
  if (lower.includes("project not found")) {
    return "没有找到对应项目，列表可能已经发生变化。";
  }
  if (lower.includes("current password is incorrect") || lower.includes("invalid_password")) {
    return "当前密码不正确，请重新输入。";
  }
  if (lower.includes("only local users can reset passwords here")) {
    return "这个账号来自统一登录，密码需要到对应身份系统中修改。";
  }
  if (lower.includes("not authenticated")) {
    return "登录状态已失效，请重新登录。";
  }
  if (path.includes("/api/") && lower.startsWith("request failed")) {
    return "请求没有成功完成，请稍后再试。";
  }
  return text;
}

async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      window.location.href = "/login";
      return {};
    }
    const detail = data.error
      || data.detail
      || data.stderr
      || data.stdout
      || (data.returncode ? `命令执行失败，退出码 ${data.returncode}` : "")
      || `请求失败：${response.status}`;
    const error = new Error(normalizeErrorMessage(detail, path));
    error.status = response.status;
    error.path = path;
    error.payload = data;
    throw error;
  }
  return data;
}

function setBusy(isBusy) {
  state.busy = isBusy;
  document.querySelectorAll("button, input, select, textarea").forEach((element) => {
    element.disabled = isBusy;
  });
}

let flashTimer = null;

function showFlash(message, type = "success") {
  if (flashTimer) {
    clearTimeout(flashTimer);
    flashTimer = null;
  }
  elements.flash.classList.remove("flash-dismissing");
  elements.flash.innerHTML = "";
  const textNode = document.createTextNode(message);
  elements.flash.appendChild(textNode);
  if (type === "error") {
    const closeBtn = document.createElement("button");
    closeBtn.className = "flash-close";
    closeBtn.setAttribute("aria-label", "关闭");
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", clearFlash);
    elements.flash.appendChild(closeBtn);
  }
  elements.flash.className = `flash flash-${type}`;
  elements.flash.classList.remove("hidden");
  if (type === "success") {
    flashTimer = setTimeout(() => {
      elements.flash.classList.add("flash-dismissing");
      setTimeout(clearFlash, 300);
    }, 3000);
  }
}

function clearFlash() {
  if (flashTimer) {
    clearTimeout(flashTimer);
    flashTimer = null;
  }
  elements.flash.className = "flash hidden";
  elements.flash.innerHTML = "";
}

function classifyLogTone(title, payload) {
  const text = `${title || ""} ${payload || ""}`.toLowerCase();
  if (/(失败|error|错误|denied|invalid)/.test(text)) return "error";
  if (/(警告|warn|阻塞|未完成|等待|需处理)/.test(text)) return "warn";
  if (/(完成|成功|saved|导出|已生成|已更新)/.test(text)) return "success";
  return "info";
}

function renderLogOutput() {
  if (!elements.logOutput) return;
  if (!state.activityLogs.length) {
    elements.logOutput.innerHTML = `
      <div class="log-entry log-entry-empty">
        <strong>等待操作…</strong>
        <span class="helper">新的运行记录会显示在这里。</span>
      </div>
    `;
    elements.jumpToLatestLogButton?.classList.add("hidden");
    return;
  }
  elements.logOutput.innerHTML = state.activityLogs.map((entry) => `
    <article class="log-entry log-entry-${entry.tone}">
      <div class="log-entry-top">
        <strong>${escapeHtml(entry.title)}</strong>
        <span class="log-entry-time">${escapeHtml(entry.stamp)}</span>
      </div>
      ${entry.detail ? `<p class="log-entry-detail" title="${escapeHtml(entry.detail)}">${escapeHtml(entry.detail)}</p>` : ""}
    </article>
  `).join("");
}

function updateLatestLogButton() {
  if (!elements.logOutput || !elements.jumpToLatestLogButton) return;
  const shouldShow = elements.logOutput.scrollTop > 24 && state.activityLogs.length > 0;
  elements.jumpToLatestLogButton.classList.toggle("hidden", !shouldShow);
}

function appendLog(title, payload) {
  const stamp = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  const short = String(payload || "").split("\n")[0].trim().slice(0, 160);
  state.activityLogs.unshift({
    stamp,
    title: String(title || "").trim(),
    detail: short,
    tone: classifyLogTone(title, short),
  });
  state.activityLogs = state.activityLogs.slice(0, 200);
  renderLogOutput();
  if (elements.logOutput) {
    elements.logOutput.scrollTop = 0;
  }
  updateLatestLogButton();
  renderHeroStatus({ latestAction: title, latestDetail: short, latestTime: stamp });
}

function getHeroStatusMeta(project) {
  if (!project) {
    return { label: "待开始", tone: "idle" };
  }
  const health = getProjectHealth(project);
  if (project.pptx_files?.length) {
    return { label: "已交付", tone: "done" };
  }
  if (health.blockerCount > 0) {
    return { label: "待处理", tone: "warn" };
  }
  if (project.svg_final_count > 0 || project.svg_output_count > 0) {
    return { label: "生成中", tone: "active" };
  }
  if (hasDesignSpec(project)) {
    return { label: "已规划", tone: "ready" };
  }
  return { label: "进行中", tone: "idle" };
}

function renderHeroStatus(overrides = {}) {
  if (!elements.heroText || !elements.heroTitle || isAdminPage) {
    return;
  }

  const project = state.selectedProject;
  const statusMeta = getHeroStatusMeta(project);
  const activeStep = FLOW_STEPS.find((step) => step.id === state.activeStepId);
  const latestAction = overrides.latestAction || state.latestAction || "";
  const latestDetail = overrides.latestDetail || state.latestDetail || "";
  const latestTime = overrides.latestTime || state.latestTime || "";

  if (overrides.latestAction !== undefined) state.latestAction = overrides.latestAction;
  if (overrides.latestDetail !== undefined) state.latestDetail = overrides.latestDetail;
  if (overrides.latestTime !== undefined) state.latestTime = overrides.latestTime;

  if (elements.heroStatusPill) {
    elements.heroStatusPill.textContent = statusMeta.label;
    elements.heroStatusPill.dataset.tone = statusMeta.tone;
    elements.heroStatusPill.classList.remove("hidden");
  }
  if (elements.heroProgress && elements.heroProgressBar && elements.heroProgressText) {
    if (!project) {
      elements.heroProgress.classList.add("hidden");
    } else {
      const health = getProjectHealth(project);
      elements.heroProgress.classList.remove("hidden");
      elements.heroProgressBar.style.width = `${health.percent}%`;
      elements.heroProgressText.textContent = `${health.completed}/${health.total} · ${health.percent}%`;
    }
  }

  if (!project) {
    elements.heroTitle.textContent = DEFAULT_HERO_TITLE;
    elements.heroTitle.title = DEFAULT_HERO_TITLE;
    elements.heroText.textContent = latestAction
      ? `${latestTime ? `[${latestTime}] ` : ""}${truncateText(latestAction, 36)}${latestDetail ? `：${truncateText(latestDetail, 84)}` : ""}`
      : DEFAULT_HERO_TEXT;
    elements.heroText.title = elements.heroText.textContent;
    return;
  }

  const stepLabel = activeStep?.label || "进行中";
  const heroGuidance = truncateText(getHeroGuidance(project), 72);
  const heroAction = truncateText(latestAction, 32);
  const heroDetail = truncateText(latestDetail, 72);
  elements.heroTitle.textContent = project.name;
  elements.heroTitle.title = project.name;
  if (latestAction) {
    elements.heroText.textContent = `${stepLabel} · ${heroGuidance} · ${heroAction}${heroDetail ? `：${heroDetail}` : ""}`;
  } else {
    elements.heroText.textContent = `${stepLabel} · ${heroGuidance}`;
  }
  elements.heroText.title = latestAction
    ? `${stepLabel} · ${getHeroGuidance(project)} · ${latestAction}${latestDetail ? `：${latestDetail}` : ""}`
    : `${stepLabel} · ${getHeroGuidance(project)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function truncateText(value, maxLength = 120) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

// ============ Focus Trap ============
let focusTrapState = { active: false, previousFocus: null, handler: null };

function trapFocus(modalEl) {
  if (!modalEl) return;
  focusTrapState.previousFocus = document.activeElement;
  focusTrapState.active = true;

  const getFocusable = () => modalEl.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
  );

  focusTrapState.handler = (e) => {
    if (e.key !== "Tab") return;
    const focusable = getFocusable();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  modalEl.addEventListener("keydown", focusTrapState.handler);
  const focusable = getFocusable();
  if (focusable.length > 0) {
    requestAnimationFrame(() => focusable[0].focus());
  }
}

function releaseFocus() {
  if (!focusTrapState.active) return;
  document.querySelectorAll(".modal").forEach((el) => {
    if (focusTrapState.handler) {
      el.removeEventListener("keydown", focusTrapState.handler);
    }
  });
  if (focusTrapState.previousFocus && typeof focusTrapState.previousFocus.focus === "function") {
    focusTrapState.previousFocus.focus();
  }
  focusTrapState = { active: false, previousFocus: null, handler: null };
}

// ============ Skeleton Loader ============
function renderSkeleton(rows = 4) {
  const lines = Array.from({ length: rows }, () => '<div class="skeleton-line"></div>').join("");
  return `<div class="skeleton">${lines}</div>`;
}

function renderSkeletonCards(count = 3) {
  return Array.from({ length: count }, () =>
    `<div class="skeleton-card skeleton"><div class="skeleton-line"></div><div class="skeleton-line"></div></div>`
  ).join("");
}

// ============ Inline Validation ============
function validateField(input, rules = {}) {
  const value = input.value.trim();
  const fieldEl = input.closest(".field");
  let existingError = fieldEl?.querySelector(".field-error");
  let errorMsg = "";

  if (rules.required && !value) {
    errorMsg = rules.requiredMsg || "此字段为必填项";
  } else if (rules.pattern && value && !rules.pattern.test(value)) {
    errorMsg = rules.patternMsg || "格式不正确";
  } else if (rules.minLength && value.length < rules.minLength) {
    errorMsg = rules.minLengthMsg || `至少需要 ${rules.minLength} 个字符`;
  }

  if (errorMsg) {
    input.classList.add("field-invalid");
    if (!existingError && fieldEl) {
      existingError = document.createElement("p");
      existingError.className = "field-error";
      fieldEl.appendChild(existingError);
    }
    if (existingError) existingError.textContent = errorMsg;
    return false;
  }

  input.classList.remove("field-invalid");
  if (existingError) existingError.remove();
  return true;
}

function setupPasswordToggles(root = document) {
  root.querySelectorAll("[data-password-toggle]").forEach((button) => {
    if (button.dataset.passwordToggleBound === "true") return;
    button.dataset.passwordToggleBound = "true";
    button.addEventListener("click", () => {
      const wrap = button.closest(".password-input-wrap, .admin-inline-password");
      const input = wrap?.querySelector('input[type="password"], input[type="text"]');
      if (!input) return;
      const nextType = input.type === "password" ? "text" : "password";
      input.type = nextType;
      if (nextType === "text") {
        input.dataset.passwordText = "true";
      } else {
        delete input.dataset.passwordText;
      }
      button.textContent = nextType === "password" ? "显示" : "隐藏";
      button.setAttribute("aria-label", nextType === "password" ? "显示密码" : "隐藏密码");
    });
  });
}

function setupInlineValidation(root = document) {
  const emailInputs = root.querySelectorAll('input[type="email"]');
  emailInputs.forEach((input) => {
    if (input.dataset.validationBound === "true") return;
    input.dataset.validationBound = "true";
    const rules = {
      required: input.required,
      requiredMsg: "请输入邮箱地址",
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      patternMsg: "请输入有效的邮箱地址",
    };
    input.addEventListener("blur", () => validateField(input, rules));
    input.addEventListener("input", () => {
      if (input.classList.contains("field-invalid")) validateField(input, rules);
    });
  });

  const passwordInputs = root.querySelectorAll('input[type="password"][minlength], input[type="text"][minlength][data-password-text]');
  passwordInputs.forEach((input) => {
    if (input.dataset.passwordValidationBound === "true") return;
    input.dataset.passwordValidationBound = "true";
    const minLength = Number(input.getAttribute("minlength") || "0");
    const rules = {
      required: input.required,
      requiredMsg: "请输入密码",
      minLength,
      minLengthMsg: minLength > 0 ? `至少需要 ${minLength} 位` : "格式不正确",
    };
    input.addEventListener("blur", () => validateField(input, rules));
    input.addEventListener("input", () => {
      if (input.classList.contains("field-invalid")) validateField(input, rules);
    });
  });
}

// ============ Next Step Guide Helper ============
function renderNextStepGuide(currentStepId) {
  const project = state.selectedProject;
  if (!project) return "";
  const recommended = getRecommendedStepId(project);
  const currentIndex = FLOW_STEPS.findIndex((s) => s.id === currentStepId);
  const nextIndex = currentIndex + 1;
  if (nextIndex >= FLOW_STEPS.length) return "";
  const nextStep = FLOW_STEPS[nextIndex];
  const nextStepStatus = getFlowStepStatus(nextStep.id, project, state.activeStepId);
  if (nextStepStatus === "locked") return "";
  return `
    <div class="next-step-guide">
      <span class="next-step-guide-label">这一步已经完成</span>
      <button class="button button-secondary" data-next-step="${escapeHtml(nextStep.id)}">
        前往下一步：${escapeHtml(nextStep.title)}
      </button>
    </div>
  `;
}

function metric(label, value, strong = false) {
  const labelMap = {
    format: "画布",
    src: "来源",
    spec: "方案",
    svg: "页面",
    notes: "讲稿",
    final: "最终页面",
    pptx: "PPT",
    sources: "来源",
    svg_output: "页面",
    svg_final: "最终页面",
  };
  const displayLabel = labelMap[label] || label;
  return `<span class="badge ${strong ? "badge-strong" : ""}">${escapeHtml(displayLabel)}：${escapeHtml(String(value))}</span>`;
}

function getProjectRef(project) {
  return project?.id || project?.slug || project?.name || "";
}

function getSelectedProjectByRef(projectRef) {
  return state.projects.find((item) => getProjectRef(item) === projectRef || item.name === projectRef) || null;
}

function getFilteredProjects() {
  const keyword = state.projectFilter.trim().toLowerCase();
  if (!keyword) {
    return state.projects;
  }
  return state.projects.filter((project) => {
    const haystack = [
      project.name,
      project.display_name,
      project.canvas_label,
      project.created_at,
    ].join(" ").toLowerCase();
    return haystack.includes(keyword);
  });
}

function getProfiles() {
  return state.modelConfig?.profiles || [];
}

function getActiveProfile() {
  return state.modelConfig?.active_profile || null;
}

function getActiveProfileLabel() {
  const profile = getActiveProfile();
  if (!profile) {
    return "missing";
  }
  return profile.name || profile.model || profile.backend || "configured";
}

function hasDesignSpec(project) {
  return Boolean(project?.design_spec || project?.has_spec);
}

function hasTemplateDecision(project) {
  if (!project) {
    return false;
  }
  return hasDesignSpec(project)
    || project.svg_output_count > 0
    || project.has_total_notes
    || project.svg_final_count > 0
    || project.pptx_files.length > 0;
}

function hasExecutorOutputs(project) {
  if (!project) {
    return false;
  }
  return project.svg_output_count > 0 && project.has_total_notes;
}

function buildAiStagePrompt(project, objectiveLines = []) {
  if (!project) {
    return "";
  }

  return [
    "请先阅读 skills/ppt-master/SKILL.md，然后继续这个项目的主流程。",
    `项目路径：${project.path}`,
    `项目名称：${project.name}`,
    ...objectiveLines,
  ].join("\n");
}

function getProjectStepState(project, stepId) {
  if (!project) {
    return { disabled: true, reason: "请先选择一个项目" };
  }

  if (stepId === "split-notes") {
    if (project.svg_output_count === 0) {
      return { disabled: true, reason: "需要先生成页面内容" };
    }
    if (!project.has_total_notes) {
      return { disabled: true, reason: "需要先生成讲稿总表" };
    }
    return { disabled: false, reason: "可以开始" };
  }

  if (stepId === "finalize-svg") {
    if (project.svg_output_count === 0) {
      return { disabled: true, reason: "需要先生成页面内容" };
    }
    if ((project.split_notes_count || 0) === 0) {
      return { disabled: true, reason: "需要先整理出逐页讲稿备注" };
    }
    return { disabled: false, reason: "可以开始" };
  }

  if (stepId === "export-pptx") {
    if ((project.split_notes_count || 0) === 0) {
      return { disabled: true, reason: "需要先整理出逐页讲稿备注" };
    }
    if (project.svg_final_count === 0) {
      return { disabled: true, reason: "需要先整理好最终页面文件" };
    }
    return { disabled: false, reason: "可以开始" };
  }

  return { disabled: false, reason: "可以开始" };
}

function getRecommendedStepId(project) {
  if (!project) {
    return "project";
  }
  if (project.source_count === 0) {
    return "sources";
  }
  if (!hasTemplateDecision(project)) {
    return "template";
  }
  if (!hasDesignSpec(project)) {
    return "strategist";
  }
  if (project.svg_output_count === 0 || !project.has_total_notes) {
    return "executor";
  }
  if (project.svg_final_count === 0 || project.pptx_files.length === 0) {
    return "post";
  }
  return "post";
}

function getNextActionLabel(project) {
  if (!project) {
    return "选择一个项目，或先创建一个新项目";
  }
  if (project.source_count === 0) {
    return "添加要整理的内容";
  }
  if (!hasTemplateDecision(project)) {
    return "选择页面外观，或改为自由排版";
  }
  if (!hasDesignSpec(project)) {
    return "确认页数、风格、配色和图片需求";
  }
  if (project.svg_output_count === 0) {
    return "开始生成页面内容";
  }
  if (!project.has_total_notes) {
    if (!state.modelConfig?.configured) {
      return "先连接文字模型，再生成讲稿备注";
    }
    return "生成讲稿备注";
  }
  if ((project.split_notes_count || 0) === 0) {
    return "整理每一页的讲稿备注";
  }
  if (project.svg_final_count === 0) {
    return "整理最终页面文件";
  }
  if (project.pptx_files.length === 0) {
    return "导出可编辑的 PPT";
  }
  return "预览并下载结果";
}

function modelConfigStatus() {
  return state.modelConfig?.configured ? "ready" : "missing";
}

function getCompletedFlowCount(project) {
  if (!project) {
    return 0;
  }
  const completed = [
    true,
    project.source_count > 0,
    hasTemplateDecision(project),
    hasDesignSpec(project),
    project.svg_output_count > 0,
    hasExecutorOutputs(project),
    project.pptx_files.length > 0,
  ];
  return completed.filter(Boolean).length;
}

function getProjectBlockers(project) {
  if (!project) {
    return ["请先选择一个项目。"];
  }

  const blockers = [];
  if (project.source_count === 0) {
    blockers.push("还没有添加任何内容。");
    return blockers;
  }
  if (!hasTemplateDecision(project)) {
    blockers.push("还没有确认页面外观。先选择模板，或改为自由排版。");
    return blockers;
  }
  if (!hasDesignSpec(project)) {
    blockers.push("还没有完成方案确认。请先确认页数、风格、配色和图片需求。");
    return blockers;
  }
  if (project.svg_output_count === 0) {
    blockers.push("页面内容还没有生成。请先开始生成页面。");
    return blockers;
  }
  if (!project.has_total_notes) {
    blockers.push("讲稿备注还没有生成，所以还不能继续整理导出文件。");
    if (!state.modelConfig?.configured) {
      blockers.push("如果要继续自动生成，请先连接一个可用的文字模型。");
    }
    return blockers;
  }
  if ((project.split_notes_count || 0) === 0) {
    blockers.push("还没有整理出逐页讲稿备注。");
    return blockers;
  }
  if (project.svg_final_count === 0) {
    blockers.push("最终页面文件还没有整理完成。");
    return blockers;
  }
  if (project.pptx_files.length === 0) {
    blockers.push("内容已经准备好，但还没有导出 PPT。");
  }

  return blockers;
}

function getProjectHealth(project) {
  const completed = getCompletedFlowCount(project);
  const total = FLOW_STEPS.length;
  const blockers = getProjectBlockers(project);
  return {
    completed,
    total,
    percent: project ? Math.round((completed / total) * 100) : 0,
    blockers,
    blockerCount: blockers.length,
    nextStepLabel: getNextActionLabel(project),
  };
}

function getHeroGuidance(project) {
  if (!project) {
    return "还没有选中项目，从创建项目或打开最近项目开始。";
  }
  const health = getProjectHealth(project);
  if (health.blockerCount > 0) {
    return `阻塞项：${health.blockers[0]}`;
  }
  return `下一步：${health.nextStepLabel}`;
}

function getPipelineChecklist(project, stepId) {
  if (!project) {
    return [];
  }

  if (stepId === "split-notes") {
    return [
      { label: `页面内容已生成（${project.svg_output_count} 页）`, ok: project.svg_output_count > 0 },
      { label: `讲稿总表已准备好（${project.has_total_notes ? "是" : "否"}）`, ok: project.has_total_notes },
    ];
  }

  if (stepId === "finalize-svg") {
    return [
      { label: `逐页讲稿备注已整理（${project.split_notes_count || 0} 份）`, ok: (project.split_notes_count || 0) > 0 },
      { label: `页面内容已生成（${project.svg_output_count} 页）`, ok: project.svg_output_count > 0 },
    ];
  }

  if (stepId === "export-pptx") {
    return [
      { label: `逐页讲稿备注已整理（${project.split_notes_count || 0} 份）`, ok: (project.split_notes_count || 0) > 0 },
      { label: `最终页面文件已准备好（${project.svg_final_count} 页）`, ok: project.svg_final_count > 0 },
    ];
  }

  return [];
}

function getPipelineOutputs(project, stepId) {
  if (!project) {
    return [];
  }

  if (stepId === "split-notes") {
    return [`逐页讲稿备注：${project.split_notes_count || 0} 份`];
  }

  if (stepId === "finalize-svg") {
    return [`最终页面文件：${project.svg_final_count} 页`];
  }

  if (stepId === "export-pptx") {
    return [`可编辑 PPT：${project.pptx_files.length} 份`];
  }

  return [];
}

function pickEditableProfile(profileId = null) {
  const profiles = getProfiles();
  if (profileId) {
    const matched = profiles.find((item) => item.id === profileId);
    if (matched) {
      return matched;
    }
  }
  return getActiveProfile() || profiles[0] || null;
}

function syncModalDraftFromInputs() {
  state.modal.draft = {
    ...state.modal.draft,
    name: elements.modalProfileNameInput?.value.trim() || "",
    backend: elements.modalBackendSelect?.value || "openai",
    base_url: elements.modalBaseUrlInput?.value.trim() || "",
    api_key_masked: state.modal.draft.api_key_masked || "",
    selected_model: elements.modalFetchedModelSelect?.value || "",
    manual_model: elements.modalManualModelInput?.value.trim() || "",
  };
}

function setModalDraft(profile = null, options = {}) {
  const nextProfile = profile || null;
  state.modal.draft = createDraft(nextProfile || {});
  state.modal.fetchedModels = Array.isArray(options.fetchedModels) ? options.fetchedModels : [];
  state.modal.fetchMessage = options.fetchMessage || "默认用下拉选择模型，也可以手动输入。";
  state.modal.fetchError = Boolean(options.fetchError);
  state.modal.testMessage = options.testMessage || "测试会发送一条极短文本请求，验证当前配置是否可用。";
  state.modal.testError = Boolean(options.testError);
  state.modal.testOutput = options.testOutput || "";
}

function renderModelConfigModal() {
  const profiles = getProfiles();
  const activeProfile = getActiveProfile();
  const draft = state.modal.draft;
  const selectedModel = draft.selected_model || "";
  const knownModels = [...state.modal.fetchedModels];
  if (selectedModel && !knownModels.includes(selectedModel)) {
    knownModels.unshift(selectedModel);
  }

  if (elements.modalProfileSummary) {
    const summaryText = activeProfile
      ? `当前使用：${activeProfile.name} · ${activeProfile.backend} · ${activeProfile.model || "未指定模型"}`
      : "当前还没有可用设置。";
    elements.modalProfileSummary.textContent = truncateText(summaryText, 56);
    elements.modalProfileSummary.title = summaryText;
  }

  if (elements.modelProfileList) {
    elements.modelProfileList.innerHTML = profiles.length === 0
      ? `
        <div class="empty-state profile-empty">
          <strong>还没有保存的设置</strong>
          <p class="helper">先在右侧填写接口地址、访问密钥和模型名称，再保存成一条可复用设置。</p>
        </div>
      `
      : profiles.map((profile) => `
        <article class="profile-item ${state.modelConfig.selected_profile_id === profile.id ? "profile-item-active" : ""}">
          <div class="profile-item-top">
            <div>
              <h3 title="${escapeHtml(profile.name)}">${escapeHtml(profile.name)}</h3>
              <p title="${escapeHtml(`${profile.backend} · ${profile.model || "未指定模型"}`)}">${escapeHtml(profile.backend)} · ${escapeHtml(profile.model || "未指定模型")}</p>
            </div>
            <span class="badge ${state.modelConfig.selected_profile_id === profile.id ? "badge-strong" : ""}">
              ${state.modelConfig.selected_profile_id === profile.id ? "当前" : "候选"}
            </span>
          </div>
          <div class="action-row">
            <button type="button" class="button button-ghost" data-profile-action="edit" data-profile-id="${escapeHtml(profile.id)}">编辑</button>
            <button type="button" class="button button-ghost" data-profile-action="select" data-profile-id="${escapeHtml(profile.id)}" ${state.modelConfig.selected_profile_id === profile.id ? "disabled" : ""}>设为当前</button>
            <button type="button" class="button button-ghost" data-profile-action="delete" data-profile-id="${escapeHtml(profile.id)}" ${profile.source === "env" ? "disabled" : ""}>删除</button>
          </div>
        </article>
      `).join("");
  }

  if (elements.modalProfileNameInput) {
    elements.modalProfileNameInput.value = draft.name;
  }
  if (elements.modalBackendSelect) {
    elements.modalBackendSelect.value = draft.backend;
  }
  if (elements.modalBaseUrlInput) {
    elements.modalBaseUrlInput.value = draft.base_url;
  }
  if (elements.modalApiKeyInput) {
    elements.modalApiKeyInput.value = "";
  }
  if (elements.modalApiKeyLabel) {
    elements.modalApiKeyLabel.textContent = draft.api_key_masked
      ? `访问密钥（当前：${draft.api_key_masked}）`
      : "访问密钥";
  }
  if (elements.modalFetchedModelSelect) {
    const options = knownModels.length === 0
      ? `<option value="">先获取可选模型</option>`
      : knownModels.map((modelId, index) => {
        const label = index === 0 && modelId === selectedModel && !state.modal.fetchedModels.includes(modelId)
          ? `当前选择：${modelId}`
          : modelId;
        return `<option value="${escapeHtml(modelId)}">${escapeHtml(label)}</option>`;
      }).join("");
    elements.modalFetchedModelSelect.innerHTML = options;
    elements.modalFetchedModelSelect.value = selectedModel;
  }
  if (elements.modalManualModelInput) {
    elements.modalManualModelInput.value = draft.manual_model;
  }
  if (elements.modelFetchHint) {
    elements.modelFetchHint.textContent = state.modal.fetchMessage;
    elements.modelFetchHint.className = state.modal.fetchError ? "helper helper-error" : "helper";
  }
  if (elements.modelTestHint) {
    elements.modelTestHint.textContent = state.modal.testMessage;
    elements.modelTestHint.className = state.modal.testError ? "helper helper-error" : "helper";
  }
  if (elements.modalTestOutput) {
    const hasOutput = Boolean(state.modal.testOutput);
    elements.modalTestOutput.textContent = state.modal.testOutput;
    elements.modalTestOutput.classList.toggle("hidden", !hasOutput);
  }
}

function lockBackgroundScroll() {
  if (state.modal.isOpen) {
    return;
  }

  const scrollY = window.scrollY || window.pageYOffset || 0;
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

  state.modal.isOpen = true;
  state.modal.scrollY = scrollY;

  document.body.classList.add("modal-open");
  document.body.style.top = `-${scrollY}px`;
  document.body.style.paddingRight = scrollbarWidth > 0 ? `${scrollbarWidth}px` : "";
}

function unlockBackgroundScroll() {
  if (!state.modal.isOpen) {
    return;
  }

  const scrollY = state.modal.scrollY || 0;

  state.modal.isOpen = false;
  state.modal.scrollY = 0;

  document.body.classList.remove("modal-open");
  document.body.style.top = "";
  document.body.style.paddingRight = "";
  window.scrollTo(0, scrollY);
}

function openModelConfigModal() {
  setModalDraft(pickEditableProfile());
  renderModelConfigModal();
  lockBackgroundScroll();
  elements.modelConfigModal?.classList.remove("hidden");
  elements.modelConfigModal?.setAttribute("aria-hidden", "false");
  trapFocus(elements.modelConfigModal);
}

function closeModelConfigModal() {
  elements.modelConfigModal?.classList.add("hidden");
  elements.modelConfigModal?.setAttribute("aria-hidden", "true");
  releaseFocus();
  unlockBackgroundScroll();
}

function renderAccountSettingsModal() {
  if (!state.user) {
    return;
  }
  if (elements.accountSummaryName) {
    elements.accountSummaryName.textContent = state.user.display_name || state.user.username || "-";
  }
  if (elements.accountSummaryMeta) {
    elements.accountSummaryMeta.textContent = `${state.user.email} · ${state.user.username}`;
  }
  if (elements.accountSummaryBadge) {
    elements.accountSummaryBadge.textContent = state.user.role === "admin" ? "管理员" : "普通用户";
  }
  if (elements.accountDisplayNameInput) {
    elements.accountDisplayNameInput.value = state.user.display_name || "";
  }
  if (elements.accountEmailInput) {
    elements.accountEmailInput.value = state.user.email || "";
  }
  const isLocalAccount = state.user.auth_provider === "local";
  if (elements.accountPasswordFields) {
    elements.accountPasswordFields.classList.toggle("hidden", !isLocalAccount);
  }
  if (elements.accountProviderHint) {
    elements.accountProviderHint.textContent = isLocalAccount
      ? "当前是本地账号，显示名和密码都可以在这里修改。"
      : `当前账号来自 ${state.user.auth_provider || "外部身份系统"}，这里只能修改显示名。`;
  }
  if (elements.accountCurrentPasswordInput) {
    elements.accountCurrentPasswordInput.value = "";
  }
  if (elements.accountNewPasswordInput) {
    elements.accountNewPasswordInput.value = "";
  }
}

function openAccountSettingsModal() {
  if (!state.user) {
    return;
  }
  renderAccountSettingsModal();
  lockBackgroundScroll();
  elements.accountSettingsModal?.classList.remove("hidden");
  elements.accountSettingsModal?.setAttribute("aria-hidden", "false");
  trapFocus(elements.accountSettingsModal);
}

function closeAccountSettingsModal() {
  elements.accountSettingsModal?.classList.add("hidden");
  elements.accountSettingsModal?.setAttribute("aria-hidden", "true");
  releaseFocus();
  unlockBackgroundScroll();
}

// ============ Image Model Modal Functions ============

function openImageModelModal() {
  loadImageModelConfig();
  elements.imageModelModal?.classList.remove("hidden");
  elements.imageModelModal?.setAttribute("aria-hidden", "false");
  lockBackgroundScroll();
  trapFocus(elements.imageModelModal);
}

function closeImageModelModal() {
  elements.imageModelModal?.classList.add("hidden");
  elements.imageModelModal?.setAttribute("aria-hidden", "true");
  releaseFocus();
  unlockBackgroundScroll();
}

function renderImageModelModal() {
  const config = state.imageModelConfig;
  const profiles = config.profiles || [];
  const selectedId = config.selected_profile_id;
  const draft = state.imageModal.draft;

  // Profile list
  if (elements.imageModalProfileSummary) {
    let summaryText = "";
    if (profiles.length === 0) {
      summaryText = "当前还没有可用设置。";
    } else {
      summaryText = `共 ${profiles.length} 套设置，当前使用：${config.active_profile?.name || "无"}`;
    }
    elements.imageModalProfileSummary.textContent = truncateText(summaryText, 56);
    elements.imageModalProfileSummary.title = summaryText;
  }

  if (elements.imageModelProfileList) {
    if (profiles.length === 0) {
      elements.imageModelProfileList.innerHTML = `<p class="helper profile-empty">点击下方按钮新增设置。</p>`;
    } else {
      elements.imageModelProfileList.innerHTML = profiles.map((profile) => `
        <article class="profile-item ${selectedId === profile.id ? "profile-item-active" : ""}">
          <div class="profile-item-top">
            <div>
              <h3 title="${escapeHtml(profile.name)}">${escapeHtml(profile.name)}</h3>
              <p title="${escapeHtml(`${profile.backend} · ${profile.model || "默认模型"}`)}">${escapeHtml(profile.backend)} · ${escapeHtml(profile.model || "默认模型")}</p>
            </div>
            <span class="badge ${selectedId === profile.id ? "badge-strong" : ""}">
              ${selectedId === profile.id ? "当前" : "候选"}
            </span>
          </div>
          <div class="action-row">
            <button type="button" class="button button-ghost" data-image-profile-action="edit" data-image-profile-id="${escapeHtml(profile.id)}">编辑</button>
            <button type="button" class="button button-ghost" data-image-profile-action="select" data-image-profile-id="${escapeHtml(profile.id)}" ${selectedId === profile.id ? "disabled" : ""}>设为当前</button>
            <button type="button" class="button button-ghost" data-image-profile-action="delete" data-image-profile-id="${escapeHtml(profile.id)}">删除</button>
          </div>
        </article>
      `).join("");
    }
  }

  // Form fields
  if (elements.imageProfileNameInput) elements.imageProfileNameInput.value = draft.name || "";
  if (elements.imageBackendSelect) elements.imageBackendSelect.value = draft.backend || "gemini";
  if (elements.imageApiKeyInput) elements.imageApiKeyInput.value = "";
  if (elements.imageApiKeyLabel) {
    elements.imageApiKeyLabel.textContent = draft.api_key_masked ? `访问密钥（${draft.api_key_masked}）` : "访问密钥";
  }

  // Update model dropdown and base URL based on backend
  const backendPresets = {
    gemini: { base_url: "", models: ["gemini-2.0-flash-exp", "gemini-1.5-flash", "gemini-1.5-pro"] },
    openai: { base_url: "", models: ["dall-e-3", "dall-e-2", "gpt-image-1"] },
    siliconflow: { base_url: "https://api.siliconflow.cn/v1", models: ["Kwai-Kolors/Kolors", "black-forest-labs/FLUX.1-schnell", "black-forest-labs/FLUX.1-dev", "stabilityai/stable-diffusion-3-medium", "stabilityai/stable-diffusion-xl-base-1.0"] },
  };

  const currentBackend = draft.backend || "gemini";
  const preset = backendPresets[currentBackend] || backendPresets.gemini;

  // Update model dropdown options
  if (elements.imageModelSelect) {
    const currentModel = draft.model || "";
    elements.imageModelSelect.innerHTML = `
      <option value="">使用默认模型</option>
      ${preset.models.map(m => `<option value="${m}" ${currentModel === m ? "selected" : ""}>${m}</option>`).join("")}
    `;
  }

  // Update base URL if empty and backend has preset
  if (elements.imageBaseUrlInput) {
    const currentBaseUrl = elements.imageBaseUrlInput.value.trim();
    // Only auto-fill if the field is empty or matches another backend's preset
    const matchesOtherBackend = Object.values(backendPresets).some(p => p.base_url && p.base_url === currentBaseUrl && p !== preset);
    if (!currentBaseUrl || matchesOtherBackend) {
      elements.imageBaseUrlInput.value = preset.base_url;
    } else {
      elements.imageBaseUrlInput.value = draft.base_url || "";
    }
  }

  // Manual model input
  if (elements.imageManualModelInput) {
    const currentModel = draft.model || "";
    if (currentModel && !preset.models.includes(currentModel)) {
      elements.imageManualModelInput.value = currentModel;
    } else {
      elements.imageManualModelInput.value = "";
    }
  }

  // Test output
  if (elements.imageTestOutput) {
    if (state.imageModal.testOutput) {
      elements.imageTestOutput.classList.remove("hidden");
      elements.imageTestOutput.textContent = state.imageModal.testOutput;
    } else {
      elements.imageTestOutput.classList.add("hidden");
    }
  }
}

function beginNewImageProfile() {
  state.imageModal.draft = {
    id: "",
    name: "",
    backend: "gemini",
    model: "",
    base_url: "",
    api_key_masked: "",
  };
  state.imageModal.testOutput = "";
  state.imageModal.testError = false;
  renderImageModelModal();
}

function editImageProfile(profileId) {
  const profile = state.imageModelConfig.profiles?.find((p) => p.id === profileId);
  if (!profile) return;

  state.imageModal.draft = {
    id: profile.id,
    name: profile.name || "",
    backend: profile.backend || "gemini",
    model: profile.model || "",
    base_url: profile.base_url || "",
    api_key_masked: profile.api_key_masked || "",
  };
  state.imageModal.testOutput = "";
  renderImageModelModal();
}

function syncImageModalDraftFromInputs() {
  state.imageModal.draft.name = elements.imageProfileNameInput?.value?.trim() || "";
  state.imageModal.draft.backend = elements.imageBackendSelect?.value || "gemini";
  state.imageModal.draft.base_url = elements.imageBaseUrlInput?.value?.trim() || "";
  // Prefer manual model input over dropdown
  const manualModel = elements.imageManualModelInput?.value?.trim() || "";
  const selectModel = elements.imageModelSelect?.value || "";
  state.imageModal.draft.model = manualModel || selectModel;
}

async function saveImageModelProfile(event) {
  event.preventDefault();
  syncImageModalDraftFromInputs();

  const apiKey = elements.imageApiKeyInput?.value?.trim() || "";
  const profile = {
    ...state.imageModal.draft,
    api_key: apiKey || undefined,
  };

  if (!profile.name) {
    showFlash("请输入配置名称", "error");
    return;
  }
  if (!profile.id && !apiKey) {
    showFlash("新增设置时需要填写访问密钥", "error");
    return;
  }

  try {
    clearFlash();
    setBusy(true);
    await apiFetch("/api/image-model-config", {
      method: "POST",
      body: JSON.stringify({ action: "upsert", profile }),
    });
    await loadImageModelConfig();
    beginNewImageProfile();
    showFlash("图片模型设置已保存。");
    renderImageModelModal();
  } catch (error) {
    showFlash(error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function selectImageProfile(profileId) {
  if (!profileId) return;

  try {
    await apiFetch("/api/image-model-config", {
      method: "POST",
      body: JSON.stringify({ action: "select", profile_id: profileId }),
    });
    await loadImageModelConfig();
    renderImageModelModal();
  } catch (error) {
    showFlash(error.message, "error");
  }
}

async function deleteImageProfile(profileId) {
  if (!profileId) return;
  const profile = state.imageModelConfig.profiles?.find((item) => item.id === profileId);
  const profileLabel = profile?.name || "这条设置";
  if (!window.confirm(`确认删除“${profileLabel}”吗？删除后将无法恢复。`)) {
    return;
  }

  try {
    await apiFetch("/api/image-model-config", {
      method: "POST",
      body: JSON.stringify({ action: "delete", profile_id: profileId }),
    });
    await loadImageModelConfig();
    if (state.imageModal.draft.id === profileId) {
      beginNewImageProfile();
    }
    renderImageModelModal();
  } catch (error) {
    showFlash(error.message, "error");
  }
}

async function testImageConfig() {
  syncImageModalDraftFromInputs();
  const apiKey = elements.imageApiKeyInput?.value?.trim() || "";

  if (!apiKey && !state.imageModal.draft.api_key_masked) {
    showFlash("请先输入访问密钥", "error");
    return;
  }

  try {
    clearFlash();
    setBusy(true);
    state.imageModal.testOutput = "正在测试这套设置...";
    state.imageModal.testError = false;
    renderImageModelModal();

    const profile = {
      ...state.imageModal.draft,
      api_key: apiKey || undefined,
    };

    const data = await apiFetch("/api/image-model-config/test", {
      method: "POST",
      body: JSON.stringify({ profile }),
    });

    state.imageModal.testOutput = `测试成功\n服务类型：${data.result?.backend || "未识别"}\n模型名称：${data.result?.model || "未识别"}`;
    state.imageModal.testError = false;
    renderImageModelModal();
  } catch (error) {
    state.imageModal.testOutput = `测试失败: ${error.message}`;
    state.imageModal.testError = true;
    renderImageModelModal();
  } finally {
    setBusy(false);
  }
}

function handleImageProfileListClick(event) {
  const button = event.target.closest("button[data-image-profile-action]");
  if (!button) return;

  const action = button.dataset.imageProfileAction;
  const profileId = button.dataset.imageProfileId;

  if (action === "edit") {
    editImageProfile(profileId);
  } else if (action === "select") {
    selectImageProfile(profileId);
  } else if (action === "delete") {
    deleteImageProfile(profileId);
  }
}

function copyFromGlobalModelConfig() {
  const activeProfile = state.modelConfig.active_profile;
  if (!activeProfile) {
    showFlash("请先在全局模型设置里选好一套可用设置。", "error");
    return;
  }

  // Copy values from active text model profile to image model form
  state.imageModal.draft = {
    id: "",
    name: activeProfile.name ? `${activeProfile.name}（图片）` : "从全局设置复制",
    backend: activeProfile.backend || "gemini",
    model: activeProfile.model || "",
    base_url: activeProfile.base_url || "",
    api_key_masked: activeProfile.api_key_masked || "",
  };

  // Update form fields
  if (elements.imageProfileNameInput) {
    elements.imageProfileNameInput.value = state.imageModal.draft.name;
  }
  if (elements.imageBackendSelect) {
    elements.imageBackendSelect.value = state.imageModal.draft.backend;
  }
  if (elements.imageBaseUrlInput) {
    elements.imageBaseUrlInput.value = state.imageModal.draft.base_url;
  }
  if (elements.imageApiKeyLabel) {
    elements.imageApiKeyLabel.textContent = state.imageModal.draft.api_key_masked
      ? `访问密钥（${state.imageModal.draft.api_key_masked}）`
      : "访问密钥";
  }
  if (elements.imageApiKeyInput) {
    elements.imageApiKeyInput.value = "";
  }

  showFlash("已从全局模型设置复制，请补充访问密钥后保存。");
}

function getFlowStepStatus(stepId, project, activeStepId) {
  if (stepId === activeStepId) {
    return "current";
  }

  if (!project) {
    return stepId === "project" ? "available" : "locked";
  }

  const completed = {
    project: true,
    sources: project.source_count > 0,
    template: hasTemplateDecision(project),
    strategist: hasDesignSpec(project),
    images: project.svg_output_count > 0 || project.has_total_notes || project.svg_final_count > 0 || project.pptx_files.length > 0,
    executor: hasExecutorOutputs(project),
    post: project.pptx_files.length > 0,
  };

  const available = {
    project: true,
    sources: true,
    template: project.source_count > 0,
    strategist: hasTemplateDecision(project),
    images: hasDesignSpec(project),
    executor: hasDesignSpec(project),
    post: project.svg_output_count > 0 || project.has_total_notes || project.split_notes_count > 0 || project.svg_final_count > 0,
  };

  if (completed[stepId]) {
    return "complete";
  }

  return available[stepId] ? "available" : "locked";
}

function renderStats() {
  if (elements.projectCount) {
    elements.projectCount.textContent = String(state.projects.length);
  }
  if (elements.formatCount) {
    elements.formatCount.textContent = String(state.formats.length);
  }
  if (elements.stepCount) {
    elements.stepCount.textContent = String(FLOW_STEPS.length);
  }
}

function renderProjectContext() {
  const project = state.selectedProject;
  if (!project) {
    elements.projectContext.innerHTML = `
      <div class="context-empty">
        <strong>当前还没有选中项目</strong>
        <p class="context-text">从第 1 步开始。你可以创建一个新项目，或者从最近项目列表里选一个继续操作。</p>
        <div class="action-row">
          <button class="button button-secondary" type="button" data-context-action="open-project-manager">打开项目管理</button>
        </div>
      </div>
    `;
    elements.projectContext.querySelector('[data-context-action="open-project-manager"]')?.addEventListener("click", openProjectManagerModal);
    return;
  }

  const health = getProjectHealth(project);
  const blockerItems = health.blockers.length === 0
    ? `<li>当前没有明显阻塞，可以继续往下走。</li>`
    : health.blockers.slice(0, 3).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const nextStepLabel = truncateText(health.nextStepLabel, 120);

  elements.projectContext.innerHTML = `
    <div class="context-card">
      <div class="context-grid">
        <div class="context-main">
          <div class="context-top">
            <div>
              <h3 class="context-title" title="${escapeHtml(project.name)}">${escapeHtml(project.name)}</h3>
              <p class="context-text" title="${escapeHtml(health.nextStepLabel)}">${escapeHtml(nextStepLabel)}</p>
            </div>
            <div class="action-row context-actions">
              <button class="button button-ghost button-small" data-context-action="refresh" title="刷新当前项目状态">刷新</button>
              <button class="button button-ghost button-small" data-context-action="validate" title="校验当前项目结构">校验</button>
            </div>
          </div>
          <div class="badge-row badge-row-compact">
            ${metric("format", project.canvas_label, true)}
            ${metric("src", project.source_count)}
            ${metric("spec", hasDesignSpec(project) ? "✓" : "–", hasDesignSpec(project))}
            ${metric("svg", project.svg_output_count)}
            ${metric("notes", project.has_total_notes ? "✓" : "–", project.has_total_notes)}
            ${metric("final", project.svg_final_count)}
            ${metric("pptx", project.pptx_files.length)}
          </div>
        </div>
        <div class="context-side">
          <div class="context-summary">
            <p class="context-summary-label">进度</p>
            <strong>${health.completed}/${health.total}</strong>
            <span>${health.percent}%</span>
          </div>
          <div class="progress-track" role="progressbar" aria-valuenow="${health.percent}" aria-valuemax="100" aria-label="项目进度 ${health.percent}%">
            <span class="progress-fill" style="width: ${health.percent}%"></span>
          </div>
          ${health.blockerCount > 0 ? `
            <div class="context-blockers">
              <p class="context-summary-label">阻塞 ${health.blockerCount}</p>
              <ul class="context-list">${health.blockers.slice(0, 2).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
            </div>
          ` : ""}
        </div>
      </div>
    </div>
  `;

  elements.projectContext.querySelector('[data-context-action="refresh"]').addEventListener("click", () => {
    selectProject(getProjectRef(project), { keepStep: true });
  });
  elements.projectContext.querySelector('[data-context-action="validate"]').addEventListener("click", () => validateProject(getProjectRef(project)));
}

function getStepLabel(stepId) {
  return FLOW_STEPS.find((step) => step.id === stepId)?.title || stepId;
}

function renderStepRail() {
  elements.stepRail.innerHTML = FLOW_STEPS.map((step, index) => {
    const status = getFlowStepStatus(step.id, state.selectedProject, state.activeStepId);
    const canOpen = Boolean(state.selectedProject) || step.id === "project";
    const className = [
      "step-chip",
      status === "current" ? "step-chip-current" : "",
      status === "complete" ? "step-chip-complete" : "",
      status === "locked" ? "step-chip-locked" : "",
    ].join(" ").trim();

    const numberContent = status === "complete" ? "\u2713" : String(index + 1);

    return `
      <button class="${className}" data-flow-step="${escapeHtml(step.id)}" title="${escapeHtml(step.description)}" aria-label="${escapeHtml(`${step.title}：${step.description}`)}" ${status === "current" ? 'aria-current="step"' : ""} ${canOpen ? "" : "disabled"}>
        <span class="step-number">${numberContent}</span>
        <p class="step-title">${escapeHtml(step.title)}</p>
        <p class="step-desc">${escapeHtml(step.description)}</p>
      </button>
    `;
  }).join("");

  elements.stepRail.querySelectorAll("[data-flow-step]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeStepId = button.dataset.flowStep;
      renderStage();
      renderStepRail();
    });
  });
}

function renderRecentProjects() {
  if (state.projects.length === 0) {
    return `
      <div class="empty-state">
        <strong>还没有项目</strong>
        <p class="helper">先在上面创建一个新项目，后续步骤会自动切换到这个项目。</p>
      </div>
    `;
  }

  const filteredProjects = getFilteredProjects();
  if (filteredProjects.length === 0) {
    return `
      <div class="empty-state">
        <strong>没有匹配的项目</strong>
        <p class="helper">换个关键词试试，或者清空筛选看全部项目。</p>
      </div>
    `;
  }

  return `
    <div class="project-list">
      ${filteredProjects.map((project) => `
        <article class="project-item ${getProjectRef(state.selectedProject) === getProjectRef(project) ? "project-item-active" : ""}">
          <div class="project-top">
            <div>
              <h3 class="project-name" title="${escapeHtml(project.name)}">${escapeHtml(project.name)}</h3>
              <p class="project-meta" title="${escapeHtml(`${project.canvas_label} · ${project.created_at}`)}">${escapeHtml(project.canvas_label)} · ${escapeHtml(project.created_at)}</p>
            </div>
            <div class="project-actions">
              <button class="button button-ghost" data-project-select="${escapeHtml(getProjectRef(project))}" title="${getProjectRef(state.selectedProject) === getProjectRef(project) ? escapeHtml(`当前项目：${project.name}`) : escapeHtml(`切换到项目：${project.name}`)}">
                ${getProjectRef(state.selectedProject) === getProjectRef(project) ? "当前项目" : "切换到此项目"}
              </button>
            </div>
          </div>
          <div class="badge-row">
            ${metric("sources", project.source_count)}
            ${metric("svg_output", project.svg_output_count)}
            ${metric("notes", project.split_notes_count || 0)}
            ${metric("svg_final", project.svg_final_count)}
            ${metric("pptx", project.pptx_files.length)}
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderProjectStep() {
  const formatOptions = state.formats.map((format) => {
    return `<option value="${escapeHtml(format.id)}">${escapeHtml(format.name)} · ${escapeHtml(format.dimensions)}</option>`;
  }).join("");
  const filteredProjects = getFilteredProjects();

  return `
    <div class="two-col">
      <section class="subpanel">
        <div class="section-head">
          <p class="section-kicker">新建</p>
          <h2>新建项目</h2>
        </div>
        <form id="createProjectForm" class="stack">
          <label class="field">
            <span>项目名</span>
            <input type="text" name="project_name" placeholder="例如：年度汇报" required>
          </label>
          <label class="field">
            <span>画布格式</span>
            <select name="canvas_format">${formatOptions}</select>
          </label>
          <button type="submit" class="button button-primary">创建并进入下一步</button>
        </form>
      </section>

      <section class="subpanel">
        <div class="section-head">
          <p class="section-kicker">最近使用</p>
          <h2>最近项目</h2>
          <p class="helper">共 ${state.projects.length} 个项目，当前显示 ${filteredProjects.length} 个。</p>
        </div>
        <label class="field">
          <span>筛选项目</span>
          <input id="projectFilterInput" type="text" value="${escapeHtml(state.projectFilter)}" placeholder="按项目名、格式或日期搜索">
        </label>
        ${renderRecentProjects()}
      </section>
    </div>
  `;
}

function renderSourcesStep() {
  if (!state.selectedProject) {
    return renderLockedStage("请先创建或选择一个项目，然后再添加内容。");
  }

  const project = state.selectedProject;
  const sourceFiles = project.source_markdown || [];
  const sourceCount = project.source_count || 0;

  const existingSourcesHtml = sourceCount > 0 ? `
    <section class="subpanel">
      <div class="section-head">
        <p class="section-kicker">已导入</p>
        <h2>已导入来源 (${sourceCount})</h2>
      </div>
      <div class="pm-file-list">
        ${sourceFiles.length > 0 ? sourceFiles.map((file) => `
          <div class="pm-file-item">
            <span class="pm-file-icon svg-icon">文</span>
            <span class="pm-file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
            <a class="button button-ghost button-small doc-preview-trigger" data-doc-preview="${escapeHtml(file.url)}" data-doc-title="${escapeHtml(file.name)}" title="${escapeHtml(`预览 ${file.name}`)}">预览</a>
          </div>
        `).join("") : `
          <p class="helper">${sourceCount} 个来源文件（详细列表需刷新项目数据）</p>
        `}
      </div>
    </section>
  ` : "";

  return `
    ${existingSourcesHtml}
    <section class="subpanel">
      <div class="section-head">
        <p class="section-kicker">继续导入</p>
        <h2>${sourceCount > 0 ? "追加导入" : "导入到"} ${escapeHtml(project.name)}</h2>
      </div>
      <form id="importForm" class="stack">
        <label class="field">
          <span>来源列表</span>
          <textarea name="sources" rows="6" placeholder="每行一个本地路径或 URL"></textarea>
        </label>
        <label class="checkbox">
          <input type="checkbox" name="move">
          <span>导入后把原文件移到项目里，而不是保留一份副本</span>
        </label>
        <div class="two-col">
          <label class="field">
            <span>粘贴内容格式</span>
            <select name="pasted_format">
              <option value="markdown">Markdown</option>
              <option value="text">纯文本</option>
            </select>
          </label>
          <label class="field">
            <span>生成文件名</span>
            <input type="text" name="pasted_filename" placeholder="例如：项目说明.md">
          </label>
        </div>
        <label class="field">
          <span>粘贴正文</span>
          <textarea name="pasted_content" rows="10" placeholder="把文字直接贴在这里，系统会自动存成文件并加入项目"></textarea>
        </label>
        <div class="action-row">
          <button type="submit" class="button button-secondary">${sourceCount > 0 ? "继续添加内容" : "导入内容并进入下一步"}</button>
          <button type="button" class="button button-ghost" data-jump-step="project">切换项目</button>
        </div>
      </form>
      <p class="helper">支持 Markdown、PDF、DOCX、TXT、网页链接，以及直接粘贴文字。</p>
    </section>
    ${sourceCount > 0 ? renderNextStepGuide("sources") : ""}
  `;
}

function renderLockedStage(message) {
  return `
    <div class="empty-state">
      <strong>这一步还不能开始</strong>
      <p class="helper">${escapeHtml(message)}</p>
    </div>
  `;
}

function renderValidationDetails() {
  if (!state.validation || !state.selectedProject || state.validation.projectName !== state.selectedProject.name) {
    return `<p class="helper">还没有检查当前项目。建议在导出前先检查一次，避免遗漏问题。</p>`;
  }

  const result = state.validation.result;
  return `
    <div class="stack">
      <div class="badge-row">
        ${metric("结果", result.is_valid ? "通过" : "未通过", result.is_valid)}
        ${metric("问题", result.errors.length)}
        ${metric("提醒", result.warnings.length)}
      </div>
      ${result.errors.length ? `<pre class="status-log">${escapeHtml(result.errors.join("\n"))}</pre>` : ""}
      ${result.warnings.length ? `<pre class="status-log">${escapeHtml(result.warnings.join("\n"))}</pre>` : ""}
    </div>
  `;
}

function renderTemplateStep() {
  if (!state.selectedProject) {
    return renderLockedStage("请先创建或选择一个项目，再决定页面外观。");
  }

  const project = state.selectedProject;
  const completed = hasTemplateDecision(project);

  // If already completed, show summary
  if (completed) {
    return `
      <div class="stack">
        <section class="subpanel">
          <div class="section-head">
            <p class="section-kicker">已确认</p>
            <h2>模板策略</h2>
          </div>
          <div class="status-grid">
            <article class="status-card status-ok">
              <strong>外观方案已确认</strong>
              <p class="helper">系统检测到你已经完成了这一步，可以直接继续后面的内容整理。</p>
            </article>
          </div>
          <div class="action-row">
            <button class="button button-ghost" data-jump-step="sources">查看已导入来源</button>
            ${hasDesignSpec(project) ? '<button class="button button-secondary" data-jump-step="strategist">查看方案说明</button>' : ""}
          </div>
        </section>
        ${renderNextStepGuide("template")}
      </div>
    `;
  }

  // Template selection UI
  const templates = state.templates || [];
  const categories = state.templateCategories || {};
  const selectedId = state.selectedTemplateId;

  // Category label translations
  const categoryLabels = {
    brand: "品牌风格模板",
    general: "通用风格模板",
    scenario: "场景专用模板",
    government: "政府企业模板",
    special: "特殊风格模板",
  };

  // Group templates by category
  const categoryTemplates = {};
  for (const [catId, catInfo] of Object.entries(categories)) {
    categoryTemplates[catId] = {
      label: categoryLabels[catId] || catInfo.label || catId,
      templates: templates.filter(t => catInfo.layouts && catInfo.layouts.includes(t.id)),
    };
  }

  // Build template cards
  const renderTemplateCard = (template) => {
    const isSelected = selectedId === template.id;
    let previewHtml = "";

    if (template.preview_url) {
      previewHtml = `<img src="${template.preview_url}" alt="${escapeHtml(template.label)}" class="template-preview-img" onerror="this.parentElement.innerHTML='<div class=\\'template-preview-placeholder\\'><span>${escapeHtml(template.label.charAt(0))}</span></div>'">`;
    } else if (template.svg_files && template.svg_files.length > 0) {
      // Use first SVG as preview
      const svgUrl = `/files/templates/${template.id}/${template.svg_files[0]}`;
      previewHtml = `<img src="${svgUrl}" alt="${escapeHtml(template.label)}" class="template-preview-img" onerror="this.parentElement.innerHTML='<div class=\\'template-preview-placeholder\\'><span>${escapeHtml(template.label.charAt(0))}</span></div>'">`;
    } else {
      previewHtml = `<div class="template-preview-placeholder"><span>${escapeHtml(template.label.charAt(0))}</span></div>`;
    }

    return `
      <article class="template-card ${isSelected ? "template-card-selected" : ""}" data-template-id="${escapeHtml(template.id)}">
        <div class="template-preview">${previewHtml}</div>
        <div class="template-info">
          <h4>${escapeHtml(template.label)}</h4>
          <p class="template-summary">${escapeHtml(template.summary || "")}</p>
          <div class="template-meta">
            ${template.svg_count ? `<span class="badge">${template.svg_count} 页</span>` : ""}
            ${template.keywords && template.keywords.length ? `<span class="template-keywords">${escapeHtml(template.keywords.slice(0, 3).join(" · "))}</span>` : ""}
          </div>
        </div>
        ${isSelected ? '<span class="template-check">✓</span>' : ""}
      </article>
    `;
  };

  // Build category sections
  const categoryHtml = Object.entries(categoryTemplates)
    .filter(([_, cat]) => cat.templates.length > 0)
    .map(([catId, cat]) => `
      <section class="template-category">
        <h3>${escapeHtml(cat.label)}</h3>
        <div class="template-grid">
          ${cat.templates.map(renderTemplateCard).join("")}
        </div>
      </section>
    `).join("");

  const loadingHtml = state.templatesLoading
    ? renderSkeletonCards(4)
    : "";

  const emptyHtml = !state.templatesLoading && templates.length === 0
    ? `<div class="empty-state"><p>暂无可用模板，可选择自由设计</p></div>`
    : "";

  return `
    <div class="stack">
      <section class="subpanel">
        <div class="section-head">
          <p class="section-kicker">模板方案</p>
          <h2>选择模板</h2>
        </div>
        <p class="helper">你可以选一个现成模板，也可以让系统根据内容自由排版。</p>

        <div class="template-options">
          <label class="template-option-free ${selectedId === null ? "template-option-selected" : ""}">
            <input type="radio" name="template_choice" value="" ${selectedId === null ? "checked" : ""} data-template-free>
            <div class="template-option-content">
              <strong>自由设计</strong>
              <p>不套用模板，直接根据内容生成页面风格</p>
            </div>
          </label>
        </div>

        ${loadingHtml}
        ${emptyHtml}
        ${categoryHtml}

        <div class="action-row template-actions">
          ${selectedId === null
            ? '<button class="button button-primary" data-template-action="skip">确认继续</button>'
            : `<button class="button button-primary" data-template-action="apply" ${state.templateApplyLoading ? "disabled" : ""}>
                ${state.templateApplyLoading ? "应用中..." : "应用模板"}
               </button>
               <button class="button button-ghost" data-template-action="skip">跳过</button>`
          }
        </div>
      </section>
    </div>
  `;
}

function renderStrategistStep() {
  if (!state.selectedProject) {
    return renderLockedStage("请先创建或选择一个项目，再确认整体方案。");
  }
  if (state.selectedProject.source_count === 0) {
    return renderLockedStage("请先添加要整理的内容，系统才能给出方案建议。");
  }

  const project = state.selectedProject;
  const specReady = hasDesignSpec(project);
  const activeProfile = getActiveProfile();

  // Loading state - must be checked first
  if (state.strategistLoading) {
    return `
      <div class="stack">
        <section class="subpanel">
          <div class="section-head">
            <p class="section-kicker">方案分析</p>
            <h2>正在分析内容...</h2>
          </div>
          <div class="loading-indicator">
            <div class="loading-spinner"></div>
            <p>正在理解内容，并生成页面方案建议...</p>
          </div>
          ${renderSkeleton(6)}
        </section>
      </div>
    `;
  }

  // Check model configuration
  if (!activeProfile?.configured) {
    return `
      <div class="stack">
        <section class="subpanel">
          <div class="section-head">
            <p class="section-kicker">方案分析</p>
            <h2>八项确认</h2>
          </div>
          <div class="status-card status-warn">
            <strong>需要先连接文字模型</strong>
            <p class="helper">这一步需要系统先理解你的内容，所以要先配置一个可用的文字模型。</p>
          </div>
          <div class="action-row">
            <button class="button button-primary" data-review-action="open-model-config">去设置模型</button>
          </div>
        </section>
      </div>
    `;
  }

  // If design spec already exists AND no new analysis, show summary with reanalyze option
  if (specReady && !state.strategistAnalysis) {
    return `
      <div class="stack">
        <section class="subpanel">
          <div class="section-head">
            <p class="section-kicker">方案分析</p>
            <h2>方案说明与内容结构</h2>
          </div>
          <div class="status-grid">
            <article class="status-card status-ok">
              <strong>方案说明已经准备好</strong>
              <p class="helper">你可以直接进入下一步，或者重新分析一遍再调整。</p>
            </article>
          </div>
          <div class="asset-actions">
            ${renderDocLink(project.design_spec)}
          </div>
          <div class="action-row action-row-top-gap">
            <button class="button button-ghost" data-strategist-action="reanalyze">重新分析</button>
            <button class="button button-secondary" data-jump-step="executor">继续生成内容</button>
          </div>
        </section>
        ${renderNextStepGuide("strategist")}
      </div>
    `;
  }

  // If no analysis yet, show start button
  if (!state.strategistAnalysis) {
    return `
      <div class="stack">
        <section class="subpanel">
          <div class="section-head">
            <p class="section-kicker">方案分析</p>
            <h2>方案说明</h2>
          </div>
          <p class="helper">点击“开始分析”后，系统会根据你的内容给出页数、风格、配色和图片建议。</p>
          <div class="action-row">
            <button class="button button-primary" data-strategist-action="analyze">开始分析</button>
          </div>
        </section>
      </div>
    `;
  }

  // Show form with analysis results
  const analysis = state.strategistAnalysis;

  const renderField = (label, key, type = "text", options = []) => {
    const value = state.eightConfirmations[key] ?? "";
    if (type === "select") {
      return `
        <label class="field">
          <span>${label}</span>
          <select data-confirmation="${key}">
            ${options.map(opt => `<option value="${opt.value}" ${value === opt.value ? "selected" : ""}>${opt.label}</option>`).join("")}
          </select>
        </label>
      `;
    }
    if (type === "number") {
      return `
        <label class="field field-small">
          <span>${label}</span>
          <input type="number" data-confirmation="${key}" value="${escapeHtml(String(value))}" placeholder="${options.placeholder || ""}">
        </label>
      `;
    }
    if (type === "color") {
      return `
        <label class="field field-small">
          <span>${label}</span>
          <div class="color-input-group">
            <input type="color" data-confirmation="${key}" value="${escapeHtml(String(value) || "#1565C0")}">
            <input type="text" data-confirmation="${key}-text" value="${escapeHtml(String(value))}" placeholder="#RRGGBB">
          </div>
        </label>
      `;
    }
    return `
      <label class="field">
        <span>${label}</span>
        <input type="text" data-confirmation="${key}" value="${escapeHtml(String(value))}">
      </label>
    `;
  };

  const formatOptions = state.formats.map(f => ({ value: f.id, label: `${f.name} (${f.dimensions})` }));
  const styleOptions = [
    { value: "general", label: "通用灵活" },
    { value: "consultant", label: "一般咨询" },
    { value: "consultant-top", label: "顶级咨询" },
  ];
  const iconOptions = [
    { value: "builtin", label: "内置图标库" },
    { value: "emoji", label: "Emoji 表情" },
    { value: "ai-generated", label: "AI 生成" },
    { value: "none", label: "不使用" },
  ];
  const imageOptions = [
    { value: "none", label: "不使用图片" },
    { value: "user-provided", label: "用户提供" },
    { value: "ai-generated", label: "AI 生成" },
  ];

  return `
    <div class="stack">
      <section class="subpanel">
        <div class="section-head">
          <p class="section-kicker">方案分析</p>
          <h2>方案说明</h2>
        </div>

        <form id="strategistForm" class="confirmation-form">
          <div class="collapsible-section collapsible-open" data-collapsible>
            <div class="collapsible-header">
              <h3>基础设置（画布 / 页数 / 受众 / 风格）</h3>
              <span class="collapsible-arrow">\u25BC</span>
            </div>
            <div class="collapsible-body">
              <div class="confirmation-section">
                <div class="confirmation-row">
                  ${renderField("选择格式", "canvas_format", "select", formatOptions)}
                </div>
              </div>
              <div class="confirmation-section">
                <div class="confirmation-row two-col-inline">
                  ${renderField("最小页数", "page_count_min", "number", { placeholder: "8" })}
                  ${renderField("最大页数", "page_count_max", "number", { placeholder: "12" })}
                </div>
              </div>
              <div class="confirmation-section">
                <div class="confirmation-row">
                  ${renderField("受众描述", "target_audience", "text")}
                </div>
              </div>
              <div class="confirmation-section">
                <div class="confirmation-row">
                  ${renderField("选择风格", "style_objective", "select", styleOptions)}
                </div>
              </div>
            </div>
          </div>

          <div class="collapsible-section" data-collapsible>
            <div class="collapsible-header">
              <h3>配色方案</h3>
              <span class="collapsible-arrow">\u25BC</span>
            </div>
            <div class="collapsible-body">
              <div class="confirmation-section">
                <div class="confirmation-row three-col-inline">
                  ${renderField("主色", "color_primary", "color")}
                  ${renderField("辅色", "color_secondary", "color")}
                  ${renderField("强调色", "color_accent", "color")}
                </div>
              </div>
            </div>
          </div>

          <div class="collapsible-section" data-collapsible>
            <div class="collapsible-header">
              <h3>字体方案</h3>
              <span class="collapsible-arrow">\u25BC</span>
            </div>
            <div class="collapsible-body">
              <div class="confirmation-section">
                <div class="confirmation-row three-col-inline">
                  ${renderField("标题字体", "title_font", "text")}
                  ${renderField("正文字体", "body_font", "text")}
                  ${renderField("字号", "body_size", "number", { placeholder: "24" })}
                </div>
              </div>
            </div>
          </div>

          <div class="collapsible-section" data-collapsible>
            <div class="collapsible-header">
              <h3>图标与图片</h3>
              <span class="collapsible-arrow">\u25BC</span>
            </div>
            <div class="collapsible-body">
              <div class="confirmation-section">
                <div class="confirmation-row">
                  ${renderField("图标方案", "icon_approach", "select", iconOptions)}
                </div>
              </div>
              <div class="confirmation-section">
                <div class="confirmation-row">
                  ${renderField("图片方案", "image_approach", "select", imageOptions)}
                </div>
              </div>
            </div>
          </div>

          <div class="action-row">
            <button type="button" class="button button-ghost" data-strategist-action="reanalyze">重新分析</button>
            <button type="submit" class="button button-primary">保存方案说明</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderImagesStep() {
  if (!state.selectedProject) {
    return renderLockedStage("请先创建或选择一个项目，再处理图片。");
  }
  if (!hasDesignSpec(state.selectedProject)) {
    return renderLockedStage("请先完成方案确认，这样系统才知道需不需要图片。");
  }

  const project = state.selectedProject;
  const downstreamStarted = project.svg_output_count > 0 || project.has_total_notes || project.svg_final_count > 0;
  const imageConfig = state.imageModelConfig;
  const activeImageProfile = imageConfig.active_profile;
  const imgGen = state.imageGeneration;

  // Get image resources from design spec
  const imageResources = project.image_resources || [];
  const totalImages = imageResources.length;
  const pendingImages = imageResources.filter((img) => img.status === "pending");
  const generatedCount = imageResources.filter((img) => img.status === "generated").length;

  // Get image approach from strategist analysis if available
  const imageApproach = state.eightConfirmations.image_approach || "none";
  const needsImages = imageApproach === "ai-generated" || totalImages > 0;

  if (downstreamStarted && !needsImages) {
    return `
      <div class="stack">
        <section class="subpanel">
          <div class="section-head">
            <p class="section-kicker">可选步骤</p>
            <h2>AI 配图</h2>
          </div>
          <div class="badge-row">
            ${metric("状态", "已跳过")}
          </div>
          <p class="helper">当前方案里没有必须生成的图片，可以直接继续。</p>
          <div class="action-row">
            <button class="button button-primary" data-jump-step="executor">继续</button>
          </div>
        </section>
      </div>
    `;
  }

  if (imgGen.inProgress) {
    return `
      <div class="stack">
        <section class="subpanel">
          <div class="section-head">
            <p class="section-kicker">生成中</p>
            <h2>生成图片</h2>
          </div>
          <div class="loading-indicator">
            <div class="loading-spinner"></div>
            <p>${escapeHtml(imgGen.status || "生成中...")}</p>
          </div>
        </section>
      </div>
    `;
  }

  const profileOptions = (imageConfig.profiles || []).map((profile) => {
    const label = `${profile.name} · ${profile.backend}${profile.model ? ` · ${profile.model}` : ""}`;
    return `<option value="${escapeHtml(profile.id)}" ${activeImageProfile?.id === profile.id ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");

  // Render image resources list if available
  let imageListHtml = "";
  if (totalImages > 0) {
    imageListHtml = `
      <div class="image-resources-section">
        <div class="section-head image-resources-head">
          <h3 class="image-resources-title">图片资源清单</h3>
          <span class="badge">${generatedCount}/${totalImages} 已生成</span>
        </div>
        <div class="image-resource-list">
          ${imageResources.map((img, idx) => `
            <div class="image-resource-item ${img.status === "generated" ? "image-generated" : ""}">
              <div class="image-resource-main">
                <div class="image-resource-top">
                  <span class="image-resource-name">${escapeHtml(img.filename)}</span>
                  <span class="badge image-resource-badge ${img.status === "generated" ? "badge-strong" : ""}">
                    ${img.status === "generated" ? "已生成" : "待生成"}
                  </span>
                </div>
                <div class="image-resource-meta">
                  ${img.usage_pages ? `📍 ${escapeHtml(img.usage_pages)}` : ""}
                  ${img.dimensions ? ` · ${escapeHtml(img.dimensions)}` : ""}
                </div>
                ${img.description ? `
                  <div class="image-resource-description">
                    ${escapeHtml(img.description.substring(0, 150))}${img.description.length > 150 ? "..." : ""}
                  </div>
                ` : ""}
              </div>
              ${img.status === "pending" ? `
                <button class="button button-ghost button-small image-resource-generate"
                        data-generate-single-image="${idx}"
                        ${!activeImageProfile?.configured ? "disabled" : ""}>
                  生成
                </button>
              ` : ""}
            </div>
          `).join("")}
        </div>
        ${pendingImages.length > 0 && activeImageProfile?.configured ? `
          <div class="action-row action-row-top-gap">
            <button class="button button-primary" data-generate-all-images>
              批量生成 (${pendingImages.length} 张)
            </button>
          </div>
        ` : ""}
      </div>
    `;
  }

  return `
    <div class="stack">
      <section class="subpanel">
        <div class="section-head">
          <p class="section-kicker">可选步骤</p>
          <h2>AI 配图</h2>
        </div>

        ${!activeImageProfile?.configured ? `
          <p class="helper">要生成图片，先连接一个可用的图片模型服务。</p>
          <div class="action-row">
            <button class="button button-primary" data-image-action="open-config">去设置图片模型</button>
            <button class="button button-ghost" data-jump-step="executor">先跳过</button>
          </div>
        ` : `
          <div class="inline-toolbar">
            <p class="helper inline-toolbar-text">${totalImages > 0 ? `系统识别出 ${totalImages} 张建议图片，你可以逐张生成。` : "输入一句图片描述，直接生成一张插图。"}</p>
            <button class="button button-ghost button-small compact-button" data-image-action="open-config">修改模型设置</button>
          </div>

          ${imageListHtml}

          ${totalImages === 0 ? `
            <div class="section-divider-block">
              <p class="helper helper-gap-sm">手动生成一张图片：</p>
              <label class="field">
                <span>图片描述</span>
                <textarea id="imagePromptInput" rows="2" placeholder="描述图片...">${escapeHtml(imgGen.prompt)}</textarea>
              </label>
              <div class="two-col compact-grid">
                <label class="field">
                  <span>宽高比</span>
                  <select id="imageAspectSelect">
                    ${(imageConfig.aspect_ratios || ["1:1", "16:9", "9:16"]).map((ar) => `<option value="${ar}" ${imgGen.aspectRatio === ar ? "selected" : ""}>${ar}</option>`).join("")}
                  </select>
                </label>
                <label class="field">
                  <span>尺寸</span>
                  <select id="imageSizeSelect">
                    ${(imageConfig.sizes || ["512px", "1K", "2K"]).map((sz) => `<option value="${sz}" ${imgGen.imageSize === sz ? "selected" : ""}>${sz}</option>`).join("")}
                  </select>
                </label>
              </div>
              <div class="action-row">
                <button class="button button-primary" data-image-action="generate">生成图片</button>
              </div>
            </div>
          ` : ""}

          ${imgGen.lastResult ? `
            <div class="status-card status-ok status-card-top-gap">
              <strong>生成成功</strong>
              <p class="helper">${escapeHtml(imgGen.lastResult.filename)}</p>
            </div>
          ` : ""}
          ${imgGen.error ? `
            <div class="status-card status-error status-card-top-gap">
              <strong>失败</strong>
              <p class="helper">${escapeHtml(imgGen.error)}</p>
            </div>
          ` : ""}

          <div class="action-row section-divider-block">
            <button class="button button-ghost" data-jump-step="executor">暂时跳过，继续下一步</button>
          </div>
        `}
      </section>
      ${renderNextStepGuide("images")}
    </div>
  `;
}

function renderExecutorStep() {
  if (!state.selectedProject) {
    return renderLockedStage("请先创建或选择一个项目，再开始生成页面。");
  }
  if (!hasDesignSpec(state.selectedProject)) {
    return renderLockedStage("请先完成方案确认，系统需要先知道页面风格和结构。");
  }

  const project = state.selectedProject;
  const profiles = getProfiles();
  const activeProfile = getActiveProfile();
  const profileOptions = profiles.map((profile) => {
    const label = `${profile.name} · ${profile.backend}${profile.model ? ` · ${profile.model}` : ""}`;
    return `
      <option value="${escapeHtml(profile.id)}" ${activeProfile?.id === profile.id ? "selected" : ""}>
        ${escapeHtml(label)}
      </option>
    `;
  }).join("");

  const svgGen = state.svgGeneration;

  // Determine phase
  const phase = (() => {
    if (svgGen.inProgress) {
      return "generating";
    }
    if (!activeProfile?.configured) {
      return "awaiting-model";
    }
    if (project.svg_output_count === 0) {
      return "ready-svg";
    }
    if (!project.has_total_notes) {
      return "ready-notes";
    }
    return "complete";
  })();

  const profileSelectHtml = `
    <label class="field">
      <span>当前使用的模型设置</span>
      <select id="reviewProfileSelect" ${profiles.length === 0 ? "disabled" : ""}>
        ${profiles.length === 0 ? '<option value="">先新增模型设置</option>' : profileOptions}
      </select>
    </label>
  `;

  const modelConfigButtonHtml = `
    <button class="button button-ghost" type="button" data-review-action="open-model-config">修改模型设置</button>
  `;

  // SVG preview section (shown when there are existing SVGs)
  const svgPreviewHtml = project.svg_output_count > 0 ? `
    <section class="subpanel">
      <div class="section-head">
        <p class="section-kicker">页面预览</p>
          <h2>已生成的页面</h2>
      </div>
      <div class="badge-row">
        ${metric("svg_output", project.svg_output_count)}
      </div>
      <div class="preview-grid preview-grid-top-gap">
        ${renderSlides(project.preview_slides)}
      </div>
      <div class="action-row action-row-top-gap">
        <button class="button button-ghost" type="button" data-review-action="regenerate-all">重新生成全部</button>
        <button class="button button-ghost" type="button" data-review-action="delete-all-svg">删除全部页面文件</button>
      </div>
    </section>
  ` : "";

  return `
    <div class="stack">
      <section class="subpanel">
        <div class="section-head">
          <p class="section-kicker">内容生成</p>
          <h2>页面生成与讲稿补齐</h2>
        </div>
        <div class="badge-row">
          ${metric("方案说明", hasDesignSpec(project) ? "已准备" : "未准备", hasDesignSpec(project))}
          ${metric("页面数量", project.svg_output_count)}
          ${metric("讲稿总表", project.has_total_notes ? "已生成" : "未生成", project.has_total_notes)}
        </div>

        ${phase === "awaiting-model" ? `
          <p class="helper">开始生成前，先连接一个可用的文字模型服务。</p>
          <div class="action-row">
            <button class="button button-primary" data-review-action="open-model-config">去设置模型</button>
          </div>
        ` : ""}

        ${phase === "ready-svg" ? `
          <p class="helper">准备好了，先生成页面内容。</p>
          ${profileSelectHtml}
          <div class="action-row">
            <button class="button button-primary" data-review-action="generate-svg">开始生成页面</button>
            ${modelConfigButtonHtml}
          </div>
        ` : ""}

        ${phase === "generating" ? `
          <div class="status-card status-info">
            <strong>${svgGen.totalPages > 0 ? (svgGen.mode === "regenerate" ? "重新生成中..." : "生成中...") : "任务运行中..."}</strong>
            ${svgGen.totalPages > 0 ? `
              <div class="progress-bar" role="progressbar" aria-valuenow="${Math.round((svgGen.generatedPages / svgGen.totalPages) * 100)}" aria-valuemax="100" aria-label="页面生成进度">
                <div class="progress-fill" style="width: ${Math.round((svgGen.generatedPages / svgGen.totalPages) * 100)}%"></div>
              </div>
              <p class="helper">正在生成第 ${svgGen.generatedPages} / ${svgGen.totalPages} 页，已完成 ${Math.round((svgGen.generatedPages / svgGen.totalPages) * 100)}%</p>
            ` : `
              <div class="loading-indicator loading-indicator-roomy">
                <div class="loading-spinner"></div>
              </div>
              <p class="helper">系统正在准备生成任务，请稍候...</p>
            `}
          </div>
          <div class="log-panel">
            <pre class="status-log">${svgGen.log.slice(-10).map((line) => escapeHtml(line)).join("\n")}</pre>
          </div>
        ` : ""}

        ${phase === "ready-notes" ? `
          <p class="helper">页面已经生成，接下来补齐讲稿备注。</p>
          ${profileSelectHtml}
          <div class="action-row">
            <button class="button button-primary" data-review-action="generate-notes">生成讲稿备注</button>
            ${modelConfigButtonHtml}
          </div>
        ` : ""}

        ${phase === "complete" ? `
          <p class="helper">页面和讲稿都准备好了，可以开始导出 PPT。</p>
          <div class="action-row">
            <button class="button button-primary" data-jump-step="post">去导出 PPT</button>
          </div>
        ` : ""}
      </section>

      ${svgPreviewHtml}
      ${phase === "complete" ? renderNextStepGuide("executor") : ""}
    </div>
  `;
}

function renderPipelineStep() {
  if (!state.selectedProject) {
    return renderLockedStage("请先创建或选择一个项目，再整理导出文件。");
  }

  return `
    <div class="stack">
      ${state.steps.map((step, index) => {
        const stepState = getProjectStepState(state.selectedProject, step.id);
        const guide = PIPELINE_GUIDE[step.id] || {};
        const checklist = getPipelineChecklist(state.selectedProject, step.id);
        const outputs = getPipelineOutputs(state.selectedProject, step.id);
        return `
          <section class="step-card">
            <div class="step-card-top">
              <div>
                <p class="section-kicker">整理步骤 ${index + 1}</p>
                <h3 class="card-title">${escapeHtml(step.label)}</h3>
                <p class="helper">${escapeHtml(guide.description || "")}</p>
                <p class="step-state ${stepState.disabled ? "step-state-warn" : "step-state-ok"}">${escapeHtml(stepState.reason)}</p>
              </div>
              <button
                class="button button-secondary step-card-run"
                data-run-step="${escapeHtml(step.id)}"
                ${stepState.disabled ? "disabled" : ""}
              >
                开始 ${escapeHtml(step.label)}
              </button>
            </div>
            <div class="step-card-grid">
              <div class="detail-block">
                <p class="detail-title">前置条件</p>
                <div class="checklist">
                  ${checklist.map((item) => `
                    <div class="checklist-item ${item.ok ? "checklist-item-ok" : "checklist-item-warn"}">
                      <span class="check-indicator">${item.ok ? "就绪" : "待处理"}</span>
                      <span>${escapeHtml(item.label)}</span>
                    </div>
                  `).join("")}
                </div>
              </div>
              <div class="detail-block">
                <p class="detail-title">本步产出</p>
                <div class="badge-row">
                  ${outputs.map((item) => metric("产出", item)).join("")}
                </div>
              </div>
            </div>
            <pre class="command-preview">${escapeHtml(guide.command || "")}</pre>
          </section>
        `;
      }).join("")}
    </div>
  `;
}

function renderLinks(items, emptyText) {
  if (!items || items.length === 0) {
    return `<p class="helper">${escapeHtml(emptyText)}</p>`;
  }
  return items.map((item) => {
    return `<a class="button button-ghost" href="${encodeURI(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.name)}</a>`;
  }).join("");
}

function renderSlides(slides) {
  if (!slides || slides.length === 0) {
    return `<p class="helper">还没有可预览的页面。</p>`;
  }
  const cacheBuster = Date.now();
  return slides.map((slide, index) => {
    const url = slide.url;
    const urlWithCache = url + (url.includes("?") ? `&t=${cacheBuster}` : `?t=${cacheBuster}`);
    return `
      <a class="slide-thumb" href="#" data-svg-preview="${index}" data-svg-url="${encodeURI(slide.url)}">
        <img loading="lazy" src="${urlWithCache}" alt="${escapeHtml(slide.name)}">
        <span>${escapeHtml(slide.name)}</span>
      </a>
    `;
  }).join("");
}

function openSvgPreviewModal(slides, startIndex = 0) {
  if (!slides || slides.length === 0) {
    return;
  }

  state.svgPreview.slides = slides;
  state.svgPreview.currentIndex = startIndex;
  updateSvgPreviewDisplay();

  if (elements.svgPreviewModal) {
    elements.svgPreviewModal.classList.remove("hidden");
    elements.svgPreviewModal.setAttribute("aria-hidden", "false");
  }
  trapFocus(elements.svgPreviewModal);
}

function closeSvgPreviewModal() {
  if (elements.svgPreviewModal) {
    elements.svgPreviewModal.classList.add("hidden");
    elements.svgPreviewModal.setAttribute("aria-hidden", "true");
  }
  releaseFocus();
  state.svgPreview.slides = [];
  state.svgPreview.currentIndex = 0;
}

function updateSvgPreviewDisplay() {
  const { slides, currentIndex } = state.svgPreview;
  if (!slides || slides.length === 0) {
    return;
  }

  const slide = slides[currentIndex];
  const url = slide?.url || "";
  // Add timestamp to prevent caching
  const cacheBuster = `?t=${Date.now()}`;
  const urlWithCache = url + (url.includes("?") ? `&t=${Date.now()}` : cacheBuster);

  if (elements.svgPreviewObject) {
    elements.svgPreviewObject.data = urlWithCache;
  }
  if (elements.svgPreviewImg) {
    elements.svgPreviewImg.src = urlWithCache;
    elements.svgPreviewImg.alt = slide?.name || "页面预览";
  }
  if (elements.svgPageIndicator) {
    elements.svgPageIndicator.textContent = `第 ${currentIndex + 1} 页 / 共 ${slides.length} 页`;
  }
  if (elements.svgOpenNewButton) {
    elements.svgOpenNewButton.href = urlWithCache;
  }
  if (elements.svgPrevButton) {
    elements.svgPrevButton.disabled = currentIndex === 0;
  }
  if (elements.svgNextButton) {
    elements.svgNextButton.disabled = currentIndex === slides.length - 1;
  }
}

function navigateSvgPreview(direction) {
  const { slides, currentIndex } = state.svgPreview;
  if (!slides || slides.length === 0) {
    return;
  }

  let newIndex = currentIndex + direction;
  if (newIndex < 0) {
    newIndex = 0;
  } else if (newIndex >= slides.length) {
    newIndex = slides.length - 1;
  }

  state.svgPreview.currentIndex = newIndex;
  updateSvgPreviewDisplay();
}

async function openDocPreview(title, url) {
  state.docPreview = {
    isOpen: true,
    title: title,
    content: "加载中...",
    url: url,
  };

  if (elements.docPreviewModal) {
    elements.docPreviewModal.classList.remove("hidden");
    elements.docPreviewModal.setAttribute("aria-hidden", "false");
  }
  trapFocus(elements.docPreviewModal);
  if (elements.docPreviewTitle) {
    elements.docPreviewTitle.textContent = title;
  }
  if (elements.docPreviewText) {
    elements.docPreviewText.textContent = "加载中...";
  }
  if (elements.docPreviewOpenButton) {
    elements.docPreviewOpenButton.href = url;
  }
  document.body.classList.add("modal-open");

  // Fetch document content
  try {
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const content = await response.text();
    state.docPreview.content = content;
    if (elements.docPreviewText) {
      elements.docPreviewText.textContent = content;
    }
  } catch (error) {
    state.docPreview.content = `加载失败: ${error.message}`;
    if (elements.docPreviewText) {
      elements.docPreviewText.textContent = state.docPreview.content;
    }
  }
}

function closeDocPreview() {
  state.docPreview = {
    isOpen: false,
    title: "",
    content: "",
    url: "",
  };
  if (elements.docPreviewModal) {
    elements.docPreviewModal.classList.add("hidden");
    elements.docPreviewModal.setAttribute("aria-hidden", "true");
  }
  releaseFocus();
  document.body.classList.remove("modal-open");
}

function renderDocLink(item, options = {}) {
  if (!item || !item.url) {
    return options.emptyText || '<span class="helper">无</span>';
  }
  const title = item.name || "文档";
  const escapedTitle = escapeHtml(title);
  const escapedUrl = encodeURI(item.url);
  return `
    <span class="preview-link" data-doc-preview="${escapedUrl}" data-doc-title="${escapedTitle}">
      ${escapedTitle}
    </span>
  `;
}

function renderDeliverStep() {
  if (!state.selectedProject) {
    return renderLockedStage("请先创建或选择一个项目，再查看导出结果。");
  }

  const project = state.selectedProject;
  const deliverySummary = [
    metric("PPT 文件", project.pptx_files.length, project.pptx_files.length > 0),
    metric("最终页面", project.svg_final_count, project.svg_final_count > 0),
    metric("逐页讲稿", project.split_notes_count || 0, (project.split_notes_count || 0) > 0),
    metric("来源内容", project.source_count, project.source_count > 0),
  ].join("");
  return `
    <div class="stack">
      <section class="subpanel">
        <div class="section-head">
          <p class="section-kicker">交付概览</p>
          <h2>交付总览</h2>
        </div>
        <div class="badge-row">${deliverySummary}</div>
      </section>

      <section class="subpanel">
        <div class="section-head">
          <p class="section-kicker">关键文档</p>
          <h2>关键文档</h2>
        </div>
        <div class="asset-actions">
          ${renderDocLink(project.total_notes, { emptyText: '<span class="helper">还没有讲稿总表</span>' })}
          ${renderDocLink(project.design_spec, { emptyText: '<span class="helper">还没有方案说明文件</span>' })}
        </div>
      </section>

      <section class="subpanel">
        <div class="section-head">
          <p class="section-kicker">导出文件</p>
          <h2>PPT 文件</h2>
        </div>
        <div class="asset-actions">${renderLinks(project.pptx_files, "还没有导出的演示文稿文件")}</div>
      </section>

      <section class="subpanel">
        <div class="section-head">
          <p class="section-kicker">来源归档</p>
          <h2>归档来源</h2>
        </div>
        <div class="asset-actions">${project.source_markdown && project.source_markdown.length > 0 ? project.source_markdown.map((item) => renderDocLink(item)).join("") : '<p class="helper">还没有归档的来源内容</p>'}</div>
      </section>

      <section class="subpanel">
        <div class="section-head">
          <p class="section-kicker">页面预览</p>
          <h2>页面文件预览</h2>
        </div>
        <div class="asset-actions">${renderLinks(project.all_slides, "还没有页面预览文件")}</div>
        <div class="preview-grid">${renderSlides(project.preview_slides)}</div>
      </section>
    </div>
  `;
}

function renderPostStep() {
  if (!state.selectedProject) {
    return renderLockedStage("请先创建或选择一个项目，再进入导出检查。");
  }

  const project = state.selectedProject;
  const preflight = [
    {
      label: "页面内容",
      ok: project.svg_output_count > 0,
      desc: project.svg_output_count > 0 ? `已生成 ${project.svg_output_count} 页页面内容` : "还没有页面内容，请先完成页面生成。",
    },
    {
      label: "讲稿总表",
      ok: project.has_total_notes,
      desc: project.has_total_notes ? "讲稿总表已准备好，可以继续整理" : "还没有讲稿总表，请先生成讲稿备注。",
    },
    {
      label: "逐页讲稿备注",
      ok: (project.split_notes_count || 0) > 0,
      desc: (project.split_notes_count || 0) > 0 ? `已整理 ${project.split_notes_count} 份逐页备注` : "还没有整理成逐页备注。",
    },
    {
      label: "最终页面文件",
      ok: project.svg_final_count > 0,
      desc: project.svg_final_count > 0 ? `最终页面文件已准备好（${project.svg_final_count} 页）` : "最终页面文件还没有整理完成。",
    },
  ];

  return `
    <div class="stack">
      <section class="subpanel">
        <div class="section-head">
          <p class="section-kicker">导出前检查</p>
          <h2>导出前检查</h2>
        </div>
        <div class="status-grid">
          ${preflight.map((item) => `
            <article class="status-card ${item.ok ? "status-ok" : "status-warn"}">
              <strong>${escapeHtml(item.label)}</strong>
              <p class="helper">${escapeHtml(item.desc)}</p>
            </article>
          `).join("")}
        </div>
        <div class="action-row">
          <button class="button button-secondary" data-review-action="validate">检查项目</button>
          <button class="button button-ghost" data-review-action="refresh">刷新项目状态</button>
          <button class="button button-ghost" data-jump-step="executor">回到内容生成</button>
        </div>
      </section>

      <section class="subpanel">
        <div class="section-head">
          <p class="section-kicker">检查结果</p>
          <h2>校验结果</h2>
        </div>
        ${renderValidationDetails()}
      </section>

      ${renderPipelineStep()}
      ${renderDeliverStep()}
    </div>
  `;
}

function renderStage() {
  const stage = FLOW_STEPS.find((item) => item.id === state.activeStepId) || FLOW_STEPS[0];
  elements.stageKicker.textContent = stage.kicker;
  elements.stageTitle.textContent = stage.title;
  elements.stageDescription.textContent = stage.description;

  let html = "";
  if (stage.id === "project") {
    html = renderProjectStep();
  } else if (stage.id === "sources") {
    html = renderSourcesStep();
  } else if (stage.id === "template") {
    html = renderTemplateStep();
    // Load templates on first render
    if (state.templates.length === 0 && !state.templatesLoading) {
      loadTemplates();
    }
  } else if (stage.id === "strategist") {
    html = renderStrategistStep();
  } else if (stage.id === "images") {
    html = renderImagesStep();
  } else if (stage.id === "executor") {
    html = renderExecutorStep();
  } else if (stage.id === "post") {
    html = renderPostStep();
  }

  elements.stageBody.innerHTML = html;
  bindStageEvents();
}

function bindStageEvents() {
  elements.stageBody.querySelector("#createProjectForm")?.addEventListener("submit", createProject);
  elements.stageBody.querySelector("#importForm")?.addEventListener("submit", importSources);
  elements.stageBody.querySelector("#projectFilterInput")?.addEventListener("input", (event) => {
    const nextValue = event.currentTarget.value || "";
    state.projectFilter = nextValue;
    renderStage();
    const nextInput = elements.stageBody.querySelector("#projectFilterInput");
    if (nextInput) {
      nextInput.focus();
      nextInput.setSelectionRange(nextValue.length, nextValue.length);
    }
  });

  elements.stageBody.querySelectorAll("[data-project-select]").forEach((button) => {
    button.addEventListener("click", () => selectProject(button.dataset.projectSelect, { stepId: "sources" }));
  });

  elements.stageBody.querySelectorAll("[data-jump-step]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeStepId = button.dataset.jumpStep;
      renderStepRail();
      renderStage();
    });
  });

  elements.stageBody.querySelectorAll('[data-review-action="validate"]').forEach((button) => {
    button.addEventListener("click", () => {
      validateProject(state.selectedProject.name);
    });
  });
  elements.stageBody.querySelectorAll('[data-review-action="refresh"]').forEach((button) => {
    button.addEventListener("click", () => {
      selectProject(state.selectedProject.name);
    });
  });
  elements.stageBody.querySelectorAll('[data-review-action="generate-notes"]').forEach((button) => {
    button.addEventListener("click", () => {
      generateNotes(state.selectedProject.name);
    });
  });
  elements.stageBody.querySelectorAll('[data-review-action="generate-svg"]').forEach((button) => {
    button.addEventListener("click", () => {
      generateSvg(state.selectedProject.name);
    });
  });
  elements.stageBody.querySelectorAll('[data-review-action="regenerate-svg"]').forEach((button) => {
    button.addEventListener("click", () => {
      regenerateSvg(state.selectedProject.name);
    });
  });
  elements.stageBody.querySelectorAll('[data-review-action="regenerate-all"]').forEach((button) => {
    button.addEventListener("click", () => {
      regenerateAllSvg(state.selectedProject.name);
    });
  });
  elements.stageBody.querySelectorAll('[data-review-action="delete-all-svg"]').forEach((button) => {
    button.addEventListener("click", () => {
      deleteAllSvg(state.selectedProject.name);
    });
  });
  elements.stageBody.querySelectorAll('[data-review-action="open-model-config"]').forEach((button) => {
    button.addEventListener("click", openModelConfigModal);
  });
  elements.stageBody.querySelector("#reviewProfileSelect")?.addEventListener("change", (event) => {
    selectModelProfile(event.currentTarget.value, { quiet: true });
  });

  // Image generation events
  elements.stageBody.querySelectorAll("[data-image-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.imageAction;
      if (action === "generate") {
        if (state.selectedProject) {
          generateImage(state.selectedProject.name);
        }
      } else if (action === "open-config") {
        openImageModelModal();
        renderImageModelModal();
      }
    });
  });

  // Single image generation from resource list
  elements.stageBody.querySelectorAll("[data-generate-single-image]").forEach((button) => {
    button.addEventListener("click", () => {
      const idx = parseInt(button.dataset.generateSingleImage, 10);
      const imageResources = state.selectedProject?.image_resources || [];
      const img = imageResources[idx];
      if (img && state.selectedProject) {
        generateSingleImageFromResource(state.selectedProject.name, img, idx);
      }
    });
  });

  // Batch generate all pending images
  elements.stageBody.querySelectorAll("[data-generate-all-images]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.selectedProject) {
        generateAllPendingImages(state.selectedProject.name);
      }
    });
  });

  elements.stageBody.querySelector("#imageProfileSelect")?.addEventListener("change", (event) => {
    selectImageProfile(event.currentTarget.value);
  });

  elements.stageBody.querySelectorAll("[data-run-step]").forEach((button) => {
    button.addEventListener("click", () => runStep(state.selectedProject.name, button.dataset.runStep));
  });

  // Template selection events
  elements.stageBody.querySelectorAll("[data-template-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.templateAction;
      if (action === "refresh") {
        state.templates = [];
        loadTemplates();
      } else if (action === "apply") {
        if (state.selectedProject && state.selectedTemplateId) {
          applyTemplate(state.selectedProject.name, state.selectedTemplateId);
        }
      } else if (action === "skip") {
        // Skip to strategist step
        state.activeStepId = "strategist";
        renderStepRail();
        renderStage();
      }
    });
  });

  elements.stageBody.querySelectorAll("[data-template-id]").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedTemplateId = card.dataset.templateId;
      renderStage();
    });
  });

  elements.stageBody.querySelectorAll("[data-template-free]").forEach((radio) => {
    radio.addEventListener("change", () => {
      if (radio.checked) {
        state.selectedTemplateId = null;
        renderStage();
      }
    });
  });

  // Document preview events (using event delegation)
  elements.stageBody.querySelectorAll("[data-doc-preview]").forEach((el) => {
    el.addEventListener("click", (event) => {
      event.preventDefault();
      const url = el.dataset.docPreview;
      const title = el.dataset.docTitle || "文档预览";
      if (url) {
        openDocPreview(title, url);
      }
    });
  });

  // SVG preview events
  elements.stageBody.querySelectorAll("[data-svg-preview]").forEach((thumb) => {
    thumb.addEventListener("click", (event) => {
      event.preventDefault();
      const index = parseInt(thumb.dataset.svgPreview, 10);
      const slides = state.selectedProject?.all_slides || state.selectedProject?.preview_slides || [];
      if (slides.length > 0) {
        openSvgPreviewModal(slides, index);
      }
    });
  });

  // Strategist events
  elements.stageBody.querySelectorAll("[data-strategist-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.strategistAction;
      if (action === "analyze") {
        analyzeProject();
      } else if (action === "reanalyze") {
        state.strategistAnalysis = null;
        analyzeProject();
      }
    });
  });

  // Strategist form submission
  elements.stageBody.querySelector("#strategistForm")?.addEventListener("submit", saveDesignSpec);

  // Strategist form input changes
  elements.stageBody.querySelectorAll("[data-confirmation]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const key = event.target.dataset.confirmation;
      if (key) {
        state.eightConfirmations[key] = event.target.value;
      }
    });
    input.addEventListener("input", (event) => {
      const key = event.target.dataset.confirmation;
      if (key) {
        state.eightConfirmations[key] = event.target.value;
      }
    });
  });

  // Color input sync
  elements.stageBody.querySelectorAll("input[type='color']").forEach((colorInput) => {
    colorInput.addEventListener("input", (event) => {
      const key = event.target.dataset.confirmation;
      if (key) {
        state.eightConfirmations[key] = event.target.value;
        // Sync to text input
        const textInput = elements.stageBody.querySelector(`[data-confirmation="${key}-text"]`);
        if (textInput) {
          textInput.value = event.target.value;
        }
      }
    });
  });

  // ============ Next Step Guide ============
  elements.stageBody.querySelectorAll("[data-next-step]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeStepId = button.dataset.nextStep;
      renderStepRail();
      renderStage();
    });
  });

  // ============ Collapsible Sections ============
  elements.stageBody.querySelectorAll("[data-collapsible] .collapsible-header").forEach((header) => {
    header.addEventListener("click", () => {
      const section = header.closest("[data-collapsible]");
      if (section) {
        section.classList.toggle("collapsible-open");
      }
    });
  });

  // ============ Inline Validation ============
  const projectNameInput = elements.stageBody.querySelector('input[name="project_name"]');
  if (projectNameInput) {
    projectNameInput.addEventListener("blur", () => {
      validateField(projectNameInput, {
        required: true,
        requiredMsg: "项目名不能为空",
        pattern: /^[a-zA-Z0-9_\-\u4e00-\u9fff]+$/,
        patternMsg: "项目名只能包含字母、数字、下划线、中划线或中文",
      });
    });
  }
}

function renderAll(options = {}) {
  const { stats = true, context = true, rail = true, stage = true } = options;
  if (stats) renderStats();
  renderUserBadge();
  renderHeroStatus();
  if (context) renderProjectContext();
  if (rail) renderStepRail();
  if (stage) renderStage();
}

function renderInitializationError(error) {
  const statusText = error?.status ? `HTTP ${error.status}` : "Request failed";
  const pathText = error?.path || "/api/dashboard";
  const detail = error?.message || "未知错误";

  elements.projectContext.innerHTML = `
    <div class="context-empty">
      <strong>工作台暂时打不开</strong>
      <p class="context-text">页面已经加载出来了，但后台服务暂时没有正常响应，所以项目、账号和流程数据还不能显示。</p>
      <div class="detail-block">
        <p class="detail-title">当前情况</p>
        <p class="helper">请求接口：${escapeHtml(pathText)}</p>
        <p class="helper">返回状态：${escapeHtml(statusText)}</p>
        <p class="helper">错误详情：${escapeHtml(detail)}</p>
      </div>
      <div class="detail-block">
        <p class="detail-title">你可以这样处理</p>
        <ul class="context-list">
          <li>确认你打开的是 Web 服务首页，而不是单独打开的静态 HTML 文件。</li>
          <li>如果刚更新过后端，先重启服务，再刷新当前页面。</li>
          <li>推荐使用 <code>python3 webapp/server.py</code> 启动服务。</li>
        </ul>
      </div>
    </div>
  `;

  elements.stageKicker.textContent = "系统状态";
  elements.stageTitle.textContent = "后台服务暂时不可用";
  elements.stageDescription.textContent = "页面已进入保护模式，等待后台服务恢复。";
  elements.stageBody.innerHTML = `
    <div class="status-card status-error">
      <strong>现在还不能继续操作</strong>
      <p class="helper">后台服务恢复后，刷新页面就可以重新进入正常工作台。</p>
      <pre class="status-log">${escapeHtml(`${statusText}\n${pathText}\n${detail}`)}</pre>
    </div>
  `;
}

function syncSelectedProject() {
  if (!state.selectedProject) {
    return;
  }
  const refreshed = getSelectedProjectByRef(getProjectRef(state.selectedProject));
  state.selectedProject = refreshed;
  if (!state.selectedProject) {
    state.validation = null;
    state.activeStepId = "project";
  }
}

async function loadDashboard({ preserveSelection = true } = {}) {
  const data = await apiFetch("/api/dashboard");
  state.user = data.user || state.user;
  state.formats = data.formats;
  state.steps = data.steps;
  state.projects = data.projects;
  state.modelConfig = data.model_config || createEmptyModelConfig();

  if (!preserveSelection) {
    state.selectedProject = null;
    state.validation = null;
  }

  syncSelectedProject();

  if (!state.selectedProject) {
    state.activeStepId = "project";
  }

  // Also load image model config
  loadImageModelConfig().catch(() => {});

  renderAll();
  if (elements.modelConfigModal && !elements.modelConfigModal.classList.contains("hidden")) {
    renderModelConfigModal();
  }
}

async function loadCurrentUser() {
  const data = await apiFetch("/api/me");
  state.user = data.user || null;
}

async function saveAccountSettings(event) {
  event.preventDefault();
  if (!state.user) {
    return;
  }

  const displayName = elements.accountDisplayNameInput?.value?.trim() || "";
  const currentPassword = elements.accountCurrentPasswordInput?.value || "";
  const nextPassword = elements.accountNewPasswordInput?.value || "";

  if (!displayName) {
    showFlash("显示名不能为空。", "error");
    elements.accountDisplayNameInput?.focus();
    return;
  }
  if (nextPassword && nextPassword.length < 6) {
    showFlash("新密码至少需要 6 位。", "error");
    elements.accountNewPasswordInput?.focus();
    return;
  }
  if (nextPassword && !currentPassword) {
    showFlash("修改密码时请先输入当前密码。", "error");
    elements.accountCurrentPasswordInput?.focus();
    return;
  }

  const payload = { display_name: displayName };
  if (nextPassword) {
    payload.current_password = currentPassword;
    payload.password = nextPassword;
  }

  const data = await apiFetch("/api/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  state.user = data.user || state.user;
  renderUserBadge();
  renderAccountSettingsModal();
  closeAccountSettingsModal();
  showFlash(nextPassword ? "账号信息和密码都已更新。" : "账号信息已更新。");
}

function renderUserBadge() {
  if (!elements.userBadge || !elements.logoutButton) {
    return;
  }
  if (!state.user) {
    elements.userBadge.classList.add("hidden");
    elements.openAccountSettingsButton?.classList.add("hidden");
    elements.logoutButton.classList.add("hidden");
    elements.openAdminPanelButton?.classList.add("hidden");
    document.body.classList.remove("is-admin", "is-user");
    return;
  }
  elements.userBadge.textContent = `${state.user.display_name || state.user.username} · ${state.user.role}`;
  elements.userBadge.classList.remove("hidden");
  elements.openAccountSettingsButton?.classList.remove("hidden");
  elements.logoutButton.classList.remove("hidden");
  if (elements.openAdminPanelButton) {
    if (state.user.role === "admin") {
      elements.openAdminPanelButton.classList.remove("hidden");
    } else {
      elements.openAdminPanelButton.classList.add("hidden");
    }
  }
  document.body.classList.toggle("is-admin", state.user.role === "admin");
  document.body.classList.toggle("is-user", state.user.role !== "admin");
}

async function logout() {
  try {
    await apiFetch("/auth/logout", { method: "POST", body: JSON.stringify({}) });
  } catch (error) {
    console.error("Logout failed:", error);
  } finally {
    window.location.href = "/login";
  }
}

async function loadAdminData() {
  if (state.user?.role !== "admin") {
    return;
  }
  const userOffset = (state.admin.page - 1) * state.admin.pageSize;
  const auditOffset = (state.admin.auditPage - 1) * state.admin.auditPageSize;
  const userParams = new URLSearchParams();
  if (state.admin.userQuery) userParams.set("q", state.admin.userQuery);
  if (state.admin.roleFilter) userParams.set("role", state.admin.roleFilter);
  if (state.admin.statusFilter) userParams.set("status", state.admin.statusFilter);
  if (state.admin.providerFilter) userParams.set("provider", state.admin.providerFilter);
  userParams.set("limit", String(state.admin.pageSize));
  userParams.set("offset", String(userOffset));

  const auditParams = new URLSearchParams();
  if (state.admin.selectedUserId) auditParams.set("user_id", state.admin.selectedUserId);
  if (state.admin.auditAction) auditParams.set("action", state.admin.auditAction);
  if (state.admin.auditResource) auditParams.set("resource_type", state.admin.auditResource);
  if (state.admin.auditStart) auditParams.set("start", state.admin.auditStart);
  if (state.admin.auditEnd) auditParams.set("end", state.admin.auditEnd);
  auditParams.set("limit", String(state.admin.auditPageSize));
  auditParams.set("offset", String(auditOffset));

  const [usersData, logsData] = await Promise.all([
    apiFetch(`/api/admin/users?${userParams.toString()}`),
    apiFetch(`/api/admin/audit-logs?${auditParams.toString()}`),
  ]);
  state.admin.users = usersData.users || [];
  state.admin.totalUsers = usersData.total || 0;
  state.admin.logs = logsData.logs || [];
  state.admin.totalLogs = logsData.total || 0;
}

function formatGroups(groups = []) {
  return Array.isArray(groups) ? groups.join(", ") : "";
}

function parseGroups(value = "") {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDateTimeLocal(date) {
  const pad = (num) => String(num).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + "T" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join(":");
}

function setAuditRange(hoursBack) {
  const end = new Date();
  const start = new Date(end.getTime() - hoursBack * 60 * 60 * 1000);
  state.admin.auditStart = formatDateTimeLocal(start);
  state.admin.auditEnd = formatDateTimeLocal(end);
  state.admin.auditPage = 1;
  loadAdminData().then(renderAdminPanel).catch((error) => showFlash(error.message, "error"));
}

function buildAuditExportUrl() {
  const params = new URLSearchParams();
  if (state.admin.selectedUserId) params.set("user_id", state.admin.selectedUserId);
  if (state.admin.auditAction) params.set("action", state.admin.auditAction);
  if (state.admin.auditResource) params.set("resource_type", state.admin.auditResource);
  if (state.admin.auditStart) params.set("start", state.admin.auditStart);
  if (state.admin.auditEnd) params.set("end", state.admin.auditEnd);
  return `/api/admin/audit-logs/export?${params.toString()}`;
}

async function copyAuditLogs() {
  const rows = (state.admin.logs || []).map((log) => {
    return `[${log.created_at}] ${log.action} ${log.resource_type}:${log.resource_id || "-"} user=${log.user_id || "-"} ${JSON.stringify(log.details || {})}`;
  }).join("\n");
  if (!rows) {
    showFlash("当前没有可复制的访问记录。", "error");
    return;
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(rows);
    showFlash("当前访问记录已复制。");
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = rows;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
  showFlash("当前访问记录已复制。");
}

async function updateAdminUser(userId, payload) {
  await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  await loadAdminData();
  if (state.admin.selectedUserId) {
    await loadAdminUserDetail(state.admin.selectedUserId);
  }
  renderAdminPanel();
}

async function createAdminUser(payload) {
  const data = await apiFetch("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  await loadAdminData();
  const createdUserId = data?.user?.id || null;
  if (createdUserId) {
    state.admin.selectedUserId = createdUserId;
    await loadAdminUserDetail(createdUserId);
  } else if (state.admin.selectedUserId) {
    await loadAdminUserDetail(state.admin.selectedUserId);
  }
  renderAdminPanel();
}

async function purgeUserSessions(userId) {
  await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/sessions/purge`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  await loadAdminData();
  if (state.admin.selectedUserId) {
    await loadAdminUserDetail(state.admin.selectedUserId);
  }
  renderAdminPanel();
}

async function loadAdminUserDetail(userId) {
  if (!userId) {
    state.admin.userDetail = null;
    return;
  }
  const data = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}`);
  state.admin.userDetail = data || null;
}

function renderAdminPanel() {
  if (!elements.adminUsersList || !elements.adminAuditLog) {
    return;
  }
  if (elements.adminUserSearchInput) {
    elements.adminUserSearchInput.value = state.admin.userQuery || "";
  }
  if (elements.adminRoleFilter) {
    elements.adminRoleFilter.value = state.admin.roleFilter || "";
  }
  if (elements.adminStatusFilter) {
    elements.adminStatusFilter.value = state.admin.statusFilter || "";
  }
  if (elements.adminProviderFilter) {
    elements.adminProviderFilter.value = state.admin.providerFilter || "";
  }
  if (elements.adminAuditActionInput) {
    elements.adminAuditActionInput.value = state.admin.auditAction || "";
  }
  if (elements.adminAuditResourceInput) {
    elements.adminAuditResourceInput.value = state.admin.auditResource || "";
  }
  if (elements.adminAuditStartInput) {
    elements.adminAuditStartInput.value = state.admin.auditStart || "";
  }
  if (elements.adminAuditEndInput) {
    elements.adminAuditEndInput.value = state.admin.auditEnd || "";
  }
  const activeUserFilters = [];
  if (state.admin.userQuery) activeUserFilters.push(`搜索: ${state.admin.userQuery}`);
  if (state.admin.roleFilter) activeUserFilters.push(`角色: ${state.admin.roleFilter === "admin" ? "管理员" : "普通用户"}`);
  if (state.admin.statusFilter) activeUserFilters.push(`状态: ${state.admin.statusFilter}`);
  if (state.admin.providerFilter) activeUserFilters.push(`来源: ${state.admin.providerFilter}`);
  if (elements.adminUsersSummary) {
    elements.adminUsersSummary.textContent = activeUserFilters.length
      ? `当前筛选 ${activeUserFilters.join(" / ")} · 本页 ${state.admin.users.length} 人，共 ${state.admin.totalUsers} 人`
      : `当前显示全部用户 · 本页 ${state.admin.users.length} 人，共 ${state.admin.totalUsers} 人`;
    elements.adminUsersSummary.title = elements.adminUsersSummary.textContent;
  }
  elements.adminUsersList.innerHTML = (state.admin.users || []).map((user) => `
    <article class="pm-item admin-user-card ${state.admin.selectedUserId === user.id ? "pm-item-active" : ""}" data-admin-user-id="${escapeHtml(user.id)}" data-admin-active="${user.is_active ? "1" : "0"}">
      <div class="admin-user-card-top">
        <div class="admin-user-main">
          <h3 class="pm-item-name" title="${escapeHtml(user.display_name || user.username)}">${escapeHtml(user.display_name || user.username)}</h3>
          <p class="pm-item-meta" title="${escapeHtml(user.email)}">${escapeHtml(user.email)}</p>
        </div>
        <span class="badge ${user.is_active ? "badge-positive" : ""}">${user.is_active ? "启用" : "禁用"}</span>
      </div>
      <div class="pm-item-badges admin-user-meta-badges">
        <span class="badge">${escapeHtml(user.role === "admin" ? "管理员" : "普通用户")}</span>
        ${(user.groups || []).slice(0, 4).map((group) => `<span class="badge">${escapeHtml(group)}</span>`).join("")}
      </div>
      <div class="admin-user-summary">
        <span title="${escapeHtml(user.last_login_at || "-")}">最近登录：${escapeHtml(user.last_login_at || "-")}</span>
      </div>
      <div class="admin-user-controls">
        <label class="field admin-field">
          <span>角色</span>
          <select data-admin-role>
            <option value="user" ${user.role === "user" ? "selected" : ""}>普通用户</option>
            <option value="admin" ${user.role === "admin" ? "selected" : ""}>管理员</option>
          </select>
        </label>
        <label class="field admin-field">
          <span>分组（逗号分隔）</span>
          <input type="text" data-admin-groups value="${escapeHtml(formatGroups(user.groups))}">
        </label>
        <div class="action-row admin-actions">
          <button type="button" class="button button-secondary" data-admin-action="save">保存</button>
          <button type="button" class="button button-ghost" data-admin-action="toggle-active">${user.is_active ? "禁用" : "启用"}</button>
          <button type="button" class="button button-ghost" data-admin-action="purge-sessions">强制下线</button>
        </div>
      </div>
    </article>
  `).join("") || `
    <div class="admin-empty-state">
      <strong>没有匹配的用户</strong>
      <p class="helper">试试清空搜索词，或者放宽角色/状态筛选条件。</p>
      <div class="action-row">
        <button type="button" class="button button-secondary button-small" data-admin-empty-action="focus-create-user">创建本地账号</button>
      </div>
    </div>
  `;
  const logRows = (state.admin.logs || []).map((log) => {
    const userLabel = log.user_display_name || log.user_email || log.user_id || "-";
    const detailText = JSON.stringify(log.details || {});
    const compactDetail = truncateText(detailText, 240);
    return `
      <div class="admin-audit-row" data-audit-user="${escapeHtml(log.user_id || "")}">
        <div class="admin-audit-topline">
          <strong>${escapeHtml(log.action)}</strong>
          <span class="helper">${escapeHtml(log.created_at)}</span>
        </div>
        <p class="admin-audit-resource" title="${escapeHtml(`${log.resource_type}:${log.resource_id || "-"}`)}">${escapeHtml(log.resource_type)}:${escapeHtml(log.resource_id || "-")}</p>
        <div class="admin-audit-meta">
          <span>账号：</span>
          ${log.user_id ? `<span class="admin-audit-link" data-admin-audit-user="${escapeHtml(log.user_id)}" title="${escapeHtml(userLabel)}">${escapeHtml(truncateText(userLabel, 48))}</span>` : `<span title="${escapeHtml(userLabel)}">${escapeHtml(truncateText(userLabel, 48))}</span>`}
        </div>
        <div class="admin-audit-detail" title="${escapeHtml(detailText)}">${escapeHtml(compactDetail)}</div>
      </div>
    `;
  }).join("");
  elements.adminAuditLog.innerHTML = logRows || `
    <div class="admin-empty-state">
      <strong>当前条件下没有审计日志</strong>
      <p class="helper">可以缩短时间范围，或者清空动作/资源类型筛选后再查看。</p>
    </div>
  `;

  if (elements.adminAuditSummary) {
    const counts = {};
    (state.admin.logs || []).forEach((log) => {
      const key = log.action || "未分类";
      counts[key] = (counts[key] || 0) + 1;
    });
    const sortedCounts = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const primaryCounts = sortedCounts.slice(0, 4);
    const overflowCount = sortedCounts.slice(4).reduce((sum, [, count]) => sum + count, 0);
    const statBadges = primaryCounts.map(([action, count]) => {
      return `<span class="badge" title="${escapeHtml(action)}: ${count}">${escapeHtml(truncateText(action, 24))}: ${count}</span>`;
    }).join("");
    const overflowBadge = overflowCount > 0 ? `<span class="badge" title="其余动作共 ${overflowCount} 条">其他：${overflowCount}</span>` : "";
    elements.adminAuditSummary.innerHTML = `
      <span class="badge">总计：${state.admin.totalLogs}</span>
      ${statBadges || `<span class="helper">暂无统计</span>`}
      ${overflowBadge}
    `;
  }

  if (elements.adminPageIndicator) {
    const totalPages = Math.max(1, Math.ceil(state.admin.totalUsers / state.admin.pageSize));
    const pageLabel = `第 ${state.admin.page} / ${totalPages} 页 · 共 ${state.admin.totalUsers} 人`;
    elements.adminPageIndicator.textContent = pageLabel;
    elements.adminPageIndicator.title = pageLabel;
    elements.adminPrevPage.disabled = state.admin.page <= 1;
    elements.adminNextPage.disabled = state.admin.page >= totalPages;
  }

  if (elements.adminAuditPageIndicator) {
    const totalPages = Math.max(1, Math.ceil(state.admin.totalLogs / state.admin.auditPageSize));
    const auditPageLabel = `第 ${state.admin.auditPage} / ${totalPages} 页 · 共 ${state.admin.totalLogs} 条`;
    elements.adminAuditPageIndicator.textContent = auditPageLabel;
    elements.adminAuditPageIndicator.title = auditPageLabel;
    elements.adminAuditPrevPage.disabled = state.admin.auditPage <= 1;
    elements.adminAuditNextPage.disabled = state.admin.auditPage >= totalPages;
  }

  if (elements.adminOverviewUsers) {
    elements.adminOverviewUsers.textContent = String(state.admin.totalUsers || 0);
  }
  if (elements.adminOverviewLogs) {
    elements.adminOverviewLogs.textContent = String(state.admin.totalLogs || 0);
  }
  if (elements.adminOverviewSelected) {
    const selected = state.admin.users.find((user) => user.id === state.admin.selectedUserId);
    const selectedLabel = selected ? (selected.display_name || selected.username) : "未选择";
    elements.adminOverviewSelected.textContent = truncateText(selectedLabel, 24);
    elements.adminOverviewSelected.title = selectedLabel;
  }

  renderAdminUserDetail();
  elements.adminUsersList.querySelector('[data-admin-empty-action="focus-create-user"]')?.addEventListener("click", () => {
    elements.adminCreateEmail?.focus();
    elements.adminCreateEmail?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function renderAdminUserDetail() {
  if (!elements.adminUserDetail) return;
  const detail = state.admin.userDetail;
  if (!detail || !detail.user) {
    elements.adminUserDetail.innerHTML = `<p class="helper">选择左侧用户查看详情</p>`;
    return;
  }
  const user = detail.user;
  const logs = detail.recent_logs || [];
  const projects = detail.projects?.recent || [];
  const activity = detail.activity || {};
  const recentUa = activity.last_active_ua || activity.last_login_ua || "-";
  const passwordResetSection = user.auth_provider === "local" ? `
    <div class="admin-danger-zone">
      <div class="admin-danger-copy">
        <strong>重置本地密码</strong>
        <p class="helper">为这个账号设置一个新密码，用户下次登录即可使用。</p>
      </div>
      <div class="admin-inline-password">
        <input type="password" class="input" data-admin-reset-password data-password-text placeholder="至少 6 位新密码" minlength="6">
        <button type="button" class="button button-ghost button-small password-toggle" data-password-toggle>显示</button>
        <button type="button" class="button button-secondary" data-admin-detail-action="reset-password" data-admin-user-id="${escapeHtml(user.id)}">更新密码</button>
      </div>
    </div>
  ` : `
    <div class="admin-danger-zone">
      <div class="admin-danger-copy">
        <strong>密码不在此处管理</strong>
        <p class="helper">这个账号来自外部认证源，密码应在对应的身份系统中维护。</p>
      </div>
    </div>
  `;
  elements.adminUserDetail.innerHTML = `
    <div class="admin-user-summary-grid">
      <article class="admin-summary-tile">
        <span class="admin-summary-label">账号状态</span>
        <strong>${user.is_active ? "启用中" : "已禁用"}</strong>
      </article>
      <article class="admin-summary-tile">
        <span class="admin-summary-label">最近活跃</span>
        <strong>${escapeHtml(activity.last_active_at || "-")}</strong>
      </article>
      <article class="admin-summary-tile">
        <span class="admin-summary-label">项目数</span>
        <strong>${detail.projects?.count ?? 0}</strong>
      </article>
    </div>
    <div class="pm-detail-section">
      <h4>基本信息</h4>
      <div class="pm-detail-grid">
        <div class="pm-detail-item">
          <span class="pm-detail-item-label">邮箱</span>
          <span class="pm-detail-item-value">${escapeHtml(user.email)}</span>
        </div>
        <div class="pm-detail-item">
          <span class="pm-detail-item-label">角色</span>
          <span class="pm-detail-item-value">${escapeHtml(user.role)}</span>
        </div>
        <div class="pm-detail-item">
          <span class="pm-detail-item-label">状态</span>
          <span class="pm-detail-item-value">${user.is_active ? "启用" : "禁用"}</span>
        </div>
        <div class="pm-detail-item">
          <span class="pm-detail-item-label">最近登录</span>
          <span class="pm-detail-item-value">${escapeHtml(user.last_login_at || "-")}</span>
        </div>
        <div class="pm-detail-item">
          <span class="pm-detail-item-label">注册时间</span>
          <span class="pm-detail-item-value">${escapeHtml(user.created_at || "-")}</span>
        </div>
        <div class="pm-detail-item">
          <span class="pm-detail-item-label">最近更新</span>
          <span class="pm-detail-item-value">${escapeHtml(user.updated_at || "-")}</span>
        </div>
        <div class="pm-detail-item">
          <span class="pm-detail-item-label">认证来源</span>
          <span class="pm-detail-item-value">${escapeHtml(user.auth_provider || "-")}</span>
        </div>
        <div class="pm-detail-item">
          <span class="pm-detail-item-label">Subject</span>
          <span class="pm-detail-item-value">${escapeHtml(user.subject || "-")}</span>
        </div>
        <div class="pm-detail-item">
          <span class="pm-detail-item-label">本地密码</span>
          <span class="pm-detail-item-value">${user.has_password ? "已设置" : "未设置"}</span>
        </div>
      </div>
    </div>
    <div class="pm-detail-section">
      <h4>访问与设备</h4>
      <div class="pm-detail-grid">
        <div class="pm-detail-item">
          <span class="pm-detail-item-label">最近活跃</span>
          <span class="pm-detail-item-value">${escapeHtml(activity.last_active_at || "-")}</span>
        </div>
        <div class="pm-detail-item">
          <span class="pm-detail-item-label">最近活跃 IP</span>
          <span class="pm-detail-item-value">${escapeHtml(activity.last_active_ip || "-")}</span>
        </div>
        <div class="pm-detail-item">
          <span class="pm-detail-item-label">最近登录 IP</span>
          <span class="pm-detail-item-value">${escapeHtml(activity.last_login_ip || "-")}</span>
        </div>
        <div class="pm-detail-item">
          <span class="pm-detail-item-label">最近 UA</span>
          <span class="pm-detail-item-value" title="${escapeHtml(recentUa)}">${escapeHtml(truncateText(recentUa, 120))}</span>
        </div>
      </div>
    </div>
    <div class="pm-detail-section">
      <h4>高风险操作</h4>
      <div class="admin-danger-zone">
        <div class="admin-danger-copy">
          <strong>${user.is_active ? "禁用账号" : "启用账号"}</strong>
          <p class="helper">变更该用户的登录可用性，会直接影响后续访问。</p>
        </div>
        <button type="button" class="button ${user.is_active ? "button-danger" : "button-secondary"}" data-admin-detail-action="toggle-active" data-admin-user-id="${escapeHtml(user.id)}">${user.is_active ? "禁用用户" : "启用用户"}</button>
      </div>
      <div class="admin-danger-zone">
        <div class="admin-danger-copy">
          <strong>强制下线</strong>
          <p class="helper">清空该用户当前会话，要求其重新登录。</p>
        </div>
        <button type="button" class="button button-danger" data-admin-detail-action="purge-sessions" data-admin-user-id="${escapeHtml(user.id)}">强制下线</button>
      </div>
      ${passwordResetSection}
    </div>
    <div class="pm-detail-section">
      <h4>项目</h4>
      <div class="pm-detail-item">
        <span class="pm-detail-item-label">项目数量</span>
        <span class="pm-detail-item-value">${detail.projects?.count ?? 0}</span>
      </div>
      ${projects.length ? `
        <div class="pm-file-list">
          ${projects.map((project) => `
            <div class="pm-file-item">
              <span class="pm-file-icon svg-icon">项</span>
              <span class="pm-file-name" title="${escapeHtml(project.name)}">${escapeHtml(project.name)}</span>
              <span class="badge" title="${escapeHtml(project.status)}">${escapeHtml(project.status)}</span>
              <span class="helper" title="${escapeHtml(project.updated_at)}">${escapeHtml(project.updated_at)}</span>
            </div>
          `).join("")}
        </div>
      ` : `<p class="helper">暂无最近项目</p>`}
    </div>
    <div class="pm-detail-section">
      <h4>最近审计</h4>
      <div class="admin-recent-log-list">
        ${logs.length ? logs.map((log) => {
          const detailText = JSON.stringify(log.details || {});
          const compactDetail = truncateText(detailText, 220);
          return `
          <article class="admin-recent-log-item">
            <div class="admin-recent-log-top">
              <strong>${escapeHtml(log.action)}</strong>
              <span class="helper">${escapeHtml(log.created_at)}</span>
            </div>
            <p class="helper">${escapeHtml(log.resource_type)}:${escapeHtml(log.resource_id || "-")}</p>
            <p class="admin-recent-log-detail" title="${escapeHtml(detailText)}">${escapeHtml(compactDetail)}</p>
          </article>
        `;
        }).join("") : `<p class="helper">暂无记录</p>`}
      </div>
    </div>
  `;
  setupPasswordToggles(elements.adminUserDetail);
  setupInlineValidation(elements.adminUserDetail);
}

async function handleAdminUsersListClick(event) {
  const button = event.target.closest("button[data-admin-action]");
  const card = event.target.closest("[data-admin-user-id]");
  if (!card) {
    return;
  }
  const userId = card.dataset.adminUserId;
  if (!button) {
    state.admin.selectedUserId = userId;
    try {
      await loadAdminUserDetail(userId);
      state.admin.auditPage = 1;
      await loadAdminData();
      renderAdminPanel();
    } catch (error) {
      showFlash(error.message, "error");
    }
    return;
  }
  const action = button.dataset.adminAction;
  const user = (state.admin.users || []).find((item) => item.id === userId);

  try {
    if (action === "toggle-active") {
      if (!user) return;
      const nextActive = !user.is_active;
      const confirmText = nextActive ? "确认恢复这个账号的登录权限吗？" : "确认暂停这个账号的登录权限吗？";
      if (!window.confirm(confirmText)) return;
      await updateAdminUser(userId, { is_active: nextActive });
      showFlash(nextActive ? "账号已恢复可登录状态。" : "账号已暂停登录。");
      return;
    }
    if (action === "purge-sessions") {
      if (!window.confirm("确认让这个账号立即重新登录吗？")) return;
      await purgeUserSessions(userId);
      showFlash("该账号已被强制退出。");
      return;
    }
    if (action === "save") {
      const role = card.querySelector("[data-admin-role]")?.value || "user";
      const groupsValue = card.querySelector("[data-admin-groups]")?.value || "";
      await updateAdminUser(userId, { role, groups: parseGroups(groupsValue) });
      showFlash("账号信息已更新。");
    }
  } catch (error) {
    showFlash(error.message, "error");
  }
}

async function handleAdminUserDetailClick(event) {
  const button = event.target.closest("button[data-admin-detail-action]");
  if (!button) return;
  const userId = button.dataset.adminUserId;
  const action = button.dataset.adminDetailAction;
  if (!userId || !action) return;

  const user = state.admin.userDetail?.user;
  try {
    if (action === "toggle-active") {
      const nextActive = !(user?.is_active);
      const confirmText = nextActive ? "确认恢复这个账号的登录权限吗？" : "确认暂停这个账号的登录权限吗？";
      if (!window.confirm(confirmText)) return;
      await updateAdminUser(userId, { is_active: nextActive });
      showFlash(nextActive ? "账号已恢复可登录状态。" : "账号已暂停登录。");
      return;
    }
    if (action === "purge-sessions") {
      if (!window.confirm("确认让这个账号立即重新登录吗？")) return;
      await purgeUserSessions(userId);
      showFlash("该账号已被强制退出。");
      return;
    }
    if (action === "reset-password") {
      const container = button.closest(".admin-inline-password");
      const passwordInput = container?.querySelector("[data-admin-reset-password]");
      const nextPassword = passwordInput?.value?.trim() || "";
      if (nextPassword.length < 6) {
        showFlash("新密码至少需要 6 位。", "error");
        passwordInput?.focus();
        return;
      }
      await updateAdminUser(userId, { password: nextPassword });
      if (passwordInput) {
        passwordInput.value = "";
      }
      showFlash("密码已更新。");
    }
  } catch (error) {
    showFlash(error.message, "error");
  }
}

async function handleAdminCreateUserSubmit(event) {
  event.preventDefault();
  const email = elements.adminCreateEmail?.value?.trim() || "";
  const displayName = elements.adminCreateDisplayName?.value?.trim() || "";
  const password = elements.adminCreatePassword?.value || "";
  const role = elements.adminCreateRole?.value || "user";

  if (!email || !email.includes("@")) {
    showFlash("请填写有效邮箱地址。", "error");
    elements.adminCreateEmail?.focus();
    return;
  }
  if (password.length < 6) {
    showFlash("初始密码至少需要 6 位。", "error");
    elements.adminCreatePassword?.focus();
    return;
  }

  try {
    await createAdminUser({ email, display_name: displayName, password, role });
    if (elements.adminCreateUserForm) {
      elements.adminCreateUserForm.reset();
    }
    showFlash("本地账号已创建。");
  } catch (error) {
    showFlash(error.message, "error");
  }
}

async function loadImageModelConfig() {
  try {
    const data = await apiFetch("/api/image-model-config");
    state.imageModelConfig = data.image_model_config || {
      profiles: [],
      selected_profile_id: null,
      active_profile: null,
      configured: false,
      aspect_ratios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
      sizes: ["512px", "1K", "2K", "4K"],
    };
  } catch (error) {
    console.error("Failed to load image model config:", error);
  }
}

async function loadTemplates() {
  if (state.templates.length > 0) {
    return; // Already loaded
  }

  state.templatesLoading = true;
  renderStage();

  try {
    const data = await apiFetch("/api/templates");
    state.templates = data.templates || [];
    state.templateCategories = data.categories || {};
  } catch (error) {
    showFlash(`模板列表加载失败，请稍后重试：${error.message}`, "error");
    appendLog("加载模板列表失败", error.message);
  } finally {
    state.templatesLoading = false;
    renderStage();
  }
}

async function applyTemplate(projectName, templateId) {
  if (!templateId) {
    showFlash("请先选一个模板，再继续。", "error");
    return;
  }

  try {
    clearFlash();
    state.templateApplyLoading = true;
    renderStage();

    const data = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/apply-template`, {
      method: "POST",
      body: JSON.stringify({ template_id: templateId }),
    });

    appendLog("模板应用成功", `${(data.copied_files || []).length} 个文件`);
    showFlash("模板已应用，正在进入下一步。");

    // Refresh project state
    await loadDashboard();

    // Move to strategist step
    state.activeStepId = "strategist";
    renderAll();
  } catch (error) {
    showFlash(error.message, "error");
    appendLog("应用模板失败", error.message);
  } finally {
    state.templateApplyLoading = false;
    renderStage();
  }
}

async function analyzeProject() {
  if (!state.selectedProject) {
    showFlash("请先选择一个项目。", "error");
    return;
  }

  const activeProfile = getActiveProfile();
  if (!activeProfile?.configured) {
    showFlash("请先连接一个可用的文字模型。", "error");
    return;
  }

  try {
    clearFlash();
    state.strategistLoading = true;
    state.strategistAnalysis = null;
    renderStage();

    const data = await apiFetch(`/api/projects/${encodeURIComponent(state.selectedProject.name)}/analyze`, {
      method: "POST",
      body: JSON.stringify({ profile_id: activeProfile.id }),
    });

    state.strategistAnalysis = data.recommendations;
    appendLog("分析完成", `使用模型：${data.recommendations?.model_used || "未识别"}`);
    showFlash("方案建议已生成，请确认并保存。");

    // Initialize eightConfirmations with recommendations
    if (data.recommendations) {
      const r = data.recommendations;
      state.eightConfirmations = {
        canvas_format: r.canvas_format?.suggestion || "ppt169",
        page_count_min: r.page_count?.min || 8,
        page_count_max: r.page_count?.max || 12,
        target_audience: r.target_audience?.suggestion || "",
        style_objective: r.style_objective?.suggestion || "general",
        color_primary: r.color_scheme?.primary || "#1565C0",
        color_secondary: r.color_scheme?.secondary || "#42A5F5",
        color_accent: r.color_scheme?.accent || "#FF6F00",
        icon_approach: r.icon_approach?.suggestion || "builtin",
        title_font: r.typography?.title_font || "Microsoft YaHei",
        body_font: r.typography?.body_font || "Microsoft YaHei",
        body_size: r.typography?.body_size || 24,
        image_approach: r.image_approach?.suggestion || "none",
      };
    }

    renderStage();
  } catch (error) {
    showFlash(error.message, "error");
    appendLog("分析失败", error.message);
  } finally {
    state.strategistLoading = false;
    renderStage();
  }
}

async function saveDesignSpec(event) {
  event.preventDefault();
  if (!state.selectedProject) {
    return;
  }

  try {
    clearFlash();
    state.strategistSaving = true;
    renderStage();

    const spec = {
      canvas_format: state.eightConfirmations.canvas_format,
      page_count: {
        min: parseInt(state.eightConfirmations.page_count_min) || 8,
        max: parseInt(state.eightConfirmations.page_count_max) || 12,
      },
      target_audience: state.eightConfirmations.target_audience,
      style_objective: state.eightConfirmations.style_objective,
      color_scheme: {
        primary: state.eightConfirmations.color_primary,
        secondary: state.eightConfirmations.color_secondary,
        accent: state.eightConfirmations.color_accent,
      },
      icon_approach: state.eightConfirmations.icon_approach,
      typography: {
        title_font: state.eightConfirmations.title_font,
        body_font: state.eightConfirmations.body_font,
        body_size: parseInt(state.eightConfirmations.body_size) || 24,
      },
      image_approach: state.eightConfirmations.image_approach,
    };

    const data = await apiFetch(`/api/projects/${encodeURIComponent(state.selectedProject.name)}/design-spec`, {
      method: "POST",
      body: JSON.stringify({ spec }),
    });

    appendLog("方案说明已保存", "方案说明文件已更新");
    showFlash("方案说明已保存。");

    // Refresh and move to next step
    await loadDashboard();
    state.activeStepId = "images";
    renderAll();
  } catch (error) {
    showFlash(error.message, "error");
    appendLog("保存失败", error.message);
  } finally {
    state.strategistSaving = false;
    renderStage();
  }
}

function moveToRecommendedStep() {
  state.activeStepId = getRecommendedStepId(state.selectedProject);
}

function resetProjectSpecificState() {
  // Clear strategist state
  state.strategistAnalysis = null;
  state.strategistLoading = false;
  state.strategistSaving = false;
  state.eightConfirmations = {
    canvas_format: null,
    page_count_min: null,
    page_count_max: null,
    target_audience: null,
    style_objective: null,
    color_primary: null,
    color_secondary: null,
    color_accent: null,
    icon_approach: null,
    title_font: null,
    body_font: null,
    body_size: null,
    image_approach: null,
  };

  // Clear template state
  state.selectedTemplateId = null;
  state.templateApplyLoading = false;

  // Clear SVG generation state
  state.svgGeneration = {
    inProgress: false,
    totalPages: 0,
    generatedPages: 0,
    currentPage: 0,
    currentTitle: "",
    errors: [],
    log: [],
    mode: "generate",
  };

  // Clear image generation state
  state.imageGeneration = {
    inProgress: false,
    status: "",
    prompt: "",
    filename: "",
    aspectRatio: "16:9",
    imageSize: "1K",
    lastResult: null,
    error: null,
  };

  // Clear SVG preview state
  state.svgPreview = {
    slides: [],
    currentIndex: 0,
  };

  // Clear validation state
  state.validation = null;
}

async function selectProject(projectName, options = {}) {
  try {
    clearFlash();
    setBusy(true);

    // Reset project-specific state when switching projects
    if (state.selectedProject?.name !== projectName) {
      resetProjectSpecificState();
    }

    const data = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}`);
    state.selectedProject = data.project;
    if (!options.keepStep) {
      state.activeStepId = options.stepId || getRecommendedStepId(state.selectedProject);
    }
    renderAll();
  } catch (error) {
    showFlash(error.message, "error");
    appendLog("选择项目失败", error.message);
  } finally {
    setBusy(false);
  }
}

async function createProject(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const payload = {
    project_name: formData.get("project_name"),
    canvas_format: formData.get("canvas_format"),
  };

  try {
    clearFlash();
    setBusy(true);
    const data = await apiFetch("/api/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    appendLog("项目创建成功", data.project?.name || "");
    showFlash(`项目“${data.project.name}”已创建。`);
    await loadDashboard({ preserveSelection: false });
    state.selectedProject = data.project;
    moveToRecommendedStep();
    renderAll();
  } catch (error) {
    showFlash(error.message, "error");
    appendLog("项目创建失败", error.message);
  } finally {
    setBusy(false);
  }
}

async function importSources(event) {
  event.preventDefault();
  if (!state.selectedProject) {
    showFlash("请先选择一个项目。", "error");
    return;
  }

  const formData = new FormData(event.currentTarget);
  const payload = {
    sources: String(formData.get("sources") || "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean),
    move: formData.get("move") === "on",
    pasted_format: String(formData.get("pasted_format") || "markdown"),
    pasted_filename: String(formData.get("pasted_filename") || "").trim(),
    pasted_content: String(formData.get("pasted_content") || ""),
  };

  if (payload.sources.length === 0 && !payload.pasted_content.trim()) {
    showFlash("请添加文件、链接，或直接粘贴文字内容。", "error");
    return;
  }

  try {
    clearFlash();
    setBusy(true);
    const data = await apiFetch(`/api/projects/${encodeURIComponent(state.selectedProject.name)}/import`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    appendLog("导入完成", `${data.summary?.imported_count ?? ""} 个文件`);
    showFlash(`内容已加入项目“${state.selectedProject.name}”。`);
    state.selectedProject = data.project;
    moveToRecommendedStep();
    await loadDashboard();
    renderAll();
  } catch (error) {
    showFlash(error.message, "error");
    appendLog("导入失败", error.message);
  } finally {
    setBusy(false);
  }
}

async function validateProject(projectName) {
  try {
    clearFlash();
    setBusy(true);
    const data = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/validate`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    state.selectedProject = data.project;
    state.validation = {
      projectName,
      result: data.validation,
    };
    appendLog(`校验完成 ${projectName}`, `valid=${data.validation?.is_valid}, errors=${data.validation?.errors?.length || 0}`);
    showFlash(data.validation.is_valid ? "项目检查通过。" : "项目检查发现了一些问题。", data.validation.is_valid ? "success" : "error");
    await loadDashboard();
    renderAll();
  } catch (error) {
    showFlash(error.message, "error");
    appendLog("校验失败", error.message);
  } finally {
    setBusy(false);
  }
}

function getDraftPayload() {
  syncModalDraftFromInputs();
  return {
    id: state.modal.draft.id || undefined,
    name: state.modal.draft.name,
    backend: state.modal.draft.backend,
    base_url: state.modal.draft.base_url,
    api_key: elements.modalApiKeyInput?.value.trim() || "",
    model: state.modal.draft.manual_model || state.modal.draft.selected_model,
  };
}

async function saveModelConfig(event) {
  event.preventDefault();
  const profile = getDraftPayload();
  if (!profile.name) {
    showFlash("请先填写一个配置名称。", "error");
    return;
  }

  try {
    clearFlash();
    setBusy(true);
    const data = await apiFetch("/api/model-config", {
      method: "POST",
      body: JSON.stringify({
        action: "upsert",
        select: true,
        profile,
      }),
    });
    state.modelConfig = data.model_config || createEmptyModelConfig();
    setModalDraft(pickEditableProfile(data.profile?.id || state.modelConfig.selected_profile_id), {
      fetchedModels: state.modal.fetchedModels,
      fetchMessage: "配置已保存，系统会默认使用当前选中的模型设置。",
    });
    appendLog("模型配置已保存", data.model_config?.active_profile?.name || "");
    showFlash("模型设置已保存。");
    state.activeStepId = state.selectedProject ? "executor" : state.activeStepId;
    renderAll();
    renderModelConfigModal();
  } catch (error) {
    showFlash(error.message, "error");
    appendLog("模型配置保存失败", error.message);
  } finally {
    setBusy(false);
  }
}

async function selectModelProfile(profileId, options = {}) {
  if (!profileId) {
    return;
  }

  try {
    clearFlash();
    setBusy(true);
    const data = await apiFetch("/api/model-config", {
      method: "POST",
      body: JSON.stringify({
        action: "select",
        profile_id: profileId,
      }),
    });
    state.modelConfig = data.model_config || createEmptyModelConfig();
    if (!options.quiet) {
      showFlash("当前模型已切换。");
    }
    renderAll();
    renderModelConfigModal();
  } catch (error) {
    showFlash(error.message, "error");
    appendLog("切换模型配置失败", error.message);
  } finally {
    setBusy(false);
  }
}

async function deleteModelProfile(profileId) {
  if (!profileId) {
    return;
  }
  const profile = getProfiles().find((item) => item.id === profileId);
  const profileLabel = profile?.name || "这条设置";
  if (!window.confirm(`确认删除“${profileLabel}”吗？删除后将无法恢复。`)) {
    return;
  }

  try {
    clearFlash();
    setBusy(true);
    const data = await apiFetch("/api/model-config", {
      method: "POST",
      body: JSON.stringify({
        action: "delete",
        profile_id: profileId,
      }),
    });
    state.modelConfig = data.model_config || createEmptyModelConfig();
    setModalDraft(pickEditableProfile());
    appendLog("模型配置已删除", profileId);
    showFlash("这条模型设置已删除。");
    renderAll();
    renderModelConfigModal();
  } catch (error) {
    showFlash(error.message, "error");
    appendLog("删除模型配置失败", error.message);
  } finally {
    setBusy(false);
  }
}

async function fetchRemoteModels() {
  syncModalDraftFromInputs();
  const apiKey = elements.modalApiKeyInput?.value.trim() || "";
  const payload = {
    backend: state.modal.draft.backend,
    base_url: state.modal.draft.base_url,
    api_key: apiKey,
  };

  if (!payload.api_key && !state.modal.draft.api_key_masked) {
    showFlash("请先填写访问密钥，再获取模型列表。", "error");
    return;
  }
  if (!payload.api_key) {
    showFlash("要重新获取模型列表，请重新输入访问密钥。", "error");
    return;
  }

  try {
    clearFlash();
    setBusy(true);
    const data = await apiFetch("/api/model-config/models", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.modal.fetchedModels = data.models || [];
    if (!state.modal.draft.selected_model && state.modal.fetchedModels.length > 0) {
      state.modal.draft.selected_model = state.modal.fetchedModels[0];
    }
    state.modal.fetchError = false;
    state.modal.fetchMessage = state.modal.fetchedModels.length > 0
      ? `已获取 ${state.modal.fetchedModels.length} 个可选模型。`
      : "接口可以访问，但暂时没有返回可选模型。";
    renderModelConfigModal();
  } catch (error) {
    state.modal.fetchError = true;
    state.modal.fetchMessage = error.message;
    renderModelConfigModal();
    showFlash(error.message, "error");
    appendLog("获取模型列表失败", error.message);
  } finally {
    setBusy(false);
  }
}

async function testModelConfig() {
  syncModalDraftFromInputs();
  const profile = getDraftPayload();

  if (!profile.api_key && !state.modal.draft.api_key_masked) {
    showFlash("请先填写访问密钥，再测试模型。", "error");
    return;
  }

  try {
    clearFlash();
    setBusy(true);
    const data = await apiFetch("/api/model-config", {
      method: "POST",
      body: JSON.stringify({
        action: "test",
        profile,
      }),
    });
    const result = data.result || {};
    const durationText = result.duration_ms ? `${result.duration_ms} ms` : "已完成";
    const defaultModelNote = result.used_default_model ? "，使用默认模型" : "";

    state.modal.testError = false;
    state.modal.testMessage = `模型测试成功 · ${result.model || "未指定模型"} · ${durationText}${defaultModelNote}`;
    state.modal.testOutput = result.preview || "";
    renderModelConfigModal();

    showFlash("模型连接测试成功。");
    appendLog("模型测试成功", result?.model || "ok");
  } catch (error) {
    state.modal.testError = true;
    state.modal.testMessage = error.message;
    state.modal.testOutput = "";
    renderModelConfigModal();

    showFlash(error.message, "error");
    appendLog("模型测试失败", error.message);
  } finally {
    setBusy(false);
  }
}

async function runStep(projectName, stepId) {
  try {
    clearFlash();
    setBusy(true);
    const data = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/run-step/${encodeURIComponent(stepId)}`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const output = [data.command.join(" "), data.stdout, data.stderr].filter(Boolean).join("\n\n");
    appendLog(`步骤完成 ${data.step.label}`, output || "已完成");
    showFlash(`${data.step.label} 已完成。`);
    state.selectedProject = data.project;
    moveToRecommendedStep();
    await loadDashboard();
    renderAll();
  } catch (error) {
    const detail = error.message;
    showFlash(error.message, "error");
    appendLog(`步骤失败 ${stepId}`, detail);
  } finally {
    setBusy(false);
  }
}

async function generateNotes(projectName) {
  const activeProfile = getActiveProfile();
  if (!activeProfile) {
    showFlash("请先选好一个可用的文字模型。", "error");
    return;
  }

  try {
    clearFlash();
    setBusy(true);
    const data = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/generate-notes`, {
      method: "POST",
      body: JSON.stringify({
        profile_id: activeProfile.id,
      }),
    });
    const output = [data.command.join(" "), data.stdout, data.stderr].filter(Boolean).join("\n\n");
    appendLog(`讲稿总表已生成（${activeProfile.name}）`, output || "已完成");
    showFlash("讲稿总表已生成。");
    state.selectedProject = data.project;
    moveToRecommendedStep();
    await loadDashboard();
    renderAll();
  } catch (error) {
    const detail = error.message;
    showFlash(error.message, "error");
    appendLog("讲稿总表生成失败", detail);
  } finally {
    setBusy(false);
  }
}

async function generateSvg(projectName) {
  const activeProfile = getActiveProfile();
  if (!activeProfile) {
    showFlash("请先选好一个可用的文字模型。", "error");
    return;
  }

  if (state.svgGeneration.inProgress) {
    showFlash("页面正在生成中，请先等待当前任务完成。", "error");
    return;
  }

  // Reset generation state
  state.svgGeneration = {
    inProgress: true,
    totalPages: 0,
    generatedPages: 0,
    currentPage: 0,
    currentTitle: "",
    errors: [],
    log: ["开始生成页面文件..."],
    mode: "generate",
  };

  clearFlash();
  renderAll();

  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectName)}/generate-svg`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        profile_id: activeProfile.id,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const msg = errorData.error || errorData.detail || `HTTP ${response.status}`;
      if (response.status === 409) {
        state.svgGeneration.inProgress = true;
        state.svgGeneration.log = ["后台当前还有任务正在执行，请等待完成后再试"];
        showFlash("这个项目当前还有任务在运行，请稍后再试。", "error");
        appendLog("页面生成冲突", msg);
        renderAll();
        return;
      }
      throw new Error(msg);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        const eventMatch = line.match(/^event:\s*(\S+)\ndata:\s*(.+)$/s);
        if (eventMatch) {
          const eventType = eventMatch[1];
          const dataStr = eventMatch[2];

          try {
            const data = JSON.parse(dataStr);
            handleSseEvent(eventType, data);
          } catch (parseError) {
            console.error("Failed to parse SSE data:", parseError);
          }
        }
      }
    }

    // Handle any remaining buffer
    if (buffer.trim()) {
      const eventMatch = buffer.match(/^event:\s*(\S+)\ndata:\s*(.+)$/s);
      if (eventMatch) {
        try {
          const data = JSON.parse(eventMatch[2]);
          handleSseEvent(eventMatch[1], data);
        } catch (parseError) {
          console.error("Failed to parse final SSE data:", parseError);
        }
      }
    }
  } catch (error) {
    state.svgGeneration.inProgress = false;
    state.svgGeneration.log.push(`错误: ${error.message}`);
    showFlash(`页面生成失败：${error.message}`, "error");
    appendLog("页面生成失败", error.message);
  } finally {
    state.svgGeneration.inProgress = false;
    await loadDashboard();
    if (state.activeStepId === "executor") {
      renderAll();
    } else {
      renderProjectContext();
      renderStepRail();
    }
  }
}

async function regenerateAllSvg(projectName) {
  const activeProfile = getActiveProfile();
  if (!activeProfile) {
    showFlash("请先选好一个可用的文字模型。", "error");
    return;
  }

  if (state.svgGeneration.inProgress) {
    showFlash("页面正在生成中，请先等待当前任务完成。", "error");
    return;
  }

  if (!confirm("确定要重新生成全部页面吗？现有页面内容会被覆盖。")) {
    return;
  }

  // Reset generation state
  state.svgGeneration = {
    inProgress: true,
    totalPages: 0,
    generatedPages: 0,
    currentPage: 0,
    currentTitle: "",
    errors: [],
    log: ["开始重新生成全部页面文件..."],
    mode: "regenerate",
  };

  clearFlash();
  renderAll();

  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectName)}/regenerate-svg`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        profile_id: activeProfile.id,
        regenerate_all: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const msg = errorData.error || errorData.detail || `HTTP ${response.status}`;
      if (response.status === 409) {
        state.svgGeneration.inProgress = true;
        state.svgGeneration.log = ["后台当前还有任务正在执行，请等待完成后再试"];
        showFlash("这个项目当前还有任务在运行，请稍后再试。", "error");
        appendLog("重新生成冲突", msg);
        renderAll();
        return;
      }
      throw new Error(msg);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        const eventMatch = line.match(/^event:\s*(\S+)\ndata:\s*(.+)$/s);
        if (eventMatch) {
          const eventType = eventMatch[1];
          const dataStr = eventMatch[2];

          try {
            const data = JSON.parse(dataStr);
            handleSseEvent(eventType, data);
          } catch (parseError) {
            console.error("Failed to parse SSE data:", parseError);
          }
        }
      }
    }

    // Handle any remaining buffer
    if (buffer.trim()) {
      const eventMatch = buffer.match(/^event:\s*(\S+)\ndata:\s*(.+)$/s);
      if (eventMatch) {
        try {
          const data = JSON.parse(eventMatch[2]);
          handleSseEvent(eventMatch[1], data);
        } catch (parseError) {
          console.error("Failed to parse final SSE data:", parseError);
        }
      }
    }
  } catch (error) {
    state.svgGeneration.inProgress = false;
    state.svgGeneration.log.push(`错误: ${error.message}`);
    showFlash(`重新生成失败：${error.message}`, "error");
    appendLog("重新生成失败", error.message);
  } finally {
    state.svgGeneration.inProgress = false;
    state.svgGeneration.mode = "generate";
    await loadDashboard();
    if (state.activeStepId === "executor") {
      renderAll();
    } else {
      renderProjectContext();
      renderStepRail();
    }
  }
}async function deleteAllSvg(projectName) {
  if (!confirm("确定要删除当前项目的全部页面文件和相关讲稿吗？此操作不可撤销。")) {
    return;
  }

  try {
    clearFlash();
    setBusy(true);
    const data = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/delete-svg`, {
      method: "POST",
      body: JSON.stringify({
        delete_all: true,
      }),
    });
    appendLog("已删除页面文件", `共 ${data.deleted_files?.length || 0} 个文件`);
    showFlash(`已删除 ${data.deleted_files?.length || 0} 个页面文件。`);
    state.selectedProject = data.project;
    await loadDashboard();
    renderAll();
  } catch (error) {
    showFlash(error.message, "error");
    appendLog("删除失败", error.message);
  } finally {
    setBusy(false);
  }
}

function handleSseEvent(eventType, data) {
  const isRegenerate = state.svgGeneration.mode === "regenerate";
  switch (eventType) {
    case "start":
      state.svgGeneration.totalPages = data.total_pages || 0;
      state.svgGeneration.log.push(`当前模型：${data.model || "未识别"}（${data.backend || "未识别"}）`);
      if (data.regenerate) {
        state.svgGeneration.log.push(`共 ${data.total_pages} 页等待重新生成`);
      } else {
        state.svgGeneration.log.push(`共 ${data.total_pages} 页等待生成`);
      }
      break;

    case "log":
      state.svgGeneration.log.push(data.message || "");
      break;

    case "page_complete":
      state.svgGeneration.generatedPages += 1;
      state.svgGeneration.currentTitle = data.title || "";
      state.svgGeneration.log.push(`✓ 页面 ${data.page_number}/${data.total_pages}: ${data.title || data.filename}`);
      break;

    case "page_error":
      state.svgGeneration.errors.push(data.error || "未知错误");
      state.svgGeneration.log.push(`✗ 页面 ${data.page_number} 失败: ${data.error}`);
      break;

    case "complete":
      state.svgGeneration.inProgress = false;
      state.svgGeneration.log.push(`${isRegenerate ? "重新生成" : "生成"}完成: ${data.generated}/${data.total_pages} 页`);
      if (data.errors && data.errors.length > 0) {
        state.svgGeneration.log.push(`错误: ${data.errors.length} 页`);
      }
      showFlash(`页面${isRegenerate ? "重新生成" : "生成"}完成：${data.generated}/${data.total_pages} 页。`);
      appendLog(`页面${isRegenerate ? "重新生成" : "生成"}完成`, `${state.svgGeneration.generatedPages} 页`);
      if (data.project) {
        state.selectedProject = data.project;
      }
      break;

    default:
      break;
  }

  // Re-render: only update executor stage if user is on it; always update context
  if (state.activeStepId === "executor") {
    renderAll();
  } else {
    renderProjectContext();
    renderStepRail();
  }
}

async function generateImage(projectName) {
  const activeProfile = state.imageModelConfig?.active_profile;
  if (!activeProfile) {
    showFlash("请先选好一个可用的图片模型。", "error");
    return;
  }

  const promptInput = document.getElementById("imagePromptInput");
  const aspectSelect = document.getElementById("imageAspectSelect");
  const sizeSelect = document.getElementById("imageSizeSelect");
  const filenameInput = document.getElementById("imageFilenameInput");

  const prompt = (promptInput?.value || "").trim();
  if (!prompt) {
    showFlash("请先输入图片描述。", "error");
    return;
  }

  state.imageGeneration.inProgress = true;
  state.imageGeneration.prompt = prompt;
  state.imageGeneration.aspectRatio = aspectSelect?.value || "16:9";
  state.imageGeneration.imageSize = sizeSelect?.value || "1K";
  state.imageGeneration.filename = filenameInput?.value || "";
  state.imageGeneration.lastResult = null;
  state.imageGeneration.error = null;

  clearFlash();
  renderAll();

  try {
    const data = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/generate-image`, {
      method: "POST",
      body: JSON.stringify({
        profile_id: activeProfile.id,
        prompt: state.imageGeneration.prompt,
        aspect_ratio: state.imageGeneration.aspectRatio,
        image_size: state.imageGeneration.imageSize,
        filename: state.imageGeneration.filename || null,
      }),
    });

    state.imageGeneration.inProgress = false;
    state.imageGeneration.lastResult = data.image;
    state.imageGeneration.prompt = "";
    state.imageGeneration.filename = "";
    showFlash(`图片已生成：${data.image.filename}`);
    appendLog("图片生成成功", data.image?.filename || prompt);
    if (data.project) {
      state.selectedProject = data.project;
    }
    await loadDashboard();
  } catch (error) {
    state.imageGeneration.inProgress = false;
    state.imageGeneration.error = error.message;
    showFlash(`图片生成失败：${error.message}`, "error");
    appendLog("图片生成失败", error.message);
  } finally {
    renderAll();
  }
}

async function generateSingleImageFromResource(projectName, imgResource, idx) {
  const activeProfile = state.imageModelConfig?.active_profile;
  if (!activeProfile) {
    showFlash("请先选好一个可用的图片模型。", "error");
    return;
  }

  const prompt = imgResource.description || "";
  if (!prompt) {
    showFlash(`图片“${imgResource.filename}”还没有可用描述。`, "error");
    return;
  }

  state.imageGeneration.inProgress = true;
  state.imageGeneration.status = `正在生成: ${imgResource.filename}`;
  state.imageGeneration.lastResult = null;
  state.imageGeneration.error = null;

  clearFlash();
  renderAll();

  try {
    const data = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/generate-image`, {
      method: "POST",
      body: JSON.stringify({
        profile_id: activeProfile.id,
        prompt: prompt,
        aspect_ratio: imgResource.aspect_ratio || "16:9",
        image_size: "1K",
        filename: imgResource.filename.replace(/\.[^.]+$/, ""), // Remove extension
      }),
    });

    state.imageGeneration.inProgress = false;
    state.imageGeneration.lastResult = data.image;
    state.imageGeneration.status = "";
    showFlash(`图片已生成：${data.image.filename}`);
    appendLog("图片生成成功", imgResource.filename);
    if (data.project) {
      state.selectedProject = data.project;
    }
    await loadDashboard();
  } catch (error) {
    state.imageGeneration.inProgress = false;
    state.imageGeneration.error = error.message;
    state.imageGeneration.status = "";
    showFlash(`图片生成失败：${error.message}`, "error");
    appendLog("图片生成失败", `${imgResource.filename}: ${error.message}`);
  } finally {
    renderAll();
  }
}

async function generateAllPendingImages(projectName) {
  const activeProfile = state.imageModelConfig?.active_profile;
  if (!activeProfile) {
    showFlash("请先选好一个可用的图片模型。", "error");
    return;
  }

  const imageResources = state.selectedProject?.image_resources || [];
  const pendingImages = imageResources.filter((img) => img.status === "pending");

  if (pendingImages.length === 0) {
    showFlash("当前没有需要生成的图片。", "info");
    return;
  }

  state.imageGeneration.inProgress = true;
  state.imageGeneration.status = `准备批量生成 ${pendingImages.length} 张图片...`;
  state.imageGeneration.lastResult = null;
  state.imageGeneration.error = null;

  clearFlash();
  renderAll();

  let successCount = 0;
  let failCount = 0;
  const errors = [];

  for (let i = 0; i < pendingImages.length; i++) {
    const img = pendingImages[i];
    state.imageGeneration.status = `正在生成 (${i + 1}/${pendingImages.length}): ${img.filename}`;
    renderAll();

    try {
      const data = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/generate-image`, {
        method: "POST",
        body: JSON.stringify({
          profile_id: activeProfile.id,
          prompt: img.description || "",
          aspect_ratio: img.aspect_ratio || "16:9",
          image_size: "1K",
          filename: img.filename.replace(/\.[^.]+$/, ""),
        }),
      });

      successCount++;
      appendLog("图片生成成功", `(${i + 1}/${pendingImages.length}) ${img.filename}`);

      // Update project state
      if (data.project) {
        state.selectedProject = data.project;
      }
    } catch (error) {
      failCount++;
      errors.push(`${img.filename}: ${error.message}`);
      appendLog("图片生成失败", `${img.filename}: ${error.message}`);
    }

    // Small delay between requests
    if (i < pendingImages.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  state.imageGeneration.inProgress = false;
  state.imageGeneration.status = "";

  if (failCount === 0) {
    showFlash(`批量生成完成，${successCount} 张图片都已生成。`);
  } else {
    showFlash(`批量生成结束：${successCount} 张成功，${failCount} 张失败。`, failCount > 0 ? "error" : "info");
  }

  await loadDashboard();
  renderAll();
}

async function selectImageProfile(profileId) {
  try {
    await apiFetch("/api/image-model-config", {
      method: "POST",
      body: JSON.stringify({ action: "select", profile_id: profileId }),
    });
    await loadImageModelConfig();
    renderAll();
  } catch (error) {
    showFlash(error.message, "error");
  }
}

function handleProfileListClick(event) {
  const button = event.target.closest("[data-profile-action]");
  if (!button) {
    return;
  }

  const profileId = button.dataset.profileId;
  const action = button.dataset.profileAction;

  if (action === "edit") {
    setModalDraft(pickEditableProfile(profileId));
    renderModelConfigModal();
    return;
  }
  if (action === "select") {
    selectModelProfile(profileId);
    return;
  }
  if (action === "delete") {
    deleteModelProfile(profileId);
  }
}

function beginNewProfile() {
  setModalDraft(null, {
    fetchMessage: "新配置默认可从下拉列表选模型，也可以手动输入。",
  });
  renderModelConfigModal();
}

// ============ Template Manager Functions ============

async function openTemplateManagerModal() {
  state.templateManager.isOpen = true;
  state.templateManager.selectedTemplate = null;
  state.templateManager.searchQuery = "";
  state.templateManager.filterCategory = "";
  state.templateManager.deleteConfirm = null;
  state.templateManager.uploadMode = false;
  state.templateManager.uploadFiles = [];
  if (elements.tmSearchInput) elements.tmSearchInput.value = "";
  if (elements.tmCategoryFilter) elements.tmCategoryFilter.value = "";
  elements.templateManagerModal?.classList.remove("hidden");
  elements.templateManagerModal?.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  trapFocus(elements.templateManagerModal);

  try {
    const data = await apiFetch("/api/templates");
    state.templateManager.templates = data.templates || [];
    state.templateManager.categories = data.categories || {};
  } catch (error) {
    showFlash("模板列表加载失败，请稍后重试：" + error.message, "error");
  }
  renderTemplateManagerList();
  renderTemplateManagerDetail();
}

function closeTemplateManagerModal() {
  state.templateManager.isOpen = false;
  elements.templateManagerModal?.classList.add("hidden");
  elements.templateManagerModal?.setAttribute("aria-hidden", "true");
  releaseFocus();
  document.body.classList.remove("modal-open");
}

function getFilteredTemplatesForManager() {
  let list = state.templateManager.templates;
  const query = state.templateManager.searchQuery.toLowerCase().trim();
  const cat = state.templateManager.filterCategory;

  if (cat) {
    const catLayouts = state.templateManager.categories[cat]?.layouts || [];
    list = list.filter((t) => catLayouts.includes(t.id));
  }
  if (query) {
    list = list.filter((t) =>
      t.label.toLowerCase().includes(query)
      || t.id.toLowerCase().includes(query)
      || (t.keywords || []).some((k) => k.toLowerCase().includes(query))
      || (t.summary || "").toLowerCase().includes(query)
    );
  }
  return list;
}

function renderTemplateManagerList() {
  if (!elements.tmTemplateList) return;
  const filtered = getFilteredTemplatesForManager();
  if (filtered.length === 0) {
    elements.tmTemplateList.innerHTML = `
      <div class="empty-state">
        <strong>没有匹配的模板</strong>
        <p class="helper">换个关键词或分类试试。</p>
      </div>
    `;
    return;
  }
  elements.tmTemplateList.innerHTML = filtered.map((t) => {
    const isSelected = state.templateManager.selectedTemplate?.id === t.id;
    return `
      <article class="pm-item ${isSelected ? "pm-item-active" : ""}" data-tm-id="${escapeHtml(t.id)}">
        <h3 class="pm-item-name">${escapeHtml(t.label)}</h3>
        <p class="pm-item-meta">${escapeHtml(t.id)} · ${t.svg_count} 页</p>
        <div class="pm-item-badges">
          ${(t.keywords || []).slice(0, 3).map((k) => `<span class="badge">${escapeHtml(k)}</span>`).join("")}
        </div>
      </article>
    `;
  }).join("");
}

function renderTemplateManagerDetail() {
  if (!elements.tmTemplateDetail) return;
  const tm = state.templateManager;

  // Upload mode
  if (tm.uploadMode) {
    elements.tmTemplateDetail.innerHTML = `
      <div class="stack">
        <div class="section-head">
          <p class="section-kicker">上传模板</p>
          <h2>上传新模板</h2>
        </div>
        <form id="tmUploadForm" class="stack">
          <div class="two-col">
            <label class="field">
              <span>模板标识（用于保存）</span>
              <input type="text" name="name" placeholder="如 annual_pitch" required>
            </label>
            <label class="field">
              <span>显示名称</span>
              <input type="text" name="label" placeholder="如 我的模板" required>
            </label>
          </div>
          <label class="field">
            <span>简介</span>
            <input type="text" name="summary" placeholder="适用场景描述">
          </label>
          <div class="two-col">
            <label class="field">
              <span>分类</span>
              <select name="category">
                <option value="general">通用风格</option>
                <option value="brand">品牌风格</option>
                <option value="scenario">场景专用</option>
                <option value="government">政府企业</option>
                <option value="special">特殊风格</option>
              </select>
            </label>
            <label class="field">
              <span>关键词（逗号分隔）</span>
              <input type="text" name="keywords" placeholder="商务, 简约, 汇报">
            </label>
          </div>
          <div class="upload-dropzone" id="tmDropzone">
            <p class="upload-dropzone-label">点击选择或拖拽文件到此处</p>
            <p class="helper">至少上传 1 个页面文件，建议同时附上方案说明文件。</p>
            <input type="file" id="tmFileInput" class="visually-hidden" multiple accept=".svg,.md,.png,.jpg,.jpeg">
          </div>
          <div id="tmFileList" class="upload-file-list"></div>
          <div class="action-row">
            <button type="submit" class="button button-primary">上传模板</button>
            <button type="button" class="button button-ghost" data-tm-action="cancel-upload">取消</button>
          </div>
        </form>
      </div>
    `;
    bindTemplateUploadEvents();
    return;
  }

  const t = tm.selectedTemplate;
  if (!t) {
    elements.tmTemplateDetail.innerHTML = `<p class="helper">先从左侧选一个模板查看详情，或直接上传一个新模板。</p>`;
    return;
  }

  // Delete confirm
  if (tm.deleteConfirm === t.id) {
    elements.tmTemplateDetail.innerHTML = `
      <div class="pm-delete-confirm">
        <h4>确认删除这个模板？</h4>
        <p>模板 <strong>${escapeHtml(t.label)}</strong> 删除后将无法恢复。</p>
        <div class="pm-delete-confirm-actions">
          <button class="button button-ghost" data-tm-action="cancel-delete">取消</button>
          <button class="button button-danger" data-tm-action="confirm-delete" data-tm-id="${escapeHtml(t.id)}">确认删除</button>
        </div>
      </div>
    `;
    return;
  }

  // Normal detail
  const previewHtml = t.preview_url
    ? `<img src="${t.preview_url}" alt="${escapeHtml(t.label)}" class="template-preview-image">`
    : (t.svg_files?.length > 0
      ? `<img src="/files/templates/${encodeURIComponent(t.id)}/${encodeURIComponent(t.svg_files[0])}" alt="preview" class="template-preview-image template-preview-image-contain">`
      : "");

  elements.tmTemplateDetail.innerHTML = `
    <div class="stack">
      ${previewHtml}
      <div class="pm-detail-header">
        <h3 class="pm-detail-title" title="${escapeHtml(t.label)}">${escapeHtml(t.label)}</h3>
        <div class="pm-detail-actions">
          <button class="button button-danger" data-tm-action="delete" data-tm-id="${escapeHtml(t.id)}">删除</button>
        </div>
      </div>
      <p class="helper" title="${escapeHtml(t.summary || "")}">${escapeHtml(truncateText(t.summary || "", 180))}</p>
      <div class="pm-detail-section">
        <h4>基本信息</h4>
        <div class="pm-detail-grid">
          <div class="pm-detail-item">
            <span class="pm-detail-item-label">模板标识</span>
            <span class="pm-detail-item-value">${escapeHtml(t.id)}</span>
          </div>
          <div class="pm-detail-item">
            <span class="pm-detail-item-label">页面数量</span>
            <span class="pm-detail-item-value">${t.svg_count} 页</span>
          </div>
          <div class="pm-detail-item">
            <span class="pm-detail-item-label">方案说明</span>
            <span class="pm-detail-item-value">${t.has_design_spec ? "已附带" : "未附带"}</span>
          </div>
          <div class="pm-detail-item">
            <span class="pm-detail-item-label">主题风格</span>
            <span class="pm-detail-item-value">${escapeHtml(t.theme_mode || "-")}</span>
          </div>
        </div>
      </div>
      ${t.keywords?.length ? `
        <div class="pm-detail-section">
          <h4>关键词</h4>
          <div class="badge-row">
            ${t.keywords.map((k) => `<span class="badge">${escapeHtml(k)}</span>`).join("")}
          </div>
        </div>
      ` : ""}
      <div class="pm-detail-section">
        <h4>页面文件</h4>
        <div class="pm-file-list">
          ${(t.svg_files || []).map((f) => `
            <div class="pm-file-item">
              <span class="pm-file-icon svg-icon">页</span>
              <span class="pm-file-name">${escapeHtml(f)}</span>
            </div>
          `).join("")}
        </div>
      </div>
      ${t.assets?.length ? `
        <div class="pm-detail-section">
          <h4>素材文件</h4>
          <div class="pm-file-list">
            ${t.assets.map((f) => `
              <div class="pm-file-item">
                <span class="pm-file-icon pptx-icon">A</span>
                <span class="pm-file-name">${escapeHtml(f)}</span>
              </div>
            `).join("")}
          </div>
        </div>
      ` : ""}
    </div>
  `;
}

function bindTemplateUploadEvents() {
  const dropzone = document.getElementById("tmDropzone");
  const fileInput = document.getElementById("tmFileInput");
  const form = document.getElementById("tmUploadForm");

  if (dropzone && fileInput) {
    dropzone.addEventListener("click", () => fileInput.click());
    dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("dragover"); });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      addUploadFiles(Array.from(e.dataTransfer.files));
    });
    fileInput.addEventListener("change", () => {
      addUploadFiles(Array.from(fileInput.files));
      fileInput.value = "";
    });
  }

  if (form) {
    form.addEventListener("submit", handleTemplateUpload);
  }

  // Cancel upload and detail action buttons
  elements.tmTemplateDetail?.querySelectorAll("[data-tm-action]").forEach((btn) => {
    btn.addEventListener("click", () => handleTemplateDetailAction(btn));
  });
}

function addUploadFiles(newFiles) {
  for (const f of newFiles) {
    if (!state.templateManager.uploadFiles.some((e) => e.name === f.name)) {
      state.templateManager.uploadFiles.push(f);
    }
  }
  renderUploadFileList();
}

function removeUploadFile(name) {
  state.templateManager.uploadFiles = state.templateManager.uploadFiles.filter((f) => f.name !== name);
  renderUploadFileList();
}

function renderUploadFileList() {
  const container = document.getElementById("tmFileList");
  if (!container) return;
  const files = state.templateManager.uploadFiles;
  if (files.length === 0) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = files.map((f) => `
    <div class="upload-file-item">
      <span>${escapeHtml(f.name)} (${(f.size / 1024).toFixed(1)} KB)</span>
      <button type="button" class="button button-ghost" data-remove-file="${escapeHtml(f.name)}">移除</button>
    </div>
  `).join("");
  container.querySelectorAll("[data-remove-file]").forEach((btn) => {
    btn.addEventListener("click", () => removeUploadFile(btn.dataset.removeFile));
  });
}

async function handleTemplateUpload(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData();
  formData.append("name", form.elements.name.value.trim());
  formData.append("label", form.elements.label.value.trim());
  formData.append("summary", form.elements.summary?.value?.trim() || "");
  formData.append("category", form.elements.category?.value || "general");
  formData.append("keywords", form.elements.keywords?.value?.trim() || "");

  for (const file of state.templateManager.uploadFiles) {
    formData.append("files", file);
  }

  if (!formData.get("name") || !formData.get("label")) {
    showFlash("请先填写模板标识和显示名称。", "error");
    return;
  }
  if (state.templateManager.uploadFiles.length === 0) {
    showFlash("请至少上传一个文件。", "error");
    return;
  }

  try {
    setBusy(true);
    const response = await fetch("/api/templates/upload", {
      method: "POST",
      credentials: "same-origin",
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || data.error || `HTTP ${response.status}`);
    }
    showFlash(`模板“${formData.get("name")}”上传成功。`);
    appendLog("模板上传成功", formData.get("name"));
    state.templateManager.uploadMode = false;
    state.templateManager.uploadFiles = [];
    // Reload templates
    const freshData = await apiFetch("/api/templates");
    state.templateManager.templates = freshData.templates || [];
    state.templateManager.categories = freshData.categories || {};
    // Also refresh step 3 template cache
    state.templates = freshData.templates || [];
    state.templateCategories = freshData.categories || {};
    renderTemplateManagerList();
    renderTemplateManagerDetail();
  } catch (error) {
    showFlash("上传失败，请稍后重试：" + error.message, "error");
    appendLog("模板上传失败", error.message);
  } finally {
    setBusy(false);
  }
}

async function deleteTemplate(templateId) {
  try {
    setBusy(true);
    await apiFetch(`/api/templates/${encodeURIComponent(templateId)}`, { method: "DELETE" });
    showFlash(`模板“${templateId}”已删除。`);
    appendLog("模板已删除", templateId);
    state.templateManager.selectedTemplate = null;
    state.templateManager.deleteConfirm = null;
    // Reload
    const freshData = await apiFetch("/api/templates");
    state.templateManager.templates = freshData.templates || [];
    state.templateManager.categories = freshData.categories || {};
    state.templates = freshData.templates || [];
    state.templateCategories = freshData.categories || {};
    renderTemplateManagerList();
    renderTemplateManagerDetail();
  } catch (error) {
    showFlash("删除失败，请稍后重试：" + error.message, "error");
    appendLog("模板删除失败", error.message);
  } finally {
    setBusy(false);
  }
}

function handleTemplateManagerListClick(event) {
  const item = event.target.closest("[data-tm-id]");
  if (!item) return;
  const id = item.dataset.tmId;
  const t = state.templateManager.templates.find((t) => t.id === id);
  if (t) {
    state.templateManager.selectedTemplate = t;
    state.templateManager.deleteConfirm = null;
    state.templateManager.uploadMode = false;
    renderTemplateManagerList();
    renderTemplateManagerDetail();
  }
}

function handleTemplateDetailAction(btn) {
  const action = btn.dataset.tmAction;
  const id = btn.dataset.tmId;
  if (action === "delete") {
    state.templateManager.deleteConfirm = id;
    renderTemplateManagerDetail();
  } else if (action === "cancel-delete") {
    state.templateManager.deleteConfirm = null;
    renderTemplateManagerDetail();
  } else if (action === "confirm-delete") {
    deleteTemplate(id);
  } else if (action === "cancel-upload") {
    state.templateManager.uploadMode = false;
    state.templateManager.uploadFiles = [];
    renderTemplateManagerDetail();
  }
}

function handleTemplateManagerDetailClick(event) {
  const btn = event.target.closest("[data-tm-action]");
  if (btn) handleTemplateDetailAction(btn);
}

async function bootstrapAdminPage() {
  await loadCurrentUser();
  if (!state.user) {
    window.location.href = "/login";
    return;
  }
  renderUserBadge();
  if (state.user.role !== "admin") {
    window.location.href = "/";
    return;
  }
  await loadAdminData();
  if (state.admin.users.length > 0) {
    state.admin.selectedUserId = state.admin.users[0].id;
    await loadAdminUserDetail(state.admin.selectedUserId);
    await loadAdminData();
  }
  renderAdminPanel();
}

async function bootstrap() {
  try {
    setBusy(true);
    setupPasswordToggles(document);
    setupInlineValidation(document);
    // Load saved theme
    const savedTheme = localStorage.getItem("ppt-master-theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme === "light" ? "" : savedTheme);
    const themeSelect = document.getElementById("themeSelect");
    if (themeSelect) {
      themeSelect.value = savedTheme;
      themeSelect.addEventListener("change", (event) => {
        const theme = event.target.value;
        if (theme === "light") {
          document.documentElement.removeAttribute("data-theme");
        } else {
          document.documentElement.setAttribute("data-theme", theme);
        }
        localStorage.setItem("ppt-master-theme", theme);
      });
    }
    elements.openModelConfigButton?.addEventListener("click", openModelConfigModal);
    elements.openAccountSettingsButton?.addEventListener("click", openAccountSettingsModal);
    elements.logoutButton?.addEventListener("click", logout);
    elements.closeModelConfigButton?.addEventListener("click", closeModelConfigModal);
    elements.closeAccountSettingsButton?.addEventListener("click", closeAccountSettingsModal);
    elements.clearLogButton?.addEventListener("click", () => {
      if (!window.confirm("确认清空当前操作日志吗？")) return;
      state.activityLogs = [];
      renderLogOutput();
      showFlash("操作日志已清空。");
    });
    elements.jumpToLatestLogButton?.addEventListener("click", () => {
      elements.logOutput?.scrollTo({ top: 0, behavior: "smooth" });
      requestAnimationFrame(updateLatestLogButton);
    });
    elements.logOutput?.addEventListener("scroll", updateLatestLogButton);
    elements.modelConfigBackdrop?.addEventListener("click", closeModelConfigModal);
    elements.accountSettingsBackdrop?.addEventListener("click", closeAccountSettingsModal);
    elements.modelConfigForm?.addEventListener("submit", saveModelConfig);
    elements.accountSettingsForm?.addEventListener("submit", saveAccountSettings);
    elements.fetchModelsButton?.addEventListener("click", fetchRemoteModels);
    elements.testModelButton?.addEventListener("click", testModelConfig);
    elements.createProfileButton?.addEventListener("click", beginNewProfile);
    elements.modelProfileList?.addEventListener("click", handleProfileListClick);
    // SVG Preview modal bindings
    elements.closeSvgPreviewButton?.addEventListener("click", closeSvgPreviewModal);
    elements.svgPreviewBackdrop?.addEventListener("click", closeSvgPreviewModal);
    elements.svgPrevButton?.addEventListener("click", () => navigateSvgPreview(-1));
    elements.svgNextButton?.addEventListener("click", () => navigateSvgPreview(1));
    // Document Preview modal bindings
    elements.closeDocPreviewButton?.addEventListener("click", closeDocPreview);
    elements.docPreviewBackdrop?.addEventListener("click", closeDocPreview);
    // Project Manager modal bindings
    elements.openProjectManagerButton?.addEventListener("click", openProjectManagerModal);
    elements.closeProjectManagerButton?.addEventListener("click", closeProjectManagerModal);
    elements.projectManagerBackdrop?.addEventListener("click", closeProjectManagerModal);
    // Template Manager bindings
    elements.openTemplateManagerButton?.addEventListener("click", openTemplateManagerModal);
    elements.closeTemplateManagerButton?.addEventListener("click", closeTemplateManagerModal);
    elements.templateManagerBackdrop?.addEventListener("click", closeTemplateManagerModal);
    elements.tmSearchInput?.addEventListener("input", (event) => {
      state.templateManager.searchQuery = event.currentTarget.value || "";
      renderTemplateManagerList();
    });
    elements.tmCategoryFilter?.addEventListener("change", (event) => {
      state.templateManager.filterCategory = event.target.value || "";
      renderTemplateManagerList();
    });
    elements.tmTemplateList?.addEventListener("click", handleTemplateManagerListClick);
    elements.tmTemplateDetail?.addEventListener("click", handleTemplateManagerDetailClick);
    elements.tmShowUploadButton?.addEventListener("click", () => {
      state.templateManager.uploadMode = true;
      state.templateManager.uploadFiles = [];
      state.templateManager.selectedTemplate = null;
      renderTemplateManagerList();
      renderTemplateManagerDetail();
    });
    elements.pmSearchInput?.addEventListener("input", (event) => {
      state.projectManager.searchQuery = event.currentTarget.value || "";
      renderProjectManagerList();
    });
    elements.pmProjectList?.addEventListener("click", handleProjectManagerListClick);
    elements.pmProjectDetail?.addEventListener("click", handleProjectManagerDetailClick);
    elements.adminCreateUserForm?.addEventListener("submit", handleAdminCreateUserSubmit);
    elements.adminUsersList?.addEventListener("click", handleAdminUsersListClick);
    elements.adminUserDetail?.addEventListener("click", handleAdminUserDetailClick);
    elements.adminUserSearchInput?.addEventListener("input", (event) => {
      state.admin.userQuery = event.currentTarget.value || "";
      state.admin.page = 1;
      loadAdminData().then(renderAdminPanel).catch((error) => showFlash(error.message, "error"));
    });
    elements.adminRoleFilter?.addEventListener("change", (event) => {
      state.admin.roleFilter = event.target.value || "";
      state.admin.page = 1;
      loadAdminData().then(renderAdminPanel).catch((error) => showFlash(error.message, "error"));
    });
    elements.adminStatusFilter?.addEventListener("change", (event) => {
      state.admin.statusFilter = event.target.value || "";
      state.admin.page = 1;
      loadAdminData().then(renderAdminPanel).catch((error) => showFlash(error.message, "error"));
    });
    elements.adminProviderFilter?.addEventListener("change", (event) => {
      state.admin.providerFilter = event.target.value || "";
      state.admin.page = 1;
      loadAdminData().then(renderAdminPanel).catch((error) => showFlash(error.message, "error"));
    });
    elements.adminPrevPage?.addEventListener("click", () => {
      if (state.admin.page <= 1) return;
      state.admin.page -= 1;
      loadAdminData().then(renderAdminPanel).catch((error) => showFlash(error.message, "error"));
    });
    elements.adminNextPage?.addEventListener("click", () => {
      const totalPages = Math.max(1, Math.ceil(state.admin.totalUsers / state.admin.pageSize));
      if (state.admin.page >= totalPages) return;
      state.admin.page += 1;
      loadAdminData().then(renderAdminPanel).catch((error) => showFlash(error.message, "error"));
    });
    elements.adminAuditActionInput?.addEventListener("input", (event) => {
      state.admin.auditAction = event.currentTarget.value || "";
      state.admin.auditPage = 1;
      loadAdminData().then(renderAdminPanel).catch((error) => showFlash(error.message, "error"));
    });
    elements.adminAuditResourceInput?.addEventListener("input", (event) => {
      state.admin.auditResource = event.currentTarget.value || "";
      state.admin.auditPage = 1;
      loadAdminData().then(renderAdminPanel).catch((error) => showFlash(error.message, "error"));
    });
    elements.adminAuditStartInput?.addEventListener("change", (event) => {
      state.admin.auditStart = event.currentTarget.value || "";
      state.admin.auditPage = 1;
      loadAdminData().then(renderAdminPanel).catch((error) => showFlash(error.message, "error"));
    });
    elements.adminAuditEndInput?.addEventListener("change", (event) => {
      state.admin.auditEnd = event.currentTarget.value || "";
      state.admin.auditPage = 1;
      loadAdminData().then(renderAdminPanel).catch((error) => showFlash(error.message, "error"));
    });
    elements.adminAuditPrevPage?.addEventListener("click", () => {
      if (state.admin.auditPage <= 1) return;
      state.admin.auditPage -= 1;
      loadAdminData().then(renderAdminPanel).catch((error) => showFlash(error.message, "error"));
    });
    elements.adminAuditNextPage?.addEventListener("click", () => {
      const totalPages = Math.max(1, Math.ceil(state.admin.totalLogs / state.admin.auditPageSize));
      if (state.admin.auditPage >= totalPages) return;
      state.admin.auditPage += 1;
      loadAdminData().then(renderAdminPanel).catch((error) => showFlash(error.message, "error"));
    });
    elements.adminAuditQuick24h?.addEventListener("click", () => {
      setAuditRange(24);
    });
    elements.adminAuditQuick7d?.addEventListener("click", () => {
      setAuditRange(24 * 7);
    });
    elements.adminAuditClear?.addEventListener("click", () => {
      state.admin.auditAction = "";
      state.admin.auditResource = "";
      state.admin.auditStart = "";
      state.admin.auditEnd = "";
      state.admin.auditPage = 1;
      loadAdminData().then(renderAdminPanel).catch((error) => showFlash(error.message, "error"));
    });
    elements.adminAuditCopy?.addEventListener("click", () => {
      copyAuditLogs().catch((error) => showFlash(error.message, "error"));
    });
    elements.adminAuditExport?.addEventListener("click", () => {
      window.open(buildAuditExportUrl(), "_blank");
    });
    elements.adminAuditLog?.addEventListener("click", (event) => {
      const target = event.target.closest("[data-admin-audit-user]");
      if (!target) return;
      const userId = target.dataset.adminAuditUser;
      if (!userId) return;
      state.admin.selectedUserId = userId;
      state.admin.auditPage = 1;
      loadAdminUserDetail(userId)
        .then(loadAdminData)
        .then(renderAdminPanel)
        .catch((error) => showFlash(error.message, "error"));
    });
    // Image model modal bindings
    elements.closeImageModelButton?.addEventListener("click", closeImageModelModal);
    elements.imageModelBackdrop?.addEventListener("click", closeImageModelModal);
    elements.createImageProfileButton?.addEventListener("click", beginNewImageProfile);
    elements.imageModelProfileList?.addEventListener("click", handleImageProfileListClick);
    elements.imageModelForm?.addEventListener("submit", saveImageModelProfile);
    elements.testImageButton?.addEventListener("click", testImageConfig);
    elements.copyFromGlobalConfigButton?.addEventListener("click", copyFromGlobalModelConfig);
    elements.imageBackendSelect?.addEventListener("change", (event) => {
      const backend = event.target.value;
      state.imageModal.draft.backend = backend;
      // Clear model when switching backend
      state.imageModal.draft.model = "";
      state.imageModal.draft.base_url = "";
      renderImageModelModal();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeModelConfigModal();
        closeAccountSettingsModal();
        closeSvgPreviewModal();
        closeProjectManagerModal();
        closeTemplateManagerModal();
        closeImageModelModal();
        closeDocPreview();
      }
      // Arrow keys for SVG preview navigation
      if (elements.svgPreviewModal && !elements.svgPreviewModal.classList.contains("hidden")) {
        if (event.key === "ArrowLeft") {
          navigateSvgPreview(-1);
        } else if (event.key === "ArrowRight") {
          navigateSvgPreview(1);
        }
      }
    });
    if (isAdminPage) {
      await bootstrapAdminPage();
      return;
    }
    renderLogOutput();
    await loadCurrentUser();
    await loadDashboard({ preserveSelection: false });
  } catch (error) {
    const label = error?.path ? `${error.path} · ${error.message}` : error.message;
    showFlash(label, "error");
    appendLog("初始化失败", label);
    renderInitializationError(error);
  } finally {
    setBusy(false);
  }
}

// ============ Project Manager Functions ============

function openProjectManagerModal() {
  state.projectManager.isOpen = true;
  state.projectManager.selectedProject = null;
  state.projectManager.searchQuery = "";
  state.projectManager.deleteConfirm = null;
  if (elements.pmSearchInput) {
    elements.pmSearchInput.value = "";
  }
  elements.projectManagerModal?.classList.remove("hidden");
  document.body.classList.add("modal-open");
  trapFocus(elements.projectManagerModal);
  renderProjectManagerList();
  renderProjectManagerDetail();
}

function closeProjectManagerModal() {
  state.projectManager.isOpen = false;
  elements.projectManagerModal?.classList.add("hidden");
  releaseFocus();
  document.body.classList.remove("modal-open");
}

function getFilteredProjectsForManager() {
  const query = state.projectManager.searchQuery.toLowerCase().trim();
  if (!query) {
    return state.projects;
  }
  return state.projects.filter((project) => {
    return (
      project.name.toLowerCase().includes(query) ||
      project.canvas_label?.toLowerCase().includes(query) ||
      project.created_at?.toLowerCase().includes(query)
    );
  });
}

function renderProjectManagerList() {
  if (!elements.pmProjectList) {
    return;
  }
  const filteredProjects = getFilteredProjectsForManager();

  if (filteredProjects.length === 0) {
    elements.pmProjectList.innerHTML = `
      <div class="empty-state">
        <strong>没有匹配的项目</strong>
        <p class="helper">换个关键词试试。</p>
      </div>
    `;
    return;
  }

  elements.pmProjectList.innerHTML = filteredProjects.map((project) => {
    const isSelected = getProjectRef(state.projectManager.selectedProject) === getProjectRef(project);
    return `
      <article class="pm-item ${isSelected ? "pm-item-active" : ""}" data-pm-project="${escapeHtml(getProjectRef(project))}">
        <h3 class="pm-item-name">${escapeHtml(project.name)}</h3>
        <p class="pm-item-meta">${escapeHtml(project.canvas_label)} · ${escapeHtml(project.created_at)}</p>
        <div class="pm-item-badges">
          ${metricBadge("src", project.source_count)}
          ${metricBadge("svg", project.svg_final_count)}
          ${metricBadge("pptx", project.pptx_files?.length || 0)}
        </div>
      </article>
    `;
  }).join("");
}

function metricBadge(label, count) {
  const labelMap = {
    src: "来源",
    svg: "页面",
    pptx: "PPT",
  };
  const displayLabel = labelMap[label] || label;
  return `<span class="badge">${displayLabel}：${count}</span>`;
}

function renderProjectManagerDetail() {
  if (!elements.pmProjectDetail) {
    return;
  }
  const project = state.projectManager.selectedProject;

  if (!project) {
    elements.pmProjectDetail.innerHTML = `<p class="helper">选择左侧项目查看详情</p>`;
    return;
  }

  // Delete confirmation view
  if (state.projectManager.deleteConfirm === getProjectRef(project)) {
    elements.pmProjectDetail.innerHTML = `
      <div class="pm-delete-confirm">
        <h4>确认删除这个项目？</h4>
        <p>项目 <strong>${escapeHtml(project.name)}</strong> 将被永久删除，此操作不可撤销。</p>
        <p class="helper">存放位置：${escapeHtml(project.path)}</p>
        <div class="pm-delete-confirm-actions">
          <button class="button button-ghost" data-pm-action="cancel-delete">取消</button>
          <button class="button button-primary" data-pm-action="confirm-delete" data-pm-project="${escapeHtml(getProjectRef(project))}">确认删除</button>
        </div>
      </div>
    `;
    return;
  }

  // Normal detail view
  const pptxFiles = project.pptx_files || [];
  const svgFiles = project.svg_final_files || [];

  elements.pmProjectDetail.innerHTML = `
    <div class="pm-detail-header">
      <h3 class="pm-detail-title">${escapeHtml(project.name)}</h3>
      <div class="pm-detail-actions">
        <button class="button button-ghost" data-pm-action="switch" data-pm-project="${escapeHtml(getProjectRef(project))}">切换到此项目</button>
        <button class="button button-primary" data-pm-action="delete" data-pm-project="${escapeHtml(getProjectRef(project))}">删除</button>
      </div>
    </div>
    <div class="pm-detail-section">
      <h4>基本信息</h4>
      <div class="pm-detail-grid">
        <div class="pm-detail-item">
          <span class="pm-detail-item-label">画布格式</span>
          <span class="pm-detail-item-value">${escapeHtml(project.canvas_label)}</span>
        </div>
        <div class="pm-detail-item">
          <span class="pm-detail-item-label">创建时间</span>
          <span class="pm-detail-item-value">${escapeHtml(project.created_at)}</span>
        </div>
        <div class="pm-detail-item">
          <span class="pm-detail-item-label">来源文件</span>
          <span class="pm-detail-item-value">${project.source_count} 个</span>
        </div>
        <div class="pm-detail-item">
          <span class="pm-detail-item-label">页面数量</span>
          <span class="pm-detail-item-value">${project.svg_final_count} 页</span>
        </div>
      </div>
    </div>
    <div class="pm-detail-section">
      <h4>项目位置</h4>
      <div class="pm-detail-path">${escapeHtml(project.path)}</div>
    </div>
    ${pptxFiles.length > 0 ? `
      <div class="pm-detail-section">
        <h4>导出的演示文稿文件 (${pptxFiles.length})</h4>
        <div class="pm-file-list">
          ${pptxFiles.slice(0, 10).map((file) => `
            <div class="pm-file-item">
              <span class="pm-file-icon pptx-icon">P</span>
              <span class="pm-file-name">${escapeHtml(file)}</span>
            </div>
          `).join("")}
          ${pptxFiles.length > 10 ? `<p class="helper">... 还有 ${pptxFiles.length - 10} 个文件</p>` : ""}
        </div>
      </div>
    ` : ""}
    ${svgFiles.length > 0 ? `
      <div class="pm-detail-section">
        <h4>页面文件 (${svgFiles.length})</h4>
        <div class="pm-file-list">
          ${svgFiles.slice(0, 10).map((file) => `
            <div class="pm-file-item">
              <span class="pm-file-icon svg-icon">页</span>
              <span class="pm-file-name">${escapeHtml(file)}</span>
            </div>
          `).join("")}
          ${svgFiles.length > 10 ? `<p class="helper">... 还有 ${svgFiles.length - 10} 个文件</p>` : ""}
        </div>
      </div>
    ` : ""}
  `;
}

function handleProjectManagerListClick(event) {
  const item = event.target.closest(".pm-item");
  if (!item) {
    return;
  }
  const projectName = item.dataset.pmProject;
  const project = getSelectedProjectByRef(projectName);
  if (project) {
    state.projectManager.selectedProject = project;
    state.projectManager.deleteConfirm = null;
    renderProjectManagerList();
    renderProjectManagerDetail();
  }
}

function handleProjectManagerDetailClick(event) {
  const button = event.target.closest("button[data-pm-action]");
  if (!button) {
    return;
  }
  const action = button.dataset.pmAction;
  const projectName = button.dataset.pmProject;

  if (action === "switch") {
    selectProject(projectName);
    closeProjectManagerModal();
  } else if (action === "delete") {
    state.projectManager.deleteConfirm = projectName;
    renderProjectManagerDetail();
  } else if (action === "cancel-delete") {
    state.projectManager.deleteConfirm = null;
    renderProjectManagerDetail();
  } else if (action === "confirm-delete") {
    deleteProject(projectName);
  }
}

async function deleteProject(projectName) {
  if (!projectName) {
    return;
  }

  try {
    setBusy(true);
    await apiFetch(`/api/projects/${encodeURIComponent(projectName)}`, {
      method: "DELETE",
    });

    // If deleted project was selected, clear selection
    if (getProjectRef(state.selectedProject) === projectName) {
      state.selectedProject = null;
    }

    // Clear detail view
    state.projectManager.selectedProject = null;
    state.projectManager.deleteConfirm = null;

    // Reload projects list
    await loadDashboard({ preserveSelection: false });

    showFlash(`项目 "${projectName}" 已删除`);
    appendLog("项目已删除", projectName);
    renderProjectManagerList();
    renderProjectManagerDetail();
  } catch (error) {
    showFlash(error.message, "error");
    appendLog("删除项目失败", error.message);
  } finally {
    setBusy(false);
  }
}

bootstrap();
