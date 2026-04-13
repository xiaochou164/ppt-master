function makeEmptyModelConfig() {
  return {
    profiles: [],
    selected_profile_id: null,
    active_profile: null,
    configured: false,
  };
}

function makeDraft(profile = {}) {
  return {
    id: profile.id || "",
    source: profile.source || "profiles",
    name: profile.name || "",
    backend: profile.backend || "openai",
    base_url: profile.base_url || "",
    api_key_masked: profile.api_key_masked || "",
    selected_model: profile.model || "",
    manual_model: "",
  };
}

function createInitialState() {
  return {
    user: null,
    admin: {
      users: [],
      logs: [],
      isOpen: false,
      selectedUserId: null,
      userQuery: "",
      roleFilter: "",
      statusFilter: "",
      providerFilter: "",
      page: 1,
      pageSize: 20,
      totalUsers: 0,
      auditAction: "",
      auditResource: "",
      auditStart: "",
      auditEnd: "",
      auditPage: 1,
      auditPageSize: 50,
      totalLogs: 0,
      userDetail: null,
    },
    formats: [],
    steps: [],
    projects: [],
    selectedProject: null,
    projectFilter: "",
    activeStepId: "project",
    validation: null,
    activityLogs: [],
    modelConfig: makeEmptyModelConfig(),
    modal: {
      draft: makeDraft(),
      fetchedModels: [],
      fetchMessage: "默认用下拉选择模型，也可以手动输入。",
      fetchError: false,
      testMessage: "测试会发送一条极短文本请求，验证当前配置是否可用。",
      testError: false,
      testOutput: "",
      isOpen: false,
      scrollY: 0,
    },
    templates: [],
    templateCategories: {},
    selectedTemplateId: null,
    templatesLoading: false,
    templateApplyLoading: false,
    latestAction: "",
    latestDetail: "",
    latestTime: "",
    strategistAnalysis: null,
    strategistLoading: false,
    strategistSaving: false,
    eightConfirmations: {
      canvas_format: null,
      page_count_min: null,
      page_count_max: null,
      target_audience: null,
      style_objective: null,
      color_primary: null,
      color_secondary: null,
      color_accent: null,
      icon_approach: null,
      title_font: null,
      body_font: null,
      body_size: null,
      image_approach: null,
    },
    svgGeneration: {
      inProgress: false,
      totalPages: 0,
      generatedPages: 0,
      currentPage: 0,
      currentTitle: "",
      errors: [],
      log: [],
      mode: "generate",
    },
    imageModelConfig: {
      profiles: [],
      selected_profile_id: null,
      active_profile: null,
      configured: false,
      aspect_ratios: [],
      sizes: [],
    },
    imageGeneration: {
      inProgress: false,
      status: "",
      prompt: "",
      filename: "",
      aspectRatio: "16:9",
      imageSize: "1K",
      lastResult: null,
      error: null,
    },
    svgPreview: {
      slides: [],
      currentIndex: 0,
    },
    docPreview: {
      isOpen: false,
      title: "",
      content: "",
      url: "",
    },
    projectManager: {
      isOpen: false,
      selectedProject: null,
      searchQuery: "",
      deleteConfirm: null,
    },
    imageModal: {
      isOpen: false,
      draft: {
        id: "",
        name: "",
        backend: "gemini",
        model: "",
        base_url: "",
        api_key_masked: "",
      },
      testMessage: "",
      testError: false,
      testOutput: "",
    },
    templateManager: {
      isOpen: false,
      templates: [],
      categories: {},
      selectedTemplate: null,
      searchQuery: "",
      filterCategory: "",
      deleteConfirm: null,
      uploadMode: false,
      uploadFiles: [],
    },
    busy: false,
  };
}

const state = createInitialState();
const subscribers = new Set();

export function getState() {
  return state;
}

export function subscribe(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

export function notifySubscribers() {
  subscribers.forEach((cb) => cb(state));
}

export function setState(path, value) {
  const keys = path.split(".");
  let current = state;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in current)) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
  notifySubscribers();
}

export function resetState() {
  const fresh = createInitialState();
  Object.keys(state).forEach((key) => {
    state[key] = fresh[key];
  });
  notifySubscribers();
}

export function makeDraft(profile) {
  return makeDraft(profile);
}

export function makeEmptyModelConfig() {
  return makeEmptyModelConfig();
}

export { state };
