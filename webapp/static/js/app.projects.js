// Project and sources module for PPT Master Web app.
(function initPptmProjects(global) {
  function createProjectsModule(deps) {
    const {
      state,
      elements,
      apiFetch,
      showFlash,
      setBusy,
      escapeHtml,
      setupInlineValidation,
      renderProjectContext,
      renderStepRail,
      renderStage,
      openDocPreview,
    } = deps;
    const nextProjectsFeature = global.PPTM_NEXT_RUNTIME?.features?.projects || null;
    const syncNextState = global.PPTM_NEXT_RUNTIME?.syncState || (() => state);

    function renderProjectStep() {
      if (!elements.stageBody) return;
      const viewModel = nextProjectsFeature?.projectStep?.getProjectCreateViewModel
        ? nextProjectsFeature.projectStep.getProjectCreateViewModel()
        : null;
      const formats = viewModel?.formats || (state.formats || []).map((format) => {
        const value = typeof format === "string" ? format : (format.id || "");
        const label = typeof format === "string" ? format : (format.name || format.id || "");
        return { value, label };
      });
      const recentProjects = viewModel?.recentProjects || (state.projects || []).slice(0, 5).map((project) => ({
        name: project.name,
        format: project.format || "",
        sourceCount: project.source_count || 0,
      }));
      elements.stageBody.innerHTML = `<form id="createProjectForm" class="stack"><div class="two-col"><label class="field"><span>项目名称</span><input type="text" name="project_name" placeholder="例如：Q1 产品汇报" required></label><label class="field"><span>画布格式</span><select name="format">${formats.map((format) => {
        const value = format.value || "";
        const label = format.label || value;
        return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
      }).join("")}</select></label></div><button type="submit" class="button button-primary">创建项目</button></form>${recentProjects.length > 0 ? `<div class="recent-projects"><h3>最近项目</h3><div class="recent-list">${recentProjects.map((project) => `<button class="recent-item" data-project="${escapeHtml(project.name)}"><span class="recent-name">${escapeHtml(project.name)}</span><span class="recent-format">${escapeHtml(project.format || "")}</span></button>`).join("")}</div></div>` : ""}`;
      setupInlineValidation(elements.stageBody);
    }

    function renderSourcesList(project) {
      const viewModel = nextProjectsFeature?.sourcesStep?.getSourcesViewModel
        ? nextProjectsFeature.sourcesStep.getSourcesViewModel()
        : null;
      const sources = viewModel?.projectName === project?.name
        ? (viewModel.sources || [])
        : (project?.sources || []);
      if (!sources.length) return "<p class='helper'>暂无已导入的来源</p>";
      return sources.map((source) => `<div class="source-item"><span class="source-name">${escapeHtml(source.name || source.path || "未命名")}</span><button class="button button-ghost button-small" data-action="preview-source" data-url="${escapeHtml(source.url || source.path)}">预览</button></div>`).join("");
    }

    function setupSourceTypeHandlers() {
      if (!elements.stageBody) return;
      elements.stageBody.querySelectorAll(".source-type-card").forEach((card) => {
        card.addEventListener("click", () => {
          const type = card.dataset.sourceType;
          const textarea = elements.stageBody.querySelector("textarea[name='content']");
          const filenameField = elements.stageBody.querySelector("input[name='filename']");
          if (textarea) {
            if (type === "path") textarea.placeholder = "/path/to/document.pdf\n/path/to/presentation.pptx";
            else if (type === "url") textarea.placeholder = "https://example.com/doc.md\nhttps://example.com/article.pdf";
            else textarea.placeholder = "在此粘贴要整理的内容...";
          }
          if (filenameField) filenameField.style.display = type === "text" ? "" : "none";
        });
      });
    }

    function renderSourcesStep() {
      if (!elements.stageBody) return;
      const project = state.selectedProject;
      if (!project) return;
      elements.stageBody.innerHTML = `<div class="step-sources"><div class="sources-import-types"><button class="source-type-card" data-source-type="path"><span class="source-type-icon">📁</span><span class="source-type-title">本地路径</span><span class="source-type-desc">每行一个文件路径</span></button><button class="source-type-card" data-source-type="url"><span class="source-type-icon">🔗</span><span class="source-type-title">URL</span><span class="source-type-desc">网页或文档链接</span></button><button class="source-type-card" data-source-type="text"><span class="source-type-icon">📝</span><span class="source-type-title">粘贴文本</span><span class="source-type-desc">直接粘贴内容</span></button></div><form id="sourcesImportForm" class="stack" enctype="multipart/form-data"><input type="hidden" name="project_name" value="${escapeHtml(project.name)}"><div id="sourcesInputArea" class="sources-input-area"><textarea name="content" placeholder="输入内容或路径，每行一个..." rows="8"></textarea></div><div class="sources-options"><label class="field"><span>文件名（粘贴文本时）</span><input type="text" name="filename" placeholder="可选"></label><label class="field checkbox-field"><input type="checkbox" name="move"> 移动文件（而非复制）</label></div><button type="submit" class="button button-primary">导入来源</button></form>${project.source_count ? `<div class="sources-list"><h3>已导入来源 (${project.source_count})</h3><div id="sourcesListContent">${renderSourcesList(project)}</div></div>` : ""}</div>`;
      setupInlineValidation(elements.stageBody);
      setupSourceTypeHandlers();
    }

    async function refreshProject(projectName) {
      try {
        const data = nextProjectsFeature?.api?.fetchProject
          ? await nextProjectsFeature.api.fetchProject(projectName)
          : await apiFetch(`/api/projects/${encodeURIComponent(projectName)}`);
        state.selectedProject = data.project;
        const index = (state.projects || []).findIndex((project) => project.name === projectName);
        if (index >= 0) state.projects[index] = data.project;
        syncNextState("refreshProject");
        renderProjectContext();
        renderStage();
      } catch (error) {
        // Ignore background refresh failures and keep current UI state.
      }
    }

    async function handleCreateProject(event) {
      event.preventDefault();
      const formData = new FormData(event.target);
      const projectName = formData.get("project_name");
      const format = formData.get("format");
      if (!projectName) {
        showFlash("请输入项目名称", "error");
        return;
      }
      try {
        setBusy(true);
        const data = nextProjectsFeature?.projectStep?.submitCreateProject
          ? await nextProjectsFeature.projectStep.submitCreateProject({
              project_name: projectName,
              canvas_format: format,
            })
          : await apiFetch("/api/projects", {
              method: "POST",
              body: JSON.stringify({ project_name: projectName, canvas_format: format }),
            });
        state.selectedProject = data.project;
        const index = (state.projects || []).findIndex((project) => project.name === data.project.name);
        if (index >= 0) state.projects[index] = data.project;
        else state.projects.unshift(data.project);
        showFlash("项目已创建");
        state.activeStepId = "sources";
        syncNextState("handleCreateProject");
        renderStepRail();
        renderStage();
        renderProjectContext();
      } catch (error) {
        showFlash(error.message, "error");
      } finally {
        setBusy(false);
      }
    }

    async function handleImportSources(event) {
      event.preventDefault();
      const formData = new FormData(event.target);
      const projectName = formData.get("project_name");
      const content = String(formData.get("content") || "");
      const filename = formData.get("filename");
      const move = formData.get("move");
      if (!content) {
        showFlash("请输入内容或路径", "error");
        return;
      }
      try {
        setBusy(true);
        let refreshedProject = null;
        if (nextProjectsFeature?.sourcesStep?.submitImportSources) {
          const result = await nextProjectsFeature.sourcesStep.submitImportSources(projectName, {
            content,
            filename,
            move: Boolean(move),
          });
          refreshedProject = result.project;
        } else {
          const lines = content
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean);
          const isTextPaste = !!filename || !lines.every((item) => item.startsWith("/") || /^https?:\/\//i.test(item));
          const payload = isTextPaste
            ? {
                pasted_content: content,
                pasted_format: "markdown",
                ...(filename ? { pasted_filename: filename } : {}),
                ...(move ? { move: true } : {}),
              }
            : {
                sources: lines,
                ...(move ? { move: true } : {}),
              };
          await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/import`, { method: "POST", body: JSON.stringify(payload) });
        }
        showFlash("来源已导入");
        if (refreshedProject) {
          state.selectedProject = refreshedProject;
          const index = (state.projects || []).findIndex((project) => project.name === refreshedProject.name);
          if (index >= 0) state.projects[index] = refreshedProject;
          syncNextState("handleImportSources");
        } else {
          await refreshProject(projectName);
        }
        renderSourcesStep();
      } catch (error) {
        showFlash(error.message, "error");
      } finally {
        setBusy(false);
      }
    }

    async function validateProject(projectName) {
      try {
        setBusy(true);
        const data = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/validate`);
        state.validation = data;
        showFlash("项目校验完成");
        renderProjectContext();
      } catch (error) {
        showFlash(error.message, "error");
      } finally {
        setBusy(false);
      }
    }

    function previewSource(url) {
      if (!url) return;
      if (url.match(/\.(md|txt|html)$/i)) openDocPreview(url.split("/").pop(), url);
      else window.open(url, "_blank");
    }

    return {
      renderProjectStep,
      renderSourcesStep,
      renderSourcesList,
      refreshProject,
      handleCreateProject,
      handleImportSources,
      validateProject,
      previewSource,
    };
  }

  global.PPTM_PROJECTS = { createProjectsModule };
})(window);
