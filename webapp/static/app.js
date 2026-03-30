const FLOW_STEPS = [
  {
    id: "project",
    kicker: "Step 1",
    title: "创建项目",
    description: "新建项目，选择画布格式。",
  },
  {
    id: "sources",
    kicker: "Step 2",
    title: "导入来源",
    description: "导入文件或粘贴内容。",
  },
  {
    id: "template",
    kicker: "Step 3",
    title: "模板决策",
    description: "选择模板或自由设计。",
  },
  {
    id: "strategist",
    kicker: "Step 4",
    title: "设计规范",
    description: "确认画布、页数、风格、配色等。",
  },
  {
    id: "images",
    kicker: "Step 5",
    title: "AI 配图",
    description: "可选，生成配图。",
  },
  {
    id: "executor",
    kicker: "Step 6",
    title: "生成页面",
    description: "生成 SVG 页面和讲稿。",
  },
  {
    id: "post",
    kicker: "Step 7",
    title: "导出",
    description: "拆分备注、规范化、导出 PPTX。",
  },
];

const PIPELINE_GUIDE = {
  "split-notes": {
    description: "拆分 total.md 为逐页备注。",
    command: "python3 skills/ppt-master/scripts/total_md_split.py <project_path>",
  },
  "finalize-svg": {
    description: "规范化 SVG 写入 svg_final/。",
    command: "python3 skills/ppt-master/scripts/finalize_svg.py <project_path>",
  },
  "export-pptx": {
    description: "导出 PPTX 文件。",
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
  formats: [],
  steps: [],
  projects: [],
  selectedProject: null,
  projectFilter: "",
  activeStepId: "project",
  validation: null,
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
  busy: false,
};

const elements = {
  projectCount: document.getElementById("projectCount"),
  formatCount: document.getElementById("formatCount"),
  stepCount: document.getElementById("stepCount"),
  openModelConfigButton: document.getElementById("openModelConfigButton"),
  closeModelConfigButton: document.getElementById("closeModelConfigButton"),
  clearLogButton: document.getElementById("clearLogButton"),
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
};

async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.error
      || data.stderr
      || data.stdout
      || (data.returncode ? `Command failed with exit code ${data.returncode}` : "")
      || `Request failed: ${response.status}`;
    const error = new Error(detail);
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

function showFlash(message, type = "success") {
  elements.flash.textContent = message;
  elements.flash.className = `flash flash-${type}`;
  elements.flash.classList.remove("hidden");
}

function clearFlash() {
  elements.flash.className = "flash hidden";
  elements.flash.textContent = "";
}

function appendLog(title, payload) {
  const stamp = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  const divider = `\n[${stamp}] ${title}\n`;
  elements.logOutput.textContent = `${divider}${payload}\n${elements.logOutput.textContent}`.trim();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function metric(label, value, strong = false) {
  return `<span class="badge ${strong ? "badge-strong" : ""}">${escapeHtml(label)}: ${escapeHtml(String(value))}</span>`;
}

function getSelectedProjectByName(projectName) {
  return state.projects.find((item) => item.name === projectName) || null;
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
    return { disabled: true, reason: "需要先选择项目" };
  }

  if (stepId === "split-notes") {
    if (project.svg_output_count === 0) {
      return { disabled: true, reason: "需要先在 svg_output/ 中生成 SVG 文件" };
    }
    if (!project.has_total_notes) {
      return { disabled: true, reason: "需要先提供 notes/total.md" };
    }
    return { disabled: false, reason: "可执行" };
  }

  if (stepId === "finalize-svg") {
    if (project.svg_output_count === 0) {
      return { disabled: true, reason: "需要先在 svg_output/ 中生成 SVG 文件" };
    }
    if ((project.split_notes_count || 0) === 0) {
      return { disabled: true, reason: "需要先执行 Split Notes 生成逐页 notes/*.md" };
    }
    return { disabled: false, reason: "可执行" };
  }

  if (stepId === "export-pptx") {
    if ((project.split_notes_count || 0) === 0) {
      return { disabled: true, reason: "需要先执行 Split Notes 生成逐页 notes/*.md" };
    }
    if (project.svg_final_count === 0) {
      return { disabled: true, reason: "需要先执行 Finalize SVG 生成 svg_final/" };
    }
    return { disabled: false, reason: "可执行" };
  }

  return { disabled: false, reason: "可执行" };
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
    return "选择或创建项目";
  }
  if (project.source_count === 0) {
    return "导入来源内容";
  }
  if (!hasTemplateDecision(project)) {
    return "确认模板策略：使用模板或自由设计";
  }
  if (!hasDesignSpec(project)) {
    return "完成八项确认并生成 design_spec.md";
  }
  if (project.svg_output_count === 0) {
    return "继续 Executor 生成 svg_output/*.svg";
  }
  if (!project.has_total_notes) {
    if (!state.modelConfig?.configured) {
      return "先配置大模型 profile，再生成 total.md";
    }
    return "生成 notes/total.md";
  }
  if ((project.split_notes_count || 0) === 0) {
    return "运行 Split Notes";
  }
  if (project.svg_final_count === 0) {
    return "运行 Finalize SVG";
  }
  if (project.pptx_files.length === 0) {
    return "运行 Export PPTX";
  }
  return "预览与导出";
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
    return ["先选择一个项目。"];
  }

  const blockers = [];
  if (project.source_count === 0) {
    blockers.push("还没有导入任何来源内容。");
    return blockers;
  }
  if (!hasTemplateDecision(project)) {
    blockers.push("还没有完成模板决策。先在主流程里确认使用模板还是自由设计。");
    return blockers;
  }
  if (!hasDesignSpec(project)) {
    blockers.push("还没有 design_spec.md。需要先完成 Strategist 的八项确认和设计规范输出。");
    return blockers;
  }
  if (project.svg_output_count === 0) {
    blockers.push("当前还停留在页面生成阶段。需要继续 Executor，生成 svg_output/*.svg。");
    return blockers;
  }
  if (!project.has_total_notes) {
    blockers.push("还缺少 notes/total.md，Split Notes 还不能执行。");
    if (!state.modelConfig?.configured) {
      blockers.push("如果走标准模式，还需要先配置一个可用的大模型 profile。");
    }
    return blockers;
  }
  if ((project.split_notes_count || 0) === 0) {
    blockers.push("还没有逐页 notes/*.md，请先执行 Split Notes。");
    return blockers;
  }
  if (project.svg_final_count === 0) {
    blockers.push("还没有 svg_final/*.svg，请执行 Finalize SVG。");
    return blockers;
  }
  if (project.pptx_files.length === 0) {
    blockers.push("最终 SVG 已就绪，但还没有导出 PPTX。");
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

function getPipelineChecklist(project, stepId) {
  if (!project) {
    return [];
  }

  if (stepId === "split-notes") {
    return [
      { label: `svg_output/*.svg 已就绪 (${project.svg_output_count})`, ok: project.svg_output_count > 0 },
      { label: `notes/total.md 已存在 (${project.has_total_notes ? "yes" : "no"})`, ok: project.has_total_notes },
    ];
  }

  if (stepId === "finalize-svg") {
    return [
      { label: `Split Notes 已完成 (${project.split_notes_count || 0} 个逐页备注)`, ok: (project.split_notes_count || 0) > 0 },
      { label: `svg_output/*.svg 已就绪 (${project.svg_output_count})`, ok: project.svg_output_count > 0 },
    ];
  }

  if (stepId === "export-pptx") {
    return [
      { label: `Split Notes 已完成 (${project.split_notes_count || 0} 个逐页备注)`, ok: (project.split_notes_count || 0) > 0 },
      { label: `svg_final/*.svg 已就绪 (${project.svg_final_count})`, ok: project.svg_final_count > 0 },
    ];
  }

  return [];
}

function getPipelineOutputs(project, stepId) {
  if (!project) {
    return [];
  }

  if (stepId === "split-notes") {
    return [`notes/*.md: ${project.split_notes_count || 0}`];
  }

  if (stepId === "finalize-svg") {
    return [`svg_final/*.svg: ${project.svg_final_count}`];
  }

  if (stepId === "export-pptx") {
    return [`PPTX 文件: ${project.pptx_files.length}`];
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
    elements.modalProfileSummary.textContent = activeProfile
      ? `当前默认：${activeProfile.name} · ${activeProfile.backend} · ${activeProfile.model || "未指定模型"}`
      : "当前还没有可用配置。";
  }

  if (elements.modelProfileList) {
    elements.modelProfileList.innerHTML = profiles.length === 0
      ? `
        <div class="empty-state profile-empty">
          <strong>还没有保存的配置</strong>
          <p class="helper">先在右侧填写 Base URL、Key 和模型，再保存成一个 profile。</p>
        </div>
      `
      : profiles.map((profile) => `
        <article class="profile-item ${state.modelConfig.selected_profile_id === profile.id ? "profile-item-active" : ""}">
          <div class="profile-item-top">
            <div>
              <h3>${escapeHtml(profile.name)}</h3>
              <p>${escapeHtml(profile.backend)} · ${escapeHtml(profile.model || "未指定模型")}</p>
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
      ? `API Key (当前：${draft.api_key_masked})`
      : "API Key";
  }
  if (elements.modalFetchedModelSelect) {
    const options = knownModels.length === 0
      ? `<option value="">先获取模型列表</option>`
      : knownModels.map((modelId, index) => {
        const label = index === 0 && modelId === selectedModel && !state.modal.fetchedModels.includes(modelId)
          ? `当前值：${modelId}`
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
}

function closeModelConfigModal() {
  elements.modelConfigModal?.classList.add("hidden");
  elements.modelConfigModal?.setAttribute("aria-hidden", "true");
  unlockBackgroundScroll();
}

// ============ Image Model Modal Functions ============

function openImageModelModal() {
  loadImageModelConfig();
  elements.imageModelModal?.classList.remove("hidden");
  elements.imageModelModal?.setAttribute("aria-hidden", "false");
  lockBackgroundScroll();
}

function closeImageModelModal() {
  elements.imageModelModal?.classList.add("hidden");
  elements.imageModelModal?.setAttribute("aria-hidden", "true");
  unlockBackgroundScroll();
}

function renderImageModelModal() {
  const config = state.imageModelConfig;
  const profiles = config.profiles || [];
  const selectedId = config.selected_profile_id;
  const draft = state.imageModal.draft;

  // Profile list
  if (elements.imageModalProfileSummary) {
    if (profiles.length === 0) {
      elements.imageModalProfileSummary.textContent = "当前还没有可用配置。";
    } else {
      elements.imageModalProfileSummary.textContent = `共 ${profiles.length} 个配置，已选择: ${config.active_profile?.name || "无"}`;
    }
  }

  if (elements.imageModelProfileList) {
    if (profiles.length === 0) {
      elements.imageModelProfileList.innerHTML = `<p class="helper profile-empty">点击下方按钮新增配置。</p>`;
    } else {
      elements.imageModelProfileList.innerHTML = profiles.map((profile) => `
        <article class="profile-item ${selectedId === profile.id ? "profile-item-active" : ""}">
          <div class="profile-item-top">
            <div>
              <h3>${escapeHtml(profile.name)}</h3>
              <p>${escapeHtml(profile.backend)} · ${escapeHtml(profile.model || "默认模型")}</p>
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
    elements.imageApiKeyLabel.textContent = draft.api_key_masked ? `API Key (${draft.api_key_masked})` : "API Key";
  }

  // Update model dropdown and base URL based on backend
  const backendPresets = {
    gemini: { base_url: "", models: ["gemini-2.0-flash-exp", "gemini-1.5-flash", "gemini-1.5-pro"] },
    openai: { base_url: "", models: ["dall-e-3", "dall-e-2", "gpt-image-1"] },
    siliconflow: { base_url: "https://api.siliconflow.cn/v1", models: ["black-forest-labs/FLUX.1-schnell", "black-forest-labs/FLUX.1-dev", "Kwai-Kolors/Kolors", "stabilityai/stable-diffusion-3-medium", "stabilityai/stable-diffusion-xl-base-1.0", "Qwen/Qwen-Image-Edit-2509"] },
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
    showFlash("新增配置需要提供 API Key", "error");
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
    showFlash("图片模型配置已保存");
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
    showFlash("请先输入 API Key", "error");
    return;
  }

  try {
    clearFlash();
    setBusy(true);
    state.imageModal.testOutput = "测试中...";
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

    state.imageModal.testOutput = `测试成功\n后端: ${data.result?.backend || "unknown"}\n模型: ${data.result?.model || "unknown"}`;
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
    showFlash("请先在全局模型配置中设置并选择一个配置", "error");
    return;
  }

  // Copy values from active text model profile to image model form
  state.imageModal.draft = {
    id: "",
    name: activeProfile.name ? `${activeProfile.name} (图片)` : "全局配置复制",
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
      ? `API Key (${state.imageModal.draft.api_key_masked})`
      : "API Key";
  }
  if (elements.imageApiKeyInput) {
    elements.imageApiKeyInput.value = "";
  }

  showFlash("已从全局配置复制，请填写 API Key 后保存");
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
      </div>
    `;
    return;
  }

  const health = getProjectHealth(project);
  const blockerItems = health.blockers.length === 0
    ? `<li>当前没有明显阻塞，可以继续往下走。</li>`
    : health.blockers.slice(0, 3).map((item) => `<li>${escapeHtml(item)}</li>`).join("");

  elements.projectContext.innerHTML = `
    <div class="context-card">
      <div class="context-grid">
        <div class="context-main">
          <div class="context-top">
            <div>
              <h3 class="context-title">${escapeHtml(project.name)}</h3>
              <p class="context-text">${escapeHtml(health.nextStepLabel)}</p>
            </div>
            <div class="action-row context-actions">
              <button class="button button-ghost button-small" data-context-action="refresh">刷新</button>
              <button class="button button-ghost button-small" data-context-action="validate">校验</button>
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
          <div class="progress-track" aria-hidden="true">
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
    selectProject(project.name, { keepStep: true });
  });
  elements.projectContext.querySelector('[data-context-action="validate"]').addEventListener("click", () => validateProject(project.name));
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

    return `
      <button class="${className}" data-flow-step="${escapeHtml(step.id)}" ${canOpen ? "" : "disabled"}>
        <span class="step-number">${index + 1}</span>
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
        <article class="project-item ${state.selectedProject?.name === project.name ? "project-item-active" : ""}">
          <div class="project-top">
            <div>
              <h3 class="project-name">${escapeHtml(project.name)}</h3>
              <p class="project-meta">${escapeHtml(project.canvas_label)} · ${escapeHtml(project.created_at)}</p>
            </div>
            <div class="project-actions">
              <button class="button button-ghost" data-project-select="${escapeHtml(project.name)}">
                ${state.selectedProject?.name === project.name ? "当前项目" : "切换到此项目"}
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
          <p class="section-kicker">Create</p>
          <h2>新建项目</h2>
        </div>
        <form id="createProjectForm" class="stack">
          <label class="field">
            <span>项目名</span>
            <input type="text" name="project_name" placeholder="例如：annual_report" required>
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
          <p class="section-kicker">Recent</p>
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
    return renderLockedStage("先完成第 1 步，选择一个项目。");
  }

  return `
    <section class="subpanel">
      <div class="section-head">
        <p class="section-kicker">Import</p>
        <h2>导入到 ${escapeHtml(state.selectedProject.name)}</h2>
      </div>
      <form id="importForm" class="stack">
        <label class="field">
          <span>来源列表</span>
          <textarea name="sources" rows="6" placeholder="每行一个本地路径或 URL"></textarea>
        </label>
        <label class="checkbox">
          <input type="checkbox" name="move">
          <span>导入时移动文件，而不是复制</span>
        </label>
        <div class="two-col">
          <label class="field">
            <span>粘贴内容格式</span>
            <select name="pasted_format">
              <option value="markdown">Markdown</option>
              <option value="text">Plain Text</option>
            </select>
          </label>
          <label class="field">
            <span>生成文件名</span>
            <input type="text" name="pasted_filename" placeholder="例如：brief.md">
          </label>
        </div>
        <label class="field">
          <span>粘贴正文</span>
          <textarea name="pasted_content" rows="10" placeholder="把文本或 Markdown 直接贴在这里，后端会先生成文件再导入项目"></textarea>
        </label>
        <div class="action-row">
          <button type="submit" class="button button-secondary">导入并进入模板决策</button>
          <button type="button" class="button button-ghost" data-jump-step="project">切换项目</button>
        </div>
      </form>
      <p class="helper">支持 Markdown、PDF、DOCX、TXT、URL，以及直接粘贴文本或 Markdown。</p>
    </section>
  `;
}

function renderLockedStage(message) {
  return `
    <div class="empty-state">
      <strong>当前步骤还不能操作</strong>
      <p class="helper">${escapeHtml(message)}</p>
    </div>
  `;
}

function renderValidationDetails() {
  if (!state.validation || !state.selectedProject || state.validation.projectName !== state.selectedProject.name) {
    return `<p class="helper">还没有执行项目校验。建议在跑后处理前先做一次校验。</p>`;
  }

  const result = state.validation.result;
  return `
    <div class="stack">
      <div class="badge-row">
        ${metric("valid", result.is_valid ? "yes" : "no", result.is_valid)}
        ${metric("errors", result.errors.length)}
        ${metric("warnings", result.warnings.length)}
      </div>
      ${result.errors.length ? `<pre class="status-log">${escapeHtml(result.errors.join("\n"))}</pre>` : ""}
      ${result.warnings.length ? `<pre class="status-log">${escapeHtml(result.warnings.join("\n"))}</pre>` : ""}
    </div>
  `;
}

function renderTemplateStep() {
  if (!state.selectedProject) {
    return renderLockedStage("先完成第 1 步，选择一个项目。");
  }

  const project = state.selectedProject;
  const completed = hasTemplateDecision(project);

  // If already completed, show summary
  if (completed) {
    return `
      <div class="stack">
        <section class="subpanel">
          <div class="section-head">
            <p class="section-kicker">Decision</p>
            <h2>模板策略</h2>
          </div>
          <div class="status-grid">
            <article class="status-card status-ok">
              <strong>模板决策已完成</strong>
              <p class="helper">系统已检测到 design_spec.md 或下游产物，说明这一步已经完成或已被上游流程带过。</p>
            </article>
          </div>
          <div class="action-row">
            <button class="button button-ghost" data-jump-step="sources">查看已导入来源</button>
            ${hasDesignSpec(project) ? '<button class="button button-secondary" data-jump-step="strategist">查看设计规范阶段</button>' : ""}
          </div>
        </section>
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
    ? `<div class="empty-state"><p>加载模板列表...</p></div>`
    : "";

  const emptyHtml = !state.templatesLoading && templates.length === 0
    ? `<div class="empty-state"><p>暂无可用模板，可选择自由设计</p></div>`
    : "";

  return `
    <div class="stack">
      <section class="subpanel">
        <div class="section-head">
          <p class="section-kicker">Template</p>
          <h2>选择模板</h2>
        </div>
        <p class="helper">选择模板或自由设计。</p>

        <div class="template-options">
          <label class="template-option-free ${selectedId === null ? "template-option-selected" : ""}">
            <input type="radio" name="template_choice" value="" ${selectedId === null ? "checked" : ""} data-template-free>
            <div class="template-option-content">
              <strong>自由设计</strong>
              <p>AI 根据内容生成</p>
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
    return renderLockedStage("先完成第 1 步，选择一个项目。");
  }
  if (state.selectedProject.source_count === 0) {
    return renderLockedStage("先完成第 2 步，导入来源内容。");
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
            <p class="section-kicker">Strategist</p>
            <h2>分析中...</h2>
          </div>
          <div class="loading-indicator">
            <div class="loading-spinner"></div>
            <p>正在分析源内容，生成八项建议...</p>
          </div>
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
            <p class="section-kicker">Strategist</p>
            <h2>八项确认</h2>
          </div>
          <div class="status-card status-warn">
            <strong>需要先配置大模型</strong>
            <p class="helper">八项确认需要调用大模型分析源内容。请先配置一个可用的模型 profile。</p>
          </div>
          <div class="action-row">
            <button class="button button-primary" data-review-action="open-model-config">配置大模型</button>
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
            <p class="section-kicker">Strategist</p>
            <h2>设计规范与内容大纲</h2>
          </div>
          <div class="status-grid">
            <article class="status-card status-ok">
              <strong>design_spec.md 已就绪</strong>
              <p class="helper">系统已检测到设计规范文件，可以继续查看 AI 配图条件或进入 Executor。</p>
            </article>
          </div>
          <div class="asset-actions">
            ${renderDocLink(project.design_spec)}
          </div>
          <div class="action-row" style="margin-top: 12px;">
            <button class="button button-ghost" data-strategist-action="reanalyze">重新分析</button>
            <button class="button button-secondary" data-jump-step="executor">继续到 Executor</button>
          </div>
        </section>
      </div>
    `;
  }

  // If no analysis yet, show start button
  if (!state.strategistAnalysis) {
    return `
      <div class="stack">
        <section class="subpanel">
          <div class="section-head">
            <p class="section-kicker">Strategist</p>
            <h2>设计规范</h2>
          </div>
          <p class="helper">点击"开始分析"后，AI 将分析源内容并生成八项建议。</p>
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
          <p class="section-kicker">Strategist</p>
          <h2>设计规范</h2>
        </div>

        <form id="strategistForm" class="confirmation-form">
          <div class="confirmation-section">
            <h3>画布格式</h3>
            <div class="confirmation-row">
              ${renderField("选择格式", "canvas_format", "select", formatOptions)}
            </div>
          </div>

          <div class="confirmation-section">
            <h3>页数范围</h3>
            <div class="confirmation-row two-col-inline">
              ${renderField("最小页数", "page_count_min", "number", { placeholder: "8" })}
              ${renderField("最大页数", "page_count_max", "number", { placeholder: "12" })}
            </div>
          </div>

          <div class="confirmation-section">
            <h3>目标受众</h3>
            <div class="confirmation-row">
              ${renderField("受众描述", "target_audience", "text")}
            </div>
          </div>

          <div class="confirmation-section">
            <h3>风格目标</h3>
            <div class="confirmation-row">
              ${renderField("选择风格", "style_objective", "select", styleOptions)}
            </div>
          </div>

          <div class="confirmation-section">
            <h3>配色方案</h3>
            <div class="confirmation-row three-col-inline">
              ${renderField("主色", "color_primary", "color")}
              ${renderField("辅色", "color_secondary", "color")}
              ${renderField("强调色", "color_accent", "color")}
            </div>
          </div>

          <div class="confirmation-section">
            <h3>图标使用</h3>
            <div class="confirmation-row">
              ${renderField("图标方案", "icon_approach", "select", iconOptions)}
            </div>
          </div>

          <div class="confirmation-section">
            <h3>字体方案</h3>
            <div class="confirmation-row three-col-inline">
              ${renderField("标题字体", "title_font", "text")}
              ${renderField("正文字体", "body_font", "text")}
              ${renderField("字号", "body_size", "number", { placeholder: "24" })}
            </div>
          </div>

          <div class="confirmation-section">
            <h3>图片使用</h3>
            <div class="confirmation-row">
              ${renderField("图片方案", "image_approach", "select", imageOptions)}
            </div>
          </div>

          <div class="action-row">
            <button type="button" class="button button-ghost" data-strategist-action="reanalyze">重新分析</button>
            <button type="submit" class="button button-primary">保存设计规范</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderImagesStep() {
  if (!state.selectedProject) {
    return renderLockedStage("先完成第 1 步，选择一个项目。");
  }
  if (!hasDesignSpec(state.selectedProject)) {
    return renderLockedStage("先完成第 4 步，产出 design_spec.md。");
  }

  const project = state.selectedProject;
  const downstreamStarted = project.svg_output_count > 0 || project.has_total_notes || project.svg_final_count > 0;
  const imageConfig = state.imageModelConfig;
  const activeImageProfile = imageConfig.active_profile;
  const imgGen = state.imageGeneration;

  // Count existing images
  const imageCount = project.source_markdown?.length || 0; // We'll use a simpler check

  // Get image approach from strategist analysis if available
  const imageApproach = state.eightConfirmations.image_approach || "none";
  const needsImages = imageApproach === "ai-generated";

  if (downstreamStarted && !needsImages) {
    return `
      <div class="stack">
        <section class="subpanel">
          <div class="section-head">
            <p class="section-kicker">Optional</p>
            <h2>AI 配图</h2>
          </div>
          <div class="badge-row">
            ${metric("状态", "已跳过")}
          </div>
          <p class="helper">设计规范未要求 AI 配图。</p>
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
            <p class="section-kicker">Generating</p>
            <h2>生成图片</h2>
          </div>
          <div class="loading-indicator">
            <div class="loading-spinner"></div>
            <p>生成中...</p>
          </div>
        </section>
      </div>
    `;
  }

  const profileOptions = (imageConfig.profiles || []).map((profile) => {
    const label = `${profile.name} · ${profile.backend}${profile.model ? ` · ${profile.model}` : ""}`;
    return `<option value="${escapeHtml(profile.id)}" ${activeImageProfile?.id === profile.id ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");

  return `
    <div class="stack">
      <section class="subpanel">
        <div class="section-head">
          <p class="section-kicker">Optional</p>
          <h2>AI 配图</h2>
        </div>

        ${!activeImageProfile?.configured ? `
          <p class="helper">需要配置图片生成模型。</p>
          <div class="action-row">
            <button class="button button-primary" data-image-action="open-config">配置模型</button>
            <button class="button button-ghost" data-jump-step="executor">跳过</button>
          </div>
        ` : `
          <p class="helper">输入图片描述生成配图。</p>
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
            <button class="button button-ghost" data-jump-step="executor">跳过</button>
          </div>
          ${imgGen.lastResult ? `
            <div class="status-card status-ok" style="margin-top: 12px;">
              <strong>生成成功</strong>
              <p class="helper">${escapeHtml(imgGen.lastResult.filename)}</p>
            </div>
          ` : ""}
          ${imgGen.error ? `
            <div class="status-card status-error" style="margin-top: 12px;">
              <strong>失败</strong>
              <p class="helper">${escapeHtml(imgGen.error)}</p>
            </div>
          ` : ""}
        `}
      </section>
    </div>
  `;
}

function renderExecutorStep() {
  if (!state.selectedProject) {
    return renderLockedStage("先完成第 1 步，选择一个项目。");
  }
  if (!hasDesignSpec(state.selectedProject)) {
    return renderLockedStage("先完成第 4 步，产出 design_spec.md。");
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
      <span>当前使用的模型配置</span>
      <select id="reviewProfileSelect" ${profiles.length === 0 ? "disabled" : ""}>
        ${profiles.length === 0 ? '<option value="">先新增模型配置</option>' : profileOptions}
      </select>
    </label>
  `;

  const modelConfigButtonHtml = `
    <button class="button button-ghost" type="button" data-review-action="open-model-config">配置大模型</button>
  `;

  // SVG preview section (shown when there are existing SVGs)
  const svgPreviewHtml = project.svg_output_count > 0 ? `
    <section class="subpanel">
      <div class="section-head">
        <p class="section-kicker">Preview</p>
        <h2>已生成页面</h2>
      </div>
      <div class="badge-row">
        ${metric("svg_output", project.svg_output_count)}
      </div>
      <div class="preview-grid" style="margin-top: 12px;">
        ${renderSlides(project.preview_slides)}
      </div>
      <div class="action-row" style="margin-top: 12px;">
        <button class="button button-ghost" type="button" data-review-action="regenerate-all">重新生成全部</button>
        <button class="button button-ghost" type="button" data-review-action="delete-all-svg">删除全部 SVG</button>
      </div>
    </section>
  ` : "";

  return `
    <div class="stack">
      <section class="subpanel">
        <div class="section-head">
          <p class="section-kicker">Executor</p>
          <h2>页面生成与讲稿补齐</h2>
        </div>
        <div class="badge-row">
          ${metric("design_spec", hasDesignSpec(project) ? "ready" : "missing", hasDesignSpec(project))}
          ${metric("svg_output", project.svg_output_count)}
          ${metric("total.md", project.has_total_notes ? "ok" : "-", project.has_total_notes)}
        </div>

        ${phase === "awaiting-model" ? `
          <p class="helper">先配置大模型。</p>
          <div class="action-row">
            <button class="button button-primary" data-review-action="open-model-config">配置模型</button>
          </div>
        ` : ""}

        ${phase === "ready-svg" ? `
          <p class="helper">点击生成 SVG 页面。</p>
          ${profileSelectHtml}
          <div class="action-row">
            <button class="button button-primary" data-review-action="generate-svg">生成 SVG</button>
            ${modelConfigButtonHtml}
          </div>
        ` : ""}

        ${phase === "generating" ? `
          <div class="status-card status-info">
            <strong>${svgGen.mode === "regenerate" ? "重新生成中..." : "生成中..."}</strong>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${svgGen.totalPages > 0 ? Math.round((svgGen.generatedPages / svgGen.totalPages) * 100) : 0}%"></div>
            </div>
            <p class="helper">${svgGen.generatedPages} / ${svgGen.totalPages} 页</p>
          </div>
          <div class="log-panel">
            <pre class="status-log">${svgGen.log.slice(-10).map((line) => escapeHtml(line)).join("\n")}</pre>
          </div>
        ` : ""}

        ${phase === "ready-notes" ? `
          <p class="helper">SVG 完成，生成讲稿。</p>
          ${profileSelectHtml}
          <div class="action-row">
            <button class="button button-primary" data-review-action="generate-notes">生成讲稿</button>
            ${modelConfigButtonHtml}
          </div>
        ` : ""}

        ${phase === "complete" ? `
          <p class="helper">已完成，进入导出。</p>
          <div class="action-row">
            <button class="button button-primary" data-jump-step="post">进入导出</button>
          </div>
        ` : ""}
      </section>

      ${svgPreviewHtml}
    </div>
  `;
}

function renderPipelineStep() {
  if (!state.selectedProject) {
    return renderLockedStage("先完成第 1 步，选择一个项目。");
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
                <p class="section-kicker">Stage ${index + 1}</p>
                <h3 class="card-title">${escapeHtml(step.label)}</h3>
                <p class="helper">${escapeHtml(guide.description || "")}</p>
                <p class="step-state ${stepState.disabled ? "step-state-warn" : "step-state-ok"}">${escapeHtml(stepState.reason)}</p>
              </div>
              <button
                class="button button-secondary step-card-run"
                data-run-step="${escapeHtml(step.id)}"
                ${stepState.disabled ? "disabled" : ""}
              >
                运行 ${escapeHtml(step.label)}
              </button>
            </div>
            <div class="step-card-grid">
              <div class="detail-block">
                <p class="detail-title">前置条件</p>
                <div class="checklist">
                  ${checklist.map((item) => `
                    <div class="checklist-item ${item.ok ? "checklist-item-ok" : "checklist-item-warn"}">
                      <span class="check-indicator">${item.ok ? "Ready" : "Hold"}</span>
                      <span>${escapeHtml(item.label)}</span>
                    </div>
                  `).join("")}
                </div>
              </div>
              <div class="detail-block">
                <p class="detail-title">本步产出</p>
                <div class="badge-row">
                  ${outputs.map((item) => metric("output", item)).join("")}
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
    return `<p class="helper">还没有可预览的 SVG 页面。</p>`;
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
}

function closeSvgPreviewModal() {
  if (elements.svgPreviewModal) {
    elements.svgPreviewModal.classList.add("hidden");
    elements.svgPreviewModal.setAttribute("aria-hidden", "true");
  }
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
    elements.svgPreviewImg.alt = slide?.name || "SVG Preview";
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
    const response = await fetch(url);
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
    return renderLockedStage("先完成第 1 步，选择一个项目。");
  }

  const project = state.selectedProject;
  const deliverySummary = [
    metric("pptx", project.pptx_files.length, project.pptx_files.length > 0),
    metric("svg_final", project.svg_final_count, project.svg_final_count > 0),
    metric("notes/*.md", project.split_notes_count || 0, (project.split_notes_count || 0) > 0),
    metric("sources", project.source_count, project.source_count > 0),
  ].join("");
  return `
    <div class="stack">
      <section class="subpanel">
        <div class="section-head">
          <p class="section-kicker">Summary</p>
          <h2>交付总览</h2>
        </div>
        <div class="badge-row">${deliverySummary}</div>
      </section>

      <section class="subpanel">
        <div class="section-head">
          <p class="section-kicker">Docs</p>
          <h2>关键文档</h2>
        </div>
        <div class="asset-actions">
          ${renderDocLink(project.total_notes, { emptyText: '<span class="helper">还没有 total.md</span>' })}
          ${renderDocLink(project.design_spec, { emptyText: '<span class="helper">还没有设计规范文件</span>' })}
        </div>
      </section>

      <section class="subpanel">
        <div class="section-head">
          <p class="section-kicker">Outputs</p>
          <h2>PPTX 产物</h2>
        </div>
        <div class="asset-actions">${renderLinks(project.pptx_files, "还没有 PPTX 文件")}</div>
      </section>

      <section class="subpanel">
        <div class="section-head">
          <p class="section-kicker">Sources</p>
          <h2>归档来源</h2>
        </div>
        <div class="asset-actions">${project.source_markdown && project.source_markdown.length > 0 ? project.source_markdown.map((item) => renderDocLink(item)).join("") : '<p class="helper">还没有归档的 Markdown 来源</p>'}</div>
      </section>

      <section class="subpanel">
        <div class="section-head">
          <p class="section-kicker">Preview</p>
          <h2>SVG 预览</h2>
        </div>
        <div class="asset-actions">${renderLinks(project.all_slides, "还没有 SVG 文件")}</div>
        <div class="preview-grid">${renderSlides(project.preview_slides)}</div>
      </section>
    </div>
  `;
}

function renderPostStep() {
  if (!state.selectedProject) {
    return renderLockedStage("先完成第 1 步，选择一个项目。");
  }

  const project = state.selectedProject;
  const preflight = [
    {
      label: "svg_output",
      ok: project.svg_output_count > 0,
      desc: project.svg_output_count > 0 ? `已生成 ${project.svg_output_count} 个 SVG 页面` : "缺失。需要先完成 Executor 的页面生成部分。",
    },
    {
      label: "notes/total.md",
      ok: project.has_total_notes,
      desc: project.has_total_notes ? "已准备，可以执行 Split Notes" : "缺失。需要先完成 Executor 的讲稿生成部分。",
    },
    {
      label: "notes/*.md",
      ok: (project.split_notes_count || 0) > 0,
      desc: (project.split_notes_count || 0) > 0 ? `已拆分 ${project.split_notes_count} 个逐页备注` : "还没拆分，将在 Split Notes 后生成。",
    },
    {
      label: "svg_final",
      ok: project.svg_final_count > 0,
      desc: project.svg_final_count > 0 ? `已生成 ${project.svg_final_count} 个最终 SVG` : "还没生成，将在 Finalize SVG 后生成。",
    },
  ];

  return `
    <div class="stack">
      <section class="subpanel">
        <div class="section-head">
          <p class="section-kicker">Preflight</p>
          <h2>进入后处理前检查</h2>
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
          <button class="button button-secondary" data-review-action="validate">执行项目校验</button>
          <button class="button button-ghost" data-review-action="refresh">刷新项目状态</button>
          <button class="button button-ghost" data-jump-step="executor">回到 Executor</button>
        </div>
      </section>

      <section class="subpanel">
        <div class="section-head">
          <p class="section-kicker">Validation</p>
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
}

function renderAll() {
  renderStats();
  renderProjectContext();
  renderStepRail();
  renderStage();
}

function syncSelectedProject() {
  if (!state.selectedProject) {
    return;
  }
  const refreshed = getSelectedProjectByName(state.selectedProject.name);
  state.selectedProject = refreshed;
  if (!state.selectedProject) {
    state.validation = null;
    state.activeStepId = "project";
  }
}

async function loadDashboard({ preserveSelection = true } = {}) {
  const data = await apiFetch("/api/dashboard");
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
    showFlash(`加载模板列表失败: ${error.message}`, "error");
    appendLog("加载模板列表失败", error.message);
  } finally {
    state.templatesLoading = false;
    renderStage();
  }
}

async function applyTemplate(projectName, templateId) {
  if (!templateId) {
    showFlash("请先选择一个模板", "error");
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

    appendLog("模板应用成功", JSON.stringify(data.copied_files, null, 2));
    showFlash(`已应用模板: ${templateId}`);

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
    showFlash("请先选择项目", "error");
    return;
  }

  const activeProfile = getActiveProfile();
  if (!activeProfile?.configured) {
    showFlash("请先配置大模型", "error");
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
    appendLog("分析完成", `使用模型: ${data.recommendations?.model_used || "unknown"}`);
    showFlash("分析完成，请确认八项建议");

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
    appendLog("分析失败", error.payload ? JSON.stringify(error.payload, null, 2) : error.message);
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

    appendLog("设计规范已保存", `design_spec.md`);
    showFlash("设计规范已保存");

    // Refresh and move to next step
    await loadDashboard();
    state.activeStepId = "images";
    renderAll();
  } catch (error) {
    showFlash(error.message, "error");
    appendLog("保存失败", error.payload ? JSON.stringify(error.payload, null, 2) : error.message);
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
    appendLog("项目创建成功", JSON.stringify(data.project, null, 2));
    showFlash(`已创建项目 ${data.project.name}`);
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
    showFlash("先选择项目", "error");
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
    showFlash("填入来源列表，或者直接粘贴正文", "error");
    return;
  }

  try {
    clearFlash();
    setBusy(true);
    const data = await apiFetch(`/api/projects/${encodeURIComponent(state.selectedProject.name)}/import`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    appendLog("导入完成", JSON.stringify(data.summary, null, 2));
    showFlash(`已导入到 ${state.selectedProject.name}`);
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
    appendLog(`校验完成 ${projectName}`, JSON.stringify(data.validation, null, 2));
    showFlash(data.validation.is_valid ? "校验通过" : "校验发现问题", data.validation.is_valid ? "success" : "error");
    await loadDashboard();
    renderAll();
  } catch (error) {
    showFlash(error.message, "error");
    appendLog("校验失败", error.payload ? JSON.stringify(error.payload, null, 2) : error.message);
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
    showFlash("配置名称不能为空", "error");
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
      fetchMessage: "配置已保存。默认使用当前所选 profile。",
    });
    appendLog("模型配置已保存", JSON.stringify(data.model_config, null, 2));
    showFlash("模型配置已保存");
    state.activeStepId = state.selectedProject ? "executor" : state.activeStepId;
    renderAll();
    renderModelConfigModal();
  } catch (error) {
    showFlash(error.message, "error");
    appendLog("模型配置保存失败", error.payload ? JSON.stringify(error.payload, null, 2) : error.message);
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
      showFlash("已切换当前模型配置");
    }
    renderAll();
    renderModelConfigModal();
  } catch (error) {
    showFlash(error.message, "error");
    appendLog("切换模型配置失败", error.payload ? JSON.stringify(error.payload, null, 2) : error.message);
  } finally {
    setBusy(false);
  }
}

async function deleteModelProfile(profileId) {
  if (!profileId) {
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
    showFlash("模型配置已删除");
    renderAll();
    renderModelConfigModal();
  } catch (error) {
    showFlash(error.message, "error");
    appendLog("删除模型配置失败", error.payload ? JSON.stringify(error.payload, null, 2) : error.message);
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
    showFlash("先提供 API Key 再获取模型列表", "error");
    return;
  }
  if (!payload.api_key) {
    showFlash("编辑已有配置时，重新获取模型列表需要再次输入 API Key", "error");
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
      ? `已获取 ${state.modal.fetchedModels.length} 个模型 ID。`
      : "接口可访问，但没有返回可选模型。";
    renderModelConfigModal();
  } catch (error) {
    state.modal.fetchError = true;
    state.modal.fetchMessage = error.message;
    renderModelConfigModal();
    showFlash(error.message, "error");
    appendLog("获取模型列表失败", error.payload ? JSON.stringify(error.payload, null, 2) : error.message);
  } finally {
    setBusy(false);
  }
}

async function testModelConfig() {
  syncModalDraftFromInputs();
  const profile = getDraftPayload();

  if (!profile.api_key && !state.modal.draft.api_key_masked) {
    showFlash("先提供 API Key 再测试模型", "error");
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

    showFlash("模型测试成功");
    appendLog("模型测试成功", JSON.stringify(result, null, 2));
  } catch (error) {
    state.modal.testError = true;
    state.modal.testMessage = error.message;
    state.modal.testOutput = "";
    renderModelConfigModal();

    showFlash(error.message, "error");
    appendLog("模型测试失败", error.payload ? JSON.stringify(error.payload, null, 2) : error.message);
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
    appendLog(`步骤完成 ${data.step.label}`, output || "No output");
    showFlash(`${data.step.label} 执行完成`);
    state.selectedProject = data.project;
    moveToRecommendedStep();
    await loadDashboard();
    renderAll();
  } catch (error) {
    const detail = error.payload ? JSON.stringify(error.payload, null, 2) : error.message;
    showFlash(error.message, "error");
    appendLog(`步骤失败 ${stepId}`, detail);
  } finally {
    setBusy(false);
  }
}

async function generateNotes(projectName) {
  const activeProfile = getActiveProfile();
  if (!activeProfile) {
    showFlash("先配置并选中一个模型 profile", "error");
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
    appendLog(`notes/total.md 生成完成 (${activeProfile.name})`, output || "No output");
    showFlash("已生成 notes/total.md");
    state.selectedProject = data.project;
    moveToRecommendedStep();
    await loadDashboard();
    renderAll();
  } catch (error) {
    const detail = error.payload ? JSON.stringify(error.payload, null, 2) : error.message;
    showFlash(error.message, "error");
    appendLog("notes/total.md 生成失败", detail);
  } finally {
    setBusy(false);
  }
}

async function generateSvg(projectName) {
  const activeProfile = getActiveProfile();
  if (!activeProfile) {
    showFlash("先配置并选中一个模型 profile", "error");
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
    log: ["开始生成 SVG 页面..."],
    mode: "generate",
  };

  clearFlash();
  renderAll();

  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectName)}/generate-svg`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        profile_id: activeProfile.id,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
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
    showFlash(`SVG 生成失败: ${error.message}`, "error");
    appendLog("SVG 生成失败", error.message);
  } finally {
    state.svgGeneration.inProgress = false;
    await loadDashboard();
    renderAll();
  }
}

async function regenerateAllSvg(projectName) {
  const activeProfile = getActiveProfile();
  if (!activeProfile) {
    showFlash("先配置并选中一个模型 profile", "error");
    return;
  }

  if (!confirm("确定要重新生成所有 SVG 页面吗？现有的 SVG 文件将被覆盖。")) {
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
    log: ["开始重新生成所有 SVG 页面..."],
    mode: "regenerate",
  };

  clearFlash();
  renderAll();

  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectName)}/regenerate-svg`, {
      method: "POST",
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
      throw new Error(errorData.error || `HTTP ${response.status}`);
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
    showFlash(`重新生成失败: ${error.message}`, "error");
    appendLog("重新生成失败", error.message);
  } finally {
    state.svgGeneration.inProgress = false;
    state.svgGeneration.mode = "generate";
    await loadDashboard();
    renderAll();
  }
}

async function deleteAllSvg(projectName) {
  if (!confirm("确定要删除所有 SVG 文件吗？这将同时删除 svg_output/ 和 svg_final/ 中的所有 SVG 文件，以及相关的讲稿文件。")) {
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
    appendLog("已删除 SVG 文件", `共 ${data.deleted_files?.length || 0} 个文件`);
    showFlash(`已删除 ${data.deleted_files?.length || 0} 个 SVG 文件`);
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
      state.svgGeneration.log.push(`模型: ${data.model || "unknown"} (${data.backend || "unknown"})`);
      if (data.regenerate) {
        state.svgGeneration.log.push(`共 ${data.total_pages} 页待重新生成`);
      } else {
        state.svgGeneration.log.push(`共 ${data.total_pages} 页待生成`);
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
      state.svgGeneration.errors.push(data.error || "Unknown error");
      state.svgGeneration.log.push(`✗ 页面 ${data.page_number} 失败: ${data.error}`);
      break;

    case "complete":
      state.svgGeneration.inProgress = false;
      state.svgGeneration.log.push(`${isRegenerate ? "重新生成" : "生成"}完成: ${data.generated}/${data.total_pages} 页`);
      if (data.errors && data.errors.length > 0) {
        state.svgGeneration.log.push(`错误: ${data.errors.length} 页`);
      }
      showFlash(`SVG ${isRegenerate ? "重新生成" : "生成"}完成: ${data.generated}/${data.total_pages} 页`);
      appendLog(`SVG ${isRegenerate ? "重新生成" : "生成"}完成`, state.svgGeneration.log.join("\n"));
      if (data.project) {
        state.selectedProject = data.project;
      }
      break;

    default:
      console.log("Unknown SSE event:", eventType, data);
  }

  // Re-render to update progress
  renderAll();
}

async function generateImage(projectName) {
  const activeProfile = state.imageModelConfig?.active_profile;
  if (!activeProfile) {
    showFlash("先配置并选中一个图片生成模型", "error");
    return;
  }

  const promptInput = document.getElementById("imagePromptInput");
  const aspectSelect = document.getElementById("imageAspectSelect");
  const sizeSelect = document.getElementById("imageSizeSelect");
  const filenameInput = document.getElementById("imageFilenameInput");

  const prompt = (promptInput?.value || "").trim();
  if (!prompt) {
    showFlash("请输入图片描述", "error");
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
    showFlash(`图片生成成功: ${data.image.filename}`);
    appendLog("图片生成成功", `Prompt: ${prompt}\n文件: ${data.image.filename}`);
    if (data.project) {
      state.selectedProject = data.project;
    }
    await loadDashboard();
  } catch (error) {
    state.imageGeneration.inProgress = false;
    state.imageGeneration.error = error.message;
    showFlash(`图片生成失败: ${error.message}`, "error");
    appendLog("图片生成失败", error.message);
  } finally {
    renderAll();
  }
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
    fetchMessage: "新 profile 默认用下拉选择模型，也可以手动输入。",
  });
  renderModelConfigModal();
}

async function bootstrap() {
  try {
    setBusy(true);
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
    elements.closeModelConfigButton?.addEventListener("click", closeModelConfigModal);
    elements.clearLogButton?.addEventListener("click", () => {
      elements.logOutput.textContent = "等待操作…";
    });
    elements.modelConfigBackdrop?.addEventListener("click", closeModelConfigModal);
    elements.modelConfigForm?.addEventListener("submit", saveModelConfig);
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
    elements.pmSearchInput?.addEventListener("input", (event) => {
      state.projectManager.searchQuery = event.currentTarget.value || "";
      renderProjectManagerList();
    });
    elements.pmProjectList?.addEventListener("click", handleProjectManagerListClick);
    elements.pmProjectDetail?.addEventListener("click", handleProjectManagerDetailClick);
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
        closeSvgPreviewModal();
        closeProjectManagerModal();
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
    await loadDashboard({ preserveSelection: false });
  } catch (error) {
    showFlash(error.message, "error");
    appendLog("初始化失败", error.message);
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
  renderProjectManagerList();
  renderProjectManagerDetail();
}

function closeProjectManagerModal() {
  state.projectManager.isOpen = false;
  elements.projectManagerModal?.classList.add("hidden");
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
    const isSelected = state.projectManager.selectedProject?.name === project.name;
    return `
      <article class="pm-item ${isSelected ? "pm-item-active" : ""}" data-pm-project="${escapeHtml(project.name)}">
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
  return `<span class="badge">${label}: ${count}</span>`;
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
  if (state.projectManager.deleteConfirm === project.name) {
    elements.pmProjectDetail.innerHTML = `
      <div class="pm-delete-confirm">
        <h4>确认删除项目？</h4>
        <p>项目 <strong>${escapeHtml(project.name)}</strong> 将被永久删除，此操作不可撤销。</p>
        <p class="helper">路径: ${escapeHtml(project.path)}</p>
        <div class="pm-delete-confirm-actions">
          <button class="button button-ghost" data-pm-action="cancel-delete">取消</button>
          <button class="button button-primary" data-pm-action="confirm-delete" data-pm-project="${escapeHtml(project.name)}">确认删除</button>
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
        <button class="button button-ghost" data-pm-action="switch" data-pm-project="${escapeHtml(project.name)}">切换到此项目</button>
        <button class="button button-primary" data-pm-action="delete" data-pm-project="${escapeHtml(project.name)}">删除</button>
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
          <span class="pm-detail-item-label">SVG 页面</span>
          <span class="pm-detail-item-value">${project.svg_final_count} 页</span>
        </div>
      </div>
    </div>
    <div class="pm-detail-section">
      <h4>项目路径</h4>
      <div class="pm-detail-path">${escapeHtml(project.path)}</div>
    </div>
    ${pptxFiles.length > 0 ? `
      <div class="pm-detail-section">
        <h4>PPTX 文件 (${pptxFiles.length})</h4>
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
        <h4>SVG 文件 (${svgFiles.length})</h4>
        <div class="pm-file-list">
          ${svgFiles.slice(0, 10).map((file) => `
            <div class="pm-file-item">
              <span class="pm-file-icon svg-icon">S</span>
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
  const project = state.projects.find((p) => p.name === projectName);
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
    if (state.selectedProject?.name === projectName) {
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
    appendLog("删除项目失败", error.payload ? JSON.stringify(error.payload, null, 2) : error.message);
  } finally {
    setBusy(false);
  }
}

bootstrap();
