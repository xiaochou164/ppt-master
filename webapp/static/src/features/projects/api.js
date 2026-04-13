// Transitional project feature API.
(function initPptmNextProjectApi(global) {
  function createProjectsApi(options = {}) {
    const {
      request,
    } = options;

    async function createProject(payload) {
      return request("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          project_name: payload.project_name,
          canvas_format: payload.canvas_format,
        }),
      });
    }

    async function fetchProject(projectName) {
      return request(`/api/projects/${encodeURIComponent(projectName)}`);
    }

    async function importSources(projectName, payload) {
      return request(`/api/projects/${encodeURIComponent(projectName)}/import`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }

    async function validateProject(projectName) {
      return request(`/api/projects/${encodeURIComponent(projectName)}/validate`);
    }

    return {
      createProject,
      fetchProject,
      importSources,
      validateProject,
    };
  }

  global.PPTM_NEXT_FEATURES = global.PPTM_NEXT_FEATURES || {};
  global.PPTM_NEXT_FEATURES.projects = global.PPTM_NEXT_FEATURES.projects || {};
  global.PPTM_NEXT_FEATURES.projects.api = { createProjectsApi };
})(window);
