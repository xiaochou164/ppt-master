// Transitional sources step logic.
(function initPptmNextSourcesStep(global) {
  function createSourcesStep(options = {}) {
    const {
      runtime = global.PPTM_NEXT_RUNTIME || {},
      api = null,
      models = null,
    } = options;

    function getState() {
      return runtime.store?.getState ? runtime.store.getState() : (runtime.state || {});
    }

    function buildImportPayload(rawInput = {}) {
      const content = String(rawInput.content || "");
      const filename = rawInput.filename || "";
      const move = Boolean(rawInput.move);
      const lines = content
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
      const isTextPaste = !!filename || !lines.every((item) => item.startsWith("/") || /^https?:\/\//i.test(item));
      if (isTextPaste) {
        return {
          pasted_content: content,
          pasted_format: "markdown",
          ...(filename ? { pasted_filename: filename } : {}),
          ...(move ? { move: true } : {}),
        };
      }
      return {
        sources: lines,
        ...(move ? { move: true } : {}),
      };
    }

    function getSourcesViewModel() {
      const state = getState();
      const project = state.selectedProject || null;
      const sourceMapper = models?.toSourceItem || ((source) => source);
      return {
        projectName: project?.name || "",
        sourceCount: project?.source_count || 0,
        sources: (project?.sources || []).map(sourceMapper),
      };
    }

    async function submitImportSources(projectName, rawInput) {
      if (!api) throw new Error("Projects API is not configured");
      const payload = buildImportPayload(rawInput);
      await api.importSources(projectName, payload);
      const refreshed = await api.fetchProject(projectName);
      if (runtime.actions?.setSelectedProject) {
        runtime.actions.setSelectedProject(refreshed.project);
      }
      if (runtime.actions?.setProjects) {
        const state = getState();
        const projects = Array.isArray(state.projects) ? [...state.projects] : [];
        const index = projects.findIndex((project) => project.name === refreshed.project?.name);
        if (index >= 0) projects[index] = refreshed.project;
        runtime.actions.setProjects(projects);
      }
      return refreshed;
    }

    return {
      buildImportPayload,
      getSourcesViewModel,
      submitImportSources,
    };
  }

  global.PPTM_NEXT_FEATURES = global.PPTM_NEXT_FEATURES || {};
  global.PPTM_NEXT_FEATURES.projects = global.PPTM_NEXT_FEATURES.projects || {};
  global.PPTM_NEXT_FEATURES.projects.sourcesStep = { createSourcesStep };
})(window);
