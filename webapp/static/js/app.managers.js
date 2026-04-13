// Project manager and template manager module for PPT Master Web app.
(function initPptmManagers(global) {
  function createManagersModule(deps) {
    const {
      state,
      elements,
      apiFetch,
      showFlash,
      openModal,
      closeModal,
      escapeHtml,
      renderProjectContext,
      renderStepRail,
      renderStage,
      applyTemplate,
    } = deps;

    function renderProjectManagerList() {
      const query = (state.projectManager.searchQuery || "").toLowerCase();
      const filtered = (state.projects || []).filter((project) => {
        return !query || (project.name || "").toLowerCase().includes(query);
      });
      if (elements.pmProjectList) {
        elements.pmProjectList.innerHTML = filtered
          .map((project) => `<div class="pm-list-item" data-project-name="${escapeHtml(project.name)}"><div><strong>${escapeHtml(project.name)}</strong><span class="helper">${escapeHtml(project.format || "")} · ${project.source_count || 0} 来源</span></div></div>`)
          .join("");
      }
    }

    function renderProjectManagerDetail() {
      if (!elements.pmProjectDetail) return;
      const project = state.projectManager.selectedProject;
      if (!project) {
        elements.pmProjectDetail.innerHTML = '<p class="helper">选择左侧项目查看详情</p>';
        return;
      }
      elements.pmProjectDetail.innerHTML = `<div class="pm-detail-card"><h3>${escapeHtml(project.name)}</h3><dl class="pm-detail-stats"><dt>格式</dt><dd>${escapeHtml(project.format || "-")}</dd><dt>来源</dt><dd>${project.source_count || 0}</dd><dt>页面</dt><dd>${project.slide_count || 0}</dd><dt>导出</dt><dd>${project.exported ? "已导出" : "未导出"}</dd></dl><div class="pm-detail-actions"><button class="button button-secondary button-small" data-action="switch-project">切换到此项目</button><button class="button button-ghost button-small" data-action="delete-project">删除</button></div></div>`;
    }

    function handleProjectManagerListClick(event) {
      const item = event.target.closest("[data-project-name]");
      if (!item) return;
      const name = item.dataset.projectName;
      state.projectManager.selectedProject = (state.projects || []).find((project) => project.name === name) || null;
      renderProjectManagerDetail();
    }

    async function switchToProject(projectName) {
      try {
        state.selectedProject = (await apiFetch(`/api/projects/${encodeURIComponent(projectName)}`)).project;
        state.projectManager.selectedProject = state.selectedProject;
        closeModal(elements.projectManagerModal);
        renderProjectContext();
        renderStepRail();
        renderStage();
        showFlash(`已切换到项目: ${projectName}`);
      } catch (error) {
        showFlash(error.message, "error");
      }
    }

    async function confirmDeleteProject(projectName) {
      if (!confirm(`确认删除项目 "${projectName}"？此操作不可撤销。`)) return;
      try {
        await apiFetch(`/api/projects/${encodeURIComponent(projectName)}`, { method: "DELETE" });
        state.projects = (state.projects || []).filter((project) => project.name !== projectName);
        if (state.selectedProject?.name === projectName) {
          state.selectedProject = state.projects[0] || null;
        }
        state.projectManager.selectedProject = state.selectedProject || null;
        showFlash("项目已删除");
        renderProjectManagerList();
        renderProjectManagerDetail();
        renderProjectContext();
        renderStepRail();
        renderStage();
      } catch (error) {
        showFlash(error.message, "error");
      }
    }

    function handleProjectManagerDetailClick(event) {
      const btn = event.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const project = state.projectManager.selectedProject;
      if (!project) return;
      if (action === "switch-project") switchToProject(project.name);
      if (action === "delete-project") confirmDeleteProject(project.name);
    }

    function openProjectManagerModal() {
      state.projectManager.isOpen = true;
      state.projectManager.selectedProject = state.selectedProject || state.projectManager.selectedProject;
      renderProjectManagerList();
      renderProjectManagerDetail();
      openModal(elements.projectManagerModal);
    }

    function closeProjectManagerModal() {
      state.projectManager.isOpen = false;
      closeModal(elements.projectManagerModal);
    }

    function renderTemplateManagerList() {
      const { searchQuery, filterCategory } = state.templateManager;
      const filtered = (state.templates || []).filter((template) => {
        const displayName = template.name || template.label || template.id || "";
        const matchQuery = !searchQuery || displayName.toLowerCase().includes(searchQuery.toLowerCase());
        const matchCategory = !filterCategory || template.category === filterCategory;
        return matchQuery && matchCategory;
      });
      if (elements.tmTemplateList) {
        elements.tmTemplateList.innerHTML = filtered
          .map((template) => `<div class="pm-list-item" data-template-id="${template.id}"><div><strong>${escapeHtml(template.name || template.label || template.id)}</strong><span class="helper">${escapeHtml(template.category_label || template.category || template.label || "")}</span></div></div>`)
          .join("");
      }
    }

    function renderTemplateManagerDetail() {
      if (!elements.tmTemplateDetail) return;
      const template = state.templateManager.selectedTemplate;
      const uploadForm = `<form id="templateUploadForm" class="stack" ${state.templateManager.uploadMode ? "" : 'style="display:none"'} enctype="multipart/form-data"><div class="two-col"><label class="field"><span>模板 ID</span><input name="name" type="text" required placeholder="例如：my_template"></label><label class="field"><span>模板名称</span><input name="label" type="text" required placeholder="例如：My Template"></label></div><div class="two-col"><label class="field"><span>分类</span><select name="category"><option value="brand">品牌风格</option><option value="general" selected>通用风格</option><option value="scenario">场景专用</option><option value="government">政府企业</option><option value="special">特殊风格</option></select></label><label class="field"><span>关键词</span><input name="keywords" type="text" placeholder="逗号分隔，例如：科技, 商务, 蓝色"></label></div><label class="field"><span>模板简介</span><textarea name="summary" rows="3" placeholder="简要描述模板适用场景和风格"></textarea></label><label class="field"><span>模板文件</span><input name="files" type="file" multiple required accept=".svg,.png,.jpg,.jpeg,.json,.yaml,.yml,.md,.txt"></label><p class="helper">至少上传一个 SVG 文件；模板 ID 仅支持字母、数字、下划线、横杠或中文。</p><div class="action-row"><button class="button button-secondary button-small" type="submit">开始上传</button></div></form>`;
      if (!template) {
        elements.tmTemplateDetail.innerHTML = `<p class="helper">选择左侧模板查看详情</p>${uploadForm}`;
        return;
      }
      elements.tmTemplateDetail.innerHTML = `<div class="template-detail-card"><h3>${escapeHtml(template.name || template.label || template.id)}</h3><p class="helper">${escapeHtml(template.label || "")}</p>${template.summary ? `<p>${escapeHtml(template.summary)}</p>` : ""}<dl class="template-detail-props"><dt>分类</dt><dd>${escapeHtml(template.category_label || template.category || "-")}</dd><dt>关键词</dt><dd>${(template.keywords || []).map((keyword) => `<span class="keyword-tag">${escapeHtml(keyword)}</span>`).join("") || "-"}</dd></dl><div class="pm-detail-actions"><button class="button button-secondary button-small" data-action="apply-template">应用模板</button><button class="button button-ghost button-small" data-action="delete-template">删除</button></div></div>${uploadForm}`;
    }

    function handleTemplateManagerListClick(event) {
      const item = event.target.closest("[data-template-id]");
      if (!item) return;
      const id = item.dataset.templateId;
      state.templateManager.selectedTemplate = (state.templates || []).find((template) => template.id === id) || null;
      renderTemplateManagerDetail();
    }

    async function confirmDeleteTemplate(templateId) {
      if (!confirm("确认删除此模板？")) return;
      try {
        await apiFetch(`/api/templates/${templateId}`, { method: "DELETE" });
        state.templates = (state.templates || []).filter((template) => template.id !== templateId);
        state.templateManager.selectedTemplate = null;
        showFlash("模板已删除");
        renderTemplateManagerList();
        renderTemplateManagerDetail();
      } catch (error) {
        showFlash(error.message, "error");
      }
    }

    function handleTemplateManagerDetailClick(event) {
      const btn = event.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const template = state.templateManager.selectedTemplate;
      if (!template) return;
      if (action === "apply-template") {
        applyTemplate(template.id);
        closeModal(elements.templateManagerModal);
      }
      if (action === "delete-template") confirmDeleteTemplate(template.id);
    }

    async function loadTemplatesForManager() {
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
        renderTemplateManagerList();
      } catch (error) {
        showFlash(error.message, "error");
      }
    }

    function openTemplateManagerModal() {
      state.templateManager.isOpen = true;
      renderTemplateManagerDetail();
      loadTemplatesForManager();
      openModal(elements.templateManagerModal);
    }

    function closeTemplateManagerModal() {
      state.templateManager.isOpen = false;
      closeModal(elements.templateManagerModal);
    }

    function handleTemplateUpload(event) {
      event.preventDefault();
      const formData = new FormData(event.target);
      fetch("/api/templates/upload", { method: "POST", credentials: "same-origin", body: formData })
        .then((response) => response.json())
        .then((data) => {
          if (data.error) throw new Error(data.error);
          showFlash("模板上传成功");
          state.templateManager.uploadMode = false;
          state.templateManager.selectedTemplate = null;
          loadTemplatesForManager();
          event.target.reset();
          renderTemplateManagerDetail();
        })
        .catch((error) => showFlash(error.message, "error"));
    }

    function bindTemplateUploadEvents() {
      if (elements.tmShowUploadButton && elements.tmShowUploadButton.dataset.bound !== "true") {
        elements.tmShowUploadButton.dataset.bound = "true";
        elements.tmShowUploadButton.addEventListener("click", () => {
          state.templateManager.uploadMode = !state.templateManager.uploadMode;
          renderTemplateManagerDetail();
        });
      }
      if (elements.tmTemplateDetail && elements.tmTemplateDetail.dataset.bound !== "true") {
        elements.tmTemplateDetail.dataset.bound = "true";
        elements.tmTemplateDetail.addEventListener("submit", (event) => {
          if (event.target.id === "templateUploadForm") handleTemplateUpload(event);
        });
      }
    }

    return {
      renderProjectManagerList,
      renderProjectManagerDetail,
      handleProjectManagerListClick,
      handleProjectManagerDetailClick,
      openProjectManagerModal,
      closeProjectManagerModal,
      renderTemplateManagerList,
      renderTemplateManagerDetail,
      handleTemplateManagerListClick,
      handleTemplateManagerDetailClick,
      openTemplateManagerModal,
      closeTemplateManagerModal,
      handleTemplateUpload,
      bindTemplateUploadEvents,
    };
  }

  global.PPTM_MANAGERS = { createManagersModule };
})(window);
