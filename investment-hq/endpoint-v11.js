// Investment HQ live endpoint override — BUILD v11
// Keeps the API token inside the encrypted snapshot while allowing the
// Apps Script deployment URL to be rotated without re-encrypting project data.
(() => {
  const endpoint = 'https://script.google.com/macros/s/AKfycbxHcOebi_InAPAhNFkZBRA451lXrWlIBUgKy31DcZbNR7qpGug5_7Tj38tNEdSF09JQjw/exec';
  const originalLiveFetchBridge = liveFetchBridge;
  liveFetchBridge = function () {
    if (state.data) {
      state.data.liveApi = { ...(state.data.liveApi || {}), url: endpoint };
    }
    return originalLiveFetchBridge();
  };
})();
