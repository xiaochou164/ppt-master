// Images Module - Image model config and generation
import { state, getState, setState } from "../state.js";
import { apiFetch } from "../api.js";
import * as ui from "./ui.js";

export function initImages() {
  // Placeholder
}

export async function generateImage(projectName, prompt, options = {}) {
  try {
    state.setState("imageGeneration.inProgress", true);
    state.setState("imageGeneration.status", "generating");
    state.setState("imageGeneration.prompt", prompt);

    const data = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/generate-image`, {
      method: "POST",
      body: JSON.stringify({ prompt, ...options }),
    });

    state.setState("imageGeneration.lastResult", data);
    state.setState("imageGeneration.status", "success");
    ui.showFlash("图片生成完成");
    return data;
  } catch (error) {
    state.setState("imageGeneration.error", error.message);
    state.setState("imageGeneration.status", "error");
    ui.showFlash(error.message, "error");
    throw error;
  } finally {
    state.setState("imageGeneration.inProgress", false);
  }
}

export async function generateAllPendingImages(projectName) {
  try {
    state.setState("imageGeneration.inProgress", true);
    state.setState("imageGeneration.status", "generating_all");

    const data = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/generate-image`, {
      method: "POST",
      body: JSON.stringify({ generate_all: true }),
    });

    state.setState("imageGeneration.lastResult", data);
    state.setState("imageGeneration.status", "success");
    ui.showFlash("全部图片生成完成");
    return data;
  } catch (error) {
    state.setState("imageGeneration.error", error.message);
    state.setState("imageGeneration.status", "error");
    ui.showFlash(error.message, "error");
    throw error;
  } finally {
    state.setState("imageGeneration.inProgress", false);
  }
}
