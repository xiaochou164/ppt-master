// Transitional workspace page entry scaffold.
(function initPptmNextWorkspacePage(global) {
  function createWorkspacePage(options = {}) {
    const runtime = options.runtime || global.PPTM_NEXT_RUNTIME || {};
    const context = options.context || runtime.context || null;
    const projectsFeature = options.projectsFeature || runtime.features?.projects || null;

    function getSnapshot() {
      return runtime.store?.getState ? runtime.store.getState() : (runtime.state || null);
    }

    function getViewModel() {
      const state = getSnapshot() || {};
      return {
        page: "workspace",
        activeStepId: state.activeStepId || "project",
        selectedProjectName: state.selectedProject?.name || "",
        projectCount: Array.isArray(state.projects) ? state.projects.length : 0,
        userName: state.user?.display_name || state.user?.email || "",
        projectCreate: projectsFeature?.projectStep?.getProjectCreateViewModel
          ? projectsFeature.projectStep.getProjectCreateViewModel()
          : null,
        sources: projectsFeature?.sourcesStep?.getSourcesViewModel
          ? projectsFeature.sourcesStep.getSourcesViewModel()
          : null,
        lastSyncReason: context?.options?.lastSyncReason || "",
      };
    }

    function bootstrap() {
      return getViewModel();
    }

    return {
      getSnapshot,
      getViewModel,
      bootstrap,
    };
  }

  global.PPTM_NEXT_PAGES = global.PPTM_NEXT_PAGES || {};
  global.PPTM_NEXT_PAGES.workspace = { createWorkspacePage };
})(window);
