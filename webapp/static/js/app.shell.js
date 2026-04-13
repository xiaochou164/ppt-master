// Shell and page bootstrap module for PPT Master Web app.
(function initPptmShell(global) {
  function createShellModule(deps) {
    const {
      state,
      elements,
      apiFetch,
      setBusy,
      escapeHtml,
      cacheElements,
      applyTheme,
      setupPasswordToggles,
      confirmDiscardChanges,
      hasUnsavedStageChanges,
      renderUserBadge,
      addActivityLog,
      FLOW_STEPS,
      createEmptyModelConfig,
      renderProjectStep,
      renderSourcesStep,
      renderTemplateStep,
      renderStrategistStep,
      renderImagesStep,
      renderExecutorStep,
      renderPostStep,
      refreshProject,
      validateProject,
      previewSource,
      runStrategistAnalysis,
      generateSingleImage,
      handleCreateProject,
      handleImportSources,
      openModelConfigModal,
      closeModelConfigModal,
      beginNewProfile,
      handleModelProfileListClick,
      fetchRemoteModels,
      testModelConfig,
      saveModelConfig,
      openImageModelModal,
      closeImageModelModal,
      beginNewImageProfile,
      handleImageProfileListClick,
      copyFromGlobalModelConfig,
      testImageConfig,
      saveImageModelProfile,
      closeSvgPreviewModal,
      navigateSvgPreview,
      openProjectManagerModal,
      closeProjectManagerModal,
      renderProjectManagerList,
      handleProjectManagerListClick,
      handleProjectManagerDetailClick,
      openTemplateManagerModal,
      closeTemplateManagerModal,
      renderTemplateManagerList,
      handleTemplateManagerListClick,
      handleTemplateManagerDetailClick,
      bindTemplateUploadEvents,
      handleAccountSettingsSubmit,
      handleLogout,
      toggleCollapsible,
      clearAuditFilters,
      setAuditRange,
      changeAdminPage,
      changeAuditPage,
      copyAuditLogs,
      exportAuditLogs,
      handleAdminCreateUser,
      handleAdminUsersListClick,
      handleAdminUserDetailClick,
      loadAdminData,
      loadAuditLogs,
      closeModal,
    } = deps;

    function getProjectBlockers(project) {
      const blockers = [];
      if (!project.name) blockers.push("请先创建项目");
      else if (!project.source_count) blockers.push("请先添加内容来源");
      else if (!project.template_id && !project.free_design) blockers.push("请先选择模板");
      else if (!project.design_spec_path) blockers.push("请先确认设计方案");
      return blockers;
    }

    async function loadDashboard(options = {}) {
      const { preserveSelection } = options;
      try {
        setBusy(true);
        const data = await apiFetch("/api/dashboard");
        state.user = data.user;
        state.formats = data.formats || [];
        state.steps = data.steps || FLOW_STEPS;
        state.projects = data.projects || [];
        state.modelConfig = data.model_config || createEmptyModelConfig();
        state.imageModelConfig = data.image_model_config || {
          profiles: [],
          selected_profile_id: null,
          active_profile: null,
          configured: false,
          aspect_ratios: [],
          sizes: [],
        };
        if (!preserveSelection) state.selectedProject = data.selected_project || null;
        renderAll();
        renderUserBadge();
        return data;
      } catch (error) {
        renderInitializationError(error);
        throw error;
      } finally {
        setBusy(false);
      }
    }

    function renderInitializationError(error) {
      if (!elements.stageBody) return;
      elements.stageBody.innerHTML = `<div class="init-error"><h2>初始化失败</h2><p>${escapeHtml(error.message)}</p><p>请检查服务是否正常运行。</p></div>`;
    }

    function renderAll() {
      renderStats();
      renderProjectContext();
      renderStepRail();
      renderStage();
    }

    function renderStats() {
      if (elements.projectCount) elements.projectCount.textContent = state.projects?.length || 0;
      if (elements.formatCount) elements.formatCount.textContent = state.formats?.length || 0;
      if (elements.stepCount) elements.stepCount.textContent = FLOW_STEPS.length;
    }

    function renderProjectContext() {
      if (!elements.projectContext) return;
      const project = state.selectedProject;
      if (!project) {
        elements.projectContext.innerHTML = "<p class='helper'>请先创建或选择一个项目</p>";
        return;
      }
      const blockers = getProjectBlockers(project);
      const health = blockers.length === 0 ? "healthy" : "blocked";
      elements.projectContext.innerHTML = `<div class="project-context-card ${health}"><div class="project-context-info"><strong>${escapeHtml(project.name)}</strong><span class="project-context-format">${escapeHtml(project.format || "")}</span></div>${blockers.length > 0 ? `<div class="project-context-blockers">${blockers.map((blocker) => `<span class="blocker-tag">${escapeHtml(blocker)}</span>`).join("")}</div>` : ""}<div class="project-context-actions"><button class="button button-ghost button-small" data-action="refresh">刷新</button><button class="button button-ghost button-small" data-action="validate">校验</button></div></div>`;
    }

    function renderStepRail() {
      if (!elements.stepRail) return;
      const steps = state.steps || FLOW_STEPS;
      const currentId = state.activeStepId || "project";
      const project = state.selectedProject;
      elements.stepRail.innerHTML = steps.map((step) => {
        const isActive = step.id === currentId;
        const isCompleted = isStepCompleted(step.id, project);
        const isLocked = isStepLocked(step.id, project);
        return `<button class="step-item ${isActive ? "active" : ""} ${isCompleted ? "completed" : ""} ${isLocked ? "locked" : ""}" data-step="${step.id}" ${isLocked ? "disabled" : ""}><span class="step-number">${step.kicker}</span><span class="step-title">${escapeHtml(step.title)}</span></button>`;
      }).join("");
    }

    function isStepCompleted(stepId, project) {
      if (!project) return false;
      switch (stepId) {
        case "project": return !!project.name;
        case "sources": return project.source_count > 0;
        case "template": return !!project.template_id || project.free_design;
        case "strategist": return !!project.design_spec_path;
        case "images": return true;
        case "executor": return project.executor_done;
        case "post": return project.exported;
        default: return false;
      }
    }

    function isStepLocked(stepId, project) {
      if (!project) return stepId !== "project";
      switch (stepId) {
        case "project": return false;
        case "sources": return !project.name;
        case "template": return !project.name || project.source_count === 0;
        case "strategist": return !project.template_id && !project.free_design;
        case "images": return !project.design_spec_path;
        case "executor": return !project.design_spec_path;
        case "post": return !project.executor_done;
        default: return true;
      }
    }

    function renderStage() {
      const stepId = state.activeStepId || "project";
      const step = (state.steps || FLOW_STEPS).find((item) => item.id === stepId) || FLOW_STEPS[0];
      if (elements.stageKicker) elements.stageKicker.textContent = step.kicker;
      if (elements.stageTitle) elements.stageTitle.textContent = step.title;
      if (elements.stageDescription) elements.stageDescription.textContent = step.description;
      if (!state.selectedProject && stepId !== "project") {
        if (elements.stageBody) elements.stageBody.innerHTML = "<p class='helper'>请先创建或选择一个项目</p>";
        return;
      }
      switch (stepId) {
        case "project": renderProjectStep(); break;
        case "sources": renderSourcesStep(); break;
        case "template": renderTemplateStep(); break;
        case "strategist": renderStrategistStep(); break;
        case "images": renderImagesStep(); break;
        case "executor": renderExecutorStep(); break;
        case "post": renderPostStep(); break;
        default:
          if (elements.stageBody) elements.stageBody.innerHTML = "";
      }
    }

    function bindStageEvents() {
      if (!elements.stageBody) return;
      elements.stageBody.addEventListener("click", (event) => {
        const projectButton = event.target.closest("[data-project]");
        if (projectButton) {
          const projectName = projectButton.dataset.project;
          state.selectedProject = (state.projects || []).find((project) => project.name === projectName) || state.selectedProject;
          renderProjectContext();
          renderStepRail();
          renderStage();
          return;
        }
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        const { action } = button.dataset;
        if (action === "refresh") refreshProject(state.selectedProject?.name);
        else if (action === "validate") validateProject(state.selectedProject?.name);
        else if (action === "preview-source") previewSource(button.dataset.url);
        else if (action === "re-analyze") runStrategistAnalysis();
        else if (action === "generate-image") generateSingleImage(state.selectedProject?.name, Number.parseInt(button.dataset.index, 10));
      });
      elements.stageBody.addEventListener("submit", (event) => {
        if (event.target.id === "createProjectForm") handleCreateProject(event);
        else if (event.target.id === "sourcesImportForm") handleImportSources(event);
      });
    }

    function setupGlobalEventListeners() {
      elements.clearLogButton?.addEventListener("click", () => {
        state.activityLogs = [];
        const output = elements.logOutput;
        if (output) {
          output.innerHTML = `<div class="log-entry log-entry-empty"><strong>等待操作…</strong><span class="helper">新的运行记录会显示在这里。</span></div>`;
        }
        elements.jumpToLatestLogButton?.classList.add("hidden");
      });
      elements.jumpToLatestLogButton?.addEventListener("click", () => {
        if (elements.logOutput) elements.logOutput.scrollTop = elements.logOutput.scrollHeight;
        elements.jumpToLatestLogButton.classList.add("hidden");
      });
      elements.logOutput?.addEventListener("scroll", () => {
        if (elements.jumpToLatestLogButton) {
          elements.jumpToLatestLogButton.classList.toggle("hidden", elements.logOutput.scrollTop > 24);
        }
      });

      elements.stepRail?.addEventListener("click", (event) => {
        const button = event.target.closest(".step-item");
        if (!button || button.disabled) return;
        const stepId = button.dataset.step;
        if (hasUnsavedStageChanges()) {
          if (!confirmDiscardChanges()) return;
        }
        state.activeStepId = stepId;
        renderStepRail();
        renderStage();
      });

      elements.openModelConfigButton?.addEventListener("click", openModelConfigModal);
      elements.closeModelConfigButton?.addEventListener("click", () => closeModelConfigModal());
      elements.modelConfigBackdrop?.addEventListener("click", () => closeModelConfigModal());
      elements.createProfileButton?.addEventListener("click", beginNewProfile);
      elements.modelProfileList?.addEventListener("click", handleModelProfileListClick);
      elements.fetchModelsButton?.addEventListener("click", fetchRemoteModels);
      elements.testModelButton?.addEventListener("click", testModelConfig);
      elements.modelConfigForm?.addEventListener("submit", saveModelConfig);

      document.getElementById("openImageModelButton")?.addEventListener("click", openImageModelModal);
      elements.closeImageModelButton?.addEventListener("click", () => closeImageModelModal());
      elements.imageModelBackdrop?.addEventListener("click", () => closeImageModelModal());
      elements.createImageProfileButton?.addEventListener("click", beginNewImageProfile);
      elements.imageModelProfileList?.addEventListener("click", handleImageProfileListClick);
      elements.copyFromGlobalConfigButton?.addEventListener("click", copyFromGlobalModelConfig);
      elements.testImageButton?.addEventListener("click", testImageConfig);
      elements.imageModelForm?.addEventListener("submit", saveImageModelProfile);

      elements.closeSvgPreviewButton?.addEventListener("click", closeSvgPreviewModal);
      elements.svgPreviewBackdrop?.addEventListener("click", closeSvgPreviewModal);
      elements.svgPrevButton?.addEventListener("click", () => navigateSvgPreview(-1));
      elements.svgNextButton?.addEventListener("click", () => navigateSvgPreview(1));
      document.addEventListener("keydown", (event) => {
        if (elements.svgPreviewModal && !elements.svgPreviewModal.classList.contains("hidden")) {
          if (event.key === "ArrowLeft") navigateSvgPreview(-1);
          if (event.key === "ArrowRight") navigateSvgPreview(1);
        }
      });

      document.getElementById("closeDocPreviewButton")?.addEventListener("click", () => closeModal(document.getElementById("docPreviewModal")));
      document.getElementById("docPreviewBackdrop")?.addEventListener("click", () => closeModal(document.getElementById("docPreviewModal")));

      elements.openProjectManagerButton?.addEventListener("click", openProjectManagerModal);
      elements.closeProjectManagerButton?.addEventListener("click", closeProjectManagerModal);
      elements.projectManagerBackdrop?.addEventListener("click", closeProjectManagerModal);
      elements.pmSearchInput?.addEventListener("input", (event) => {
        state.projectManager.searchQuery = event.target.value;
        renderProjectManagerList();
      });
      elements.pmProjectList?.addEventListener("click", handleProjectManagerListClick);
      elements.pmProjectDetail?.addEventListener("click", handleProjectManagerDetailClick);

      elements.openTemplateManagerButton?.addEventListener("click", openTemplateManagerModal);
      elements.closeTemplateManagerButton?.addEventListener("click", closeTemplateManagerModal);
      elements.templateManagerBackdrop?.addEventListener("click", closeTemplateManagerModal);
      elements.tmSearchInput?.addEventListener("input", (event) => {
        state.templateManager.searchQuery = event.target.value;
        renderTemplateManagerList();
      });
      elements.tmCategoryFilter?.addEventListener("change", (event) => {
        state.templateManager.filterCategory = event.target.value;
        renderTemplateManagerList();
      });
      elements.tmTemplateList?.addEventListener("click", handleTemplateManagerListClick);
      elements.tmTemplateDetail?.addEventListener("click", handleTemplateManagerDetailClick);
      bindTemplateUploadEvents();

      elements.openAccountSettingsButton?.addEventListener("click", () => openModal(elements.accountSettingsModal));
      document.getElementById("closeAccountSettingsButton")?.addEventListener("click", () => closeModal(elements.accountSettingsModal));
      document.getElementById("accountSettingsBackdrop")?.addEventListener("click", () => closeModal(elements.accountSettingsModal));
      elements.accountSettingsForm?.addEventListener("submit", handleAccountSettingsSubmit);

      elements.logoutButton?.addEventListener("click", handleLogout);
      elements.themeSelect?.addEventListener("change", (event) => applyTheme(event.target.value));

      document.addEventListener("click", (event) => {
        const button = event.target.closest("[data-collapsible] button");
        if (button) toggleCollapsible(button);
      });
    }

    async function bootstrap() {
      cacheElements();
      applyTheme(localStorage.getItem("ppt-master-theme") || "light");
      setupGlobalEventListeners();
      setupPasswordToggles();
      bindStageEvents();
      if (elements.modelConfigModal) state.modal.isOpen = false;
      if (elements.imageModelModal) state.imageModal.isOpen = false;
      addActivityLog("工作台已就绪");
    }

    async function bootstrapAdminPage() {
      cacheElements();
      applyTheme(localStorage.getItem("ppt-master-theme") || "light");
      setupPasswordToggles();
      setupGlobalEventListeners();
      document.getElementById("adminUserSearchInput")?.addEventListener("input", (event) => {
        state.admin.userQuery = event.target.value;
        state.admin.page = 1;
        loadAdminData();
      });
      document.getElementById("adminRoleFilter")?.addEventListener("change", (event) => {
        state.admin.roleFilter = event.target.value;
        state.admin.page = 1;
        loadAdminData();
      });
      document.getElementById("adminStatusFilter")?.addEventListener("change", (event) => {
        state.admin.statusFilter = event.target.value;
        state.admin.page = 1;
        loadAdminData();
      });
      document.getElementById("adminProviderFilter")?.addEventListener("change", (event) => {
        state.admin.providerFilter = event.target.value;
        state.admin.page = 1;
        loadAdminData();
      });
      document.getElementById("adminPrevPage")?.addEventListener("click", () => changeAdminPage(-1));
      document.getElementById("adminNextPage")?.addEventListener("click", () => changeAdminPage(1));
      document.getElementById("adminCreateUserForm")?.addEventListener("submit", handleAdminCreateUser);
      document.getElementById("adminAuditActionInput")?.addEventListener("input", (event) => {
        state.admin.auditAction = event.target.value;
        state.admin.auditPage = 1;
        loadAuditLogs();
      });
      document.getElementById("adminAuditResourceInput")?.addEventListener("input", (event) => {
        state.admin.auditResource = event.target.value;
        state.admin.auditPage = 1;
        loadAuditLogs();
      });
      document.getElementById("adminAuditStartInput")?.addEventListener("change", (event) => {
        state.admin.auditStart = event.target.value;
        state.admin.auditPage = 1;
        loadAuditLogs();
      });
      document.getElementById("adminAuditEndInput")?.addEventListener("change", (event) => {
        state.admin.auditEnd = event.target.value;
        state.admin.auditPage = 1;
        loadAuditLogs();
      });
      document.getElementById("adminAuditPrevPage")?.addEventListener("click", () => changeAuditPage(-1));
      document.getElementById("adminAuditNextPage")?.addEventListener("click", () => changeAuditPage(1));
      document.getElementById("adminAuditQuick24h")?.addEventListener("click", () => setAuditRange(24));
      document.getElementById("adminAuditQuick7d")?.addEventListener("click", () => setAuditRange(168));
      document.getElementById("adminAuditClear")?.addEventListener("click", clearAuditFilters);
      document.getElementById("adminAuditCopy")?.addEventListener("click", copyAuditLogs);
      document.getElementById("adminAuditExport")?.addEventListener("click", exportAuditLogs);
      document.getElementById("adminUsersList")?.addEventListener("click", handleAdminUsersListClick);
      document.getElementById("adminUserDetail")?.addEventListener("click", handleAdminUserDetailClick);
      await loadAdminData();
      await loadAuditLogs();
    }

    return {
      getProjectBlockers,
      loadDashboard,
      renderInitializationError,
      renderAll,
      renderStats,
      renderProjectContext,
      renderStepRail,
      isStepCompleted,
      isStepLocked,
      renderStage,
      bindStageEvents,
      setupGlobalEventListeners,
      bootstrap,
      bootstrapAdminPage,
    };
  }

  global.PPTM_SHELL = { createShellModule };
})(window);
