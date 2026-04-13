// Postprocess Module - Three-step post-processing and delivery
import { state, getState } from "../state.js";
import { apiFetch } from "../api.js";
import * as ui from "./ui.js";
import { PIPELINE_GUIDE } from "../constants.js";

export function initPostprocess() {
  // Placeholder
}

export async function runPostprocessStep(projectName, step) {
  try {
    ui.addActivityLog(`开始执行: ${step}`);
    ui.addActivityLog(`命令: ${PIPELINE_GUIDE[step]?.command || step}`);

    const data = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/run-step/${step}`, {
      method: "POST",
    });

    ui.addActivityLog(`完成: ${step}`);
    ui.showFlash(`${PIPELINE_GUIDE[step]?.description || step} 完成`);
    return data;
  } catch (error) {
    ui.addActivityLog(`失败: ${error.message}`, "error");
    ui.showFlash(error.message, "error");
    throw error;
  }
}

export async function runSplitNotes(projectName) {
  return runPostprocessStep(projectName, "split-notes");
}

export async function runFinalizeSvg(projectName) {
  return runPostprocessStep(projectName, "finalize-svg");
}

export async function runExportPptx(projectName) {
  return runPostprocessStep(projectName, "export-pptx");
}

export function getPostprocessStatus(project) {
  if (!project) {
    return {
      splitNotes: { ready: false, disabled: true, reason: "缺少项目" },
      finalizeSvg: { ready: false, disabled: true, reason: "缺少项目" },
      exportPptx: { ready: false, disabled: true, reason: "缺少项目" },
    };
  }

  const splitNotes = {
    ready: !!project.design_spec_path && !!project.notes_path,
    disabled: !project.design_spec_path,
    reason: !project.design_spec_path ? "需要设计规范" : null,
  };

  const finalizeSvg = {
    ready: !!project.svg_output_path,
    disabled: !project.svg_output_path,
    reason: !project.svg_output_path ? "需要 SVG 输出" : null,
  };

  const exportPptx = {
    ready: !!project.svg_final_path && !!project.notes_split_path,
    disabled: !project.svg_final_path || !project.notes_split_path,
    reason: !project.svg_final_path ? "需要最终 SVG" : !project.notes_split_path ? "需要拆分讲稿" : null,
  };

  return { splitNotes, finalizeSvg, exportPptx };
}
