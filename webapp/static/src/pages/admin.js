// Transitional admin page entry scaffold.
(function initPptmNextAdminPage(global) {
  function createAdminPage(options = {}) {
    const runtime = options.runtime || global.PPTM_NEXT_RUNTIME || {};
    const context = options.context || runtime.context || null;

    function getSnapshot() {
      return runtime.store?.getState ? runtime.store.getState() : (runtime.state || null);
    }

    function getViewModel() {
      const state = getSnapshot() || {};
      const admin = state.admin || {};
      return {
        page: "admin",
        userCount: Array.isArray(admin.users) ? admin.users.length : 0,
        selectedUserId: admin.selectedUserId || "",
        auditCount: Array.isArray(admin.logs) ? admin.logs.length : 0,
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
  global.PPTM_NEXT_PAGES.admin = { createAdminPage };
})(window);
