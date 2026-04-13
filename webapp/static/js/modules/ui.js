// ============ UI Module ============
// Modal system, focus trap, toast notifications, theme, log panel

let focusTrapState = { active: false, previousFocus: null, handler: null };
let flashTimer = null;
let currentModal = null;

// ============ Flash / Toast ============

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
    closeBtn.addEventListener("click", () => clearFlashInternal());
    flashEl.appendChild(closeBtn);
  }
  flashEl.className = `flash flash-${type}`;
  flashEl.classList.remove("hidden");
  if (type === "success") {
    flashTimer = setTimeout(() => {
      flashEl.classList.add("flash-dismissing");
      setTimeout(clearFlashInternal, 300);
    }, 3000);
  }
}

function clearFlashInternal() {
  if (flashTimer) {
    clearTimeout(flashTimer);
    flashTimer = null;
  }
  const flashEl = document.getElementById("flash");
  if (flashEl) {
    flashEl.className = "flash hidden";
    flashEl.innerHTML = "";
  }
}

export function clearFlash() {
  clearFlashInternal();
}

// ============ Theme ============

export function applyTheme(theme) {
  const nextTheme = theme || "light";
  if (nextTheme === "light") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", nextTheme);
  }
  localStorage.setItem("ppt-master-theme", nextTheme);
  const themeSelect = document.getElementById("themeSelect");
  if (themeSelect) {
    themeSelect.value = nextTheme;
  }
}

// ============ Focus Trap (Modal Accessibility) ============

export function trapFocus(modalEl) {
  if (!modalEl) return;
  focusTrapState.previousFocus = document.activeElement;
  focusTrapState.active = true;

  const getFocusable = () => modalEl.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
  );

  focusTrapState.handler = (e) => {
    if (e.key !== "Tab") return;
    const focusable = getFocusable();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  modalEl.addEventListener("keydown", focusTrapState.handler);
  const focusable = getFocusable();
  if (focusable.length > 0) {
    requestAnimationFrame(() => focusable[0].focus());
  }
}

export function releaseFocus() {
  if (!focusTrapState.active) return;
  document.querySelectorAll(".modal").forEach((el) => {
    if (focusTrapState.handler) {
      el.removeEventListener("keydown", focusTrapState.handler);
    }
  });
  if (focusTrapState.previousFocus && typeof focusTrapState.previousFocus.focus === "function") {
    focusTrapState.previousFocus.focus();
  }
  focusTrapState = { active: false, previousFocus: null, handler: null };
}

// ============ Modal System ============

export function openModal(modalEl) {
  if (typeof modalEl === "string") {
    modalEl = document.getElementById(modalEl);
  }
  if (!modalEl) return;
  modalEl.classList.remove("hidden");
  modalEl.setAttribute("aria-hidden", "false");
  currentModal = modalEl;
  document.body.style.overflow = "hidden";
  trapFocus(modalEl);
}

export function closeModal(modalEl) {
  if (typeof modalEl === "string") {
    modalEl = document.getElementById(modalEl);
  }
  if (!modalEl) return;
  modalEl.classList.add("hidden");
  modalEl.setAttribute("aria-hidden", "true");
  if (currentModal === modalEl) currentModal = null;
  document.body.style.overflow = "";
  releaseFocus();
}

export function getCurrentModal() {
  return currentModal;
}

// ============ Modal Backdrop/Close Handlers ============

export function initModals() {
  // Close on backdrop click
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-backdrop")) {
      const modal = e.target.closest(".modal");
      if (modal) closeModal(modal);
    }
  });

  // Close on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && currentModal) {
      closeModal(currentModal);
    }
  });
}

// ============ Password Toggles ============

export function setupPasswordToggles(root = document) {
  root.querySelectorAll("[data-password-toggle]").forEach((button) => {
    if (button.dataset.passwordToggleBound === "true") return;
    button.dataset.passwordToggleBound = "true";
    button.addEventListener("click", () => {
      const wrap = button.closest(".password-input-wrap");
      const input = wrap?.querySelector("input");
      if (!input) return;
      if (input.type === "password") {
        input.type = "text";
        button.textContent = "隐藏";
      } else {
        input.type = "password";
        button.textContent = "显示";
      }
    });
  });
}

// ============ Skeleton Loaders ============

export function renderSkeleton(rows = 4) {
  const lines = Array.from({ length: rows }, () => '<div class="skeleton-line"></div>').join("");
  return `<div class="skeleton">${lines}</div>`;
}

export function renderSkeletonCards(count = 3) {
  return Array.from({ length: count }, () =>
    `<div class="skeleton-card skeleton"><div class="skeleton-line"></div><div class="skeleton-line"></div></div>`
  ).join("");
}

// ============ Inline Validation ============

export function validateField(input, rules = {}) {
  const value = input.value.trim();
  const fieldEl = input.closest(".field");
  let existingError = fieldEl?.querySelector(".field-error");
  let errorMsg = "";

  if (rules.required && !value) {
    errorMsg = rules.requiredMsg || "此字段为必填项";
  } else if (rules.pattern && value && !rules.pattern.test(value)) {
    errorMsg = rules.patternMsg || "格式不正确";
  } else if (rules.minLength && value.length < rules.minLength) {
    errorMsg = rules.minLengthMsg || `至少需要 ${rules.minLength} 个字符`;
  }

  if (errorMsg) {
    input.classList.add("field-invalid");
    if (!existingError && fieldEl) {
      existingError = document.createElement("p");
      existingError.className = "field-error";
      fieldEl.appendChild(existingError);
    }
    if (existingError) existingError.textContent = errorMsg;
    return false;
  }

  input.classList.remove("field-invalid");
  if (existingError) existingError.remove();
  return true;
}

export function setupInlineValidation(root = document) {
  root.querySelectorAll("[data-validate]").forEach((input) => {
    if (input.dataset.validateBound === "true") return;
    input.dataset.validateBound = "true";
    input.addEventListener("blur", () => {
      const rules = JSON.parse(input.dataset.validate || "{}");
      validateField(input, rules);
    });
  });
}

// ============ Log Output ============

export function classifyLogTone(title, payload) {
  const text = `${title || ""} ${payload || ""}`.toLowerCase();
  if (/(失败|error|错误|denied|invalid)/.test(text)) return "error";
  if (/(警告|warn|阻塞|未完成|等待|需处理)/.test(text)) return "warn";
  if (/(完成|成功|saved|导出|已生成|已更新)/.test(text)) return "success";
  return "info";
}

export function renderLogOutput(logOutputEl, activityLogs) {
  if (!logOutputEl) return;
  if (!activityLogs.length) {
    logOutputEl.innerHTML = `
      <div class="log-entry log-entry-empty">
        <strong>等待操作…</strong>
        <span class="helper">新的运行记录会显示在这里。</span>
      </div>
    `;
    return;
  }
  logOutputEl.innerHTML = activityLogs.map((entry) => `
    <article class="log-entry log-entry-${entry.tone}">
      <div class="log-entry-top">
        <strong>${escapeHtml(entry.title)}</strong>
        <span class="log-entry-time">${escapeHtml(entry.stamp)}</span>
      </div>
      ${entry.detail ? `<p class="log-entry-detail" title="${escapeHtml(entry.detail)}">${escapeHtml(entry.detail)}</p>` : ""}
    </article>
  `).join("");
}

export function updateLatestLogButton(logOutputEl, jumpBtn) {
  if (!logOutputEl || !jumpBtn) return;
  const shouldShow = logOutputEl.scrollTop > 24;
  jumpBtn.classList.toggle("hidden", !shouldShow);
}

// ============ SVG Preview ============

let svgPreviewState = { slides: [], currentIndex: 0 };

export function openSvgPreviewModal(slides, index = 0) {
  svgPreviewState = { slides, currentIndex: index };
  const modal = document.getElementById("svgPreviewModal");
  if (!modal) return;
  openModal(modal);
  renderSvgPreview();
}

export function renderSvgPreview() {
  const { slides, currentIndex } = svgPreviewState;
  const objectEl = document.getElementById("svgPreviewObject");
  const imgEl = document.getElementById("svgPreviewImg");
  const indicator = document.getElementById("svgPageIndicator");
  const openNewBtn = document.getElementById("svgOpenNewButton");

  if (!slides.length) return;

  const slide = slides[currentIndex];
  const url = `${slide.url}${slide.url.includes('?') ? '&' : '?'}t=${Date.now()}`;

  if (objectEl) {
    objectEl.data = url;
    objectEl.style.display = "block";
  }
  if (imgEl) {
    imgEl.src = url;
    imgEl.style.display = "none";
  }
  if (indicator) indicator.textContent = `第 ${currentIndex + 1} 页 / 共 ${slides.length} 页`;
  if (openNewBtn && slide.url) openNewBtn.href = slide.url;

  const prevBtn = document.getElementById("svgPrevButton");
  const nextBtn = document.getElementById("svgNextButton");
  if (prevBtn) prevBtn.disabled = currentIndex === 0;
  if (nextBtn) nextBtn.disabled = currentIndex === slides.length - 1;
}

export function navigateSvgPreview(direction) {
  const { slides, currentIndex } = svgPreviewState;
  const newIndex = currentIndex + direction;
  if (newIndex < 0 || newIndex >= slides.length) return;
  svgPreviewState.currentIndex = newIndex;
  renderSvgPreview();
}

export function initSvgPreviewHandlers() {
  const modal = document.getElementById("svgPreviewModal");
  if (!modal) return;

  document.getElementById("closeSvgPreviewButton")?.addEventListener("click", () => closeModal(modal));
  document.getElementById("svgPreviewBackdrop")?.addEventListener("click", () => closeModal(modal));

  document.getElementById("svgPrevButton")?.addEventListener("click", () => navigateSvgPreview(-1));
  document.getElementById("svgNextButton")?.addEventListener("click", () => navigateSvgPreview(1));

  document.addEventListener("keydown", (e) => {
    if (!document.getElementById("svgPreviewModal")?.classList.contains("hidden")) {
      if (e.key === "ArrowLeft") navigateSvgPreview(-1);
      if (e.key === "ArrowRight") navigateSvgPreview(1);
    }
  });
}

// ============ Document Preview ============

export function openDocPreview(title, url) {
  const modal = document.getElementById("docPreviewModal");
  const titleEl = document.getElementById("docPreviewTitle");
  const textEl = document.getElementById("docPreviewText");
  const openBtn = document.getElementById("docPreviewOpenButton");

  if (!modal) return;

  if (titleEl) titleEl.textContent = title || "文档预览";
  if (openBtn && url) openBtn.href = url;

  if (url && textEl) {
    fetch(url)
      .then((r) => r.text())
      .then((text) => {
        if (textEl) textEl.textContent = text;
      })
      .catch(() => {
        if (textEl) textEl.textContent = "加载失败";
      });
  }

  openModal(modal);
}

export function initDocPreviewHandlers() {
  const modal = document.getElementById("docPreviewModal");
  if (!modal) return;

  document.getElementById("closeDocPreviewButton")?.addEventListener("click", () => closeModal(modal));
  document.getElementById("docPreviewBackdrop")?.addEventListener("click", () => closeModal(modal));
}

// ============ Utility ============

export function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function truncateText(text, maxLength = 80) {
  if (!text) return "";
  text = String(text);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

// ============ Unsaved Changes Detection ============

export function hasUnsavedModelConfigChanges(state, elements) {
  if (!elements.modelConfigModal || elements.modelConfigModal.classList.contains("hidden")) return false;
  const draft = state.modal?.draft || {};
  const current = {
    name: elements.modalProfileNameInput?.value?.trim() || "",
    backend: elements.modalBackendSelect?.value || "openai",
    base_url: elements.modalBaseUrlInput?.value?.trim() || "",
    selected_model: elements.modalFetchedModelSelect?.value || "",
    manual_model: elements.modalManualModelInput?.value?.trim() || "",
    api_key: elements.modalApiKeyInput?.value?.trim() || "",
  };
  return current.name !== (draft.name || "")
    || current.backend !== (draft.backend || "openai")
    || current.base_url !== (draft.base_url || "")
    || current.selected_model !== (draft.selected_model || "")
    || current.manual_model !== (draft.manual_model || "")
    || Boolean(current.api_key);
}

export function hasUnsavedImageModelChanges(state, elements) {
  if (!elements.imageModelModal || elements.imageModelModal.classList.contains("hidden")) return false;
  const draft = state.imageModal?.draft || {};
  const current = {
    name: elements.imageProfileNameInput?.value?.trim() || "",
    backend: elements.imageBackendSelect?.value || "gemini",
    base_url: elements.imageBaseUrlInput?.value?.trim() || "",
    manual_model: elements.imageManualModelInput?.value?.trim() || "",
    selected_model: elements.imageModelSelect?.value || "",
    api_key: elements.imageApiKeyInput?.value?.trim() || "",
  };
  const draftModel = draft.model || "";
  return current.name !== (draft.name || "")
    || current.backend !== (draft.backend || "gemini")
    || current.base_url !== (draft.base_url || "")
    || (current.manual_model || current.selected_model) !== draftModel
    || Boolean(current.api_key);
}

export function hasUnsavedAccountSettingsChanges(state, elements) {
  if (!elements.accountSettingsModal || elements.accountSettingsModal.classList.contains("hidden") || !state.user) return false;
  const displayName = elements.accountDisplayNameInput?.value?.trim() || "";
  const currentPassword = elements.accountCurrentPasswordInput?.value || "";
  const newPassword = elements.accountNewPasswordInput?.value || "";
  return displayName !== (state.user.display_name || "")
    || Boolean(currentPassword)
    || Boolean(newPassword);
}

export function hasUnsavedStageChanges(elements) {
  if (!elements.stageBody) return false;
  const fields = elements.stageBody.querySelectorAll("input, textarea, select");
  return Array.from(fields).some((field) => {
    if (field.disabled) return false;
    if (field.type === "checkbox" || field.type === "radio") {
      return field.checked !== field.defaultChecked;
    }
    return field.value !== field.defaultValue;
  });
}

export function confirmDiscardChanges(message) {
  return window.confirm(message || "当前还有未保存的修改，确认直接离开吗？");
}
