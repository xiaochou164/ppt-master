import * as state from "./state.js";
import * as api from "./api.js";
import { FLOW_STEPS, PIPELINE_GUIDE } from "./constants.js";
import * as ui from "./modules/ui.js";
import * as auth from "./modules/auth.js";
import * as dashboard from "./modules/dashboard.js";

const DEFAULT_HERO_TEXT = "把项目上下文、关键步骤和导出状态收拢到一个清晰的工作台里，减少跳转和流程迷失。";

export let elements = {};

export function cacheElements() {
  elements = {
    heroStatusPill: document.getElementById("heroStatusPill"),
    heroTitle: document.getElementById("heroTitle"),
    heroText: document.getElementById("heroText"),
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
    modalBaseUrlInput: document.getElementById("modalBaseUrlInput"),
    modalApiKeyInput: document.getElementById("modalApiKeyInput"),
    modalApiKeyLabel: document.getElementById("modalApiKeyLabel"),
    fetchModelsButton: document.getElementById("fetchModelsButton"),
    testModelButton: document.getElementById("testModelButton"),
    modalTestOutput: document.getElementById("modalTestOutput"),
    modalManualModelInput: document.getElementById("modalManualModelInput"),
    modelFetchHint: document.getElementById("modelFetchHint"),
    modelTestHint: document.getElementById("modelTestHint"),
    svgPreviewModal: document.getElementById("svgPreviewModal"),
    svgPreviewBackdrop: document.getElementById("svgPreviewBackdrop"),
    closeSvgPreviewButton: document.getElementById("closeSvgPreviewButton"),
    svgPrevButton: document.getElementById("svgPrevButton"),
    svgNextButton: document.getElementById("svgNextButton"),
    svgPreviewObject: document.getElementById("svgPreviewObject"),
    svgPreviewImg: document.getElementById("svgPreviewImg"),
    svgPageIndicator: document.getElementById("svgPageIndicator"),
    svgOpenNewButton: document.getElementById("svgOpenNewButton"),
    imageModelModal: document.getElementById("imageModelModal"),
    imageModelBackdrop: document.getElementById("imageModelBackdrop"),
    closeImageModelButton: document.getElementById("closeImageModelButton"),
    imageModelForm: document.getElementById("imageModelForm"),
    imageModalProfileSummary: document.getElementById("imageModalProfileSummary"),
    imageModelProfileList: document.getElementById("imageModelProfileList"),
    createImageProfileButton: document.getElementById("createImageProfileButton"),
    copyFromGlobalConfigButton: document.getElementById("copyFromGlobalConfigButton"),
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
    docPreviewModal: document.getElementById("docPreviewModal"),
    docPreviewBackdrop: document.getElementById("docPreviewBackdrop"),
    closeDocPreviewButton: document.getElementById("closeDocPreviewButton"),
    docPreviewTitle: document.getElementById("docPreviewTitle"),
    docPreviewText: document.getElementById("docPreviewText"),
    docPreviewOpenButton: document.getElementById("docPreviewOpenButton"),
    projectManagerModal: document.getElementById("projectManagerModal"),
    projectManagerBackdrop: document.getElementById("projectManagerBackdrop"),
    closeProjectManagerButton: document.getElementById("closeProjectManagerButton"),
    pmSearchInput: document.getElementById("pmSearchInput"),
    pmProjectList: document.getElementById("pmProjectList"),
    pmProjectDetail: document.getElementById("pmProjectDetail"),
    templateManagerModal: document.getElementById("templateManagerModal"),
    templateManagerBackdrop: document.getElementById("templateManagerBackdrop"),
    closeTemplateManagerButton: document.getElementById("closeTemplateManagerButton"),
    tmSearchInput: document.getElementById("tmSearchInput"),
    tmCategoryFilter: document.getElementById("tmCategoryFilter"),
    tmTemplateList: document.getElementById("tmTemplateList"),
    tmTemplateDetail: document.getElementById("tmTemplateDetail"),
    tmShowUploadButton: document.getElementById("tmShowUploadButton"),
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
    userBadge: document.getElementById("userBadge"),
    openAccountSettingsButton: document.getElementById("openAccountSettingsButton"),
    openAdminPanelButton: document.getElementById("openAdminPanelButton"),
    logoutButton: document.getElementById("logoutButton"),
    openProjectManagerButton: document.getElementById("openProjectManagerButton"),
    openTemplateManagerButton: document.getElementById("openTemplateManagerButton"),
    themeSelect: document.getElementById("themeSelect"),
    flash: document.getElementById("flash"),
    projectContext: document.getElementById("projectContext"),
    logOutput: document.getElementById("logOutput"),
    stepRail: document.getElementById("stepRail"),
    stageKicker: document.getElementById("stageKicker"),
    stageTitle: document.getElementById("stageTitle"),
    stageDescription: document.getElementById("stageDescription"),
    stageBody: document.getElementById("stageBody"),
  };
}

export function initTheme() {
  const saved = localStorage.getItem("pptmaster-theme") || "light";
  ui.applyTheme(saved);
}

export async function loadDashboard() {
  try {
    const data = await api.apiFetch("/api/dashboard");
    state.setState("user", data.user);
    state.setState("formats", data.formats || []);
    state.setState("steps", data.steps || FLOW_STEPS);
    state.setState("projects", data.projects || []);
    state.setState("selectedProject", data.selected_project || null);
    state.setState("modelConfig", data.model_config || state.getState().modelConfig);
    state.setState("imageModelConfig", data.image_model_config || state.getState().imageModelConfig);
    return data;
  } catch (error) {
    ui.showFlash(error.message, "error");
    throw error;
  }
}

export function bootstrap() {
  cacheElements();
  ui.initModals();
  ui.initThemePicker();
  ui.initLogPanel();
  auth.initAuth();
  dashboard.initDashboard();
}

window.addEventListener("beforeunload", (e) => {
  if (state.getState().busy) {
    e.preventDefault();
    e.returnValue = "";
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  try {
    await loadDashboard();
  } catch (error) {
    document.getElementById("stageBody").innerHTML = `
      <div class="init-error">
        <h2>初始化失败</h2>
        <p>${escapeHtml(error.message)}</p>
        <p>请检查服务是否正常运行。</p>
      </div>
    `;
    return;
  }
  bootstrap();
});

function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
