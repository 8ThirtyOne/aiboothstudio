// Designs saved to the customer's account (Supabase), autosave, share links and the view-only mode for shared links.
// Loaded after app.js. Signed-out visitors keep the original browser-only Designs window.
(function () {
  const auth = window.aibdAuth;
  const baseOpenDesigns = window.openDesigns;
  const cloud = { id: null, name: '', lastSaved: '', timer: null, viewing: null };
  const signedIn = () => !!(auth && auth.state && auth.state.user);
  const table = () => auth.client.from('designs');
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // ── Status chip next to the Designs button: "Saving…", "Saved", "Not saved"
  const status = el('span', 'cloud-status'); status.hidden = true; status.setAttribute('aria-live', 'polite');
  const top = document.querySelector('.cv-top-right'); if (top) top.prepend(status);
  function setStatus(text, kind) { status.hidden = !text; status.textContent = text || ''; status.dataset.kind = kind || ''; }

  // ── Small thumbnail of the current view for the design list
  async function thumbnail() {
    try {
      const blob = await currentViewBlob();
      const url = URL.createObjectURL(blob);
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const c = document.createElement('canvas'); c.width = 320; c.height = Math.round(320 * img.naturalHeight / img.naturalWidth);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      return c.toDataURL('image/jpeg', 0.72);
    } catch { return null; }
  }

  async function saveToAccount(name, { asNew = false } = {}) {
    const data = serializeDesign(), thumb = await thumbnail(), now = new Date().toISOString();
    if (cloud.id && !asNew) {
      const { error } = await table().update({ name, data, thumb, updated_at: now }).eq('id', cloud.id);
      if (error) throw error;
    } else {
      const { data: row, error } = await table().insert({ name, data, thumb }).select('id').single();
      if (error) throw error;
      cloud.id = row.id;
    }
    cloud.name = name; cloud.lastSaved = JSON.stringify(data);
    startAutosave(); setStatus('Saved', 'ok');
  }

  // Autosave every 20 seconds while a design from the account is open and has changed.
  function startAutosave() {
    clearInterval(cloud.timer);
    cloud.timer = setInterval(async () => {
      if (!cloud.id || !signedIn() || cloud.viewing) return;
      const data = serializeDesign(), s = JSON.stringify(data);
      if (s === cloud.lastSaved) return;
      setStatus('Saving…', 'busy');
      const { error } = await table().update({ data, updated_at: new Date().toISOString() }).eq('id', cloud.id);
      if (error) { setStatus('Not saved', 'err'); return; }
      cloud.lastSaved = s; setStatus('Saved', 'ok');
    }, 20000);
  }
  function stopTracking() { clearInterval(cloud.timer); cloud.id = null; cloud.name = ''; cloud.lastSaved = ''; setStatus(''); }

  async function openFromAccount(id) {
    const { data, error } = await table().select('id, name, data').eq('id', id).single();
    if (error) throw error;
    closeModal(); applyDesign(data.data);
    cloud.id = data.id; cloud.name = data.name; cloud.lastSaved = JSON.stringify(serializeDesign());
    startAutosave(); setStatus('Saved', 'ok');
  }

  function newToken() {
    const b = crypto.getRandomValues(new Uint8Array(24));
    return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  const shareUrl = t => `${location.origin}/app/?view=${t}`;

  // ── Designs window for signed-in customers
  async function openDesignsSignedIn() {
    const body = openModal('Your designs', true);
    body.innerHTML = `
      <div class="ds-row"><input type="text" id="ds-name" placeholder="Design name" aria-label="Design name" maxlength="80">
        <button class="btn btn-sm btn-primary" id="cl-save"></button><button class="btn btn-sm" id="cl-save-new" hidden>Save as new</button></div>
      <div class="ds-row"><button class="btn btn-sm" id="ds-new">New design</button><button class="btn btn-sm" id="ds-export">Save as file</button><button class="btn btn-sm" id="ds-import">Open file</button><input type="file" id="ds-file" hidden accept=".json,application/json"></div>
      <p class="ds-msg" id="ds-msg" aria-live="polite">Designs saved to your account open on any computer and save automatically as you work.</p>
      <div class="ss-title">Saved to your account</div>
      <div id="cl-list" class="cl-grid"><p class="ds-msg">Loading…</p></div>
      <div id="cl-local"></div>`;
    const nameIn = document.getElementById('ds-name'), saveBtn = document.getElementById('cl-save'), saveNew = document.getElementById('cl-save-new');
    nameIn.value = cloud.id ? cloud.name : (S.brand.company ? `${S.brand.company} ${getSZ().lbl}` : '');
    saveBtn.textContent = cloud.id ? 'Save' : 'Save to account'; saveNew.hidden = !cloud.id;
    const doSave = async asNew => {
      const name = nameIn.value.trim() || 'Untitled design';
      saveBtn.disabled = saveNew.disabled = true; dsMsg('Saving…');
      try { await saveToAccount(name, { asNew }); dsMsg(`Saved “${name}” to your account.`); saveBtn.textContent = 'Save'; saveNew.hidden = false; await drawList(); }
      catch (e) { dsMsg("Couldn't save to your account. Try again, or use Save as file."); console.warn(e); }
      saveBtn.disabled = saveNew.disabled = false;
    };
    saveBtn.onclick = () => doSave(false); saveNew.onclick = () => doSave(true);
    document.getElementById('ds-new').onclick = () => confirmInline(document.getElementById('ds-new'), 'Start a new design? The current one stays saved in your account if you saved it.', () => { stopTracking(); closeModal(); applyDesign(starterDesign()); heroCamera(); });
    document.getElementById('ds-export').onclick = exportDesignFile;
    document.getElementById('ds-import').onclick = () => document.getElementById('ds-file').click();
    document.getElementById('ds-file').onchange = e => { stopTracking(); importDesignFile(e); };
    await drawList(); drawLocal();
  }

  async function drawList() {
    const wrap = document.getElementById('cl-list'); if (!wrap) return;
    const { data, error } = await table().select('id, name, thumb, updated_at, share_token').order('updated_at', { ascending: false }).limit(100);
    wrap.textContent = '';
    if (error) { wrap.append(el('p', 'ds-msg', "Couldn't load your designs. Check your connection and try again.")); return; }
    if (!data.length) { wrap.append(el('p', 'ds-msg', 'No designs saved to your account yet. Name this one and click Save to account.')); return; }
    data.forEach(d => {
      const card = el('div', 'cl-card' + (d.id === cloud.id ? ' current' : ''));
      const pic = el('div', 'cl-thumb'); if (d.thumb) { const im = el('img'); im.src = d.thumb; im.alt = ''; pic.append(im); }
      const info = el('div', 'cl-info'); info.append(el('strong', '', d.name), el('span', '', (d.id === cloud.id ? 'Open now · ' : '') + new Date(d.updated_at).toLocaleString()));
      const btns = el('div', 'cl-btns');
      const open = el('button', 'btn btn-sm btn-primary', 'Open');
      open.onclick = async () => { open.disabled = true; try { await openFromAccount(d.id); } catch { dsMsg("Couldn't open that design. Try again."); open.disabled = false; } };
      const share = el('button', 'btn btn-sm', d.share_token ? 'Shared' : 'Share');
      share.onclick = () => showShare(card, d);
      const del = el('button', 'btn btn-sm', 'Delete');
      del.onclick = () => confirmInline(del, `Delete “${d.name}”? This can't be undone, and its share link stops working.`, async () => {
        const { error: e2 } = await table().delete().eq('id', d.id);
        if (e2) { dsMsg("Couldn't delete it. Try again."); return; }
        if (d.id === cloud.id) stopTracking();
        drawList();
      });
      btns.append(open, share, del);
      card.append(pic, info, btns); wrap.append(card);
    });
  }

  function showShare(card, d) {
    card.parentElement.querySelectorAll('.cl-share').forEach(x => x.remove());
    const box = el('div', 'cl-share');
    const go = async () => {
      let t = d.share_token;
      if (!t) {
        t = newToken();
        const { error } = await table().update({ share_token: t }).eq('id', d.id);
        if (error) { box.textContent = "Couldn't create a share link. Try again."; return; }
        d.share_token = t;
      }
      box.textContent = '';
      const p = el('p', '', 'Anyone with this link can view this design (view only). Changes you make later appear automatically.');
      const row = el('div', 'cl-share-row');
      const input = el('input'); input.readOnly = true; input.value = shareUrl(t); input.onclick = () => input.select();
      const copy = el('button', 'btn btn-sm btn-primary', 'Copy link');
      copy.onclick = async () => { try { await navigator.clipboard.writeText(input.value); copy.textContent = 'Copied'; } catch { input.select(); copy.textContent = 'Press Cmd+C'; } };
      const stop = el('button', 'btn btn-sm', 'Stop sharing');
      stop.onclick = async () => { const { error } = await table().update({ share_token: null }).eq('id', d.id); if (error) return; d.share_token = null; box.remove(); drawList(); };
      row.append(input, copy, stop); box.append(p, row);
    };
    box.textContent = 'Creating link…'; card.after(box); go();
  }

  // Designs saved in this browser before accounts existed: offer to move them to the account.
  function drawLocal() {
    const host = document.getElementById('cl-local'); if (!host) return;
    const list = readStore(); host.textContent = ''; if (!list.length) return;
    host.append(el('div', 'ss-title', 'Saved on this browser only'));
    list.forEach(x => {
      const row = el('div', 'ds-item');
      const info = el('div'); info.style.minWidth = '0'; info.append(el('strong', '', x.name), el('span', '', new Date(x.savedAt).toLocaleString()));
      const open = el('button', 'btn btn-sm', 'Open'); open.onclick = () => { stopTracking(); closeModal(); applyDesign(x.design); };
      const move = el('button', 'btn btn-sm btn-primary', 'Move to account');
      move.onclick = async () => {
        move.disabled = true;
        const { error } = await table().insert({ name: x.name.slice(0, 80), data: x.design });
        if (error) { dsMsg("Couldn't move it. Try again."); move.disabled = false; return; }
        writeStore(readStore().filter(y => y.id !== x.id)); dsMsg(`Moved “${x.name}” to your account.`); drawList(); drawLocal();
      };
      row.append(info, open, move); host.append(row);
    });
  }

  window.openDesigns = function () {
    if (!signedIn() || cloud.viewing) return baseOpenDesigns();
    return openDesignsSignedIn();
  };
  if (auth) auth.onChange(st => { if (!st.user) stopTracking(); });

  // ── View-only mode for share links: /app/?view=<token>
  const viewToken = new URLSearchParams(location.search).get('view');
  if (viewToken) {
    fetch(`/api/share?t=${encodeURIComponent(viewToken)}`).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(d => {
      cloud.viewing = d.name; applyDesign(d.data);
      const bar = el('div', 'view-bar');
      const txt = el('span'); txt.append('Viewing ', el('b', '', `“${d.name}”`), ' · shared design, view only');
      const mine = el('button', 'btn btn-sm btn-primary', 'Make my own copy');
      mine.onclick = async () => {
        if (!signedIn()) { openAccount(); return; }
        mine.disabled = true;
        try { cloud.viewing = null; await saveToAccount(`${d.name} (copy)`, { asNew: true }); bar.remove(); history.replaceState(null, '', '/app/'); }
        catch { cloud.viewing = d.name; mine.disabled = false; }
      };
      bar.append(txt, mine); document.body.append(bar);
    }).catch(() => {
      const bar = el('div', 'view-bar err'); bar.textContent = "This share link isn't available. It may have been turned off by its owner.";
      document.body.append(bar); setTimeout(() => bar.remove(), 8000);
    });
  }
})();
