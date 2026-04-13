// Executor Module - SVG generation SSE, regenerate, delete, notes
import { state, getState, setState } from "../state.js";
import { apiFetch } from "../api.js";
import * as ui from "./ui.js";

export function initExecutor() {
  // Placeholder
}

export async function generateSvg(projectName) {
  try {
    state.setState("svgGeneration.inProgress", true);
    state.setState("svgGeneration.mode", "generate");
    state.setState("svgGeneration.log", []);
    state.setState("svgGeneration.errors", []);

    ui.addActivityLog("开始生成 SVG...");

    const response = await fetch(
      `/api/projects/${encodeURIComponent(projectName)}/generate-svg`,
      { credentials: "same-origin" }
    );

    if (!response.ok) {
      throw new Error(`生成失败: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            handleSseMessage(data);
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }

    ui.showFlash("SVG 生成完成");
    return getState().svgGeneration;
  } catch (error) {
    state.setState("svgGeneration.errors", [...getState().svgGeneration.errors, error.message]);
    ui.showFlash(error.message, "error");
    throw error;
  } finally {
    state.setState("svgGeneration.inProgress", false);
  }
}

function handleSseMessage(data) {
  if (data.type === "progress") {
    state.setState("svgGeneration.totalPages", data.total);
    state.setState("svgGeneration.generatedPages", data.generated);
    state.setState("svgGeneration.currentPage", data.page);
    state.setState("svgGeneration.currentTitle", data.title || "");
    ui.addActivityLog(`生成第 ${data.page}/${data.total} 页: ${data.title || ""}`);
  } else if (data.type === "error") {
    state.setState("svgGeneration.errors", [...getState().svgGeneration.errors, data.message]);
    ui.addActivityLog(`错误: ${data.message}`, "error");
  } else if (data.type === "log") {
    ui.addActivityLog(data.message);
  }
}

export async function regenerateSvg(projectName, pageIndices = null) {
  try {
    state.setState("svgGeneration.inProgress", true);
    state.setState("svgGeneration.mode", "regenerate");

    const data = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/regenerate-svg`, {
      method: "POST",
      body: JSON.stringify({ pages: pageIndices }),
    });

    ui.showFlash("SVG 重新生成完成");
    return data;
  } catch (error) {
    ui.showFlash(error.message, "error");
    throw error;
  } finally {
    state.setState("svgGeneration.inProgress", false);
  }
}

export async function deleteSvg(projectName, pageIndex = null) {
  try {
    const endpoint = pageIndex !== null
      ? `/api/projects/${encodeURIComponent(projectName)}/delete-svg?page=${pageIndex}`
      : `/api/projects/${encodeURIComponent(projectName)}/delete-svg`;

    const data = await apiFetch(endpoint, { method: "DELETE" });
    ui.showFlash(pageIndex !== null ? "页面 SVG 已删除" : "全部 SVG 已删除");
    return data;
  } catch (error) {
    ui.showFlash(error.message, "error");
    throw error;
  }
}

export async function generateNotes(projectName) {
  try {
    ui.addActivityLog("开始生成讲稿...");

    const data = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/generate-notes`, {
      method: "POST",
    });

    ui.showFlash("讲稿生成完成");
    ui.addActivityLog("讲稿已生成: notes/total.md");
    return data;
  } catch (error) {
    ui.showFlash(error.message, "error");
    throw error;
  }
}
