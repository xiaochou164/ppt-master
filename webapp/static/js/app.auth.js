// Auth module for PPT Master Web app.
(function initPptmAuth(global) {
  function createAuthModule(deps) {
    const { state, elements, apiFetch, showFlash, closeModal } = deps;

    function renderAccountSettingsForm(user) {
      if (!elements.accountSettingsModal) return;

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

      const provider = user.auth_provider || user.provider || "";
      const isLocal = provider === "local" || !provider;
      if (passwordFields) passwordFields.style.display = isLocal ? "block" : "none";
      if (providerHint) {
        providerHint.textContent = isLocal
          ? "只有本地账号可以在这里修改密码。"
          : "这个账号来自统一登录，密码需要到对应身份系统中修改。";
      }
    }

    function renderUserBadge() {
      if (!elements.userBadge) return;

      if (state.user) {
        elements.userBadge.textContent = state.user.display_name || state.user.email || "用户";
        elements.userBadge.classList.remove("hidden");
        elements.logoutButton?.classList.remove("hidden");
        elements.openAccountSettingsButton?.classList.remove("hidden");
        if (state.user.role === "admin") elements.openAdminPanelButton?.classList.remove("hidden");
        else elements.openAdminPanelButton?.classList.add("hidden");
        renderAccountSettingsForm(state.user);
      } else {
        elements.userBadge.classList.add("hidden");
        elements.logoutButton?.classList.add("hidden");
        elements.openAccountSettingsButton?.classList.add("hidden");
        elements.openAdminPanelButton?.classList.add("hidden");
      }
    }

    async function loadCurrentUser() {
      try {
        const data = await apiFetch("/api/me");
        state.user = data?.user || null;
        renderUserBadge();
        return state.user;
      } catch (error) {
        showFlash(error.message, "error");
        return null;
      }
    }

    async function handleLogout() {
      try {
        await apiFetch("/auth/logout", { method: "POST" });
        window.location.href = "/login";
      } catch (error) {
        showFlash(error.message, "error");
      }
    }

    async function handleAccountSettingsSubmit(event) {
      event.preventDefault();
      const displayName = event.target.display_name?.value;
      const currentPassword = event.target.current_password?.value;
      const newPassword = event.target.password?.value;
      if (!displayName) {
        showFlash("请输入显示名", "error");
        return;
      }
      try {
        const payload = { display_name: displayName };
        if (currentPassword && newPassword) {
          payload.current_password = currentPassword;
          payload.password = newPassword;
        }
        const data = await apiFetch("/api/me", { method: "PATCH", body: JSON.stringify(payload) });
        state.user = data?.user || state.user;
        if (event.target.current_password) event.target.current_password.value = "";
        if (event.target.password) event.target.password.value = "";
        showFlash("账号设置已保存");
        renderUserBadge();
        closeModal(elements.accountSettingsModal);
      } catch (error) {
        showFlash(error.message, "error");
      }
    }

    return {
      renderUserBadge,
      loadCurrentUser,
      handleLogout,
      handleAccountSettingsSubmit,
    };
  }

  global.PPTM_AUTH = { createAuthModule };
})(window);
