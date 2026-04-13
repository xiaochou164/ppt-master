// Transitional bootstrap scaffold for the next frontend architecture.
(function initPptmNextBootstrap(global) {
  function createBootstrapContext(options = {}) {
    const namespace = global.PPTM_NEXT_CORE || {};
    const store = options.store || null;
    return {
      apiClient: namespace.apiClient || null,
      adapters: namespace.adapters || null,
      errors: namespace.errors || null,
      storeLib: namespace.store || null,
      store,
      selectors: namespace.selectors || null,
      actions: namespace.actions || null,
      domQuery: namespace.domQuery || null,
      flash: namespace.flash || null,
      modal: namespace.modal || null,
      validation: namespace.validation || null,
      preview: namespace.preview || null,
      options,
    };
  }

  global.PPTM_NEXT_APP = global.PPTM_NEXT_APP || {};
  global.PPTM_NEXT_APP.bootstrap = { createBootstrapContext };
})(window);
