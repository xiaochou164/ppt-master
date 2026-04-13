// Shared constants for PPT Master Web app.
(function initPptmConstants(global) {
  const FLOW_STEPS = [
    { id: "project", kicker: "第 1 步", title: "创建项目", description: "先建一个演示文稿项目，并选好页面比例。" },
    { id: "sources", kicker: "第 2 步", title: "添加内容", description: "上传资料，或直接粘贴你要整理的内容。" },
    { id: "template", kicker: "第 3 步", title: "选择外观", description: "挑一个模板，或让系统自由生成版式。" },
    { id: "strategist", kicker: "第 4 步", title: "确认方案", description: "确认页数、风格、配色和图片需求。" },
    { id: "images", kicker: "第 5 步", title: "补充图片", description: "按需生成插图，这一步可以跳过。" },
    { id: "executor", kicker: "第 6 步", title: "生成内容", description: "生成页面内容，并补齐讲稿备注。" },
    { id: "post", kicker: "第 7 步", title: "导出 PPT", description: "整理最终文件，并导出可编辑的 PPT。" },
  ];

  const PIPELINE_GUIDE = {
    "split-notes": { description: "拆分 total.md 为逐页备注。", command: "python3 skills/ppt-master/scripts/total_md_split.py <project_path>" },
    "finalize-svg": { description: "整理最终页面文件，供导出使用。", command: "python3 skills/ppt-master/scripts/finalize_svg.py <project_path>" },
    "export-pptx": { description: "导出可编辑的 PPT 文件。", command: "python3 skills/ppt-master/scripts/svg_to_pptx.py <project_path> -s final" },
  };

  const DEFAULT_HERO_TEXT = "把项目上下文、关键步骤和导出状态收拢到一个清晰的工作台里，减少跳转和流程迷失。";

  global.PPTM_CONSTANTS = {
    FLOW_STEPS,
    PIPELINE_GUIDE,
    DEFAULT_HERO_TEXT,
  };
})(window);
