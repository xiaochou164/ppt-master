// Transitional page router scaffold.
(function initPptmNextRouter(global) {
  function detectPage(documentRef = document) {
    return documentRef.body?.dataset?.page || "workspace";
  }

  global.PPTM_NEXT_APP = global.PPTM_NEXT_APP || {};
  global.PPTM_NEXT_APP.router = { detectPage };
})(window);
