// Transitional preview helpers scaffold.
(function initPptmCorePreview(global) {
  function normalizeSlides(slides) {
    return (slides || []).map((slide, index) => ({
      ...slide,
      title: slide.title || slide.name || `页面 ${index + 1}`,
      thumbnail: slide.thumbnail || slide.url,
    }));
  }

  global.PPTM_NEXT_CORE = global.PPTM_NEXT_CORE || {};
  global.PPTM_NEXT_CORE.preview = { normalizeSlides };
})(window);
