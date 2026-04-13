// Transitional state store scaffold.
(function initPptmCoreStore(global) {
  function createStore(initialState = {}) {
    let state = initialState;
    const listeners = new Set();

    function getState() {
      return state;
    }

    function setState(patch) {
      state = { ...state, ...(patch || {}) };
      listeners.forEach((listener) => listener(state));
      return state;
    }

    function replaceState(nextState) {
      state = nextState || {};
      listeners.forEach((listener) => listener(state));
      return state;
    }

    function update(updater) {
      const nextState = typeof updater === "function" ? updater(state) : state;
      if (nextState && nextState !== state) {
        state = nextState;
        listeners.forEach((listener) => listener(state));
      }
      return state;
    }

    function subscribe(listener) {
      listeners.add(listener);
      return function unsubscribe() {
        listeners.delete(listener);
      };
    }

    return {
      getState,
      setState,
      replaceState,
      update,
      subscribe,
    };
  }

  global.PPTM_NEXT_CORE = global.PPTM_NEXT_CORE || {};
  global.PPTM_NEXT_CORE.store = { createStore };
})(window);
