// Transitional error helpers scaffold.
(function initPptmCoreErrors(global) {
  function normalizeErrorMessage(message, path = "") {
    const text = String(message || "").trim();
    if (!text) return "操作失败，请稍后重试。";
    const lower = text.toLowerCase();
    if (lower.includes("failed to fetch") || lower.includes("networkerror")) return "网络连接失败，请检查服务是否可用后重试。";
    if (lower.includes("another task is already running")) return "当前项目还有任务在运行，请稍后再试。";
    if (lower.includes("project not found")) return "没有找到对应项目，列表可能已经发生变化。";
    if (lower.includes("current password is incorrect") || lower.includes("invalid_password")) return "当前密码不正确，请重新输入。";
    if (lower.includes("only local users can reset passwords here")) return "这个账号来自统一登录，密码需要到对应身份系统中修改。";
    if (lower.includes("not authenticated")) return "登录状态已失效，请重新登录。";
    if (path.includes("/api/") && lower.startsWith("request failed")) return "请求没有成功完成，请稍后再试。";
    return text;
  }

  global.PPTM_NEXT_CORE = global.PPTM_NEXT_CORE || {};
  global.PPTM_NEXT_CORE.errors = { normalizeErrorMessage };
})(window);
