// Shared UI infrastructure for PPT Master Web app.
(function initPptmUi(global) {
  function createUiModule(deps) {
    const {
      state,
      elements,
      escapeHtml,
      createDraft,
    } = deps;

    let flashTimer = null;
    let focusTrapState = { active: false, previousFocus: null, handler: null };
    let currentModal = null;
    let svgPreviewState = { slides: [], currentIndex: 0 };

    function showFlash(message, type = "success") {
      if (!elements.flash) return;
      if (flashTimer) {
        clearTimeout(flashTimer);
        flashTimer = null;
      }
      elements.flash.classList.remove("flash-dismissing");
      elements.flash.innerHTML = "";
      elements.flash.appendChild(document.createTextNode(message));
      if (type === "error") {
        const closeButton = document.createElement("button");
        closeButton.className = "flash-close";
        closeButton.setAttribute("aria-label", "关闭");
        closeButton.textContent = "\u00d7";
        closeButton.addEventListener("click", clearFlash);
        elements.flash.appendChild(closeButton);
      }
      elements.flash.className = `flash flash-${type}`;
      elements.flash.classList.remove("hidden");
      if (type === "success") {
        flashTimer = setTimeout(() => {
          elements.flash.classList.add("flash-dismissing");
          setTimeout(clearFlash, 300);
        }, 3000);
      }
    }

    function clearFlash() {
      if (!elements.flash) return;
      if (flashTimer) {
        clearTimeout(flashTimer);
        flashTimer = null;
      }
      elements.flash.className = "flash hidden";
      elements.flash.innerHTML = "";
    }

    function setBusy(isBusy) {
      state.busy = isBusy;
      const openModalEl = document.querySelector(".modal:not(.hidden)");
      const root = openModalEl || document;
      root.querySelectorAll("button, input, select, textarea").forEach((element) => {
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

    function applyTheme(theme) {
      const nextTheme = theme || "light";
      if (nextTheme === "light") document.documentElement.removeAttribute("data-theme");
      else document.documentElement.setAttribute("data-theme", nextTheme);
      localStorage.setItem("ppt-master-theme", nextTheme);
      if (elements.themeSelect) elements.themeSelect.value = nextTheme;
    }

    function trapFocus(modalEl) {
      if (!modalEl) return;
      focusTrapState.previousFocus = document.activeElement;
      focusTrapState.active = true;
      const getFocusable = () => modalEl.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])');
      focusTrapState.handler = (event) => {
        if (event.key !== "Tab") return;
        const focusable = getFocusable();
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      };
      modalEl.addEventListener("keydown", focusTrapState.handler);
      const focusable = getFocusable();
      if (focusable.length > 0) requestAnimationFrame(() => focusable[0].focus());
    }

    function releaseFocus() {
      if (!focusTrapState.active) return;
      document.querySelectorAll(".modal").forEach((element) => {
        if (focusTrapState.handler) element.removeEventListener("keydown", focusTrapState.handler);
      });
      if (focusTrapState.previousFocus && typeof focusTrapState.previousFocus.focus === "function") {
        focusTrapState.previousFocus.focus();
      }
      focusTrapState = { active: false, previousFocus: null, handler: null };
    }

    function openModal(modalEl) {
      const target = typeof modalEl === "string" ? document.getElementById(modalEl) : modalEl;
      if (!target) return;
      target.classList.remove("hidden");
      target.setAttribute("aria-hidden", "false");
      currentModal = target;
      document.body.style.overflow = "hidden";
      trapFocus(target);
    }

    function closeModal(modalEl) {
      const target = typeof modalEl === "string" ? document.getElementById(modalEl) : modalEl;
      if (!target) return;
      target.classList.add("hidden");
      target.setAttribute("aria-hidden", "true");
      if (currentModal === target) currentModal = null;
      document.body.style.overflow = "";
      releaseFocus();
    }

    function openSvgPreviewModal(slides, index = 0) {
      svgPreviewState = { slides, currentIndex: index };
      openModal(elements.svgPreviewModal);
      renderSvgPreview();
    }

    function renderSvgPreview() {
      const { slides, currentIndex } = svgPreviewState;
      if (!slides.length) return;
      const slide = slides[currentIndex];
      const url = `${slide.url}${slide.url.includes("?") ? "&" : "?"}t=${Date.now()}`;
      if (elements.svgPreviewObject) {
        elements.svgPreviewObject.data = url;
        elements.svgPreviewObject.style.display = "block";
      }
      if (elements.svgPreviewImg) {
        elements.svgPreviewImg.src = url;
        elements.svgPreviewImg.style.display = "none";
      }
      if (elements.svgPageIndicator) elements.svgPageIndicator.textContent = `第 ${currentIndex + 1} 页 / 共 ${slides.length} 页`;
      if (elements.svgOpenNewButton && slide.url) elements.svgOpenNewButton.href = slide.url;
      if (elements.svgPrevButton) elements.svgPrevButton.disabled = currentIndex === 0;
      if (elements.svgNextButton) elements.svgNextButton.disabled = currentIndex === slides.length - 1;
    }

    function navigateSvgPreview(direction) {
      const { slides, currentIndex } = svgPreviewState;
      const nextIndex = currentIndex + direction;
      if (nextIndex < 0 || nextIndex >= slides.length) return;
      svgPreviewState.currentIndex = nextIndex;
      renderSvgPreview();
    }

    function closeSvgPreviewModal() {
      closeModal(elements.svgPreviewModal);
    }

    function hasUnsavedModelConfigChanges() {
      if (!elements.modelConfigModal || elements.modelConfigModal.classList.contains("hidden")) return false;
      const draft = state.modal.draft || createDraft();
      const current = {
        name: elements.modalProfileNameInput?.value?.trim() || "",
        backend: elements.modalBackendSelect?.value || "openai",
        base_url: elements.modalBaseUrlInput?.value?.trim() || "",
        selected_model: elements.modalFetchedModelSelect?.value || "",
        manual_model: elements.modalManualModelInput?.value?.trim() || "",
        api_key: elements.modalApiKeyInput?.value?.trim() || "",
      };
      return current.name !== (draft.name || "") || current.backend !== (draft.backend || "openai") || current.base_url !== (draft.base_url || "") || current.selected_model !== (draft.selected_model || "") || current.manual_model !== (draft.manual_model || "") || Boolean(current.api_key);
    }

    function hasUnsavedImageModelChanges() {
      if (!elements.imageModelModal || elements.imageModelModal.classList.contains("hidden")) return false;
      const draft = state.imageModal.draft || {};
      const current = {
        name: elements.imageProfileNameInput?.value?.trim() || "",
        backend: elements.imageBackendSelect?.value || "gemini",
        base_url: elements.imageBaseUrlInput?.value?.trim() || "",
        manual_model: elements.imageManualModelInput?.value?.trim() || "",
        selected_model: elements.imageModelSelect?.value || "",
        api_key: elements.imageApiKeyInput?.value?.trim() || "",
      };
      const draftModel = draft.model || "";
      return current.name !== (draft.name || "") || current.backend !== (draft.backend || "gemini") || current.base_url !== (draft.base_url || "") || (current.manual_model || current.selected_model) !== draftModel || Boolean(current.api_key);
    }

    function hasUnsavedAccountSettingsChanges() {
      if (!elements.accountSettingsModal || elements.accountSettingsModal.classList.contains("hidden") || !state.user) return false;
      const displayName = elements.accountDisplayNameInput?.value?.trim() || "";
      const currentPassword = elements.accountCurrentPasswordInput?.value || "";
      const newPassword = elements.accountNewPasswordInput?.value || "";
      return displayName !== (state.user.display_name || "") || Boolean(currentPassword) || Boolean(newPassword);
    }

    function hasUnsavedStageChanges() {
      if (!elements.stageBody) return false;
      const fields = elements.stageBody.querySelectorAll("input, textarea, select");
      return Array.from(fields).some((field) => {
        if (field.disabled) return false;
        if (field.type === "checkbox" || field.type === "radio") return field.checked !== field.defaultChecked;
        return field.value !== field.defaultValue;
      });
    }

    function confirmDiscardChanges(message) {
      return window.confirm(message || "当前还有未保存的修改，确认直接离开吗？");
    }

    function classifyLogTone(title, payload) {
      const text = `${title || ""} ${payload || ""}`.toLowerCase();
      if (/(失败|error|错误|denied|invalid)/.test(text)) return "error";
      if (/(警告|warn|阻塞|未完成|等待|需处理)/.test(text)) return "warn";
      if (/(完成|成功|saved|导出|已生成|已更新)/.test(text)) return "success";
      return "info";
    }

    function addActivityLog(title, detail = "", payload = "") {
      const tone = classifyLogTone(title, payload);
      const stamp = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      state.activityLogs.push({ title, detail, payload, tone, stamp });
      if (state.activityLogs.length > 500) state.activityLogs.shift();
      renderLogOutput();
    }

    function renderLogOutput() {
      if (!elements.logOutput) return;
      if (!state.activityLogs.length) {
        elements.logOutput.innerHTML = `<div class="log-entry log-entry-empty"><strong>等待操作…</strong><span class="helper">新的运行记录会显示在这里。</span></div>`;
        elements.jumpToLatestLogButton?.classList.add("hidden");
        return;
      }
      elements.logOutput.innerHTML = state.activityLogs.map((entry) => `<article class="log-entry log-entry-${entry.tone}"><div class="log-entry-top"><strong>${escapeHtml(entry.title)}</strong><span class="log-entry-time">${escapeHtml(entry.stamp)}</span></div>${entry.detail ? `<p class="log-entry-detail" title="${escapeHtml(entry.detail)}">${escapeHtml(entry.detail)}</p>` : ""}</article>`).join("");
      if (elements.jumpToLatestLogButton) {
        elements.jumpToLatestLogButton.classList.toggle("hidden", elements.logOutput.scrollTop > 24);
      }
    }

    function renderSkeleton(rows = 4) {
      return `<div class="skeleton">${Array.from({ length: rows }, () => '<div class="skeleton-line"></div>').join("")}</div>`;
    }

    function renderSkeletonCards(count = 3) {
      return Array.from({ length: count }, () => `<div class="skeleton-card skeleton"><div class="skeleton-line"></div><div class="skeleton-line"></div></div>`).join("");
    }

    function validateField(input, rules = {}) {
      const value = input.value.trim();
      const fieldEl = input.closest(".field");
      let existingError = fieldEl?.querySelector(".field-error");
      let errorMsg = "";
      if (rules.required && !value) errorMsg = rules.requiredMsg || "此字段为必填项";
      else if (rules.pattern && value && !rules.pattern.test(value)) errorMsg = rules.patternMsg || "格式不正确";
      else if (rules.minLength && value.length < rules.minLength) errorMsg = rules.minLengthMsg || `至少需要 ${rules.minLength} 个字符`;
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

    function setupInlineValidation(root = document) {
      root.querySelectorAll("[data-validate]").forEach((input) => {
        if (input.dataset.validateBound === "true") return;
        input.dataset.validateBound = "true";
        input.addEventListener("blur", () => {
          const rules = JSON.parse(input.dataset.validate || "{}");
          validateField(input, rules);
        });
      });
    }

    function setupPasswordToggles(root = document) {
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

    function toggleCollapsible(button) {
      const item = button.closest("[data-collapsible]");
      if (!item) return;
      const content = item.querySelector(".collapsible-content");
      const isOpen = item.classList.toggle("collapsible-open");
      button.setAttribute("aria-expanded", isOpen);
      if (content) content.style.display = isOpen ? "" : "none";
    }

    function openDocPreview(title, url) {
      if (elements.docPreviewTitle) elements.docPreviewTitle.textContent = title || "文档预览";
      if (elements.docPreviewOpenButton && url) elements.docPreviewOpenButton.href = url;
      if (elements.docPreviewText) elements.docPreviewText.textContent = "加载中...";
      if (url && elements.docPreviewText) {
        fetch(url)
          .then((response) => response.text())
          .then((text) => {
            if (elements.docPreviewText) elements.docPreviewText.textContent = text;
          })
          .catch(() => {
            if (elements.docPreviewText) elements.docPreviewText.textContent = "加载失败";
          });
      }
      openModal(elements.docPreviewModal);
    }

    return {
      showFlash,
      clearFlash,
      setBusy,
      applyTheme,
      trapFocus,
      releaseFocus,
      openModal,
      closeModal,
      openSvgPreviewModal,
      renderSvgPreview,
      navigateSvgPreview,
      closeSvgPreviewModal,
      hasUnsavedModelConfigChanges,
      hasUnsavedImageModelChanges,
      hasUnsavedAccountSettingsChanges,
      hasUnsavedStageChanges,
      confirmDiscardChanges,
      addActivityLog,
      renderLogOutput,
      renderSkeleton,
      renderSkeletonCards,
      validateField,
      setupInlineValidation,
      setupPasswordToggles,
      toggleCollapsible,
      openDocPreview,
    };
  }

  global.PPTM_UI = { createUiModule };
})(window);
