// Transitional selectors scaffold.
(function initPptmCoreSelectors(global) {
  function getSelectedProject(state) {
    return state?.selectedProject || null;
  }

  function getProjectList(state) {
    return state?.projects || [];
  }

  function getActiveStepId(state) {
    return state?.activeStepId || "project";
  }

  function getCurrentUser(state) {
    return state?.user || null;
  }

  global.PPTM_NEXT_CORE = global.PPTM_NEXT_CORE || {};
  global.PPTM_NEXT_CORE.selectors = {
    getSelectedProject,
    getProjectList,
    getActiveStepId,
    getCurrentUser,
  };
})(window);
