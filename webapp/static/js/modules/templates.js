// Templates Module - Template selection and manager modal
import { state, getState, setState } from "../state.js";
import { apiFetch } from "../api.js";
import * as ui from "./ui.js";

export function initTemplates() {
  // Placeholder
}

export async function loadTemplates() {
  try {
    state.setState("templatesLoading", true);
    const data = await apiFetch("/api/templates");
    state.setState("templates", data.templates || []);
    state.setState("templateCategories", data.categories || {});
    return data;
  } catch (error) {
    ui.showFlash(error.message, "error");
    throw error;
  } finally {
    state.setState("templatesLoading", false);
  }
}

export async function applyTemplate(projectName, templateId) {
  try {
    state.setState("templateApplyLoading", true);
    const data = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/template`, {
      method: "POST",
      body: JSON.stringify({ template_id: templateId }),
    });
    ui.showFlash("模板已应用");
    return data;
  } catch (error) {
    ui.showFlash(error.message, "error");
    throw error;
  } finally {
    state.setState("templateApplyLoading", false);
  }
}

export async function uploadTemplate(formData) {
  try {
    const response = await fetch("/api/templates/upload", {
      method: "POST",
      credentials: "same-origin",
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "上传失败");
    }
    ui.showFlash("模板上传成功");
    await loadTemplates();
    return data;
  } catch (error) {
    ui.showFlash(error.message, "error");
    throw error;
  }
}

export async function deleteTemplate(templateId) {
  try {
    await apiFetch(`/api/templates/${templateId}`, { method: "DELETE" });
    ui.showFlash("模板已删除");
    await loadTemplates();
  } catch (error) {
    ui.showFlash(error.message, "error");
    throw error;
  }
}
