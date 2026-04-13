import { state, getState } from "../state.js";
import { apiFetch } from "../api.js";
import * as ui from "./ui.js";

export function initAuth() {
  const logoutBtn = document.getElementById("logoutButton");
  const accountBtn = document.getElementById("openAccountSettingsButton");
  const adminBtn = document.getElementById("openAdminPanelButton");
  const accountSettingsModal = document.getElementById("accountSettingsModal");

  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogout);
  }
  if (accountBtn) {
    accountBtn.addEventListener("click", () => ui.openModal("accountSettingsModal"));
  }
  if (accountSettingsModal) {
    const backdrop = document.getElementById("accountSettingsBackdrop");
    const closeBtn = document.getElementById("closeAccountSettingsButton");
    const form = document.getElementById("accountSettingsForm");
    if (backdrop) backdrop.addEventListener("click", () => ui.closeModal("accountSettingsModal"));
    if (closeBtn) closeBtn.addEventListener("click", () => ui.closeModal("accountSettingsModal"));
    if (form) form.addEventListener("submit", handleAccountSubmit);
  }

  renderUserBadge();
}

function renderUserBadge() {
  const user = getState().user;
  const badge = document.getElementById("userBadge");
  const logoutBtn = document.getElementById("logoutButton");
  const accountBtn = document.getElementById("openAccountSettingsButton");
  const adminBtn = document.getElementById("openAdminPanelButton");

  if (!badge) return;

  if (user) {
    badge.textContent = user.display_name || user.email || "用户";
    badge.classList.remove("hidden");
    if (logoutBtn) logoutBtn.classList.remove("hidden");
    if (accountBtn) accountBtn.classList.remove("hidden");
    if (adminBtn && user.role === "admin") {
      adminBtn.classList.remove("hidden");
    } else if (adminBtn) {
      adminBtn.classList.add("hidden");
    }
    renderAccountSettings(user);
  } else {
    badge.classList.add("hidden");
    if (logoutBtn) logoutBtn.classList.add("hidden");
    if (accountBtn) accountBtn.classList.add("hidden");
    if (adminBtn) adminBtn.classList.add("hidden");
  }
}

function renderAccountSettings(user) {
  const nameEl = document.getElementById("accountSummaryName");
  const metaEl = document.getElementById("accountSummaryMeta");
  const badgeEl = document.getElementById("accountSummaryBadge");
  const emailEl = document.getElementById("accountEmailInput");
  const displayNameEl = document.getElementById("accountDisplayNameInput");
  const passwordFields = document.getElementById("accountPasswordFields");
  const providerHint = document.getElementById("accountProviderHint");

  if (nameEl) nameEl.textContent = user.display_name || user.email || "-";
  if (metaEl) metaEl.textContent = user.email || "";
  if (badgeEl) badgeEl.textContent = user.role === "admin" ? "管理员" : "普通用户";
  if (emailEl) emailEl.value = user.email || "";
  if (displayNameEl) displayNameEl.value = user.display_name || "";

  const isLocal = user.provider === "local" || !user.provider;
  if (passwordFields) {
    passwordFields.style.display = isLocal ? "block" : "none";
  }
  if (providerHint) {
    providerHint.textContent = isLocal
      ? "只有本地账号可以在这里修改密码。"
      : "这个账号来自统一登录，密码需要到对应身份系统中修改。";
  }
}

async function handleLogout() {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
    window.location.href = "/login";
  } catch (error) {
    ui.showFlash(error.message, "error");
  }
}

async function handleAccountSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const displayName = form.display_name.value;
  const currentPassword = form.current_password?.value;
  const newPassword = form.password?.value;

  if (!displayName) {
    ui.showFlash("请输入显示名", "error");
    return;
  }

  try {
    const payload = { display_name: displayName };
    if (currentPassword && newPassword) {
      payload.current_password = currentPassword;
      payload.password = newPassword;
    }
    const data = await apiFetch("/api/me", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    state.setState("user", data);
    ui.showFlash("账号设置已保存");
    ui.closeModal("accountSettingsModal");
    renderUserBadge();
  } catch (error) {
    ui.showFlash(error.message, "error");
  }
}
