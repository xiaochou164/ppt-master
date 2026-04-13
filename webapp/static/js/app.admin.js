// Admin module for PPT Master Web app.
(function initPptmAdmin(global) {
  function createAdminModule(deps) {
    const { state, apiFetch, showFlash, escapeHtml } = deps;

    function renderAdminPanel() {
      renderAdminUsersList();
      renderAdminUserDetail();
      renderAuditLogs();
    }

    function renderAdminUsersList() {
      const { users, totalUsers, page, selectedUserId } = state.admin;
      const list = document.getElementById("adminUsersList");
      const summary = document.getElementById("adminUsersSummary");
      const pageIndicator = document.getElementById("adminPageIndicator");
      if (summary) summary.textContent = `共 ${totalUsers} 个用户`;
      if (pageIndicator) pageIndicator.textContent = `第 ${page} 页`;
      if (list) {
        list.innerHTML = (users || []).map((user) => `<div class="pm-list-item ${user.id === selectedUserId ? "active" : ""}" data-user-id="${user.id}"><div><strong>${escapeHtml(user.display_name || user.email)}</strong><div class="helper">${escapeHtml(user.email)}</div></div><span class="badge">${user.role === "admin" ? "管理员" : "用户"}</span></div>`).join("");
      }
    }

    function renderAdminUserDetail() {
      const detailEl = document.getElementById("adminUserDetail");
      const detail = state.admin.userDetail;
      const user = detail?.user;
      if (!detailEl) return;
      if (!user) {
        detailEl.innerHTML = '<p class="helper">选择左侧用户查看详情</p>';
        return;
      }
      const activity = detail.activity || {};
      const projects = detail.projects || {};
      const recentProjects = (projects.recent || []).map((project) => `<li>${escapeHtml(project.name)}<span class="helper"> · ${escapeHtml(project.updated_at || "")}</span></li>`).join("");
      const recentLogs = (detail.recent_logs || []).slice(0, 5).map((log) => `<li><strong>${escapeHtml(log.action)}</strong> ${escapeHtml(log.resource_type || "")}<span class="helper"> · ${escapeHtml(log.created_at || "")}</span></li>`).join("");
      detailEl.innerHTML = `<div class="user-detail-card"><h3>${escapeHtml(user.display_name || user.email)}</h3><p class="helper">${escapeHtml(user.email)}</p><div class="badge-row" style="margin-top:12px;"><span class="badge">${user.role === "admin" ? "管理员" : "普通用户"}</span><span class="badge">${escapeHtml(user.auth_provider || "local")}</span>${user.is_active === false ? '<span class="badge" style="background:var(--color-error-light);color:var(--color-error);">已禁用</span>' : ""}</div></div><div class="user-detail-section"><h4>最近活动</h4><p class="helper">最后活跃: ${escapeHtml(activity.last_active_at || "未知")}</p><p class="helper">最近 IP: ${escapeHtml(activity.last_active_ip || "未知")}</p><p class="helper">最近登录 IP: ${escapeHtml(activity.last_login_ip || "未知")}</p></div><div class="user-detail-section"><h4>项目概览</h4><p class="helper">项目总数: ${projects.count || 0}</p>${recentProjects ? `<ul class="helper">${recentProjects}</ul>` : '<p class="helper">暂无项目</p>'}</div><div class="user-detail-section"><h4>最近审计</h4>${recentLogs ? `<ul class="helper">${recentLogs}</ul>` : '<p class="helper">暂无审计记录</p>'}</div><div class="user-detail-actions"><button class="button button-secondary button-small" data-action="toggle-role" data-role="${user.role}">${user.role === "admin" ? "降级为用户" : "升级为管理员"}</button><button class="button button-secondary button-small" data-action="toggle-status" data-status="${user.is_active === false ? "disabled" : "active"}">${user.is_active === false ? "启用账号" : "禁用账号"}</button><button class="button button-ghost button-small" data-action="purge-sessions">强制下线</button></div>`;
    }

    function renderAuditLogs() {
      const logEl = document.getElementById("adminAuditLog");
      const summary = document.getElementById("adminAuditSummary");
      const pageIndicator = document.getElementById("adminAuditPageIndicator");
      const { logs, totalLogs, auditPage } = state.admin;
      if (!logEl) return;
      if (summary) summary.innerHTML = `<span class="badge">共 ${totalLogs} 条记录</span><span class="badge">第 ${auditPage} 页</span>`;
      if (pageIndicator) pageIndicator.textContent = `第 ${auditPage} 页`;
      logEl.innerHTML = (logs || []).map((log) => `<div class="log-entry"><span class="log-entry-time">${log.created_at || ""}</span><span class="log-entry-content"><strong>${escapeHtml(log.action)}</strong> ${escapeHtml(log.resource_type)} ${escapeHtml(log.resource_id || "")} - ${escapeHtml(JSON.stringify(log.details || {}))}</span></div>`).join("");
    }

    async function handleAdminUsersListClick(event) {
      const item = event.target.closest("[data-user-id]");
      if (!item) return;
      const userId = item.dataset.userId;
      state.admin.selectedUserId = userId;
      await loadAdminUserDetail(userId);
      renderAdminUsersList();
    }

    async function handleAdminUserDetailClick(event) {
      const btn = event.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const userId = state.admin.selectedUserId;
      if (!userId) return;
      if (action === "toggle-role") await updateAdminUser(userId, { role: btn.dataset.role === "admin" ? "user" : "admin" });
      if (action === "toggle-status") await updateAdminUser(userId, { is_active: btn.dataset.status === "disabled" });
      if (action === "purge-sessions") await purgeUserSessions(userId);
    }

    async function loadAdminData() {
      try {
        const { page, pageSize, userQuery, roleFilter, statusFilter, providerFilter } = state.admin;
        const params = new URLSearchParams();
        params.set("limit", String(pageSize));
        params.set("offset", String((page - 1) * pageSize));
        if (userQuery) params.set("q", userQuery);
        if (roleFilter) params.set("role", roleFilter);
        if (statusFilter) params.set("status", statusFilter);
        if (providerFilter) params.set("provider", providerFilter);
        const data = await apiFetch(`/api/admin/users?${params.toString()}`);
        state.admin.users = data.users || [];
        state.admin.totalUsers = data.total || 0;
        if (state.admin.selectedUserId && !state.admin.users.some((user) => user.id === state.admin.selectedUserId)) {
          state.admin.selectedUserId = null;
          state.admin.userDetail = null;
        }
        renderAdminUsersList();
        renderAdminUserDetail();
      } catch (error) {
        showFlash(error.message, "error");
      }
    }

    async function loadAdminUserDetail(userId) {
      try {
        const data = await apiFetch(`/api/admin/users/${userId}`);
        state.admin.userDetail = data;
        renderAdminUserDetail();
      } catch (error) {
        showFlash(error.message, "error");
      }
    }

    async function updateAdminUser(userId, payload) {
      try {
        await apiFetch(`/api/admin/users/${userId}`, { method: "PATCH", body: JSON.stringify(payload) });
        showFlash("用户已更新");
        await loadAdminData();
        if (state.admin.selectedUserId === userId) await loadAdminUserDetail(userId);
      } catch (error) {
        showFlash(error.message, "error");
      }
    }

    async function purgeUserSessions(userId) {
      try {
        await apiFetch(`/api/admin/users/${userId}/sessions/purge`, { method: "POST", body: JSON.stringify({}) });
        showFlash("用户会话已清除");
      } catch (error) {
        showFlash(error.message, "error");
      }
    }

    async function loadAuditLogs() {
      try {
        const { auditPage, auditPageSize, auditAction, auditResource, auditStart, auditEnd, selectedUserId } = state.admin;
        const params = new URLSearchParams();
        params.set("limit", String(auditPageSize));
        params.set("offset", String((auditPage - 1) * auditPageSize));
        if (selectedUserId) params.set("user_id", selectedUserId);
        if (auditAction) params.set("action", auditAction);
        if (auditResource) params.set("resource_type", auditResource);
        if (auditStart) params.set("start", auditStart);
        if (auditEnd) params.set("end", auditEnd);
        const data = await apiFetch(`/api/admin/audit-logs?${params.toString()}`);
        state.admin.logs = data.logs || [];
        state.admin.totalLogs = data.total || 0;
        renderAuditLogs();
      } catch (error) {
        showFlash(error.message, "error");
      }
    }

    async function copyAuditLogs() {
      const logs = state.admin.logs || [];
      const text = logs.map((log) => `${log.created_at}\t${log.action}\t${log.resource_type}\t${log.resource_id}\t${JSON.stringify(log.details || {})}`).join("\n");
      await navigator.clipboard.writeText(text);
      showFlash("审计日志已复制");
    }

    function exportAuditLogs() {
      const { auditAction, auditResource, auditStart, auditEnd, selectedUserId } = state.admin;
      const params = new URLSearchParams();
      if (selectedUserId) params.set("user_id", selectedUserId);
      if (auditAction) params.set("action", auditAction);
      if (auditResource) params.set("resource_type", auditResource);
      if (auditStart) params.set("start", auditStart);
      if (auditEnd) params.set("end", auditEnd);
      window.open(`/api/admin/audit-logs/export?${params.toString()}`, "_blank");
      showFlash("审计日志开始导出");
    }

    function changeAdminPage(delta) {
      const newPage = state.admin.page + delta;
      if (newPage < 1) return;
      if (newPage > Math.ceil(state.admin.totalUsers / state.admin.pageSize)) return;
      state.admin.page = newPage;
      loadAdminData();
    }

    function changeAuditPage(delta) {
      const newPage = state.admin.auditPage + delta;
      if (newPage < 1) return;
      if (newPage > Math.ceil(state.admin.totalLogs / state.admin.auditPageSize)) return;
      state.admin.auditPage = newPage;
      loadAuditLogs();
    }

    function setAuditRange(hours) {
      const now = new Date();
      const start = new Date(now.getTime() - hours * 60 * 60 * 1000);
      state.admin.auditStart = start.toISOString().slice(0, 16);
      state.admin.auditEnd = now.toISOString().slice(0, 16);
      loadAuditLogs();
    }

    function clearAuditFilters() {
      state.admin.auditAction = "";
      state.admin.auditResource = "";
      state.admin.auditStart = "";
      state.admin.auditEnd = "";
      state.admin.auditPage = 1;
      loadAuditLogs();
    }

    async function handleAdminCreateUser(event) {
      event.preventDefault();
      const email = event.target.email?.value;
      const displayName = event.target.display_name?.value;
      const password = event.target.password?.value;
      const role = event.target.role?.value;
      if (!email || !password) {
        showFlash("请填写必填项", "error");
        return;
      }
      try {
        await apiFetch("/api/admin/users", { method: "POST", body: JSON.stringify({ email, display_name: displayName, password, role }) });
        showFlash("用户已创建");
        event.target.reset();
        await loadAdminData();
      } catch (error) {
        showFlash(error.message, "error");
      }
    }

    return {
      renderAdminPanel,
      renderAdminUsersList,
      renderAdminUserDetail,
      renderAuditLogs,
      handleAdminUsersListClick,
      handleAdminUserDetailClick,
      loadAdminData,
      loadAdminUserDetail,
      updateAdminUser,
      purgeUserSessions,
      loadAuditLogs,
      copyAuditLogs,
      exportAuditLogs,
      changeAdminPage,
      changeAuditPage,
      setAuditRange,
      clearAuditFilters,
      handleAdminCreateUser,
    };
  }

  global.PPTM_ADMIN = { createAdminModule };
})(window);
