// Template selection module for PPT Master Web app.
(function initPptmTemplates(global) {
  function createTemplatesModule(deps) {
    const {
      state,
      elements,
      apiFetch,
      showFlash,
      setBusy,
      escapeHtml,
      renderProjectContext,
      renderStepRail,
    } = deps;

    function renderTemplateStep() {
      if (!elements.stageBody) return;
      elements.stageBody.innerHTML = `<div class="step-template"><div class="template-path-choice"><button class="template-path-card" data-template-path="select"><span class="template-path-icon">📋</span><span class="template-path-title">选择模板</span><span class="template-path-desc">从模板库中选择一个合适的模板</span></button><button class="template-path-card" data-template-path="free"><span class="template-path-icon">✨</span><span class="template-path-title">自由设计</span><span class="template-path-desc">不使用模板，让系统自由生成版式</span></button></div><div id="templateGallery" class="template-gallery hidden">${renderTemplateGallery()}</div></div>`;
      setupTemplatePathHandlers();
      if (!state.templates?.length) loadTemplates();
    }

    function renderTemplateGallery() {
      const categories = state.templateCategories || {};
      const templates = state.templates || [];
      if (!templates.length) return "<p class='helper'>暂无可用模板</p>";
      return Object.entries(categories).map(([category, meta]) => {
        const categoryTemplates = templates.filter((template) => template.category === category);
        if (!categoryTemplates.length) return "";
        const categoryLabel = typeof meta === "string" ? meta : (meta.label || category);
        return `<div class="template-category"><h3>${escapeHtml(categoryLabel)}</h3><div class="template-cards">${categoryTemplates.map((template) => `<div class="template-card" data-template-id="${template.id}"><div class="template-preview">${(template.thumbnail || template.preview_url) ? `<img src="${escapeHtml(template.thumbnail || template.preview_url)}" alt="">` : "<span>📄</span>"}</div><div class="template-info"><strong>${escapeHtml(template.name || template.label || template.id)}</strong><span>${escapeHtml(template.summary || template.label || "")}</span></div></div>`).join("")}</div></div>`;
      }).join("");
    }

    async function loadTemplates() {
      try {
        const data = await apiFetch("/api/templates");
        state.templates = (data.templates || []).map((template) => {
          const categoryEntry = Object.entries(data.categories || {}).find(([, meta]) => Array.isArray(meta?.layouts) && meta.layouts.includes(template.id));
          const category = categoryEntry?.[0] || template.category || "";
          const categoryMeta = category ? (data.categories || {})[category] : null;
          return {
            ...template,
            name: template.name || template.label || template.id,
            category,
            category_label: typeof categoryMeta === "string" ? categoryMeta : (categoryMeta?.label || category || ""),
          };
        });
        state.templateCategories = data.categories || {};
        const gallery = document.getElementById("templateGallery");
        if (gallery) gallery.innerHTML = renderTemplateGallery();
        setupTemplatePathHandlers();
      } catch (error) {
        showFlash(error.message, "error");
      }
    }

    function setupTemplatePathHandlers() {
      if (!elements.stageBody) return;
      elements.stageBody.querySelectorAll(".template-path-card").forEach((card) => {
        card.addEventListener("click", () => {
          const path = card.dataset.templatePath;
          if (path === "free") applyFreeDesign();
          else elements.stageBody.querySelector("#templateGallery")?.classList.remove("hidden");
        });
      });
      elements.stageBody.querySelectorAll(".template-card").forEach((card) => {
        card.addEventListener("click", () => {
          const templateId = card.dataset.templateId;
          if (templateId) applyTemplate(templateId);
        });
      });
    }

    async function applyFreeDesign() {
      showFlash("当前后端尚未提供自由设计接口，请先选择模板。", "error");
    }

    async function applyTemplate(templateId) {
      if (!state.selectedProject) return;
      try {
        setBusy(true);
        const data = await apiFetch(`/api/projects/${encodeURIComponent(state.selectedProject.name)}/apply-template`, {
          method: "POST",
          body: JSON.stringify({ template_id: templateId }),
        });
        state.selectedProject = { ...data.project, template_id: data.template_id || templateId };
        const index = (state.projects || []).findIndex((project) => project.name === state.selectedProject.name);
        if (index >= 0) state.projects[index] = state.selectedProject;
        showFlash("模板已应用");
        state.activeStepId = "strategist";
        renderProjectContext();
        renderStepRail();
        renderStage();
      } catch (error) {
        showFlash(error.message, "error");
      } finally {
        setBusy(false);
      }
    }

    return {
      renderTemplateStep,
      renderTemplateGallery,
      setupTemplatePathHandlers,
      applyFreeDesign,
      applyTemplate,
    };
  }

  global.PPTM_TEMPLATES = { createTemplatesModule };
})(window);
