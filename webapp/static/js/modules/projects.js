// Projects Module - Project CRUD, import, validation, manager modal
import { state, getState, setState } from "../state.js";
import { apiFetch } from "../api.js";
import * as ui from "./ui.js";

export function initProjects() {
  // Placeholder for project module initialization
}

export async function createProject(projectName, format) {
  try {
    const data = await apiFetch("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name: projectName, format }),
    });
    state.setState("selectedProject", data.project);
    const projects = [...(getState().projects || [])];
    const existingIndex = projects.findIndex((p) => p.name === data.project.name);
    if (existingIndex >= 0) {
      projects[existingIndex] = data.project;
    } else {
      projects.unshift(data.project);
    }
    state.setState("projects", projects);
    ui.showFlash("项目已创建");
    return data.project;
  } catch (error) {
    ui.showFlash(error.message, "error");
    throw error;
  }
}

export async function selectProject(projectName) {
  try {
    const data = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}`);
    state.setState("selectedProject", data.project);
    return data.project;
  } catch (error) {
    ui.showFlash(error.message, "error");
    throw error;
  }
}

export async function importSources(projectName, sources) {
  try {
    const data = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/import`, {
      method: "POST",
      body: JSON.stringify({ sources }),
    });
    ui.showFlash("来源已导入");
    return data;
  } catch (error) {
    ui.showFlash(error.message, "error");
    throw error;
  }
}

export async function validateProject(projectName) {
  try {
    const data = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/validate`);
    state.setState("validation", data);
    return data;
  } catch (error) {
    ui.showFlash(error.message, "error");
    throw error;
  }
}

export async function deleteProject(projectName) {
  try {
    await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/delete`, {
      method: "DELETE",
    });
    const projects = (getState().projects || []).filter((p) => p.name !== projectName);
    state.setState("projects", projects);
    if (getState().selectedProject?.name === projectName) {
      state.setState("selectedProject", projects[0] || null);
    }
    ui.showFlash("项目已删除");
  } catch (error) {
    ui.showFlash(error.message, "error");
    throw error;
  }
}
