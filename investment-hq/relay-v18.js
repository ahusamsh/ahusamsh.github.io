// Investment HQ direct Apps Script top-level relay — BUILD v18
// GitHub PWA -> POST Apps Script -> Google Sheets -> compressed URL fragment -> GitHub PWA.
(() => {
  const ENDPOINT = 'https://script.google.com/macros/s/AKfycbwMYBJmdGhdYD-x649Dqauh8-vt_zjZkL9Ve-z00L0w2djsxwtOsf_eLIRWQATLFA1Zhw/exec';
  const NONCE_KEY = 'ihq_relay_nonce_v18';
  let relayPayload = null;
  let relayError = null;

  const fromBase64Url = s => {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4);
    const raw = atob(b64);
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  };

  async function gunzipJson(encoded) {
    const bytes = fromBase64Url(encoded);
    if (!('DecompressionStream' in window)) throw new Error('Browser gzip relay unsupported');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(stream).text();
    return JSON.parse(text);
  }

  async function consumeRelayHash() {
    if (!location.hash.startsWith('#ihq=')) return;
    try {
      const params = new URLSearchParams(location.hash.slice(1));
      const encoded = params.get('ihq') || '';
      const nonce = params.get('n') || '';
      const expected = sessionStorage.getItem(NONCE_KEY) || '';
      history.replaceState(null, '', location.pathname + location.search);
      sessionStorage.removeItem(NONCE_KEY);
      if (!encoded || !nonce || !expected || nonce !== expected) throw new Error('Relay nonce mismatch');
      const envelope = await gunzipJson(encoded);
      const payload = envelope && envelope.payload;
      if (!payload || payload.ok === false || !Array.isArray(payload.projects)) throw new Error(payload?.error || 'Invalid API response');
      relayPayload = payload;
    } catch (e) {
      relayError = e;
    }
  }

  const relayReady = consumeRelayHash();

  window.liveFetchBridge = async function () {
    await relayReady;
    if (relayError) {
      const e = relayError;
      relayError = null;
      throw e;
    }
    if (relayPayload) {
      const p = relayPayload;
      relayPayload = null;
      return p;
    }

    const token = state.data?.liveApi?.token;
    if (!token) throw new Error('Live API not configured');

    const nonceBytes = new Uint8Array(16);
    crypto.getRandomValues(nonceBytes);
    const nonce = [...nonceBytes].map(b => b.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem(NONCE_KEY, nonce);

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = ENDPOINT;
    form.target = '_self';
    form.style.display = 'none';
    const fields = { mode: 'relay', token, nonce };
    for (const [name, value] of Object.entries(fields)) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
    return new Promise(() => {});
  };
})();
