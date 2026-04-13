// =============================================================================
// PPT Master Web - 模块化重构版本
// =============================================================================
// 保持原有设计语言，按功能模块化组织代码
// 后续可逐步拆分为独立文件：js/modules/auth.js, js/modules/dashboard.js 等
// =============================================================================

// ============ 常量与状态（拆分模块） ============
const { FLOW_STEPS, PIPELINE_GUIDE } = window.PPTM_CONSTANTS;
const { createEmptyModelConfig, createDraft, createInitialState } = window.PPTM_STATE;
const { escapeHtml } = window.PPTM_UTILS;
const state = createInitialState();

// ============ DOM 元素缓存（拆分模块） ============
const { elements, cacheElements } = window.PPTM_DOM;

const uiModule = window.PPTM_UI.createUiModule({
  state,
  elements,
  escapeHtml,
  createDraft,
});

let templatesModule;
let shellModule;
const nextCore = window.PPTM_NEXT_CORE || {};
const nextApp = window.PPTM_NEXT_APP || {};
const nextStore = nextCore.store?.createStore ? nextCore.store.createStore(state) : null;
const nextStateActions = nextCore.actions?.createStateActions ? nextCore.actions.createStateActions(nextStore) : null;
const nextBootstrapContext = nextApp.bootstrap?.createBootstrapContext
  ? nextApp.bootstrap.createBootstrapContext({
      store: nextStore,
      state,
      actions: nextStateActions,
      pageType: document.body.dataset.page || "workspace",
    })
  : null;

function syncNextState(reason = "sync") {
  if (!nextStore?.replaceState) return state;
  nextStore.replaceState(state);
  if (nextBootstrapContext) {
    nextBootstrapContext.options = {
      ...(nextBootstrapContext.options || {}),
      lastSyncReason: reason,
    };
  }
  return state;
}

window.PPTM_NEXT_RUNTIME = {
  context: nextBootstrapContext,
  state,
  store: nextStore,
  actions: nextStateActions,
  syncState: syncNextState,
};

// ============ API 封装 ============

function fallbackNormalizeProject(project) {
  if (!project || typeof project !== "object") return project;
  const slides = (project.slides || project.all_slides || project.preview_slides || []).map((slide, index) => ({
    ...slide,
    title: slide.title || slide.name || `页面 ${index + 1}`,
    thumbnail: slide.thumbnail || slide.url,
  }));
  const sources = (project.sources || project.source_markdown || []).map((source) => ({
    ...source,
    path: source.path || source.url || "",
  }));
  const imageList = (project.image_list || project.image_resources || []).map((image, index) => ({
    ...image,
    description: image.description || image.prompt || image.purpose || image.filename || `图片 ${index + 1}`,
    aspect_ratio: image.aspect_ratio || "1:1",
  }));
  const pptxFile = project.pptx_path ? { url: project.pptx_path } : ((project.pptx_files || [])[0] || null);
  const designSpecPath = project.design_spec_path || project.design_spec?.url || project.path || "";
  const hasTemplate = Boolean(project.template_id || project.free_design || project.has_spec || designSpecPath);
  const hasExecutorOutput = Boolean(project.executor_done || (project.svg_output_count || 0) > 0 || slides.length > 0);
  const hasFinalSvg = Boolean(project.svg_final_path || (project.svg_final_count || 0) > 0);
  const hasSplitNotes = Boolean(project.notes_split_path || (project.split_notes_count || 0) > 0);
  return {
    ...project,
    format: project.format || project.canvas_label || project.canvas_format || "",
    source_count: project.source_count || sources.length,
    sources,
    slides,
    slide_count: project.slide_count || slides.length || project.svg_output_count || 0,
    image_list: imageList,
    template_id: project.template_id || (hasTemplate ? "__inferred__" : null),
    design_spec_path: designSpecPath || null,
    design_spec: project.design_spec || null,
    executor_done: hasExecutorOutput,
    svg_output_path: project.svg_output_path || (hasExecutorOutput ? (slides[0]?.url || "__generated__") : null),
    svg_final_path: project.svg_final_path || (hasFinalSvg ? "__generated__" : null),
    notes_split_path: project.notes_split_path || (hasSplitNotes ? (project.total_notes?.url || "__generated__") : null),
    exported: Boolean(project.exported || pptxFile),
    pptx_path: project.pptx_path || pptxFile?.url || null,
    free_design: Boolean(project.free_design),
  };
}

function fallbackNormalizeApiPayload(path, data) {
  if (!data || typeof data !== "object") return data;
  if (path === "/api/dashboard") {
    const projects = (data.projects || []).map(fallbackNormalizeProject);
    const selectedProject = data.selected_project ? fallbackNormalizeProject(data.selected_project) : (projects[0] || null);
    return {
      ...data,
      formats: Array.isArray(data.formats) ? data.formats : [],
      steps: FLOW_STEPS,
      projects,
      selected_project: selectedProject,
    };
  }
  if (Array.isArray(data.projects)) {
    return {
      ...data,
      projects: data.projects.map(fallbackNormalizeProject),
    };
  }
  if (data.project) {
    return {
      ...data,
      project: fallbackNormalizeProject(data.project),
    };
  }
  return data;
}

function fallbackNormalizeErrorMessage(message, path = "") {
  const text = String(message || "").trim();
  if (!text) return "操作失败，请稍后重试。";
  const lower = text.toLowerCase();
  if (lower.includes("failed to fetch") || lower.includes("networkerror")) return "网络连接失败，请检查服务是否可用后重试。";
  if (lower.includes("another task is already running")) return "当前项目还有任务在运行，请稍后再试。";
  if (lower.includes("project not found")) return "没有找到对应项目，列表可能已经发生变化。";
  if (lower.includes("current password is incorrect") || lower.includes("invalid_password")) return "当前密码不正确，请重新输入。";
  if (lower.includes("only local users can reset passwords here")) return "这个账号来自统一登录，密码需要到对应身份系统中修改。";
  if (lower.includes("not authenticated")) return "登录状态已失效，请重新登录。";
  if (path.includes("/api/") && lower.startsWith("request failed")) return "请求没有成功完成，请稍后再试。";
  return text;
}

const normalizeErrorMessage = nextCore.errors?.normalizeErrorMessage || fallbackNormalizeErrorMessage;
const normalizeApiPayload = nextCore.adapters?.adaptResponse
  ? (path, payload) => nextCore.adapters.adaptResponse(path, payload, { flowSteps: FLOW_STEPS })
  : fallbackNormalizeApiPayload;

const apiClient = nextCore.apiClient?.createApiClient
  ? nextCore.apiClient.createApiClient({
      normalizeErrorMessage,
      adaptResponse: normalizeApiPayload,
      onUnauthorized: () => { window.location.href = "/login"; },
    })
  : null;

async function apiFetch(path, options = {}) {
  if (apiClient) return apiClient.request(path, options);
  const response = await fetch(path, { credentials: "same-origin", headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) { window.location.href = "/login"; return {}; }
    const detail = data.error || data.detail || data.stderr || data.stdout || (data.returncode ? `命令执行失败，退出码 ${data.returncode}` : "") || `请求失败：${response.status}`;
    const error = new Error(normalizeErrorMessage(detail, path));
    error.status = response.status; error.path = path; error.payload = data; throw error;
  }
  return normalizeApiPayload(path, data);
}

const nextProjectsFeature = window.PPTM_NEXT_FEATURES?.projects?.createProjectsFeature
  ? window.PPTM_NEXT_FEATURES.projects.createProjectsFeature({
      runtime: window.PPTM_NEXT_RUNTIME,
      context: nextBootstrapContext,
      request: (path, options = {}) => apiFetch(path, options),
    })
  : null;

const nextWorkspacePage = window.PPTM_NEXT_PAGES?.workspace?.createWorkspacePage
  ? window.PPTM_NEXT_PAGES.workspace.createWorkspacePage({
      runtime: window.PPTM_NEXT_RUNTIME,
      context: nextBootstrapContext,
      projectsFeature: nextProjectsFeature,
    })
  : null;

const nextAdminPage = window.PPTM_NEXT_PAGES?.admin?.createAdminPage
  ? window.PPTM_NEXT_PAGES.admin.createAdminPage({
      runtime: window.PPTM_NEXT_RUNTIME,
      context: nextBootstrapContext,
    })
  : null;

window.PPTM_NEXT_RUNTIME.features = {
  ...(window.PPTM_NEXT_RUNTIME.features || {}),
  projects: nextProjectsFeature,
};
window.PPTM_NEXT_RUNTIME.pages = {
  ...(window.PPTM_NEXT_RUNTIME.pages || {}),
  workspace: nextWorkspacePage,
  admin: nextAdminPage,
};

function showFlash(message, type = "success") {
  return uiModule.showFlash(message, type);
}
function setBusy(isBusy) {
  return uiModule.setBusy(isBusy);
}

// ============ 认证业务模块（拆分） ============
const authModule = window.PPTM_AUTH.createAuthModule({
  state,
  elements,
  apiFetch,
  showFlash,
  closeModal: uiModule.closeModal,
});

const managersModule = window.PPTM_MANAGERS.createManagersModule({
  state,
  elements,
  apiFetch,
  showFlash,
  openModal: uiModule.openModal,
  closeModal: uiModule.closeModal,
  escapeHtml,
  renderProjectContext: () => shellModule.renderProjectContext(),
  renderStepRail: () => shellModule.renderStepRail(),
  renderStage: () => shellModule.renderStage(),
  applyTemplate: (templateId) => templatesModule.applyTemplate(templateId),
});

const adminModule = window.PPTM_ADMIN.createAdminModule({
  state,
  apiFetch,
  showFlash,
  escapeHtml,
});

const projectsModule = window.PPTM_PROJECTS.createProjectsModule({
  state,
  elements,
  apiFetch,
  showFlash,
  setBusy: uiModule.setBusy,
  escapeHtml,
  setupInlineValidation: uiModule.setupInlineValidation,
  renderProjectContext: () => shellModule.renderProjectContext(),
  renderStepRail: () => shellModule.renderStepRail(),
  renderStage: () => shellModule.renderStage(),
  openDocPreview: uiModule.openDocPreview,
});

templatesModule = window.PPTM_TEMPLATES.createTemplatesModule({
  state,
  elements,
  apiFetch,
  showFlash,
  setBusy: uiModule.setBusy,
  escapeHtml,
  renderProjectContext: () => shellModule.renderProjectContext(),
  renderStepRail: () => shellModule.renderStepRail(),
});

const strategistModule = window.PPTM_STRATEGIST.createStrategistModule({
  state,
  elements,
  apiFetch,
  showFlash,
  setBusy: uiModule.setBusy,
  escapeHtml,
  setupInlineValidation: uiModule.setupInlineValidation,
  renderStepRail: () => shellModule.renderStepRail(),
  renderStage: () => shellModule.renderStage(),
  addActivityLog: uiModule.addActivityLog,
});

const modelsModule = window.PPTM_MODELS.createModelsModule({
  state,
  elements,
  apiFetch,
  showFlash,
  setBusy: uiModule.setBusy,
  openModal: uiModule.openModal,
  closeModal: uiModule.closeModal,
  escapeHtml,
  createDraft,
  hasUnsavedModelConfigChanges: uiModule.hasUnsavedModelConfigChanges,
  hasUnsavedImageModelChanges: uiModule.hasUnsavedImageModelChanges,
  confirmDiscardChanges: uiModule.confirmDiscardChanges,
});

const pipelineModule = window.PPTM_PIPELINE.createPipelineModule({
  state,
  elements,
  apiFetch,
  showFlash,
  setBusy: uiModule.setBusy,
  escapeHtml,
  addActivityLog: uiModule.addActivityLog,
  refreshProject: (projectName) => projectsModule.refreshProject(projectName),
  openSvgPreviewModal: uiModule.openSvgPreviewModal,
  PIPELINE_GUIDE,
});

shellModule = window.PPTM_SHELL.createShellModule({
  state,
  elements,
  apiFetch,
  setBusy: uiModule.setBusy,
  escapeHtml,
  cacheElements,
  applyTheme: uiModule.applyTheme,
  setupPasswordToggles: uiModule.setupPasswordToggles,
  confirmDiscardChanges: uiModule.confirmDiscardChanges,
  hasUnsavedStageChanges: uiModule.hasUnsavedStageChanges,
  renderUserBadge: authModule.renderUserBadge,
  addActivityLog: uiModule.addActivityLog,
  FLOW_STEPS,
  createEmptyModelConfig,
  renderProjectStep: projectsModule.renderProjectStep,
  renderSourcesStep: projectsModule.renderSourcesStep,
  renderTemplateStep: templatesModule.renderTemplateStep,
  renderStrategistStep: strategistModule.renderStrategistStep,
  renderImagesStep: pipelineModule.renderImagesStep,
  renderExecutorStep: pipelineModule.renderExecutorStep,
  renderPostStep: pipelineModule.renderPostStep,
  refreshProject: projectsModule.refreshProject,
  validateProject: projectsModule.validateProject,
  previewSource: projectsModule.previewSource,
  runStrategistAnalysis: strategistModule.runStrategistAnalysis,
  generateSingleImage,
  handleCreateProject: projectsModule.handleCreateProject,
  handleImportSources: projectsModule.handleImportSources,
  openModelConfigModal: modelsModule.openModelConfigModal,
  closeModelConfigModal: modelsModule.closeModelConfigModal,
  beginNewProfile: modelsModule.beginNewProfile,
  handleModelProfileListClick: modelsModule.handleModelProfileListClick,
  fetchRemoteModels: modelsModule.fetchRemoteModels,
  testModelConfig: modelsModule.testModelConfig,
  saveModelConfig: modelsModule.saveModelConfig,
  openImageModelModal: modelsModule.openImageModelModal,
  closeImageModelModal: modelsModule.closeImageModelModal,
  beginNewImageProfile: modelsModule.beginNewImageProfile,
  handleImageProfileListClick: modelsModule.handleImageProfileListClick,
  copyFromGlobalModelConfig: modelsModule.copyFromGlobalModelConfig,
  testImageConfig: modelsModule.testImageConfig,
  saveImageModelProfile: modelsModule.saveImageModelProfile,
  closeSvgPreviewModal: uiModule.closeSvgPreviewModal,
  navigateSvgPreview: uiModule.navigateSvgPreview,
  openProjectManagerModal: managersModule.openProjectManagerModal,
  closeProjectManagerModal: managersModule.closeProjectManagerModal,
  renderProjectManagerList: managersModule.renderProjectManagerList,
  handleProjectManagerListClick: managersModule.handleProjectManagerListClick,
  handleProjectManagerDetailClick: managersModule.handleProjectManagerDetailClick,
  openTemplateManagerModal: managersModule.openTemplateManagerModal,
  closeTemplateManagerModal: managersModule.closeTemplateManagerModal,
  renderTemplateManagerList: managersModule.renderTemplateManagerList,
  handleTemplateManagerListClick: managersModule.handleTemplateManagerListClick,
  handleTemplateManagerDetailClick: managersModule.handleTemplateManagerDetailClick,
  bindTemplateUploadEvents: managersModule.bindTemplateUploadEvents,
  handleAccountSettingsSubmit: authModule.handleAccountSettingsSubmit,
  handleLogout: authModule.handleLogout,
  toggleCollapsible: uiModule.toggleCollapsible,
  clearAuditFilters: adminModule.clearAuditFilters,
  setAuditRange: adminModule.setAuditRange,
  changeAdminPage: adminModule.changeAdminPage,
  changeAuditPage: adminModule.changeAuditPage,
  copyAuditLogs: adminModule.copyAuditLogs,
  exportAuditLogs: adminModule.exportAuditLogs,
  handleAdminCreateUser: adminModule.handleAdminCreateUser,
  handleAdminUsersListClick: adminModule.handleAdminUsersListClick,
  handleAdminUserDetailClick: adminModule.handleAdminUserDetailClick,
  loadAdminData: adminModule.loadAdminData,
  loadAuditLogs: adminModule.loadAuditLogs,
  closeModal: uiModule.closeModal,
});
const {
  openSvgPreviewModal,
  renderSvgPreview,
  navigateSvgPreview,
  closeSvgPreviewModal,
  hasUnsavedAccountSettingsChanges,
  renderLogOutput,
  renderSkeleton,
  renderSkeletonCards,
  validateField,
} = uiModule;

const {
  renderUserBadge,
  handleLogout,
  handleAccountSettingsSubmit,
} = authModule;

const {
  loadDashboard,
  renderInitializationError,
  renderAll,
  renderStats,
  renderProjectContext,
  renderStepRail,
  isStepCompleted,
  isStepLocked,
  renderStage,
  getProjectBlockers,
  bindStageEvents,
  setupGlobalEventListeners,
  bootstrap,
  bootstrapAdminPage,
} = shellModule;

const {
  renderProjectStep,
  renderSourcesStep,
  renderSourcesList,
  refreshProject,
  handleCreateProject,
  handleImportSources,
  validateProject,
  previewSource,
} = projectsModule;

const { renderTemplateStep, applyTemplate } = templatesModule;

const {
  renderStrategistStep,
  renderSpecSummary,
  runStrategistAnalysis,
  renderStrategistForm,
  handleStrategistSubmit,
} = strategistModule;

const {
  renderImagesStep,
  handleImageGenerateSubmit,
  renderExecutorStep,
  renderSvgProgress,
  renderSvgPreviewList,
  setupSvgPreviewHandlers,
  generateSvg,
  handleSseMessage,
  regenerateAllSvg,
  deleteAllSvg,
  generateNotes,
  renderPostStep,
  renderPostprocessStepCard,
  getPostprocessStatus,
  renderDeliveryArea,
  setupPostprocessHandlers,
  runPostprocessStep,
} = pipelineModule;

const {
  renderModelConfigModal,
  openModelConfigModal,
  closeModelConfigModal,
  syncModalDraftFromInputs,
  setModalDraft,
  handleModelProfileListClick,
  beginNewProfile,
  selectModelProfile,
  deleteModelProfile,
  fetchRemoteModels,
  testModelConfig,
  saveModelConfig,
  renderImageModelModal,
  openImageModelModal,
  closeImageModelModal,
  syncImageModalDraftFromInputs,
  handleImageProfileListClick,
  beginNewImageProfile,
  selectImageProfile,
  deleteImageProfile,
  copyFromGlobalModelConfig,
  testImageConfig,
  saveImageModelProfile,
} = modelsModule;

const {
  renderProjectManagerList,
  renderProjectManagerDetail,
  handleProjectManagerListClick,
  handleProjectManagerDetailClick,
  openProjectManagerModal,
  closeProjectManagerModal,
  renderTemplateManagerList,
  renderTemplateManagerDetail,
  handleTemplateManagerListClick,
  handleTemplateManagerDetailClick,
  openTemplateManagerModal,
  closeTemplateManagerModal,
  handleTemplateUpload,
  bindTemplateUploadEvents,
} = managersModule;

const {
  renderAdminPanel,
  renderAdminUsersList,
  renderAdminUserDetail,
  renderAuditLogs,
  handleAdminUsersListClick,
  handleAdminUserDetailClick,
  loadAdminData,
  loadAdminUserDetail,
  updateAdminUser,
  purgeUserSessions,
  loadAuditLogs,
  copyAuditLogs,
  exportAuditLogs,
  changeAdminPage,
  changeAuditPage,
  setAuditRange,
  clearAuditFilters,
  handleAdminCreateUser,
} = adminModule;
async function generateSingleImage(projectName, index) {
  const image = state.selectedProject?.image_list?.[index];
  if (!image) {
    showFlash("没有找到对应的图片描述", "error");
    return;
  }
  try {
    setBusy(true);
    await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/generate-image`, {
      method: "POST",
      body: JSON.stringify({
        prompt: image.description || image.purpose || `图片 ${index + 1}`,
        filename: image.filename || "",
        aspect_ratio: image.aspect_ratio || "1:1",
        image_size: "1K",
      }),
    });
    showFlash("图片生成完成");
    await refreshProject(projectName);
    syncNextState("generateSingleImage");
    renderImagesStep();
  } catch (error) { showFlash(error.message, "error"); }
  finally { setBusy(false); }
}

// ============ 页面初始化 ============
const pageType = document.body.dataset.page;
window.addEventListener("beforeunload", (e) => {
  if (state.busy) { e.preventDefault(); e.returnValue = ""; }
});
document.addEventListener("DOMContentLoaded", async () => {
  if (pageType === "admin") {
    await bootstrapAdminPage();
    syncNextState("bootstrapAdminPage");
  } else {
    await loadDashboard();
    await bootstrap();
    syncNextState("bootstrapWorkspace");
  }
});
