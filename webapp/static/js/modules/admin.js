// Admin Module - User management and audit logs
import { state, getState, setState } from "../state.js";
import { apiFetch } from "../api.js";
import * as ui from "./ui.js";

export function initAdmin() {
  const adminUsersList = document.getElementById("adminUsersList");
  const adminUserDetail = document.getElementById("adminUserDetail");
  const adminAuditLog = document.getElementById("adminAuditLog");
  const adminPrevPage = document.getElementById("adminPrevPage");
  const adminNextPage = document.getElementById("adminNextPage");
  const adminCreateUserForm = document.getElementById("adminCreateUserForm");

  if (adminUsersList) {
    adminUsersList.addEventListener("click", handleAdminUsersListClick);
  }
  if (adminUserDetail) {
    adminUserDetail.addEventListener("click", handleAdminUserDetailClick);
  }
  if (adminPrevPage) {
    adminPrevPage.addEventListener("click", () => changeAdminPage(-1));
  }
  if (adminNextPage) {
    adminNextPage.addEventListener("click", () => changeAdminPage(1));
  }
  if (adminCreateUserForm) {
    adminCreateUserForm.addEventListener("submit", handleAdminCreateUser);
  }

  document.getElementById("adminAuditPrevPage")?.addEventListener("click", () => changeAuditPage(-1));
  document.getElementById("adminAuditNextPage")?.addEventListener("click", () => changeAuditPage(1));
  document.getElementById("adminAuditQuick24h")?.addEventListener("click", () => setAuditRange(24));
  document.getElementById("adminAuditQuick7d")?.addEventListener("click", () => setAuditRange(168));
  document.getElementById("adminAuditClear")?.addEventListener("click", clearAuditFilters);
  document.getElementById("adminAuditCopy")?.addEventListener("click", copyAuditLogs);
  document.getElementById("adminAuditExport")?.addEventListener("click", exportAuditLogs);
}

async function handleAdminUsersListClick(e) {
  const item = e.target.closest("[data-user-id]");
  if (!item) return;

  const userId = item.dataset.userId;
  state.setState("admin.selectedUserId", userId);
  await loadAdminUserDetail(userId);
  renderAdminUsersList();
}

async function handleAdminUserDetailClick(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const userId = getState().admin.selectedUserId;

  switch (action) {
    case "toggle-role":
      await updateAdminUser(userId, { role: btn.dataset.role === "admin" ? "user" : "admin" });
      break;
    case "toggle-status":
      await updateAdminUser(userId, { disabled: btn.dataset.status === "disabled" ? false : true });
      break;
    case "purge-sessions":
      await purgeUserSessions(userId);
      break;
  }
}

async function handleAdminCreateUser(e) {
  e.preventDefault();
  const form = e.target;
  const email = form.email.value;
  const displayName = form.display_name.value;
  const password = form.password.value;
  const role = form.role.value;

  try {
    await apiFetch("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ email, display_name: displayName, password, role }),
    });
    ui.showFlash("用户已创建");
    form.reset();
    await loadAdminData();
  } catch (error) {
    ui.showFlash(error.message, "error");
  }
}

async function loadAdminData() {
  try {
    const admin = getState().admin;
    const params = new URLSearchParams({
      page: admin.page,
      page_size: admin.pageSize,
    });
    if (admin.userQuery) params.set("q", admin.userQuery);
    if (admin.roleFilter) params.set("role", admin.roleFilter);
    if (admin.statusFilter) params.set("status", admin.statusFilter);
    if (admin.providerFilter) params.set("provider", admin.providerFilter);

    const data = await apiFetch(`/api/admin/users?${params}`);
    state.setState("admin.users", data.users || []);
    state.setState("admin.totalUsers", data.total || 0);
    renderAdminUsersList();
  } catch (error) {
    ui.showFlash(error.message, "error");
  }
}

async function loadAdminUserDetail(userId) {
  try {
    const data = await apiFetch(`/api/admin/users/${userId}`);
    state.setState("admin.userDetail", data);
    renderAdminUserDetail();
  } catch (error) {
    ui.showFlash(error.message, "error");
  }
}

async function updateAdminUser(userId, payload) {
  try {
    await apiFetch(`/api/admin/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    ui.showFlash("用户已更新");
    await loadAdminData();
    if (getState().admin.selectedUserId === userId) {
      await loadAdminUserDetail(userId);
    }
  } catch (error) {
    ui.showFlash(error.message, "error");
  }
}

async function purgeUserSessions(userId) {
  try {
    await apiFetch(`/api/admin/users/${userId}/sessions/purge`, { method: "DELETE" });
    ui.showFlash("用户会话已清除");
  } catch (error) {
    ui.showFlash(error.message, "error");
  }
}

function changeAdminPage(delta) {
  const admin = getState().admin;
  const newPage = admin.page + delta;
  if (newPage < 1) return;
  if (newPage > Math.ceil(admin.totalUsers / admin.pageSize)) return;
  state.setState("admin.page", newPage);
  loadAdminData();
}

function changeAuditPage(delta) {
  const admin = getState().admin;
  const newPage = admin.auditPage + delta;
  if (newPage < 1) return;
  if (newPage > Math.ceil(admin.totalLogs / admin.auditPageSize)) return;
  state.setState("admin.auditPage", newPage);
  loadAuditLogs();
}

function setAuditRange(hours) {
  const now = new Date();
  const start = new Date(now.getTime() - hours * 60 * 60 * 1000);
  state.setState("admin.auditStart", start.toISOString().slice(0, 16));
  state.setState("admin.auditEnd", now.toISOString().slice(0, 16));
  loadAuditLogs();
}

function clearAuditFilters() {
  state.setState("admin.auditAction", "");
  state.setState("admin.auditResource", "");
  state.setState("admin.auditStart", "");
  state.setState("admin.auditEnd", "");
  state.setState("admin.auditPage", 1);
  loadAuditLogs();
}

async function loadAuditLogs() {
  try {
    const admin = getState().admin;
    const params = new URLSearchParams({
      page: admin.auditPage,
      page_size: admin.auditPageSize,
    });
    if (admin.auditAction) params.set("action", admin.auditAction);
    if (admin.auditResource) params.set("resource", admin.auditResource);
    if (admin.auditStart) params.set("start", admin.auditStart);
    if (admin.auditEnd) params.set("end", admin.auditEnd);

    const data = await apiFetch(`/api/admin/audit-logs?${params}`);
    state.setState("admin.logs", data.logs || []);
    state.setState("admin.totalLogs", data.total || 0);
    renderAuditLogs();
  } catch (error) {
    ui.showFlash(error.message, "error");
  }
}

function renderAdminUsersList() {
  const list = document.getElementById("adminUsersList");
  const summary = document.getElementById("adminUsersSummary");
  const pageIndicator = document.getElementById("adminPageIndicator");
  const users = getState().admin.users;
  const admin = getState().admin;

  if (!list) return;

  if (summary) {
    summary.textContent = `共 ${admin.totalUsers} 个用户`;
  }

  if (pageIndicator) {
    pageIndicator.textContent = `第 ${admin.page} 页`;
  }

  list.innerHTML = users.map((user) => `
    <div class="pm-list-item ${user.id === admin.selectedUserId ? "active" : ""}" data-user-id="${user.id}">
      <div>
        <strong>${escapeHtml(user.display_name || user.email)}</strong>
        <div class="helper">${escapeHtml(user.email)}</div>
      </div>
      <span class="badge">${user.role === "admin" ? "管理员" : "用户"}</span>
    </div>
  `).join("");
}

function renderAdminUserDetail() {
  const detail = document.getElementById("adminUserDetail");
  const user = getState().admin.userDetail;

  if (!detail || !user) return;

  detail.innerHTML = `
    <div class="user-detail-card">
      <h3>${escapeHtml(user.display_name || user.email)}</h3>
      <p class="helper">${escapeHtml(user.email)}</p>
      <div class="badge-row" style="margin-top: 12px;">
        <span class="badge">${user.role === "admin" ? "管理员" : "普通用户"}</span>
        ${user.disabled ? '<span class="badge" style="background: var(--color-error-light); color: var(--color-error);">已禁用</span>' : ""}
      </div>
    </div>
    <div class="user-detail-section">
      <h4>最近活动</h4>
      <p class="helper">最后活跃: ${user.last_active || "未知"}</p>
      <p class="helper">IP: ${user.last_ip || "未知"}</p>
    </div>
    <div class="user-detail-actions">
      <button class="button button-secondary button-small" data-action="toggle-role" data-role="${user.role}">
        ${user.role === "admin" ? "降级为用户" : "升级为管理员"}
      </button>
      <button class="button button-secondary button-small" data-action="toggle-status" data-status="${user.disabled ? "disabled" : "active"}">
        ${user.disabled ? "启用账号" : "禁用账号"}
      </button>
      <button class="button button-ghost button-small" data-action="purge-sessions">强制下线</button>
    </div>
  `;
}

function renderAuditLogs() {
  const logEl = document.getElementById("adminAuditLog");
  const summary = document.getElementById("adminAuditSummary");
  const pageIndicator = document.getElementById("adminAuditPageIndicator");
  const logs = getState().admin.logs;
  const admin = getState().admin;

  if (!logEl) return;

  if (summary) {
    summary.innerHTML = `
      <span class="badge">共 ${admin.totalLogs} 条记录</span>
      <span class="badge">第 ${admin.auditPage} 页</span>
    `;
  }

  logEl.innerHTML = logs.map((log) => `
    <div class="log-entry">
      <span class="log-time">${log.created_at || ""}</span>
      <span class="log-message">
        <strong>${escapeHtml(log.action)}</strong>
        ${escapeHtml(log.resource_type)} ${escapeHtml(log.resource_id || "")}
        - ${escapeHtml(log.details || "")}
      </span>
    </div>
  `).join("");
}

async function copyAuditLogs() {
  const logs = getState().admin.logs;
  const text = logs.map((l) => `${l.created_at}\t${l.action}\t${l.resource_type}\t${l.resource_id}\t${l.details}`).join("\n");
  await navigator.clipboard.writeText(text);
  ui.showFlash("审计日志已复制");
}

async function exportAuditLogs() {
  try {
    const admin = getState().admin;
    const params = new URLSearchParams({
      export: "csv",
      page: admin.auditPage,
      page_size: admin.auditPageSize,
    });
    if (admin.auditAction) params.set("action", admin.auditAction);
    if (admin.auditResource) params.set("resource", admin.auditResource);
    if (admin.auditStart) params.set("start", admin.auditStart);
    if (admin.auditEnd) params.set("end", admin.auditEnd);

    const data = await apiFetch(`/api/admin/audit-logs/export?${params}`);
    const blob = new Blob([data.csv || ""], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    ui.showFlash("审计日志已导出");
  } catch (error) {
    ui.showFlash(error.message, "error");
  }
}

function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export { loadAdminData, loadAuditLogs };
