// Generic utilities for PPT Master Web app.
(function initPptmUtils(global) {
  function escapeHtml(value) {
    if (value == null) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function truncateText(text, maxLength = 80) {
    if (!text) return "";
    const raw = String(text);
    if (raw.length <= maxLength) return raw;
    return `${raw.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
  }

  function formatTime(date) {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatRelativeTime(date) {
    if (!date) return "";
    const now = Date.now();
    const then = new Date(date).getTime();
    const diff = now - then;
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
    return formatTime(date);
  }

  global.PPTM_UTILS = {
    escapeHtml,
    truncateText,
    formatTime,
    formatRelativeTime,
  };
})(window);
