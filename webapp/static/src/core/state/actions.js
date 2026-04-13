// Transitional shared actions scaffold.
(function initPptmCoreActions(global) {
  function createStateActions(store) {
    function setSelectedProject(project) {
      return store.setState({ selectedProject: project || null });
    }

    function setProjects(projects) {
      return store.setState({ projects: projects || [] });
    }

    function setActiveStep(stepId) {
      return store.setState({ activeStepId: stepId || "project" });
    }

    function setCurrentUser(user) {
      return store.setState({ user: user || null });
    }

    return {
      setSelectedProject,
      setProjects,
      setActiveStep,
      setCurrentUser,
    };
  }

  global.PPTM_NEXT_CORE = global.PPTM_NEXT_CORE || {};
  global.PPTM_NEXT_CORE.actions = { createStateActions };
})(window);
