// Investment HQ direct Apps Script JSONP transport — BUILD v13
// Retries around known Apps Script ContentService redirect instability.
(() => {
  const ENDPOINT = 'https://script.google.com/macros/s/AKfycbxB0lGLRAho1hmZA1OSXJxx8mJ6Hh_aGWFr232sfszDV8-4JgUVNi9yBBE4bSxqkafB_g/exec';

  function once(attempt) {
    const token = state.data?.liveApi?.token;
    if (!token) return Promise.reject(new Error('Live API not configured'));
    return new Promise((resolve, reject) => {
      const cb = 'ihqJsonp_' + Date.now() + '_' + attempt + '_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      let done = false;
      const cleanup = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { delete window[cb]; } catch (_) { window[cb] = undefined; }
        script.remove();
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('JSONP timeout'));
      }, 10000);

      window[cb] = data => {
        cleanup();
        if (!data || data.ok === false || !Array.isArray(data.projects)) {
          reject(new Error(data?.error || 'Invalid API response'));
          return;
        }
        resolve(data);
      };

      const u = new URL(ENDPOINT);
      u.searchParams.set('token', token);
      u.searchParams.set('callback', cb);
      u.searchParams.set('_', Date.now() + '-' + attempt);
      script.src = u.toString();
      script.async = true;
      script.referrerPolicy = 'no-referrer';
      script.onerror = () => {
        cleanup();
        reject(new Error('JSONP load failed'));
      };
      document.head.appendChild(script);
    });
  }

  liveFetchBridge = async function () {
    let last;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        return await once(attempt);
      } catch (e) {
        last = e;
        if (String(e?.message || '').includes('Unauthorized')) throw e;
        if (attempt < 4) await new Promise(r => setTimeout(r, 1800 * attempt));
      }
    }
    throw last || new Error('Apps Script unavailable');
  };
})();
