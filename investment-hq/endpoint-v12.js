// Investment HQ live endpoint override — BUILD v12
// Keeps the API token inside the encrypted snapshot while allowing the
// Apps Script deployment URL to be rotated without re-encrypting project data.
(() => {
  const endpoint = 'https://script.google.com/macros/s/AKfycbxB0lGLRAho1hmZA1OSXJxx8mJ6Hh_aGWFr232sfszDV8-4JgUVNi9yBBE4bSxqkafB_g/exec';
  const originalLiveFetchBridge = liveFetchBridge;
  liveFetchBridge = function () {
    if (state.data) {
      state.data.liveApi = { ...(state.data.liveApi || {}), url: endpoint };
    }
    return originalLiveFetchBridge();
  };
})();
