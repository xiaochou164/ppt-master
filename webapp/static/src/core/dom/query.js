// Transitional DOM query helpers scaffold.
(function initPptmCoreDomQuery(global) {
  function byId(id, root = document) {
    return root.getElementById ? root.getElementById(id) : null;
  }

  function query(selector, root = document) {
    return root.querySelector(selector);
  }

  function queryAll(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  global.PPTM_NEXT_CORE = global.PPTM_NEXT_CORE || {};
  global.PPTM_NEXT_CORE.domQuery = {
    byId,
    query,
    queryAll,
  };
})(window);
