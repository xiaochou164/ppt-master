// Transitional flash helpers scaffold.
(function initPptmCoreFlash(global) {
  function createFlashController(element) {
    function show(message, type = "success") {
      if (!element) return;
      element.textContent = message;
      element.className = `flash flash-${type}`;
      element.classList.remove("hidden");
    }

    function clear() {
      if (!element) return;
      element.textContent = "";
      element.className = "flash hidden";
    }

    return {
      show,
      clear,
    };
  }

  global.PPTM_NEXT_CORE = global.PPTM_NEXT_CORE || {};
  global.PPTM_NEXT_CORE.flash = { createFlashController };
})(window);
