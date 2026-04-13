// Transitional projects feature entry.
(function initPptmNextProjectsFeature(global) {
  const namespace = global.PPTM_NEXT_FEATURES?.projects || {};

  function createProjectsFeature(options = {}) {
    const apiFactory = namespace.api?.createProjectsApi;
    const models = namespace.models || {};
    const request = options.request || null;
    const api = apiFactory && request ? apiFactory({ request }) : null;

    return {
      api,
      models,
      projectStep: namespace.projectStep?.createProjectStep
        ? namespace.projectStep.createProjectStep({ ...options, api, models })
        : null,
      sourcesStep: namespace.sourcesStep?.createSourcesStep
        ? namespace.sourcesStep.createSourcesStep({ ...options, api, models })
        : null,
      projectManager: namespace.projectManager?.createProjectManager
        ? namespace.projectManager.createProjectManager({ ...options, api })
        : null,
    };
  }

  global.PPTM_NEXT_FEATURES = global.PPTM_NEXT_FEATURES || {};
  global.PPTM_NEXT_FEATURES.projects = {
    ...namespace,
    createProjectsFeature,
  };
})(window);
