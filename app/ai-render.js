// AI Render, live version: photo-realistic images and videos from the current view, using the customer's pass credits.
// Loaded after app.js on the hosted site. Replaces the preview AI Render window.
(function () {
  const auth = window.aibdAuth;
  if (!auth) return; // not on the hosted site: keep the preview
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const live = { items: [], polling: new Map(), loaded: false, mode: 'upgrade' };
  const brandInfo = () => {
    let size = '', type = '';
    try { size = getSZ().lbl; type = (BOOTH_TYPES[S.boothType] || '').toString(); } catch {}
    return { company: S.brand.company || '', tagline: S.brand.tagline || '', colors: [S.brand.primary, S.brand.secondary, S.brand.accent].filter(Boolean), size, type };
  };
  const latestImage = () => live.items.find(r => r.kind === 'image' && r.status === 'done' && r.result_url);
  const POLL_MS = { image: 4000, video: 10000 };
  // One-click art direction styles. Picking one fills the box, which stays editable.
  const STYLES = [
    { id: 'flagship', name: 'Award-winning flagship', text: 'Award-winning flagship exhibit, dramatic LED lighting, bold oversized graphics, striking architectural forms, shot like a design-award photo.' },
    { id: 'hero', name: 'Clean hero shot', text: 'Professional architectural photograph, wide-angle 24mm lens at eye level, bright even exhibition hall lighting, polished concrete aisle in the foreground, sharp focus, high detail.' },
    { id: 'minimal', name: 'Premium and minimal', text: 'Sophisticated premium exhibit, minimalist luxury finishes, soft backlit glow, generous open space, high-end corporate feel.' },
    { id: 'busy', name: 'Busy show day', text: 'Award-winning exhibit on the busiest show day, crowds engaging with staff and screens, energetic atmosphere, dramatic lighting.' },
    { id: 'evening', name: 'Evening reception', text: 'Evening reception at the show, warm dramatic lighting, glowing backlit graphics and LED accents, guests holding drinks, cinematic mood.' },
  ];

  async function api(path, init = {}) {
    const token = await auth.token();
    const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw { status: r.status, message: data.message || `AI Render returned an error (${r.status}).` };
    return data;
  }

  // Current view as a JPEG (longest side 1600 px), base64 without the data: prefix.
  async function captureView() {
    const blob = await currentViewBlob(), url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.88).split(',')[1];
    } finally { URL.revokeObjectURL(url); }
  }

  function poll(id, kind) {
    if (live.polling.has(id)) return;
    const tick = async () => {
      try {
        const { render } = await api(`/api/render?id=${encodeURIComponent(id)}`);
        upsert(render);
        if (render.status === 'done' || render.status === 'failed') { live.polling.delete(id); auth.refresh(); draw(); return; }
      } catch { /* try again next tick */ }
      live.polling.set(id, setTimeout(tick, POLL_MS[kind] || 6000));
      draw();
    };
    live.polling.set(id, setTimeout(tick, 1500));
  }
  function upsert(r) { const i = live.items.findIndex(x => x.id === r.id); if (i >= 0) live.items[i] = { ...live.items[i], ...r }; else live.items.unshift(r); }

  async function loadList() {
    try { const { renders } = await api('/api/render'); live.items = renders; live.loaded = true; renders.filter(r => r.status === 'queued' || r.status === 'running').forEach(r => poll(r.id, r.kind)); }
    catch { live.loaded = true; }
    draw();
  }

  function credits() {
    const r = acct.row;
    return r ? { img: r.images_total - r.images_used, imgTotal: r.images_total, vid: r.videos_total - r.videos_used, vidTotal: r.videos_total } : null;
  }

  function openRender() {
    const body = openModal('AI Render', true);
    const w = el('div'); w.style.cssText = 'display:grid;gap:12px'; body.append(w);
    if (!acct.signedIn) {
      w.innerHTML = `<p class="gen-note">Sign in with the email you bought your pass with to turn your design into photo-realistic images and videos.</p>`;
      const b = el('button', 'btn btn-primary', 'Sign in'); b.onclick = () => openAccount(); w.append(b); return;
    }
    const c = credits();
    if (!c) {
      w.innerHTML = `<p class="gen-note">AI Render is included with every pass: photo-realistic images and short videos of your booth. Your account doesn't have an active pass yet.</p><a class="btn btn-primary" href="/#pricing" style="text-align:center">See passes and pricing</a>`;
      return;
    }
    w.innerHTML = `<div class="gen-top"><p style="margin:0;font-size:13px;color:var(--fg-muted);max-width:52ch;line-height:1.5">Frame the view you want in 3D, choose a style, then generate.</p>
        <div class="gen-credits"><div class="gen-chip"><b id="gen-img-left">${c.img} / ${c.imgTotal}</b><span>Images left</span></div><div class="gen-chip"><b id="gen-vid-left">${c.vid} / ${c.vidTotal}</b><span>Videos left</span></div></div></div>
      <div class="gen-mode" role="radiogroup" aria-label="Render style">
        <div class="gen-mode-btn" data-mode="upgrade" role="radio" tabindex="0"><b>Concept Upgrade</b><span>AI designs a premium, built-out version of your booth, then photographs it</span></div>
        <div class="gen-mode-btn" data-mode="faithful" role="radio" tabindex="0"><b>Faithful to My Design</b><span>Keeps your design exactly and makes it look real</span></div>
      </div>
      <div class="gen-styles" role="group" aria-label="Art direction styles">${STYLES.map(s => `<div class="gen-style" role="button" tabindex="0" data-style="${s.id}">${s.name}</div>`).join('')}</div>
      <textarea class="gen-dir" id="gen-dir" rows="3" aria-label="Art direction" placeholder="Art direction (optional), e.g. busy show hours, warm evening light"></textarea>
      <div class="gen-btns"><button class="btn btn-primary" id="gen-img">Generate image · 1 credit</button><button class="btn" id="gen-vid">Generate video · 1 credit</button></div>
      <div class="gen-buy" role="group" aria-label="Buy extra credits"><span class="gen-buy-lbl">Need more?</span>
        <label class="gen-buy-qty">Qty <select id="gen-buy-qty">${[1, 2, 3, 5, 10].map(n => `<option value="${n}">${n}</option>`).join("")}</select></label>
        <button class="btn btn-sm" data-buy="image">Buy images · $7 each</button><button class="btn btn-sm" data-buy="video">Buy videos · $15 each</button></div>
      <div class="gen-status" id="gen-status" aria-live="polite">Images take about 30 seconds. Videos animate your latest AI image and take 2–4 minutes; you can keep working meanwhile.</div>
      <div class="ss-title">Your Generations</div><div class="gen-grid" id="gen-grid"></div>`;
    const dirBox = document.getElementById('gen-dir'), styleBtns = [...w.querySelectorAll('.gen-style')];
    const markStyle = () => styleBtns.forEach(b => b.classList.toggle('on', STYLES.find(s => s.id === b.dataset.style)?.text === dirBox.value.trim()));
    const vp = document.getElementById('vp-dir'); dirBox.value = (live.dir ?? (vp ? vp.value : STYLES[0].text)).slice(0, 600);
    styleBtns.forEach(b => { const pick = () => { dirBox.value = STYLES.find(s => s.id === b.dataset.style).text; live.dir = dirBox.value; markStyle(); dirBox.focus(); };
      b.onclick = pick; b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }; });
    dirBox.oninput = () => { live.dir = dirBox.value; markStyle(); }; markStyle();
    const modeBtns = [...w.querySelectorAll('.gen-mode-btn')];
    const setMode = m => { live.mode = m; modeBtns.forEach(b => { const on = b.dataset.mode === m; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }); };
    modeBtns.forEach(b => { b.onclick = () => setMode(b.dataset.mode); b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMode(b.dataset.mode); } }; }); setMode(live.mode);
    document.getElementById('gen-img').onclick = () => start('image');
    document.getElementById('gen-vid').onclick = () => start('video');
    w.querySelectorAll('[data-buy]').forEach(b => { b.onclick = () => buy(b.dataset.buy, Number(document.getElementById('gen-buy-qty').value), b); });
    draw(); if (!live.loaded) loadList();
  }

  async function start(kind, sourceUrl) {
    const st = document.getElementById('gen-status'), btn = document.getElementById(kind === 'image' ? 'gen-img' : 'gen-vid');
    const c = credits(); if (!c || (kind === 'image' ? c.img : c.vid) <= 0) { st.textContent = `No ${kind} credits left on your pass. Buy more below.`; return; }
    btn.disabled = true;
    try {
      const src = kind === 'video' ? (sourceUrl || latestImage()?.result_url || null) : null;
      st.textContent = src ? 'Animating your latest AI image…' : 'Capturing the current view…';
      const image = src ? undefined : await captureView();
      st.textContent = 'Sending to AI Render…';
      const direction = (document.getElementById('gen-dir')?.value || '').trim();
      const { id } = await api('/api/render', { method: 'POST', body: JSON.stringify({ kind, mode: live.mode, image, sourceUrl: src || undefined, direction, brand: brandInfo() }) });
      upsert({ id, kind, status: 'queued', created_at: new Date().toISOString() });
      poll(id, kind); auth.refresh();
      st.textContent = kind === 'image' ? 'Creating your image. It appears below in about 30 seconds.' : 'Creating your video. It appears below in 2–4 minutes; you can close this window and keep working.';
    } catch (e) { st.textContent = e?.message || "AI Render couldn't start. Try again."; }
    btn.disabled = false; draw();
  }

  // Extra credits: opens Stripe Checkout; the credits are added to the pass when payment completes.
  async function buy(kind, qty, btn) {
    const st = document.getElementById('gen-status'), label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Opening checkout…';
    try { const { url } = await api('/api/checkout', { method: 'POST', body: JSON.stringify({ addon: kind, qty }) }); location.href = url; return; }
    catch (e) { st.textContent = e?.message || "Couldn't open checkout. Try again."; }
    btn.disabled = false; btn.textContent = label;
  }

  function draw() {
    const c = credits(), a = document.getElementById('gen-img-left');
    if (a && c) { a.textContent = `${c.img} / ${c.imgTotal}`; document.getElementById('gen-vid-left').textContent = `${c.vid} / ${c.vidTotal}`; }
    const grid = document.getElementById('gen-grid'); if (!grid) return;
    grid.textContent = '';
    if (!live.loaded) { grid.append(el('div', 'gen-empty', 'Loading your generations…')); return; }
    if (!live.items.length) { const e = el('div', 'gen-empty', 'Your photo-realistic images and videos will appear here.'); e.style.gridColumn = '1/-1'; grid.append(e); return; }
    live.items.forEach(it => {
      const d = el('div', 'gen-item' + (it.status === 'done' ? ' done' : ''));
      if (it.status === 'done' && it.result_url) {
        if (it.kind === 'video') { const v = el('video'); v.src = it.result_url; v.controls = true; v.loop = true; v.muted = true; v.playsInline = true; v.preload = 'metadata'; d.append(v); }
        else { const im = el('img'); im.src = it.result_url; im.alt = 'Photo-realistic render of the booth'; im.loading = 'lazy'; d.append(im); }
        const open = el('a', 'gen-open', it.kind === 'video' ? 'Open video' : 'Open full size'); open.href = it.result_url; open.target = '_blank'; open.rel = 'noopener'; d.append(open);
        if (it.kind === 'image') { const an = el('button', 'gen-animate', 'Animate · 1 video'); an.onclick = () => start('video', it.result_url); d.append(an); }
      } else {
        const msg = it.status === 'failed' ? `Couldn't create this ${it.kind}. Your credit was returned.` : it.kind === 'video' ? 'Creating video… 2–4 minutes' : 'Creating image… about 30 seconds';
        const t = el('div', 'gen-wait' + (it.status === 'failed' ? ' failed' : ''), msg); d.append(t);
      }
      grid.append(d);
    });
  }

  // Replace the preview window and point the AI Render button at the live one.
  window.openGenerate = openRender;
  const btn = document.querySelector('.cv-gen'); if (btn) btn.onclick = openRender;
  auth.onChange(st => { if (!st.user) { live.items = []; live.loaded = false; } draw(); });
})();

// Back from buying extra credits: show the AI Render window and pick up the new credits.
(function afterCreditPurchase() {
  const q = new URLSearchParams(location.search);
  if (q.get('credits') !== 'added' || !window.aibdAuth) return;
  q.delete('credits'); history.replaceState(null, '', location.pathname + (q.toString() ? `?${q}` : '') + location.hash);
  let shown = false;
  const show = () => {
    if (shown || !acct.signedIn) return; shown = true;
    window.openGenerate();
    const st = document.getElementById('gen-status');
    if (st) st.textContent = 'Payment received. Your extra credits appear here in a few seconds.';
    [3000, 8000, 15000].forEach(ms => setTimeout(() => window.aibdAuth.refresh(), ms));
  };
  window.aibdAuth.onChange(show); setTimeout(show, 1500);
})();
