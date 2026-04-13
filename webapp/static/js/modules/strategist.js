// Strategist Module - Analysis, design spec form
import { state, getState, setState } from "../state.js";
import { apiFetch } from "../api.js";
import * as ui from "./ui.js";

export function initStrategist() {
  // Placeholder
}

export async function analyzeProject(projectName) {
  try {
    state.setState("strategistLoading", true);
    const data = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/analyze`);
    state.setState("strategistAnalysis", data);
    return data;
  } catch (error) {
    ui.showFlash(error.message, "error");
    throw error;
  } finally {
    state.setState("strategistLoading", false);
  }
}

export async function saveDesignSpec(projectName, spec) {
  try {
    state.setState("strategistSaving", true);
    const data = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/design-spec`, {
      method: "POST",
      body: JSON.stringify(spec),
    });
    ui.showFlash("设计规范已保存");
    return data;
  } catch (error) {
    ui.showFlash(error.message, "error");
    throw error;
  } finally {
    state.setState("strategistSaving", false);
  }
}
