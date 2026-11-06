// TETE admin dashboard: overview, real Supabase storage left, every file, limits, security.
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const JSON_POST = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  const state = { files: [], selected: new Set(), config: null, configLoaded: false, view: 'overview' };

  // ---------- helpers ----------
  const ICONS = {
    copy: '<rect width="14" height="14" x="8" y="8"/><path d="M4 16V4h12"/>',
    open: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 14v5H5V6h5"/>',
    download: '<path d="M12 4v12M12 16l-4-4M12 16l4-4"/><path d="M4 20h16"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
    lock: '<rect width="16" height="10" x="4" y="11"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
  };
  const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    // 1023.97 MB should read 1 GB, not 1024 MB
    if (i < units.length - 1 && +(bytes / 1024 ** i).toFixed(i ? 1 : 0) >= 1024) i++;
    return `${+(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
  };

  const formatExpiry = (expiresAt) => {
    if (!expiresAt) return 'Never';
    const diff = expiresAt - Date.now();
    if (diff <= 0) return 'Expired';
    const m = Math.round(diff / 60000);
    if (m < 60) return `in ${Math.max(m, 1)} min`;
    const h = Math.round(m / 60);
    return h < 48 ? `in ${h} h` : `in ${Math.round(h / 24)} days`;
  };

  let toastTimer;
  function toast(message, type = '') {
    const el = $('#toast');
    el.textContent = message;
    el.className = `toast show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 2800);
  }

  async function api(path, options = {}) {
    const res = await fetch(path, { credentials: 'same-origin', ...options });
    let data = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function copyText(text, label) {
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = Object.assign(document.createElement('textarea'), { value: text });
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    toast(label);
  }

  const setMeter = (meter, fill, pct) => {
    fill.style.width = `${Math.max(pct, pct > 0 ? 1.5 : 0)}%`;
    meter.setAttribute('aria-valuenow', String(Math.round(pct)));
    meter.classList.toggle('is-warn', pct >= 80 && pct < 95);
    meter.classList.toggle('is-full', pct >= 95);
  };

  // ---------- chrome ----------
  $('#themeToggle').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('tete-theme', next); } catch { /* storage unavailable */ }
  });

  function showView(name) {
    state.view = name;
    $$('.view').forEach((v) => { v.hidden = v.dataset.view !== name; });
    $$('.side-link').forEach((b) => b.classList.toggle('is-active', b.dataset.view === name));
    if (history.replaceState) history.replaceState(null, '', `#${name}`);
  }

  $('#sideNav').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (btn) showView(btn.dataset.view);
  });

  // ---------- sign in / out ----------
  function setSignedIn(signedIn) {
    $('#loginView').hidden = signedIn;
    $('#dash').hidden = !signedIn;
    $('#logoutBtn').hidden = !signedIn;
    if (!signedIn) setTimeout(() => $('#loginPassword').focus(), 30);
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin/login', JSON_POST({ password: $('#loginPassword').value }));
      $('#loginPassword').value = '';
      $('#loginError').hidden = true;
      await start();
    } catch (err) {
      $('#loginError').textContent = err.message;
      $('#loginError').hidden = false;
    }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
    setSignedIn(false);
    toast('Logged out');
  });

  // ---------- overview ----------
  async function loadOverview() {
    const [stats, usage] = await Promise.all([api('/api/admin/stats'), api('/api/usage')]);
    $('#kFiles').textContent = stats.files;
    $('#kFilesNote').textContent = `${stats.public} public · ${stats.locked} locked`;
    $('#kDay').textContent = stats.uploadedLast24h;
    $('#kSoon').textContent = stats.expiringWithinHour;
    $('#kNever').textContent = stats.neverExpire;
    $('#filesCount').textContent = stats.files;
    $('#sTete').textContent = `${formatSize(stats.bytes)} in ${stats.files} files`;
    $('#sLargest').textContent = formatSize(stats.largestBytes);
    $('#sSplit').textContent = `${stats.locked} / ${stats.public}`;
    $('#rPublicSize').textContent = formatSize(usage.limits.maxFileSize);
    state.teteBytes = stats.bytes;
    $('#updatedAt').textContent = `Updated ${new Date().toLocaleTimeString()}`;
  }

  async function loadStorage(fresh = false) {
    const btn = $('#recheckStorage');
    btn.disabled = true;
    try {
      const s = await api(`/api/admin/storage${fresh ? '?fresh=1' : ''}`);
      const pct = s.quotaBytes ? Math.min(100, (s.usedBytes / s.quotaBytes) * 100) : 0;
      $('#sRemain').textContent = formatSize(s.remainingBytes);
      $('#sUsed').textContent = formatSize(s.usedBytes);
      $('#sQuota').textContent = formatSize(s.quotaBytes);
      $('#sObjects').textContent = `${s.objects} ${s.objects === 1 ? 'object' : 'objects'}${s.truncated ? '+' : ''}`;
      setMeter($('#sMeter'), $('#sFill'), pct);
      $('#sNote').textContent = `${s.note} Checked ${new Date(s.checkedAt).toLocaleTimeString()}.`;
      const drift = s.usedBytes - (state.teteBytes ?? s.usedBytes);
      const warn = $('#sWarn');
      if (pct >= 80) {
        warn.textContent = pct >= 95 ? 'The bucket is almost full. Public uploads will be refused with "Storage is full" at the quota.' : 'The bucket is above 80% of its quota.';
        warn.hidden = false;
      } else if (drift > 1024 * 1024) {
        warn.textContent = `The bucket holds ${formatSize(drift)} more than TETE's own file list. Expired files are removed after the next upload, or leftovers exist.`;
        warn.hidden = false;
      } else {
        warn.hidden = true;
      }
    } catch (err) {
      $('#sRemain').textContent = '—';
      $('#sNote').textContent = `Could not read Supabase Storage: ${err.message}`;
    } finally {
      btn.disabled = false;
    }
  }

  async function refreshAll(fresh = false) {
    await loadOverview().catch((err) => { if (err.status === 403) setSignedIn(false); else toast(err.message, 'error'); });
    await Promise.all([loadStorage(fresh), loadFiles()]);
  }

  $('#refreshAll').addEventListener('click', async () => { await refreshAll(true); toast('Updated'); });
  $('#recheckStorage').addEventListener('click', () => loadStorage(true));

  // ---------- files ----------
  async function loadFiles() {
    try {
      state.files = await api('/api/files');
      state.selected.forEach((id) => { if (!state.files.some((f) => f.id === id)) state.selected.delete(id); });
      renderFiles();
    } catch (err) {
      $('#tbody').innerHTML = `<p class="empty-row">${esc(err.message)}</p>`;
    }
  }

  function visibleFiles() {
    const q = $('#search').value.trim().toLowerCase();
    const filter = $('#filter').value;
    const sort = $('#sort').value;
    const soon = Date.now() + 3600000;
    let list = state.files.filter((f) => {
      if (q && !(f.originalName.toLowerCase().includes(q) || f.id.includes(q))) return false;
      if (filter === 'public') return !f.locked;
      if (filter === 'locked') return f.locked;
      if (filter === 'never') return !f.expiresAt;
      if (filter === 'soon') return f.expiresAt && f.expiresAt < soon;
      return true;
    });
    const by = { new: (a, b) => b.uploadedAt.localeCompare(a.uploadedAt), old: (a, b) => a.uploadedAt.localeCompare(b.uploadedAt), big: (a, b) => b.size - a.size, name: (a, b) => a.originalName.localeCompare(b.originalName) };
    list = [...list].sort(by[sort]);
    return list;
  }

  function renderFiles() {
    const list = visibleFiles();
    $('#filesSub').textContent = `${state.files.length} ${state.files.length === 1 ? 'file' : 'files'} from every owner, newest first.`;
    $('#tbody').innerHTML = list.length ? list.map((f) => `
      <div class="trow" role="row" data-id="${esc(f.id)}">
        <span role="cell"><input type="checkbox" data-pick aria-label="Select ${esc(f.originalName)}" ${state.selected.has(f.id) ? 'checked' : ''}></span>
        <span role="cell" class="tname"><b>${esc(f.originalName)}</b>${f.locked ? `<span class="badge">${icon('lock')} Locked</span>` : ''}<small class="mono">${esc(f.id)}</small></span>
        <span role="cell" class="mono" data-label="Size">${formatSize(f.size)}</span>
        <span role="cell" data-label="Uploaded">${esc(new Date(f.uploadedAt).toLocaleString())}</span>
        <span role="cell" data-label="Expires">${esc(formatExpiry(f.expiresAt))}</span>
        <span role="cell" class="end tactions">
          <button class="icon-btn" type="button" data-act="copy" aria-label="Copy link" title="Copy link">${icon('copy')}</button>
          <a class="icon-btn" href="${esc(f.url)}" target="_blank" rel="noopener" aria-label="Open page" title="Open page">${icon('open')}</a>
          ${f.locked ? '' : `<a class="icon-btn" href="/file/${esc(f.id)}/download" aria-label="Download" title="Download">${icon('download')}</a>`}
          <button class="icon-btn danger" type="button" data-act="delete" aria-label="Delete" title="Delete">${icon('trash')}</button>
        </span>
      </div>`).join('') : '<p class="empty-row">No files match.</p>';
    $('#tableNote').textContent = state.files.length >= 200 ? 'Showing the newest 200 files.' : '';
    $('#selectAll').checked = list.length > 0 && list.every((f) => state.selected.has(f.id));
    $('#deleteSelected').disabled = state.selected.size === 0;
    $('#deleteSelected').textContent = state.selected.size ? `Delete selected (${state.selected.size})` : 'Delete selected';
  }

  async function removeFiles(ids) {
    let done = 0;
    for (const id of ids) {
      try { await api(`/file/${id}`, { method: 'DELETE' }); done++; state.selected.delete(id); } catch (err) { toast(err.message, 'error'); }
    }
    if (done) toast(`${done} ${done === 1 ? 'file' : 'files'} deleted`);
    await refreshAll(true);
  }

  $('#tbody').addEventListener('click', (e) => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'copy') copyText(state.files.find((f) => f.id === id).url, 'Link copied');
    if (act === 'delete' && confirm('Delete this file now? This cannot be undone.')) removeFiles([id]);
  });
  $('#tbody').addEventListener('change', (e) => {
    const row = e.target.closest('[data-id]');
    if (!row || !e.target.matches('[data-pick]')) return;
    if (e.target.checked) state.selected.add(row.dataset.id); else state.selected.delete(row.dataset.id);
    renderFiles();
  });
  $('#selectAll').addEventListener('change', (e) => {
    visibleFiles().forEach((f) => { if (e.target.checked) state.selected.add(f.id); else state.selected.delete(f.id); });
    renderFiles();
  });
  $('#deleteSelected').addEventListener('click', () => {
    const ids = [...state.selected];
    if (ids.length && confirm(`Delete ${ids.length} selected ${ids.length === 1 ? 'file' : 'files'}? This cannot be undone.`)) removeFiles(ids);
  });
  ['#search', '#filter', '#sort'].forEach((sel) => $(sel).addEventListener('input', renderFiles));

  // ---------- limits ----------
  async function loadConfig() {
    state.configLoaded = false;
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
      state.configLoaded = true;
    } catch (err) { toast(err.message, 'error'); }
  }

  $('#configForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    // Never submit before the current values are loaded: empty fields would be sent as 0 / the first option.
    if (!state.configLoaded) { toast('Limits are still loading, try again in a moment', 'error'); return; }
    const num = (sel) => ($(sel).value === '' ? undefined : Number($(sel).value));
    try {
      await api('/api/config', JSON_POST({
        defaultExpiration: num('#cfgExpiration'),
        maxFileSize: num('#cfgMaxSize'),
        maxFilesPerUpload: num('#cfgMaxFiles'),
        fileWhitelist: $('#cfgWhitelist').value
      }));
      toast('Limits saved');
      loadOverview();
    } catch (err) { toast(err.message, 'error'); }
  });

  // ---------- security ----------
  $('#passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin/verify-password', JSON_POST({ password: $('#pwCurrent').value }));
      await api('/api/admin/change-password', JSON_POST({ newPassword: $('#pwNew').value }));
      $('#passwordForm').reset();
      toast('Password changed');
    } catch (err) { toast(err.message, 'error'); }
  });

  $('#revokeBtn').addEventListener('click', async () => {
    if (!confirm('Sign out every connected application? They will have to be approved again.')) return;
    try {
      await api('/api/admin/revoke-oauth', { method: 'POST' });
      toast('All connected applications signed out');
    } catch (err) { toast(err.message, 'error'); }
  });

  // ---------- boot ----------
  async function start() {
    setSignedIn(true);
    const wanted = (location.hash || '').slice(1);
    showView(['overview', 'files', 'settings', 'security'].includes(wanted) ? wanted : 'overview');
    loadConfig();
    await refreshAll();
  }

  (async () => {
    try {
      const { isAdmin } = await api('/api/admin/status');
      if (isAdmin) await start(); else setSignedIn(false);
    } catch { setSignedIn(false); }
    setInterval(() => { if (!document.hidden && !$('#dash').hidden && state.view !== 'settings' && state.view !== 'security') refreshAll(); }, 45000);
  })();
})();
