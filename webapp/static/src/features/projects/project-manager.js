// Transitional project manager logic.
(function initPptmNextProjectManager(global) {
  function createProjectManager(options = {}) {
    const {
      runtime = global.PPTM_NEXT_RUNTIME || {},
      api = null,
    } = options;

    function getState() {
      return runtime.store?.getState ? runtime.store.getState() : (runtime.state || {});
    }

    function getListViewModel(searchQuery = "") {
      const state = getState();
      const query = String(searchQuery || "").trim().toLowerCase();
      return (state.projects || []).filter((project) => {
        return !query || String(project.name || "").toLowerCase().includes(query);
      });
    }

    async function switchProject(projectName) {
      if (!api) throw new Error("Projects API is not configured");
      const result = await api.fetchProject(projectName);
      if (runtime.actions?.setSelectedProject) {
        runtime.actions.setSelectedProject(result.project);
      }
      return result;
    }

    return {
      getListViewModel,
      switchProject,
    };
  }

  global.PPTM_NEXT_FEATURES = global.PPTM_NEXT_FEATURES || {};
  global.PPTM_NEXT_FEATURES.projects = global.PPTM_NEXT_FEATURES.projects || {};
  global.PPTM_NEXT_FEATURES.projects.projectManager = { createProjectManager };
})(window);
