// Transitional project step logic.
(function initPptmNextProjectStep(global) {
  function createProjectStep(options = {}) {
    const {
      runtime = global.PPTM_NEXT_RUNTIME || {},
      api = null,
      models = null,
    } = options;

    function getState() {
      return runtime.store?.getState ? runtime.store.getState() : (runtime.state || {});
    }

    function getProjectCreateViewModel() {
      const state = getState();
      const formatMapper = models?.toFormatOption || ((format) => format);
      const recentMapper = models?.toRecentProjectItem || ((project) => project);
      return {
        formats: (state.formats || []).map(formatMapper),
        recentProjects: (state.projects || []).slice(0, 5).map(recentMapper),
      };
    }

    async function submitCreateProject(payload) {
      if (!api) throw new Error("Projects API is not configured");
      const result = await api.createProject(payload);
      if (runtime.actions?.setSelectedProject) {
        runtime.actions.setSelectedProject(result.project);
      }
      if (runtime.actions?.setProjects) {
        const state = getState();
        const projects = Array.isArray(state.projects) ? [...state.projects] : [];
        const index = projects.findIndex((project) => project.name === result.project?.name);
        if (index >= 0) projects[index] = result.project;
        else projects.unshift(result.project);
        runtime.actions.setProjects(projects);
      }
      if (runtime.actions?.setActiveStep) {
        runtime.actions.setActiveStep("sources");
      }
      return result;
    }

    async function selectRecentProject(projectName) {
      if (!api) throw new Error("Projects API is not configured");
      const result = await api.fetchProject(projectName);
      if (runtime.actions?.setSelectedProject) {
        runtime.actions.setSelectedProject(result.project);
      }
      return result;
    }

    return {
      getProjectCreateViewModel,
      submitCreateProject,
      selectRecentProject,
    };
  }

  global.PPTM_NEXT_FEATURES = global.PPTM_NEXT_FEATURES || {};
  global.PPTM_NEXT_FEATURES.projects = global.PPTM_NEXT_FEATURES.projects || {};
  global.PPTM_NEXT_FEATURES.projects.projectStep = { createProjectStep };
})(window);
