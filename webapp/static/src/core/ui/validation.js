// Transitional validation helpers scaffold.
(function initPptmCoreValidation(global) {
  function validateRequired(value) {
    return String(value || "").trim().length > 0;
  }

  function validateMinLength(value, minLength) {
    return String(value || "").length >= minLength;
  }

  global.PPTM_NEXT_CORE = global.PPTM_NEXT_CORE || {};
  global.PPTM_NEXT_CORE.validation = {
    validateRequired,
    validateMinLength,
  };
})(window);
