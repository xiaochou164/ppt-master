// Transitional payload adapters scaffold.
(function initPptmCoreAdapters(global) {
  function normalizeProject(project) {
    if (!project || typeof project !== "object") return project;
    const slides = (project.slides || project.all_slides || project.preview_slides || []).map((slide, index) => ({
      ...slide,
      title: slide.title || slide.name || `页面 ${index + 1}`,
      thumbnail: slide.thumbnail || slide.url,
    }));
    const sources = (project.sources || project.source_markdown || []).map((source) => ({
      ...source,
      path: source.path || source.url || "",
    }));
    const imageList = (project.image_list || project.image_resources || []).map((image, index) => ({
      ...image,
      description: image.description || image.prompt || image.purpose || image.filename || `图片 ${index + 1}`,
      aspect_ratio: image.aspect_ratio || "1:1",
    }));
    const pptxFile = project.pptx_path ? { url: project.pptx_path } : ((project.pptx_files || [])[0] || null);
    const designSpecPath = project.design_spec_path || project.design_spec?.url || null;
    const hasTemplate = Boolean(project.template_id || project.free_design || project.has_spec || designSpecPath);
    const hasExecutorOutput = Boolean(project.executor_done || (project.svg_output_count || 0) > 0 || slides.length > 0);
    const hasFinalSvg = Boolean(project.svg_final_path || (project.svg_final_count || 0) > 0);
    const hasSplitNotes = Boolean(project.notes_split_path || (project.split_notes_count || 0) > 0);

    return {
      ...project,
      format: project.format || project.canvas_label || project.canvas_format || "",
      source_count: project.source_count || sources.length,
      sources,
      slides,
      slide_count: project.slide_count || slides.length || project.svg_output_count || 0,
      image_list: imageList,
      template_id: project.template_id || (hasTemplate ? "__inferred__" : null),
      design_spec_path: designSpecPath,
      executor_done: hasExecutorOutput,
      svg_output_path: project.svg_output_path || (hasExecutorOutput ? (slides[0]?.url || "__generated__") : null),
      svg_final_path: project.svg_final_path || (hasFinalSvg ? "__generated__" : null),
      notes_split_path: project.notes_split_path || (hasSplitNotes ? (project.total_notes?.url || "__generated__") : null),
      exported: Boolean(project.exported || pptxFile),
      pptx_path: project.pptx_path || pptxFile?.url || null,
      free_design: Boolean(project.free_design),
    };
  }

  function normalizeTemplate(template, categories = {}) {
    const categoryEntry = Object.entries(categories).find(([, meta]) => Array.isArray(meta?.layouts) && meta.layouts.includes(template.id));
    const category = categoryEntry?.[0] || template.category || "";
    const categoryMeta = category ? categories[category] : null;
    return {
      ...template,
      name: template.name || template.label || template.id,
      category,
      category_label: typeof categoryMeta === "string" ? categoryMeta : (categoryMeta?.label || category || ""),
      preview_url: template.preview_url || template.thumbnail || "",
    };
  }

  function adaptDashboardPayload(payload, flowSteps) {
    const projects = (payload.projects || []).map(normalizeProject);
    return {
      ...payload,
      steps: flowSteps || payload.steps || [],
      projects,
      selected_project: payload.selected_project ? normalizeProject(payload.selected_project) : (projects[0] || null),
    };
  }

  function adaptResponse(path, payload, options = {}) {
    if (!payload || typeof payload !== "object") return payload;
    if (path === "/api/dashboard") {
      return adaptDashboardPayload(payload, options.flowSteps);
    }
    if (Array.isArray(payload.projects)) {
      return { ...payload, projects: payload.projects.map(normalizeProject) };
    }
    if (payload.project) {
      return { ...payload, project: normalizeProject(payload.project) };
    }
    if (Array.isArray(payload.templates)) {
      const categories = payload.categories || {};
      return { ...payload, templates: payload.templates.map((template) => normalizeTemplate(template, categories)) };
    }
    return payload;
  }

  global.PPTM_NEXT_CORE = global.PPTM_NEXT_CORE || {};
  global.PPTM_NEXT_CORE.adapters = {
    normalizeProject,
    normalizeTemplate,
    adaptDashboardPayload,
    adaptResponse,
  };
})(window);
