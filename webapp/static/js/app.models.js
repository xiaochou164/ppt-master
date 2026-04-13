// Text and image model configuration module for PPT Master Web app.
(function initPptmModels(global) {
  function createModelsModule(deps) {
    const {
      state,
      elements,
      apiFetch,
      showFlash,
      setBusy,
      openModal,
      closeModal,
      escapeHtml,
      createDraft,
      hasUnsavedModelConfigChanges,
      hasUnsavedImageModelChanges,
      confirmDiscardChanges,
    } = deps;

    function applyTextModelConfig(modelConfig) {
      if (!modelConfig) return;
      state.modelConfig = modelConfig;
      state.modelConfig.active_profile = (modelConfig.profiles || []).find((profile) => profile.id === modelConfig.selected_profile_id) || null;
    }

    function applyImageModelConfig(modelConfig) {
      if (!modelConfig) return;
      state.imageModelConfig = modelConfig;
      state.imageModelConfig.active_profile = (modelConfig.profiles || []).find((profile) => profile.id === modelConfig.selected_profile_id) || null;
    }

    function renderModelConfigModal() {
      const { profiles, selected_profile_id: selectedProfileId } = state.modelConfig;
      if (elements.modalProfileSummary) {
        elements.modalProfileSummary.textContent = profiles.length ? "" : "当前还没有可用配置。";
      }
      if (elements.modelProfileList) {
        elements.modelProfileList.innerHTML = profiles.map((profile) => `<div class="profile-item ${profile.id === selectedProfileId ? "active" : ""}" data-profile-id="${profile.id}"><span class="profile-item-name">${escapeHtml(profile.name)}</span>${profile.id === selectedProfileId ? '<span class="profile-item-badge">使用中</span>' : ""}</div>`).join("");
      }
    }

    function openModelConfigModal() {
      state.modal.isOpen = true;
      renderModelConfigModal();
      syncModalDraftFromInputs();
      openModal(elements.modelConfigModal);
    }

    function closeModelConfigModal(force = false) {
      if (!force && hasUnsavedModelConfigChanges()) {
        if (!confirmDiscardChanges()) return;
      }
      state.modal.isOpen = false;
      closeModal(elements.modelConfigModal);
    }

    function syncModalDraftFromInputs() {
      state.modal.draft = {
        id: state.modelConfig.selected_profile_id || "",
        name: elements.modalProfileNameInput?.value?.trim() || "",
        backend: elements.modalBackendSelect?.value || "openai",
        base_url: elements.modalBaseUrlInput?.value?.trim() || "",
        api_key_masked: "",
        selected_model: elements.modalFetchedModelSelect?.value || "",
        manual_model: elements.modalManualModelInput?.value?.trim() || "",
      };
    }

    function setModalDraft(profile, options = {}) {
      state.modal.draft = { ...createDraft(profile), ...options };
      if (elements.modalProfileNameInput) elements.modalProfileNameInput.value = state.modal.draft.name || "";
      if (elements.modalBackendSelect) elements.modalBackendSelect.value = state.modal.draft.backend || "openai";
      if (elements.modalBaseUrlInput) elements.modalBaseUrlInput.value = state.modal.draft.base_url || "";
      if (elements.modalFetchedModelSelect) elements.modalFetchedModelSelect.value = state.modal.draft.selected_model || "";
      if (elements.modalManualModelInput) elements.modalManualModelInput.value = state.modal.draft.manual_model || "";
      if (elements.modalApiKeyInput) elements.modalApiKeyInput.value = "";
    }

    function handleModelProfileListClick(event) {
      const item = event.target.closest("[data-profile-id]");
      if (!item) return;
      const profileId = item.dataset.profileId;
      if (profileId === "__new__") beginNewProfile();
      else selectModelProfile(profileId);
    }

    function beginNewProfile() {
      setModalDraft({});
    }

    function selectModelProfile(profileId) {
      const profile = state.modelConfig.profiles.find((item) => item.id === profileId);
      if (!profile) return;
      state.modelConfig.selected_profile_id = profileId;
      state.modelConfig.active_profile = profile;
      setModalDraft(profile);
      renderModelConfigModal();
    }

    async function deleteModelProfile(profileId) {
      if (!window.confirm("确认删除此配置？")) return;
      try {
        const data = await apiFetch("/api/model-config", {
          method: "POST",
          body: JSON.stringify({ action: "delete", profile_id: profileId }),
        });
        applyTextModelConfig(data.model_config);
        renderModelConfigModal();
        showFlash("配置已删除");
      } catch (error) {
        showFlash(error.message, "error");
      }
    }

    async function fetchRemoteModels() {
      syncModalDraftFromInputs();
      const draft = state.modal.draft;
      const apiKey = elements.modalApiKeyInput?.value?.trim();
      const backend = draft.backend || "openai";
      const baseUrl = draft.base_url;
      if (!apiKey && !baseUrl) {
        showFlash("请输入 API Key 或 Base URL", "error");
        return;
      }
      try {
        setBusy(true);
        if (elements.modelFetchHint) elements.modelFetchHint.textContent = "获取中...";
        const payload = {
          backend,
          ...(apiKey ? { api_key: apiKey } : {}),
          ...(baseUrl ? { base_url: baseUrl } : {}),
        };
        const data = await apiFetch("/api/model-config/models", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        state.modal.fetchedModels = data.models || [];
        if (elements.modalFetchedModelSelect) {
          elements.modalFetchedModelSelect.innerHTML = `<option value="">选择模型</option>${state.modal.fetchedModels.map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join("")}`;
        }
        if (elements.modelFetchHint) {
          elements.modelFetchHint.textContent = `获取到 ${state.modal.fetchedModels.length} 个模型`;
        }
      } catch (error) {
        showFlash(error.message, "error");
        if (elements.modelFetchHint) elements.modelFetchHint.textContent = error.message;
      } finally {
        setBusy(false);
      }
    }

    async function testModelConfig() {
      syncModalDraftFromInputs();
      const draft = state.modal.draft;
      const apiKey = elements.modalApiKeyInput?.value?.trim();
      if (!apiKey) {
        showFlash("请输入 API Key", "error");
        return;
      }
      try {
        setBusy(true);
        if (elements.modalTestOutput) elements.modalTestOutput.classList.remove("hidden");
        if (elements.modalTestOutput) elements.modalTestOutput.textContent = "测试中...";
        const data = await apiFetch("/api/model-config", {
          method: "POST",
          body: JSON.stringify({
            action: "test",
            profile: {
              id: draft.id || undefined,
              backend: draft.backend,
              api_key: apiKey,
              ...(draft.base_url ? { base_url: draft.base_url } : {}),
              model: draft.manual_model || draft.selected_model,
            },
          }),
        });
        if (elements.modalTestOutput) {
          elements.modalTestOutput.textContent = `成功！\n模型: ${data.result?.model || "N/A"}\n版本: ${data.result?.version || "N/A"}`;
        }
        showFlash("配置测试通过");
      } catch (error) {
        if (elements.modalTestOutput) elements.modalTestOutput.textContent = `失败: ${error.message}`;
        showFlash(error.message, "error");
      } finally {
        setBusy(false);
      }
    }

    async function saveModelConfig(event) {
      event.preventDefault();
      syncModalDraftFromInputs();
      const draft = state.modal.draft;
      const apiKey = elements.modalApiKeyInput?.value?.trim();
      if (!draft.name) {
        showFlash("请输入配置名称", "error");
        return;
      }
      if (!apiKey && !state.modelConfig.profiles.find((profile) => profile.id === draft.id)) {
        showFlash("请输入 API Key", "error");
        return;
      }
      try {
        setBusy(true);
        const data = await apiFetch("/api/model-config", {
          method: "POST",
          body: JSON.stringify({
            action: "upsert",
            select: true,
            profile: {
              ...(draft.id ? { id: draft.id } : {}),
              name: draft.name,
              backend: draft.backend,
              ...(draft.base_url ? { base_url: draft.base_url } : {}),
              ...(apiKey ? { api_key: apiKey } : {}),
              model: draft.manual_model || draft.selected_model,
            },
          }),
        });
        applyTextModelConfig(data.model_config);
        renderModelConfigModal();
        showFlash("配置已保存");
        closeModelConfigModal(true);
      } catch (error) {
        showFlash(error.message, "error");
      } finally {
        setBusy(false);
      }
    }

    function renderImageModelModal() {
      const { profiles, selected_profile_id: selectedProfileId } = state.imageModelConfig;
      if (elements.imageModalProfileSummary) {
        elements.imageModalProfileSummary.textContent = profiles.length ? "" : "当前还没有可用配置。";
      }
      if (elements.imageModelProfileList) {
        elements.imageModelProfileList.innerHTML = profiles.map((profile) => `<div class="profile-item ${profile.id === selectedProfileId ? "active" : ""}" data-profile-id="${profile.id}"><span class="profile-item-name">${escapeHtml(profile.name)}</span>${profile.id === selectedProfileId ? '<span class="profile-item-badge">使用中</span>' : ""}</div>`).join("");
      }
    }

    function openImageModelModal() {
      state.imageModal.isOpen = true;
      renderImageModelModal();
      openModal(elements.imageModelModal);
    }

    function closeImageModelModal(force = false) {
      if (!force && hasUnsavedImageModelChanges()) {
        if (!confirmDiscardChanges()) return;
      }
      state.imageModal.isOpen = false;
      closeModal(elements.imageModelModal);
    }

    function syncImageModalDraftFromInputs() {
      state.imageModal.draft = {
        id: state.imageModelConfig.selected_profile_id || "",
        name: elements.imageProfileNameInput?.value?.trim() || "",
        backend: elements.imageBackendSelect?.value || "gemini",
        base_url: elements.imageBaseUrlInput?.value?.trim() || "",
        model: elements.imageModelSelect?.value || "",
        manual_model: elements.imageManualModelInput?.value?.trim() || "",
        api_key_masked: "",
      };
    }

    function handleImageProfileListClick(event) {
      const item = event.target.closest("[data-profile-id]");
      if (!item) return;
      const profileId = item.dataset.profileId;
      if (profileId === "__new__") beginNewImageProfile();
      else selectImageProfile(profileId);
    }

    function beginNewImageProfile() {
      state.imageModal.draft = { id: "", name: "", backend: "gemini", model: "", base_url: "", api_key_masked: "" };
      if (elements.imageProfileNameInput) elements.imageProfileNameInput.value = "";
      if (elements.imageBackendSelect) elements.imageBackendSelect.value = "gemini";
      if (elements.imageBaseUrlInput) elements.imageBaseUrlInput.value = "";
      if (elements.imageModelSelect) elements.imageModelSelect.value = "";
      if (elements.imageManualModelInput) elements.imageManualModelInput.value = "";
      if (elements.imageApiKeyInput) elements.imageApiKeyInput.value = "";
    }

    function selectImageProfile(profileId) {
      const profile = state.imageModelConfig.profiles.find((item) => item.id === profileId);
      if (!profile) return;
      state.imageModelConfig.selected_profile_id = profileId;
      state.imageModelConfig.active_profile = profile;
      state.imageModal.draft = { ...profile };
      if (elements.imageProfileNameInput) elements.imageProfileNameInput.value = profile.name || "";
      if (elements.imageBackendSelect) elements.imageBackendSelect.value = profile.backend || "gemini";
      if (elements.imageBaseUrlInput) elements.imageBaseUrlInput.value = profile.base_url || "";
      if (elements.imageModelSelect) elements.imageModelSelect.value = profile.model || "";
      if (elements.imageManualModelInput) elements.imageManualModelInput.value = "";
      if (elements.imageApiKeyInput) elements.imageApiKeyInput.value = "";
      renderImageModelModal();
    }

    async function deleteImageProfile(profileId) {
      if (!window.confirm("确认删除此配置？")) return;
      try {
        const data = await apiFetch("/api/image-model-config", {
          method: "POST",
          body: JSON.stringify({ action: "delete", profile_id: profileId }),
        });
        applyImageModelConfig(data.image_model_config);
        renderImageModelModal();
        showFlash("配置已删除");
      } catch (error) {
        showFlash(error.message, "error");
      }
    }

    function copyFromGlobalModelConfig() {
      const globalProfile = state.modelConfig.active_profile;
      if (!globalProfile) {
        showFlash("请先配置全局大模型", "error");
        return;
      }
      if (elements.imageBackendSelect) elements.imageBackendSelect.value = globalProfile.backend || "gemini";
      if (elements.imageBaseUrlInput) elements.imageBaseUrlInput.value = globalProfile.base_url || "";
      if (elements.imageManualModelInput) elements.imageManualModelInput.value = globalProfile.model || "";
      showFlash("已从全局配置复制");
    }

    async function testImageConfig() {
      syncImageModalDraftFromInputs();
      const draft = state.imageModal.draft;
      const apiKey = elements.imageApiKeyInput?.value?.trim();
      if (!apiKey) {
        showFlash("请输入 API Key", "error");
        return;
      }
      try {
        setBusy(true);
        if (elements.imageTestOutput) elements.imageTestOutput.classList.remove("hidden");
        if (elements.imageTestOutput) elements.imageTestOutput.textContent = "测试中...";
        const data = await apiFetch("/api/image-model-config/test", {
          method: "POST",
          body: JSON.stringify({
            profile: {
              id: draft.id || undefined,
              backend: draft.backend,
              api_key: apiKey,
              ...(draft.base_url ? { base_url: draft.base_url } : {}),
              model: draft.manual_model || draft.model,
            },
          }),
        });
        if (elements.imageTestOutput) elements.imageTestOutput.textContent = `成功！\n模型: ${data.result?.model || "N/A"}\n文件: ${data.result?.filename || "N/A"}`;
        showFlash("图片模型测试通过");
      } catch (error) {
        if (elements.imageTestOutput) elements.imageTestOutput.textContent = `失败: ${error.message}`;
        showFlash(error.message, "error");
      } finally {
        setBusy(false);
      }
    }

    async function saveImageModelProfile(event) {
      event.preventDefault();
      syncImageModalDraftFromInputs();
      const draft = state.imageModal.draft;
      const apiKey = elements.imageApiKeyInput?.value?.trim();
      if (!draft.name) {
        showFlash("请输入配置名称", "error");
        return;
      }
      if (!apiKey && !state.imageModelConfig.profiles.find((profile) => profile.id === draft.id)) {
        showFlash("请输入 API Key", "error");
        return;
      }
      try {
        setBusy(true);
        const data = await apiFetch("/api/image-model-config", {
          method: "POST",
          body: JSON.stringify({
            action: "upsert",
            select: true,
            profile: {
              ...(draft.id ? { id: draft.id } : {}),
              name: draft.name,
              backend: draft.backend,
              ...(draft.base_url ? { base_url: draft.base_url } : {}),
              ...(apiKey ? { api_key: apiKey } : {}),
              model: draft.manual_model || draft.model,
            },
          }),
        });
        applyImageModelConfig(data.image_model_config);
        renderImageModelModal();
        showFlash("配置已保存");
        closeImageModelModal(true);
      } catch (error) {
        showFlash(error.message, "error");
      } finally {
        setBusy(false);
      }
    }

    return {
      renderModelConfigModal,
      openModelConfigModal,
      closeModelConfigModal,
      syncModalDraftFromInputs,
      setModalDraft,
      handleModelProfileListClick,
      beginNewProfile,
      selectModelProfile,
      deleteModelProfile,
      fetchRemoteModels,
      testModelConfig,
      saveModelConfig,
      renderImageModelModal,
      openImageModelModal,
      closeImageModelModal,
      syncImageModalDraftFromInputs,
      handleImageProfileListClick,
      beginNewImageProfile,
      selectImageProfile,
      deleteImageProfile,
      copyFromGlobalModelConfig,
      testImageConfig,
      saveImageModelProfile,
    };
  }

  global.PPTM_MODELS = { createModelsModule };
})(window);
