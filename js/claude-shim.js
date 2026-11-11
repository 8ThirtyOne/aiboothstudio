// Stands in for the claude.ai artifact runtime when the site runs on its own hosting.
// Only defines window.claude when it isn't already there, so the same pages still work as claude.ai artifacts.
(function () {
  if (window.claude && window.claude.use) return;

  // Shrink images before upload: keeps requests under the host's body limit and speeds things up.
  async function toJpegBase64(blob, maxSide = 1568) {
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.86).split(',')[1];
    } finally { URL.revokeObjectURL(url); }
  }

  function parseJson(text) {
    try { return JSON.parse(text); } catch {}
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch {} }
    throw { code: 'invalid_json', message: 'The reply was not valid JSON.', text };
  }

  async function ask(input, opts = {}) {
    const images = [];
    for (const b of opts.images || []) images.push(await toJpegBase64(b));
    let res;
    try {
      res = await fetch('/api/claude', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: opts.signal,
        body: JSON.stringify({ input, images, tier: opts.modelTier || 'default' }),
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw { code: 'aborted', message: 'Stopped.' };
      throw { code: 'network', message: 'Could not reach the AI service.' };
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw { code: data.code || 'server_error', message: data.message || 'The AI service returned an error.' };
    if (opts.onText) opts.onText({ text: data.text, delta: data.text });
    return { text: data.text, truncated: !!data.truncated };
  }
  const sample = (input, opts) => ask(input, opts);
  sample.json = async (input, opts) => parseJson((await ask(input, opts)).text);
  sample.limits = async () => ({ images: true });

  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/octet-stream' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    },
  };

  const caps = { sample, downloads };
  window.claude = { use: async name => caps[name] || null };
})();
