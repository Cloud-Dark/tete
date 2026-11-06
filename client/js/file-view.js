// File page (/file/:id): shows file facts and downloads it, asking for the password when the file is locked.
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);

  const id = (location.pathname.match(/\/file\/([a-f0-9]{6})/i) || [])[1];
  let meta = null;

  // The upload form lives on the frontend host; on other hosts it is simply this origin.
  const frontOrigin = location.hostname === 'tetein.apipedia.id' ? 'https://tete.apipedia.id' : location.origin;
  $('#homeLink').href = $('#uploadLink').href = $('#homeBtn').href = frontOrigin + '/';

  $('#themeToggle').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('tete-theme', next); } catch { /* storage unavailable */ }
  });

  let toastTimer;
  function toast(message, type = '') {
    const el = $('#toast');
    el.textContent = message;
    el.className = `toast show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 2800);
  }

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${+(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
  };

  const GLYPH = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>';
  const LOCK = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect width="16" height="10" x="4" y="11"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

  async function load() {
    try {
      if (!id) throw new Error('bad id');
      const res = await fetch(`/api/file/${id}`);
      if (!res.ok) throw new Error('not found');
      meta = await res.json();

      document.title = `${meta.locked ? 'Locked file' : meta.originalName} — TETE`;
      $('#fileGlyph').innerHTML = meta.locked ? LOCK : GLYPH;
      $('#fileName').textContent = meta.originalName;
      $('#fileSize').textContent = formatSize(meta.size);
      $('#uploadDate').textContent = new Date(meta.uploadedAt).toLocaleString();
      $('#expiryDate').textContent = meta.expiresAt ? new Date(meta.expiresAt).toLocaleString() : 'Never';
      $('#fileId').textContent = meta.id;
      const badge = $('#fileBadge');
      badge.className = meta.locked ? 'badge' : 'badge badge-open';
      badge.innerHTML = meta.locked ? `${LOCK} Locked` : 'Public';
      $('#pwField').hidden = !meta.locked;
      $('#downloadBtn').textContent = meta.locked ? 'Unlock & download' : 'Download';

      $('#loadingState').hidden = true;
      $('#fileInfo').hidden = false;
      if (meta.locked) $('#filePassword').focus();
    } catch {
      $('#loadingState').hidden = true;
      $('#errorState').hidden = false;
    }
  }

  function save(url, name) {
    const a = Object.assign(document.createElement('a'), { href: url, download: name || '' });
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  $('#downloadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!meta) return;
    const err = $('#downloadError');
    err.hidden = true;

    if (!meta.locked) { save(`/file/${id}/download`, meta.originalName); toast('Download started'); return; }

    const btn = $('#downloadBtn');
    const label = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Decrypting…';
    try {
      const res = await fetch(`/file/${id}/download`, { headers: { 'X-Password': $('#filePassword').value } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(res.status === 401 ? 'Wrong password' : data.error || 'Download failed');
      }
      const disposition = res.headers.get('Content-Disposition') || '';
      const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const url = URL.createObjectURL(await res.blob());
      save(url, utf8 ? decodeURIComponent(utf8[1]) : meta.originalName);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast('Download started');
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });

  $('#copyBtn').addEventListener('click', async () => {
    const link = `${frontOrigin}/file/${id}`;
    try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch { toast(link); }
  });

  load();
})();
