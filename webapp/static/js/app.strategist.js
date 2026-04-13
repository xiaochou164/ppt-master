// Strategist module for PPT Master Web app.
(function initPptmStrategist(global) {
  function createStrategistModule(deps) {
    const {
      state,
      elements,
      apiFetch,
      showFlash,
      setBusy,
      escapeHtml,
      setupInlineValidation,
      renderStepRail,
      renderStage,
      addActivityLog,
    } = deps;

    function renderSpecSummary(spec) {
      if (!spec) return "<p class='helper'>暂无设计规范详情</p>";
      return Object.entries(spec).map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(String(value))}</dd>`).join("");
    }

    function renderStrategistStep() {
      if (!elements.stageBody) return;
      const project = state.selectedProject;
      const hasAnalysis = !!project?.design_spec_path;
      if (hasAnalysis) {
        elements.stageBody.innerHTML = `<div class="strategist-done"><div class="status-card status-success"><p>设计方案已确认</p></div><div class="strategist-summary"><h3>设计规范摘要</h3><dl class="spec-summary">${renderSpecSummary(project.design_spec)}</dl></div><button class="button button-secondary" data-action="re-analyze">重新分析</button></div>`;
      } else {
        elements.stageBody.innerHTML = `<div class="strategist-start"><button class="button button-primary" id="startStrategistBtn">开始分析</button><p class="helper">基于内容来源和模板生成设计方案建议</p></div>`;
        document.getElementById("startStrategistBtn")?.addEventListener("click", runStrategistAnalysis);
      }
    }

    async function runStrategistAnalysis() {
      if (!state.selectedProject) return;
      try {
        setBusy(true);
        state.strategistLoading = true;
        addActivityLog("开始分析项目内容...");
        const data = await apiFetch(`/api/projects/${encodeURIComponent(state.selectedProject.name)}/analyze`, {
          method: "POST",
          body: JSON.stringify({}),
        });
        state.strategistAnalysis = data;
        renderStrategistForm(data);
      } catch (error) {
        showFlash(error.message, "error");
      } finally {
        setBusy(false);
        state.strategistLoading = false;
      }
    }

    function renderStrategistForm(analysis) {
      if (!elements.stageBody) return;
      const defaults = analysis?.eight_confirmations || {};
      elements.stageBody.innerHTML = `<form id="strategistForm" class="stack"><h3>八项确认</h3><div class="two-col"><label class="field"><span>画布格式</span><select name="canvas_format"><option value="">请选择</option>${(state.formats || []).map((format) => {
        const value = typeof format === "string" ? format : (format.id || "");
        const label = typeof format === "string" ? format : (format.name || format.id || "");
        return `<option value="${escapeHtml(value)}" ${defaults.canvas_format === value ? "selected" : ""}>${escapeHtml(label)}</option>`;
      }).join("")}</select></label><label class="field"><span>目标受众</span><input type="text" name="target_audience" value="${escapeHtml(defaults.target_audience || "")}" placeholder="例如：技术团队、投资人、客户"></label></div><div class="two-col"><label class="field"><span>最少页数</span><input type="number" name="page_count_min" value="${escapeHtml(defaults.page_count_min || "")}" placeholder="10"></label><label class="field"><span>最多页数</span><input type="number" name="page_count_max" value="${escapeHtml(defaults.page_count_max || "")}" placeholder="20"></label></div><div class="field"><span>风格目标</span><textarea name="style_objective" rows="2" placeholder="例如：专业、简洁、现代">${escapeHtml(defaults.style_objective || "")}</textarea></div><fieldset class="color-fieldset"><legend>配色方案</legend><div class="three-col"><label class="field"><span>主色</span><input type="text" name="color_primary" value="${escapeHtml(defaults.color_primary || "")}" placeholder="#2563EB"></label><label class="field"><span>辅色</span><input type="text" name="color_secondary" value="${escapeHtml(defaults.color_secondary || "")}" placeholder="#64748B"></label><label class="field"><span>强调色</span><input type="text" name="color_accent" value="${escapeHtml(defaults.color_accent || "")}" placeholder="#F59E0B"></label></div></fieldset><fieldset class="font-fieldset"><legend>字体</legend><div class="two-col"><label class="field"><span>标题字体</span><input type="text" name="title_font" value="${escapeHtml(defaults.title_font || "")}" placeholder="思源黑体"></label><label class="field"><span>正文字体</span><input type="text" name="body_font" value="${escapeHtml(defaults.body_font || "")}" placeholder="思源黑体"></label></div><label class="field"><span>正文字号</span><input type="text" name="body_size" value="${escapeHtml(defaults.body_size || "")}" placeholder="14pt"></label></fieldset><fieldset><legend>图标与图片</legend><div class="two-col"><label class="field"><span>图标方案</span><select name="icon_approach"><option value="">请选择</option><option value="outline" ${defaults.icon_approach === "outline" ? "selected" : ""}>线性图标</option><option value="filled" ${defaults.icon_approach === "filled" ? "selected" : ""}>填充图标</option><option value="mixed" ${defaults.icon_approach === "mixed" ? "selected" : ""}>混用</option></select></label><label class="field"><span>图片来源</span><select name="image_approach"><option value="">请选择</option><option value="generated" ${defaults.image_approach === "generated" ? "selected" : ""}>AI 生成</option><option value="stock" ${defaults.image_approach === "stock" ? "selected" : ""}>库存图片</option><option value="mixed" ${defaults.image_approach === "mixed" ? "selected" : ""}>混用</option></select></label></div></fieldset><button type="submit" class="button button-primary">保存设计规范</button></form>`;
      setupInlineValidation(elements.stageBody);
      elements.stageBody.querySelector("#strategistForm")?.addEventListener("submit", handleStrategistSubmit);
    }

    async function handleStrategistSubmit(event) {
      event.preventDefault();
      if (!state.selectedProject) return;
      const formData = new FormData(event.target);
      const raw = Object.fromEntries(formData.entries());
      const spec = {
        canvas_format: raw.canvas_format || "ppt169",
        page_count: {
          min: Number(raw.page_count_min || 8),
          max: Number(raw.page_count_max || 12),
        },
        target_audience: raw.target_audience || "",
        style_objective: raw.style_objective || "general",
        color_scheme: {
          primary: raw.color_primary || "#1565C0",
          secondary: raw.color_secondary || "#42A5F5",
          accent: raw.color_accent || "#FF6F00",
        },
        icon_approach: raw.icon_approach || "builtin",
        typography: {
          title_font: raw.title_font || "Microsoft YaHei",
          body_font: raw.body_font || "Microsoft YaHei",
          body_size: Number.parseInt(raw.body_size || "24", 10) || 24,
        },
        image_approach: raw.image_approach === "generated"
          ? "ai-generated"
          : (raw.image_approach === "stock" ? "user-provided" : (raw.image_approach || "none")),
      };
      try {
        setBusy(true);
        state.strategistSaving = true;
        const data = await apiFetch(`/api/projects/${encodeURIComponent(state.selectedProject.name)}/design-spec`, {
          method: "POST",
          body: JSON.stringify({ spec }),
        });
        state.selectedProject = data.project;
        showFlash("设计规范已保存");
        state.activeStepId = "images";
        renderStepRail();
        renderStage();
      } catch (error) {
        showFlash(error.message, "error");
      } finally {
        setBusy(false);
        state.strategistSaving = false;
      }
    }

    return {
      renderStrategistStep,
      renderSpecSummary,
      runStrategistAnalysis,
      renderStrategistForm,
      handleStrategistSubmit,
    };
  }

  global.PPTM_STRATEGIST = { createStrategistModule };
})(window);
