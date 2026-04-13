// Transitional project feature models.
(function initPptmNextProjectModels(global) {
  function toFormatOption(format) {
    if (typeof format === "string") {
      return { value: format, label: format };
    }
    return {
      value: format?.id || "",
      label: format?.name || format?.id || "",
    };
  }

  function toRecentProjectItem(project) {
    return {
      name: project?.name || "",
      format: project?.format || "",
      sourceCount: project?.source_count || 0,
    };
  }

  function toSourceItem(source) {
    return {
      name: source?.name || source?.path || "未命名",
      url: source?.url || source?.path || "",
    };
  }

  global.PPTM_NEXT_FEATURES = global.PPTM_NEXT_FEATURES || {};
  global.PPTM_NEXT_FEATURES.projects = global.PPTM_NEXT_FEATURES.projects || {};
  global.PPTM_NEXT_FEATURES.projects.models = {
    toFormatOption,
    toRecentProjectItem,
    toSourceItem,
  };
})(window);
