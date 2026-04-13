const DEFAULT_HERO_TEXT = "把项目上下文、关键步骤和导出状态收拢到一个清晰的工作台里，减少跳转和流程迷失。";

export function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function truncateText(value, maxLength = 60) {
  if (!value) return "";
  const str = String(value);
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

let flashTimer = null;

export function showFlash(message, type = "success") {
  const flashEl = document.getElementById("flash");
  if (!flashEl) return;
  if (flashTimer) {
    clearTimeout(flashTimer);
    flashTimer = null;
  }
  flashEl.classList.remove("flash-dismissing");
  flashEl.innerHTML = "";
  const textNode = document.createTextNode(message);
  flashEl.appendChild(textNode);
  if (type === "error") {
    const closeBtn = document.createElement("button");
    closeBtn.className = "flash-close";
    closeBtn.setAttribute("aria-label", "关闭");
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", clearFlash);
    flashEl.appendChild(closeBtn);
  }
  flashEl.className = `flash flash-${type}`;
  flashEl.classList.remove("hidden");
  flashTimer = setTimeout(() => {
    flashEl.classList.add("flash-dismissing");
    setTimeout(() => {
      flashEl.classList.add("hidden");
      flashEl.classList.remove("flash-dismissing");
    }, 300);
  }, 5000);
}

export function clearFlash() {
  const flashEl = document.getElementById("flash");
  if (!flashEl) return;
  if (flashTimer) {
    clearTimeout(flashTimer);
    flashTimer = null;
  }
  flashEl.classList.add("flash-dismissing");
  setTimeout(() => {
    flashEl.classList.add("hidden");
    flashEl.classList.remove("flash-dismissing");
  }, 300);
}

export function setBusy(isBusy, root = null) {
  const state = document.querySelector(".modal:not(.hidden)");
  const targetRoot = root || state || document;
  targetRoot.querySelectorAll("button, input, select, textarea").forEach((element) => {
    if (isBusy) {
      if (element.disabled) return;
      element.disabled = true;
      element.dataset.busyDisabled = "true";
      return;
    }
    if (element.dataset.busyDisabled === "true") {
      element.disabled = false;
      delete element.dataset.busyDisabled;
    }
  });
}

export function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function truncateText(value, maxLength = 60) {
  if (!value) return "";
  const str = String(value);
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

export function formatTime(date) {
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

export function formatRelativeTime(date) {
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
