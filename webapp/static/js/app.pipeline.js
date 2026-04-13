// Images, executor, and postprocess module for PPT Master Web app.
(function initPptmPipeline(global) {
  function createPipelineModule(deps) {
    const {
      state,
      elements,
      apiFetch,
      showFlash,
      setBusy,
      escapeHtml,
      addActivityLog,
      refreshProject,
      openSvgPreviewModal,
      PIPELINE_GUIDE,
    } = deps;

    function renderImagesStep() {
      if (!elements.stageBody) return;
      const project = state.selectedProject;
      const hasDesignSpec = !!project?.design_spec_path;
      if (!hasDesignSpec) {
        elements.stageBody.innerHTML = "<p class='helper'>请先完成设计方案确认</p>";
        return;
      }
      const hasImageList = project?.image_list?.length > 0;
      if (!hasImageList) {
        elements.stageBody.innerHTML = `<div class="image-generate-manual"><h3>手动生成图片</h3><form id="imageGenerateForm" class="stack"><label class="field"><span>图片描述 (Prompt)</span><textarea name="prompt" rows="3" placeholder="描述你想要生成的图片内容..."></textarea></label><div class="two-col"><label class="field"><span>宽高比</span><select name="aspect_ratio"><option value="16:9">16:9 (横版)</option><option value="4:3">4:3</option><option value="1:1">1:1 (方形)</option><option value="9:16">9:16 (竖版)</option></select></label><label class="field"><span>尺寸</span><select name="image_size"><option value="1K">1K</option><option value="2K">2K</option></select></label></div><button type="submit" class="button button-primary">生成图片</button></form></div>`;
      } else {
        elements.stageBody.innerHTML = `<div class="image-list-view"><h3>待生成图片 (${project.image_list.length})</h3><div class="image-list">${project.image_list.map((img, index) => `<div class="image-list-item"><span>${escapeHtml(img.description || `图片 ${index + 1}`)}</span><button class="button button-secondary button-small" data-action="generate-image" data-index="${index}">生成</button></div>`).join("")}</div><button class="button button-primary" id="generateAllImagesBtn">批量生成全部</button></div>`;
      }
      elements.stageBody.querySelector("#imageGenerateForm")?.addEventListener("submit", handleImageGenerateSubmit);
      document.getElementById("generateAllImagesBtn")?.addEventListener("click", () => generateAllImages(state.selectedProject.name));
    }

    async function handleImageGenerateSubmit(event) {
      event.preventDefault();
      if (!state.selectedProject) return;
      const formData = new FormData(event.target);
      const prompt = formData.get("prompt");
      const aspectRatio = formData.get("aspect_ratio");
      const imageSize = formData.get("image_size");
      if (!prompt) {
        showFlash("请输入图片描述", "error");
        return;
      }
      try {
        setBusy(true);
        addActivityLog("开始生成图片...", prompt);
        const data = await apiFetch(`/api/projects/${encodeURIComponent(state.selectedProject.name)}/generate-image`, {
          method: "POST",
          body: JSON.stringify({ prompt, aspect_ratio: aspectRatio, image_size: imageSize }),
        });
        showFlash("图片生成完成");
        addActivityLog("图片生成完成", data.image?.filename || "");
        await refreshProject(state.selectedProject.name);
      } catch (error) {
        showFlash(error.message, "error");
        addActivityLog("图片生成失败", error.message, "error");
      } finally {
        setBusy(false);
      }
    }

    async function generateAllImages(projectName) {
      const project = state.selectedProject;
      const imageList = project?.image_list || [];
      if (!imageList.length) {
        showFlash("当前没有待生成图片", "error");
        return;
      }
      try {
        setBusy(true);
        for (const [index, image] of imageList.entries()) {
          const prompt = image.description || image.purpose || `图片 ${index + 1}`;
          addActivityLog(`批量生成图片 ${index + 1}/${imageList.length}`, prompt);
          await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/generate-image`, {
            method: "POST",
            body: JSON.stringify({
              prompt,
              filename: image.filename || "",
              aspect_ratio: image.aspect_ratio || "1:1",
              image_size: "1K",
            }),
          });
        }
        showFlash("批量图片生成完成");
        await refreshProject(projectName);
      } catch (error) {
        showFlash(error.message, "error");
        addActivityLog("批量图片生成失败", error.message, "error");
      } finally {
        setBusy(false);
      }
    }

    function renderExecutorStep() {
      if (!elements.stageBody) return;
      const project = state.selectedProject;
      const hasDesignSpec = !!project?.design_spec_path;
      if (!hasDesignSpec) {
        elements.stageBody.innerHTML = "<p class='helper'>请先完成设计方案确认</p>";
        return;
      }
      const hasSlides = project?.slide_count > 0;
      elements.stageBody.innerHTML = `<div class="executor-view"><div class="executor-actions"><button class="button button-primary" id="generateSvgBtn" ${state.svgGeneration.inProgress ? "disabled" : ""}>${state.svgGeneration.inProgress ? "生成中..." : "生成页面"}</button>${hasSlides ? `<button class="button button-secondary" id="regenerateSvgBtn">重新生成</button><button class="button button-ghost" id="deleteSvgBtn">删除全部</button>` : ""}</div>${state.svgGeneration.inProgress ? renderSvgProgress() : ""}<div id="svgPreviewArea" class="svg-preview-area">${hasSlides ? renderSvgPreviewList(project) : "<p class='helper'>暂无生成的页面</p>"}</div></div>`;
      document.getElementById("generateSvgBtn")?.addEventListener("click", () => generateSvg(state.selectedProject.name));
      document.getElementById("regenerateSvgBtn")?.addEventListener("click", () => regenerateAllSvg(state.selectedProject.name));
      document.getElementById("deleteSvgBtn")?.addEventListener("click", () => deleteAllSvg(state.selectedProject.name));
      setupSvgPreviewHandlers();
    }

    function renderSvgProgress() {
      const { totalPages, generatedPages, currentTitle } = state.svgGeneration;
      return `<div class="svg-progress"><div class="svg-progress-bar"><div class="svg-progress-fill" style="width: ${totalPages > 0 ? (generatedPages / totalPages * 100) : 0}%"></div></div><p>${generatedPages}/${totalPages} 页${currentTitle ? `: ${escapeHtml(currentTitle)}` : ""}</p></div>`;
    }

    function renderSvgPreviewList(project) {
      if (!project.slides?.length) return "";
      return `<div class="svg-preview-grid">${project.slides.map((slide, index) => `<div class="svg-preview-item" data-slide-index="${index}"><img src="${escapeHtml(slide.thumbnail || slide.url)}?t=${Date.now()}" alt="页面 ${index + 1}"><span>${escapeHtml(slide.title || `页面 ${index + 1}`)}</span></div>`).join("")}</div>`;
    }

    function setupSvgPreviewHandlers() {
      elements.stageBody?.querySelectorAll(".svg-preview-item").forEach((item) => {
        item.addEventListener("click", () => {
          const index = Number.parseInt(item.dataset.slideIndex, 10);
          const project = state.selectedProject;
          if (project?.slides?.length) openSvgPreviewModal(project.slides, index);
        });
      });
    }

    async function generateSvg(projectName) {
      try {
        state.svgGeneration.inProgress = true;
        state.svgGeneration.mode = "generate";
        state.svgGeneration.log = [];
        state.svgGeneration.errors = [];
        state.svgGeneration.totalPages = 0;
        state.svgGeneration.generatedPages = 0;
        state.svgGeneration.currentPage = 0;
        state.svgGeneration.currentTitle = "";
        addActivityLog("开始生成 SVG...");
        renderExecutorStep();

        const response = await fetch(`/api/projects/${encodeURIComponent(projectName)}/generate-svg`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!response.ok) throw new Error(`生成失败: ${response.status}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent = "message";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
              continue;
            }
            if (!line.startsWith("data: ")) continue;
            try {
              handleSseMessage(currentEvent, JSON.parse(line.slice(6)));
            } catch (error) {
              // Ignore partial SSE chunks while continuing to stream progress.
            }
          }
        }

        showFlash("SVG 生成完成");
        await refreshProject(projectName);
      } catch (error) {
        showFlash(error.message, "error");
        addActivityLog("SVG 生成失败", error.message, "error");
      } finally {
        state.svgGeneration.inProgress = false;
        renderExecutorStep();
      }
    }

    function handleSseMessage(eventName, data) {
      if (eventName === "start") {
        state.svgGeneration.totalPages = data.total_pages || 0;
        state.svgGeneration.generatedPages = 0;
        state.svgGeneration.currentPage = 0;
        state.svgGeneration.currentTitle = "";
        renderExecutorStep();
        return;
      }
      if (eventName === "page_complete") {
        state.svgGeneration.totalPages = data.total_pages || state.svgGeneration.totalPages;
        state.svgGeneration.generatedPages += 1;
        state.svgGeneration.currentPage = data.page_number || state.svgGeneration.currentPage;
        state.svgGeneration.currentTitle = data.title || "";
        addActivityLog(`生成第 ${data.page_number}/${state.svgGeneration.totalPages} 页`, data.title || "");
        renderExecutorStep();
        return;
      }
      if (eventName === "page_error") {
        const message = data.error || "未知错误";
        state.svgGeneration.errors.push(message);
        addActivityLog(`错误: ${message}`, message, "error");
        return;
      }
      if (eventName === "complete") {
        if (Array.isArray(data.errors)) state.svgGeneration.errors = data.errors;
        addActivityLog("SVG 生成流程完成", `${data.generated || 0} 页已输出`);
      }
    }

    async function regenerateAllSvg(projectName) {
      try {
        state.svgGeneration.inProgress = true;
        state.svgGeneration.mode = "regenerate";
        state.svgGeneration.totalPages = 0;
        state.svgGeneration.generatedPages = 0;
        state.svgGeneration.currentPage = 0;
        state.svgGeneration.currentTitle = "";
        addActivityLog("重新生成全部 SVG...");
        renderExecutorStep();

        const response = await fetch(`/api/projects/${encodeURIComponent(projectName)}/regenerate-svg`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ regenerate_all: true }),
        });
        if (!response.ok) throw new Error(`重新生成失败: ${response.status}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent = "message";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
              continue;
            }
            if (!line.startsWith("data: ")) continue;
            try {
              handleSseMessage(currentEvent, JSON.parse(line.slice(6)));
            } catch (error) {
              // Ignore partial SSE chunks while continuing to stream progress.
            }
          }
        }

        showFlash("SVG 重新生成完成");
        await refreshProject(projectName);
      } catch (error) {
        showFlash(error.message, "error");
      } finally {
        state.svgGeneration.inProgress = false;
        renderExecutorStep();
      }
    }

    async function deleteAllSvg(projectName) {
      if (!window.confirm("确认删除全部 SVG 和讲稿？此操作不可撤销。")) return;
      try {
        setBusy(true);
        await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/delete-svg`, {
          method: "POST",
          body: JSON.stringify({ delete_all: true }),
        });
        showFlash("SVG 已删除");
        await refreshProject(projectName);
      } catch (error) {
        showFlash(error.message, "error");
      } finally {
        setBusy(false);
      }
    }

    async function generateNotes(projectName) {
      try {
        setBusy(true);
        addActivityLog("开始生成讲稿...");
        const data = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/generate-notes`, {
          method: "POST",
          body: JSON.stringify({}),
        });
        showFlash("讲稿生成完成");
        addActivityLog("讲稿已生成", data.command || "");
        await refreshProject(projectName);
      } catch (error) {
        showFlash(error.message, "error");
      } finally {
        setBusy(false);
      }
    }

    function renderPostStep() {
      if (!elements.stageBody) return;
      const project = state.selectedProject;
      if (!project) return;
      const status = getPostprocessStatus(project);
      elements.stageBody.innerHTML = `<div class="postprocess-view"><div class="postprocess-steps">${renderPostprocessStepCard("split-notes", "拆分讲稿", "将 total.md 拆分为逐页备注", status.splitNotes)}${renderPostprocessStepCard("finalize-svg", "整理 SVG", "整理最终页面文件", status.finalizeSvg)}${renderPostprocessStepCard("export-pptx", "导出 PPT", "导出可编辑的 PPT 文件", status.exportPptx)}</div><div id="deliveryArea" class="delivery-area">${renderDeliveryArea(project)}</div></div>`;
      setupPostprocessHandlers();
    }

    function renderPostprocessStepCard(stepId, title, desc, status) {
      return `<div class="postprocess-card ${status.ready ? "ready" : ""} ${status.disabled ? "disabled" : ""}" data-step-id="${escapeHtml(stepId)}"><div class="postprocess-card-header"><h3>${escapeHtml(title)}</h3><span class="postprocess-status">${status.ready ? "✓ 已完成" : status.disabled ? "⏳ 等待中" : "📋 待执行"}</span></div><p class="helper">${escapeHtml(desc)}</p><p class="postprocess-command">${escapeHtml(PIPELINE_GUIDE[stepId]?.command || "")}</p>${status.reason ? `<p class="blocker-reason">${escapeHtml(status.reason)}</p>` : ""}</div>`;
    }

    function getPostprocessStatus(project) {
      const splitNotes = {
        ready: !!project.notes_split_path,
        disabled: !project.design_spec_path,
        reason: !project.design_spec_path ? "需要设计规范" : null,
      };
      const finalizeSvg = {
        ready: !!project.svg_final_path,
        disabled: !project.svg_output_path,
        reason: !project.svg_output_path ? "需要 SVG 输出" : null,
      };
      const exportPptx = {
        ready: !!project.exported,
        disabled: !project.svg_final_path || !project.notes_split_path,
        reason: !project.svg_final_path ? "需要最终 SVG" : (!project.notes_split_path ? "需要拆分讲稿" : null),
      };
      return { splitNotes, finalizeSvg, exportPptx };
    }

    function renderDeliveryArea(project) {
      if (!project.exported) return "<p class='helper'>完成以上步骤后，导出文件将显示在这里</p>";
      return `<div class="delivery-files"><h3>交付物</h3><div class="delivery-file"><a href="${escapeHtml(project.pptx_path)}" target="_blank">📄 下载 PPT</a></div>${project.design_spec_path ? `<div class="delivery-file"><a href="${escapeHtml(project.design_spec_path)}" target="_blank">📋 设计规范</a></div>` : ""}${project.notes_split_path ? `<div class="delivery-file"><a href="${escapeHtml(project.notes_split_path)}" target="_blank">📝 讲稿</a></div>` : ""}</div>`;
    }

    function setupPostprocessHandlers() {
      elements.stageBody?.querySelectorAll(".postprocess-card:not(.disabled)").forEach((card) => {
        card.addEventListener("click", () => {
          const stepId = card.dataset.stepId;
          if (stepId) runPostprocessStep(stepId);
        });
      });
    }

    async function runPostprocessStep(stepId) {
      if (!state.selectedProject) return;
      try {
        setBusy(true);
        addActivityLog(`开始执行: ${PIPELINE_GUIDE[stepId]?.description || stepId}`);
        const data = await apiFetch(`/api/projects/${encodeURIComponent(state.selectedProject.name)}/run-step/${stepId}`, {
          method: "POST",
        });
        showFlash(`${PIPELINE_GUIDE[stepId]?.description || stepId} 完成`);
        addActivityLog("执行完成", data.output || "");
        await refreshProject(state.selectedProject.name);
      } catch (error) {
        showFlash(error.message, "error");
        addActivityLog("执行失败", error.message, "error");
      } finally {
        setBusy(false);
      }
    }

    return {
      renderImagesStep,
      handleImageGenerateSubmit,
      generateAllImages,
      renderExecutorStep,
      renderSvgProgress,
      renderSvgPreviewList,
      setupSvgPreviewHandlers,
      generateSvg,
      handleSseMessage,
      regenerateAllSvg,
      deleteAllSvg,
      generateNotes,
      renderPostStep,
      renderPostprocessStepCard,
      getPostprocessStatus,
      renderDeliveryArea,
      setupPostprocessHandlers,
      runPostprocessStep,
    };
  }

  global.PPTM_PIPELINE = { createPipelineModule };
})(window);
