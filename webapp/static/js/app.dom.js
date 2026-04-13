// Shared DOM cache for PPT Master Web app.
(function initPptmDom(global) {
  const elements = {};

  function cacheElements() {
    const ids = [
      "heroStatusPill", "heroTitle", "heroText", "projectCount", "formatCount", "stepCount",
      "openModelConfigButton", "closeModelConfigButton", "clearLogButton", "jumpToLatestLogButton",
      "modelConfigModal", "modelConfigBackdrop", "modelConfigForm", "modalProfileSummary", "modelProfileList",
      "createProfileButton", "modalProfileNameInput", "modalBackendSelect", "modalFetchedModelSelect",
      "modalBaseUrlInput", "modalApiKeyInput", "modalApiKeyLabel", "fetchModelsButton", "testModelButton",
      "modalTestOutput", "modalManualModelInput", "modelFetchHint", "modelTestHint",
      "svgPreviewModal", "svgPreviewBackdrop", "closeSvgPreviewButton", "svgPrevButton", "svgNextButton",
      "svgPreviewObject", "svgPreviewImg", "svgPageIndicator", "svgOpenNewButton",
      "imageModelModal", "imageModelBackdrop", "closeImageModelButton", "imageModelForm",
      "imageModalProfileSummary", "imageModelProfileList", "createImageProfileButton",
      "copyFromGlobalConfigButton", "imageProfileNameInput", "imageBackendSelect", "imageModelSelect",
      "imageManualModelInput", "imageBaseUrlInput", "imageApiKeyInput", "imageApiKeyLabel",
      "testImageButton", "imageTestHint", "imageTestOutput",
      "docPreviewModal", "docPreviewBackdrop", "closeDocPreviewButton", "docPreviewTitle", "docPreviewText", "docPreviewOpenButton",
      "projectManagerModal", "projectManagerBackdrop", "closeProjectManagerButton", "pmSearchInput", "pmProjectList", "pmProjectDetail",
      "templateManagerModal", "templateManagerBackdrop", "closeTemplateManagerButton", "tmSearchInput", "tmCategoryFilter", "tmTemplateList", "tmTemplateDetail", "tmShowUploadButton",
      "accountSettingsModal", "accountSettingsBackdrop", "closeAccountSettingsButton", "accountSettingsForm",
      "accountSummaryName", "accountSummaryMeta", "accountSummaryBadge", "accountDisplayNameInput", "accountEmailInput",
      "accountPasswordFields", "accountCurrentPasswordInput", "accountNewPasswordInput", "accountProviderHint",
      "userBadge", "openAccountSettingsButton", "openAdminPanelButton", "logoutButton",
      "openProjectManagerButton", "openTemplateManagerButton", "openModelConfigButton", "themeSelect",
      "flash", "projectContext", "logOutput", "stepRail",
      "stageKicker", "stageTitle", "stageDescription", "stageBody",
    ];

    ids.forEach((id) => {
      elements[id] = document.getElementById(id);
    });
  }

  global.PPTM_DOM = {
    elements,
    cacheElements,
  };
})(window);
