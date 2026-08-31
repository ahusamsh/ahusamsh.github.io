// Investment HQ transport diagnostics + PWA update fix — BUILD v15
(() => {
  errorLabel = function (err) {
    const m = String(err?.message || err || '');
    window.__ihqLastLiveError = m;
    if (m.includes('Unauthorized')) return 'Token غير صحيح';
    if (m.includes('Live API not configured')) return 'API غير مهيأ';
    if (m.includes('JSONP load failed')) return 'Google منع تحميل API';
    if (m.includes('JSONP timeout')) return 'Google لم يرجع JavaScript';
    if (m.includes('Invalid API response')) return 'استجابة API غير صالحة';
    if (m.includes('MASTER_SHEET_ID')) return 'معرّف الشيت غير مهيأ';
    return 'خطأ: ' + (m || 'غير معروف');
  };

  // Force future PWA builds to check the service worker under a fresh URL.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js?v=15', { updateViaCache: 'none' })
      .then(reg => reg.update())
      .catch(console.warn);
  }
})();
