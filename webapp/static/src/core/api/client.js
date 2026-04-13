// Transitional core API client scaffold.
(function initPptmCoreApiClient(global) {
  function createApiClient(options = {}) {
    const {
      baseUrl = "",
      defaultHeaders = { "Content-Type": "application/json" },
      normalizeErrorMessage = (message) => String(message || "").trim() || "Request failed",
      adaptResponse = (_path, payload) => payload,
      onUnauthorized = null,
    } = options;

    async function request(path, requestOptions = {}) {
      const response = await fetch(`${baseUrl}${path}`, {
        credentials: "same-origin",
        headers: {
          ...defaultHeaders,
          ...(requestOptions.headers || {}),
        },
        ...requestOptions,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 && typeof onUnauthorized === "function") {
          onUnauthorized();
        }
        const detail = payload.error || payload.detail || payload.stderr || payload.stdout || `请求失败：${response.status}`;
        const error = new Error(normalizeErrorMessage(detail, path));
        error.status = response.status;
        error.path = path;
        error.payload = payload;
        throw error;
      }
      return adaptResponse(path, payload);
    }

    return { request };
  }

  global.PPTM_NEXT_CORE = global.PPTM_NEXT_CORE || {};
  global.PPTM_NEXT_CORE.apiClient = { createApiClient };
})(window);
