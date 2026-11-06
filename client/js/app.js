// TETE web UI. UI and API are the same Worker, so every request is same-origin.
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // Integrators use the API host; on any other host (workers.dev, local) the page's own origin is the API.
  const API_ORIGIN = location.hostname === 'tete.apipedia.id' ? 'https://tetein.apipedia.id' : location.origin;

  const state = { mode: 'file', picked: [], expiry: '', isAdmin: false, tokens: new Map(), files: new Map(), pendingDownload: null };

  // ---------- helpers ----------
  const ICONS = {
    copy: '<rect width="14" height="14" x="8" y="8" rx="0"/><path d="M4 16V4h12"/>',
    open: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 14v5H5V6h5"/>',
    download: '<path d="M12 4v12M12 16l-4-4M12 16l4-4"/><path d="M4 20h16"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
    lock: '<rect width="16" height="10" x="4" y="11"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    check: '<path d="M4 12l5 5L20 6"/>',
    x: '<path d="M5 5l14 14M19 5L5 19"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
    close: '<path d="M5 5l14 14M19 5L5 19"/>'
  };
  const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

  // File names are user-controlled: never put them into HTML unescaped.
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${+(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
  };

  const formatExpiry = (expiresAt) => {
    if (!expiresAt) return 'never expires';
    const diff = expiresAt - Date.now();
    if (diff <= 0) return 'expired';
    const m = Math.round(diff / 60000);
    if (m < 60) return `expires in ${Math.max(m, 1)} min`;
    const h = Math.round(m / 60);
    if (h < 48) return `expires in ${h} h`;
    return `expires in ${Math.round(h / 24)} days`;
  };

  let toastTimer;
  function toast(message, type = '') {
    const el = $('#toast');
    el.textContent = message;
    el.className = `toast show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 2800);
  }

  async function copyText(text, label = 'Copied') {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = Object.assign(document.createElement('textarea'), { value: text });
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast(label);
  }

  async function api(path, options = {}) {
    const res = await fetch(path, { credentials: 'same-origin', ...options });
    let data = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  }

  // ---------- theme, header, scroll ----------
  function initChrome() {
    $('#themeToggle').addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('tete-theme', next); } catch { /* storage unavailable */ }
    });

    const nav = $('#siteNav');
    const menuBtn = $('#menuBtn');
    menuBtn.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      menuBtn.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', (e) => {
      if (e.target.closest('a')) { nav.classList.remove('is-open'); menuBtn.setAttribute('aria-expanded', 'false'); }
    });

    const progress = $('#scrollProgress');
    const toTop = $('#toTop');
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      progress.style.width = max > 0 ? `${(scrollY / max) * 100}%` : '0';
      toTop.classList.toggle('is-visible', scrollY > 300);
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));

    $('#year').textContent = new Date().getFullYear();

    if ('IntersectionObserver' in window) {
      const links = new Map($$('.site-nav a').map((a) => [a.getAttribute('href'), a]));
      const spy = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            links.forEach((a) => a.classList.remove('is-active'));
            links.get(`#${en.target.id}`)?.classList.add('is-active');
          }
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      $$('main section[id]').forEach((s) => spy.observe(s));

      const reveal = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); reveal.unobserve(en.target); } });
      }, { threshold: 0.08 });
      $$('.section .wrap > *').forEach((el) => { el.classList.add('reveal'); reveal.observe(el); });
    }
  }

  // ---------- resources (storage left + limits) ----------
  const formatLife = (ms) => {
    if (!ms) return 'Never';
    const h = ms / 3600000;
    if (h < 1) return `${Math.round(ms / 60000)} min`;
    if (h < 48) return `${+h.toFixed(1)} h`;
    return `${Math.round(h / 24)} days`;
  };

  async function loadUsage() {
    try {
      const { storage, limits } = await api('/api/usage');
      const pct = storage.quotaBytes ? Math.min(100, (storage.usedBytes / storage.quotaBytes) * 100) : 0;
      $('#usedText').textContent = formatSize(storage.usedBytes);
      $('#quotaText').textContent = formatSize(storage.quotaBytes);
      $('#remainText').textContent = formatSize(storage.remainingBytes);
      $('#filesText').textContent = `${storage.files} ${storage.files === 1 ? 'file' : 'files'}`;
      $('#meterFill').style.width = `${Math.max(pct, storage.usedBytes ? 1.5 : 0)}%`;
      $('#meter').setAttribute('aria-valuenow', String(Math.round(pct)));
      $('#meter').classList.toggle('is-warn', pct >= 80 && pct < 95);
      $('#meter').classList.toggle('is-full', pct >= 95);
      $('.stats').classList.toggle('is-full', pct >= 95);
      $('#limitFile').textContent = formatSize(limits.maxFileSize);
      $('#limitCount').textContent = String(limits.maxFilesPerUpload);
      $('#limitExpiry').textContent = formatLife(limits.defaultExpiration);
      $('#dzHint').textContent = storage.remainingBytes <= 0 ? 'Storage is full right now' : `Up to ${formatSize(limits.maxFileSize)} per file`;
    } catch { /* the panel keeps its last values */ }
  }

  // ---------- upload form ----------
  function setMode(mode) {
    state.mode = mode;
    $('#tabFile').setAttribute('aria-selected', String(mode === 'file'));
    $('#tabText').setAttribute('aria-selected', String(mode === 'text'));
    $('#tabFile').classList.toggle('is-active', mode === 'file');
    $('#tabText').classList.toggle('is-active', mode === 'text');
    $('#paneFile').hidden = mode !== 'file';
    $('#paneText').hidden = mode !== 'text';
    refreshUploadButton();
  }

  function refreshUploadButton() {
    const ready = state.mode === 'file' ? state.picked.length > 0 : $('#textContent').value.trim().length > 0;
    $('#uploadBtn').disabled = !ready;
    $('#uploadBtn').textContent = state.mode === 'file' && state.picked.length > 1 ? `Upload ${state.picked.length} files` : 'Upload';
    $('#pwNotice').hidden = !$('#uploadPassword').value;
  }

  function renderPicked() {
    $('#pickedFiles').innerHTML = state.picked.map((f, i) => `
      <li><span class="icon-wrap">${icon('file')}</span><span class="name">${esc(f.name)}</span><span class="size">${formatSize(f.size)}</span>
      <button type="button" class="icon-btn" data-remove="${i}" aria-label="Remove ${esc(f.name)}">${icon('close')}</button></li>`).join('');
    refreshUploadButton();
  }

  function addFiles(list) {
    state.picked.push(...list);
    renderPicked();
  }

  function initUploadForm() {
    const dz = $('#dropZone');
    const input = $('#fileInput');
    dz.addEventListener('click', () => input.click());
    dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', () => { addFiles([...input.files]); input.value = ''; });
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('is-over'); }));
    dz.addEventListener('drop', (e) => addFiles([...e.dataTransfer.files]));
    $('#pickedFiles').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove]');
      if (btn) { state.picked.splice(Number(btn.dataset.remove), 1); renderPicked(); }
    });

    $('#tabFile').addEventListener('click', () => setMode('file'));
    $('#tabText').addEventListener('click', () => setMode('text'));
    $('#textContent').addEventListener('input', refreshUploadButton);
    $('#uploadPassword').addEventListener('input', refreshUploadButton);

    $('#expiryChips').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      $$('#expiryChips .chip').forEach((c) => c.setAttribute('aria-checked', String(c === chip)));
      state.expiry = chip.dataset.ms;
    });

    $('#togglePw').addEventListener('click', () => {
      const field = $('#uploadPassword');
      const show = field.type === 'password';
      field.type = show ? 'text' : 'password';
      $('#togglePw').setAttribute('aria-pressed', String(show));
      $('#togglePw').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });

    $('#uploadBtn').addEventListener('click', doUpload);

    $('#uploadResult').addEventListener('click', onResultClick);
  }

  // XHR (not fetch) so the button can show real upload progress.
  function sendWithProgress(path, body, headers, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', path);
      Object.entries(headers || {}).forEach(([k, v]) => xhr.setRequestHeader(k, v));
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.onload = () => {
        let data = null;
        try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error((data && data.error) || `Upload failed (${xhr.status})`));
      };
      xhr.send(body);
    });
  }

  async function doUpload() {
    const btn = $('#uploadBtn');
    const out = $('#uploadResult');
    const password = $('#uploadPassword').value;
    const label = btn.textContent;
    btn.disabled = true;
    out.innerHTML = '';

    const setBusy = (pct) => { btn.innerHTML = `<span class="spinner"></span> Uploading${pct != null ? ` ${pct}%` : '…'}`; };
    setBusy(0);

    try {
      let data;
      if (state.mode === 'file') {
        const form = new FormData();
        state.picked.forEach((f) => form.append('files', f));
        if (password) form.append('password', password);
        if (state.expiry !== '') form.append('expiration', state.expiry);
        data = await sendWithProgress('/api/upload', form, null, setBusy);
      } else {
        const body = { text: $('#textContent').value, filename: $('#textName').value.trim() || undefined, password: password || undefined };
        if (state.expiry !== '') body.expiration = Number(state.expiry);
        data = await sendWithProgress('/api/text', JSON.stringify(body), { 'Content-Type': 'application/json' }, setBusy);
      }
      const items = Array.isArray(data) ? data : [data];
      items.forEach((f) => { state.tokens.set(f.id, f.deleteToken); state.files.set(f.id, f); });
      out.innerHTML = items.map(resultCard).join('');
      out.firstElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

      if (state.mode === 'file') { state.picked = []; renderPicked(); } else { $('#textContent').value = ''; $('#textName').value = ''; }
      $('#uploadPassword').value = '';
      loadFiles();
      loadUsage();
    } catch (err) {
      out.innerHTML = `<div class="result is-error" role="alert"><p class="result-title">${icon('x')} Upload failed</p><p style="margin:0">${esc(err.message)}</p></div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = label;
      refreshUploadButton();
    }
  }

  function resultCard(f) {
    return `
      <article class="result" data-id="${esc(f.id)}">
        <h3 class="result-title"><span class="ok">${icon('check')}</span>${esc(f.originalName)} ${f.locked ? `<span class="badge">${icon('lock')} Locked</span>` : ''}</h3>
        <div class="copy-row">
          <input class="input" readonly value="${esc(f.url)}" aria-label="Share link" onfocus="this.select()">
          <button class="btn btn-primary" type="button" data-act="copy-link">${icon('copy')} Copy</button>
        </div>
        <p class="meta"><span>${formatSize(f.size)}</span><span>${esc(formatExpiry(f.expiresAt))}</span><span>${f.locked ? 'AES-256 encrypted' : 'public link'}</span></p>
        ${f.deleteToken ? `<div class="token-box"><span>Delete token, shown once:</span><code>${esc(f.deleteToken)}</code><button class="btn btn-sm" type="button" data-act="copy-token">Copy</button></div>` : ''}
        <div class="actions">
          <a class="btn btn-sm" href="${esc(f.url)}" target="_blank" rel="noopener">${icon('open')} Open page</a>
          <button class="btn btn-sm" type="button" data-act="download">${icon('download')} Download</button>
          <button class="btn btn-sm btn-danger" type="button" data-act="delete">${icon('trash')} Delete now</button>
        </div>
      </article>`;
  }

  function onResultClick(e) {
    const btn = e.target.closest('[data-act]');
    const card = e.target.closest('[data-id]');
    if (!btn || !card) return;
    const id = card.dataset.id;
    if (btn.dataset.act === 'copy-link') copyText(state.files.get(id).url, 'Link copied');
    if (btn.dataset.act === 'copy-token') copyText(state.tokens.get(id), 'Token copied');
    if (btn.dataset.act === 'download') downloadFile(id);
    if (btn.dataset.act === 'delete') deleteFile(id, card);
  }

  // ---------- my files ----------
  function fileRow(f) {
    return `
      <li class="file-row" data-id="${esc(f.id)}">
        <div>
          <div class="file-name">${esc(f.originalName)} ${f.locked ? `<span class="badge">${icon('lock')} Locked</span>` : '<span class="badge badge-open">Public</span>'}</div>
          <div class="file-meta">${formatSize(f.size)} · ${new Date(f.uploadedAt).toLocaleString()} · ${esc(formatExpiry(f.expiresAt))}</div>
        </div>
        <div class="row-actions">
          <button class="icon-btn" type="button" data-act="copy-link" aria-label="Copy link" title="Copy link">${icon('copy')}</button>
          <a class="icon-btn" href="${esc(f.url)}" target="_blank" rel="noopener" aria-label="Open page" title="Open page">${icon('open')}</a>
          <button class="icon-btn" type="button" data-act="download" aria-label="Download" title="Download">${icon('download')}</button>
          <button class="icon-btn danger" type="button" data-act="delete" aria-label="Delete" title="Delete">${icon('trash')}</button>
        </div>
      </li>`;
  }

  async function loadFiles() {
    const list = $('#fileList');
    try {
      const files = await api('/api/files');
      files.forEach((f) => state.files.set(f.id, { ...state.files.get(f.id), ...f }));
      list.innerHTML = files.length
        ? files.map(fileRow).join('')
        : '<li class="empty"><strong>Nothing here yet</strong>Files you upload from this browser show up here until they expire.</li>';
    } catch (err) {
      list.innerHTML = `<li class="empty"><strong>Could not load files</strong>${esc(err.message)}</li>`;
    }
  }

  function initFileList() {
    $('#fileList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      const row = e.target.closest('[data-id]');
      if (!btn || !row) return;
      const id = row.dataset.id;
      if (btn.dataset.act === 'copy-link') copyText(state.files.get(id).url, 'Link copied');
      if (btn.dataset.act === 'download') downloadFile(id);
      if (btn.dataset.act === 'delete') deleteFile(id, row);
    });
    $('#refreshBtn').addEventListener('click', async () => { await loadFiles(); toast('Updated'); });
    setInterval(() => { if (!document.hidden) { loadFiles(); loadUsage(); } }, 30000);
  }

  async function deleteFile(id, el) {
    if (!confirm('Delete this file now? This cannot be undone.')) return;
    try {
      const headers = state.tokens.has(id) ? { 'X-Delete-Token': state.tokens.get(id) } : {};
      await api(`/file/${id}`, { method: 'DELETE', headers });
      el.remove();
      state.files.delete(id);
      toast('File deleted');
      loadFiles();
      loadUsage();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ---------- download (with password modal for locked files) ----------
  function triggerSave(url, name) {
    const a = Object.assign(document.createElement('a'), { href: url, download: name || '' });
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function downloadFile(id) {
    const f = state.files.get(id);
    if (!f) return;
    if (f.locked) { openModal('#pwModal'); state.pendingDownload = id; $('#pwModalInput').value = ''; $('#pwModalError').hidden = true; setTimeout(() => $('#pwModalInput').focus(), 30); return; }
    triggerSave(`/file/${id}/download`, f.originalName);
  }

  async function submitPassword(e) {
    e.preventDefault();
    const id = state.pendingDownload;
    const pw = $('#pwModalInput').value;
    const errEl = $('#pwModalError');
    try {
      const res = await fetch(`/file/${id}/download`, { headers: { 'X-Password': pw } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(res.status === 401 ? 'Wrong password' : data.error || 'Download failed');
      }
      const disposition = res.headers.get('Content-Disposition') || '';
      const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const name = utf8 ? decodeURIComponent(utf8[1]) : state.files.get(id)?.originalName;
      const url = URL.createObjectURL(await res.blob());
      triggerSave(url, name);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      closeModals();
      toast('Download started');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    }
  }

  // ---------- modals ----------
  let lastFocus = null;
  function openModal(sel) { lastFocus = document.activeElement; $(sel).hidden = false; }
  function closeModals() { $$('.modal').forEach((m) => { m.hidden = true; }); lastFocus?.focus?.(); }

  function initModals() {
    $$('.modal').forEach((m) => {
      m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) closeModals(); });
    });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModals(); });
    $('#pwModalForm').addEventListener('submit', submitPassword);
  }

  // ---------- admin ----------
  function applyAdmin(isAdmin) {
    state.isAdmin = isAdmin;
    $('#admin').hidden = !isAdmin;
    $('#navAdmin').hidden = !isAdmin;
    $('#filesTitle').textContent = isAdmin ? 'All files (admin)' : 'My files';
    $('#adminBtn').textContent = isAdmin ? 'Admin ✓' : 'Admin';
    $('#navLogin').hidden = isAdmin;
    if (isAdmin) loadConfig();
    loadFiles();
  }

  async function checkAdmin() {
    try { applyAdmin((await api('/api/admin/status')).isAdmin); } catch { applyAdmin(false); }
  }

  let configLoaded = false;

  async function loadConfig() {
    configLoaded = false;
    try {
      const cfg = await api('/api/config');
      const select = $('#cfgExpiration');
      if (![...select.options].some((o) => o.value === String(cfg.defaultExpiration))) {
        select.add(new Option(`${Math.round(cfg.defaultExpiration / 60000)} minutes`, cfg.defaultExpiration));
      }
      select.value = String(cfg.defaultExpiration);
      $('#cfgMaxSize').value = cfg.maxFileSizeMB;
      $('#cfgMaxFiles').value = cfg.maxFilesPerUpload;
      $('#cfgWhitelist').value = cfg.fileWhitelist.join(', ');
      configLoaded = true;
    } catch (err) { toast(err.message, 'error'); }
  }

  function initAdmin() {
    const openAdmin = (e) => {
      e?.preventDefault();
      if (state.isAdmin) { $('#admin').scrollIntoView({ behavior: 'smooth' }); return; }
      openModal('#adminModal');
      $('#adminModalError').hidden = true;
      $('#adminPasswordInput').value = '';
      setTimeout(() => $('#adminPasswordInput').focus(), 30);
    };
    $('#adminBtn').addEventListener('click', openAdmin);
    $('#navLogin').addEventListener('click', openAdmin);

    $('#adminModalForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#adminPasswordInput').value }) });
        closeModals();
        applyAdmin(true);
        toast('Logged in');
      } catch (err) {
        $('#adminModalError').textContent = err.message;
        $('#adminModalError').hidden = false;
      }
    });

    $('#logoutBtn').addEventListener('click', async () => {
      await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
      applyAdmin(false);
      scrollTo({ top: 0 });
      toast('Logged out');
    });

    $('#configForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      // Never submit before the current values are loaded: empty fields would be sent as 0 / the first option.
      if (!configLoaded) { toast('Settings are still loading, try again in a moment', 'error'); return; }
      const num = (sel) => ($(sel).value === '' ? undefined : Number($(sel).value));
      try {
        const cfg = await api('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            defaultExpiration: num('#cfgExpiration'),
            maxFileSize: num('#cfgMaxSize'),
            maxFilesPerUpload: num('#cfgMaxFiles'),
            fileWhitelist: $('#cfgWhitelist').value
          })
        });
        loadUsage();
        toast('Limits saved');
      } catch (err) { toast(err.message, 'error'); }
    });

    $('#revokeBtn').addEventListener('click', async () => {
      if (!confirm('Sign out every connected application? They will have to be approved again.')) return;
      try {
        await api('/api/admin/revoke-oauth', { method: 'POST' });
        toast('All connected applications signed out');
      } catch (err) { toast(err.message, 'error'); }
    });

    $('#passwordForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const json = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      try {
        await api('/api/admin/verify-password', json({ password: $('#pwCurrent').value }));
        await api('/api/admin/change-password', json({ newPassword: $('#pwNew').value }));
        $('#passwordForm').reset();
        toast('Password changed');
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  // ---------- connect section ----------
  function initConnect() {
    const API = API_ORIGIN;
    $('#curlSnippet').textContent =
`# upload
curl -F "file=@report.pdf" ${API}/api

# password + expires in 1 day
curl -F "file=@secret.txt" -F "password=s3cret" \\
     -F "expiration=86400000" ${API}/api

# download (add -H "X-Password: s3cret" if locked)
curl -OJ ${API}/file/<id>/download

# delete (token comes from the upload response)
curl -X DELETE "${API}/file/<id>?token=<token>"`;

    $('#mcpSnippet').textContent =
`claude mcp add --transport http tete ${API}/mcp

# then, inside Claude Code:
#   /mcp  ->  tete  ->  Authenticate
# a browser opens with the consent screen`;

    $('#desktopSnippet').textContent = `${API}/mcp`;

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-copy-target]');
      if (btn) copyText($(`#${btn.dataset.copyTarget}`).textContent, 'Copied');
    });
  }

  // ---------- boot ----------
  document.addEventListener('DOMContentLoaded', () => {
    initChrome();
    initUploadForm();
    initFileList();
    initModals();
    initAdmin();
    initConnect();
    refreshUploadButton();
    loadFiles();
    loadUsage();
    checkAdmin();
  });
})();
