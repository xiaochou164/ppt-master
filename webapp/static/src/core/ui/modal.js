// Transitional modal helpers scaffold.
(function initPptmCoreModal(global) {
  function createModalController() {
    function open(modal) {
      if (!modal) return;
      modal.classList.remove("hidden");
      modal.setAttribute("aria-hidden", "false");
    }

    function close(modal) {
      if (!modal) return;
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
    }

    return {
      open,
      close,
    };
  }

  global.PPTM_NEXT_CORE = global.PPTM_NEXT_CORE || {};
  global.PPTM_NEXT_CORE.modal = { createModalController };
})(window);
