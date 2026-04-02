// TETE Client Application
const API_BASE = window.location.origin;
let selectedFiles = [];
let openDropdown = null;
let pendingDownloadUrl = null;
let isAdmin = false;

// Custom Dropdown with Search
function initCustomDropdowns() {
  // First, clean up any existing dropdowns that might be duplicated
  document.querySelectorAll('.custom-select-wrapper').forEach(wrapper => {
    const select = wrapper.previousElementSibling;
    if (select && select.tagName === 'SELECT') {
      // Keep only the first wrapper for each select
      const wrappers = select.parentElement.querySelectorAll('.custom-select-wrapper');
      if (wrappers.length > 1) {
        for (let i = 1; i < wrappers.length; i++) {
          wrappers[i].remove();
        }
      }
    }
  });

  document.querySelectorAll('select[data-dropdown="true"]').forEach(select => {
    // Skip if already converted
    if (select.parentElement.classList.contains('custom-select-wrapper')) return;
    
    // Also check if there's already a wrapper after this select
    const existingWrapper = select.parentElement.querySelector('.custom-select-wrapper');
    if (existingWrapper) return;

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select-wrapper';

    // Create selected display
    const selected = document.createElement('div');
    selected.className = 'custom-select-selected';
    selected.innerHTML = `<span class="custom-select-text">${select.options[select.selectedIndex]?.text || 'Select...'}</span><span class="custom-select-arrow">▼</span>`;

    // Create options list
    const options = document.createElement('div');
    options.className = 'custom-select-options';

    // Create search input
    const search = document.createElement('input');
    search.className = 'custom-select-search';
    search.type = 'text';
    search.placeholder = 'Search...';

    // Create options container
    const optionsList = document.createElement('div');
    optionsList.className = 'custom-select-options-list';

    // Populate options
    Array.from(select.options).forEach((opt, idx) => {
      const item = document.createElement('div');
      item.className = 'custom-select-option';
      item.textContent = opt.text;
      item.dataset.value = opt.value;
      item.dataset.index = idx;
      if (opt.selected) item.classList.add('selected');

      item.addEventListener('click', () => {
        select.selectedIndex = idx;
        selected.querySelector('.custom-select-text').textContent = opt.text;
        wrapper.classList.remove('show');
        select.dispatchEvent(new Event('change'));

        // Update all options selection state
        Array.from(optionsList.children).forEach(child => {
          child.classList.toggle('selected', child === item);
        });
      });

      optionsList.appendChild(item);
    });

    // Toggle dropdown
    selected.addEventListener('click', (e) => {
      e.stopPropagation();
      const isShowing = wrapper.classList.contains('show');
      closeAllCustomDropdowns();
      if (!isShowing) wrapper.classList.add('show');
    });

    // Search functionality
    search.addEventListener('input', (e) => {
      e.stopPropagation();
      const term = e.target.value.toLowerCase();
      Array.from(optionsList.children).forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(term) ? 'block' : 'none';
      });
    });

    // Prevent search input from closing dropdown
    search.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Focus search when dropdown opens
    wrapper.addEventListener('click', (e) => {
      if (wrapper.classList.contains('show')) {
        search.focus();
      }
    });

    // Assemble
    options.appendChild(search);
    options.appendChild(optionsList);
    wrapper.appendChild(selected);
    wrapper.appendChild(options);

    // Replace select with custom dropdown
    select.style.display = 'none';
    select.parentElement.insertBefore(wrapper, select.nextSibling);
  });
}

function closeAllCustomDropdowns() {
  document.querySelectorAll('.custom-select-wrapper.show').forEach(wrapper => {
    wrapper.classList.remove('show');
  });
}

// Close dropdowns when clicking outside
document.addEventListener('click', () => {
  closeAllCustomDropdowns();
});

// Toast notification
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

// Password modal functions
function openPasswordModal(url) {
  pendingDownloadUrl = url;
  document.getElementById('modalPassword').value = '';
  document.getElementById('passwordModal').classList.add('show');
  document.getElementById('modalPassword').focus();
}

function closePasswordModal() {
  pendingDownloadUrl = null;
  document.getElementById('passwordModal').classList.remove('show');
}

function submitPassword() {
  const password = document.getElementById('modalPassword').value;
  if (!password) {
    showToast('Please enter password');
    return;
  }
  if (pendingDownloadUrl) {
    const lockedUrl = `${pendingDownloadUrl}?password=${encodeURIComponent(password)}`;
    window.open(lockedUrl, '_blank');
  }
  closePasswordModal();
}

// Admin authentication functions
function toggleAdminAuth() {
  if (isAdmin) {
    logoutAdmin();
  } else {
    document.getElementById('adminPassword').value = '';
    document.getElementById('adminModal').classList.add('show');
    document.getElementById('adminPassword').focus();
  }
}

function closeAdminModal() {
  document.getElementById('adminModal').classList.remove('show');
}

async function submitAdminLogin() {
  const password = document.getElementById('adminPassword').value;
  if (!password) {
    showToast('Please enter password');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password })
    });

    if (response.ok) {
      isAdmin = true;
      showToast('Login successful');
      closeAdminModal();
      updateAdminStatus();
      loadFiles();
    } else {
      const result = await response.json();
      showToast(result.error || 'Login failed');
    }
  } catch (error) {
    showToast('Login error: ' + error.message);
  }
}

async function logoutAdmin() {
  try {
    await fetch(`${API_BASE}/api/admin/logout`, {
      method: 'POST',
      credentials: 'include'
    });
    isAdmin = false;
    showToast('Logged out');
    updateAdminStatus();
    loadFiles();
  } catch (error) {
    showToast('Logout error: ' + error.message);
  }
}

function updateAdminStatus() {
  const adminStatus = document.getElementById('adminStatus');
  const adminBtn = document.getElementById('adminBtn');
  const configTabBtn = document.getElementById('configTabBtn');

  if (isAdmin) {
    adminStatus.innerHTML = '<span class="admin-badge">👑 Admin</span>';
    adminBtn.textContent = '🚪 Logout';
    configTabBtn.style.display = 'block';
  } else {
    adminStatus.textContent = '';
    adminBtn.textContent = '🔐 Admin Login';
    configTabBtn.style.display = 'none';
  }
}

async function checkAdminStatus() {
  try {
    const response = await fetch(`${API_BASE}/api/admin/status`, {
      credentials: 'include'
    });
    const result = await response.json();
    isAdmin = result.isAdmin;
    updateAdminStatus();
  } catch (error) {
    console.error('Error checking admin status:', error);
  }
}

// Tab switching
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  if (tab === 'upload') {
    document.querySelectorAll('.tab-btn')[0].classList.add('active');
    document.getElementById('upload-tab').classList.add('active');
  } else if (tab === 'files') {
    document.querySelectorAll('.tab-btn')[1].classList.add('active');
    document.getElementById('files-tab').classList.add('active');
    loadFiles();
  } else if (tab === 'config') {
    document.querySelectorAll('.tab-btn')[2].classList.add('active');
    document.getElementById('config-tab').classList.add('active');
    loadConfig();
  } else if (tab === 'docs') {
    document.querySelectorAll('.tab-btn')[3].classList.add('active');
    document.getElementById('docs-tab').classList.add('active');
  } else if (tab === 'agent') {
    document.querySelectorAll('.tab-btn')[4].classList.add('active');
    document.getElementById('agent-tab').classList.add('active');
    loadAgentDocs();
  }
  
  // Re-initialize custom dropdowns after switching tabs
  setTimeout(initCustomDropdowns, 50);
}

// File refresh interval
let fileRefreshInterval = null;

function startFileRefresh() {
  if (fileRefreshInterval) clearInterval(fileRefreshInterval);
  fileRefreshInterval = setInterval(() => {
    const filesTab = document.getElementById('files-tab');
    if (filesTab.classList.contains('active')) {
      loadFiles();
    }
  }, 60000);
}

// Load agent documentation
async function loadAgentDocs() {
  const textarea = document.getElementById('agentContent');
  if (textarea.value) return;

  try {
    const response = await fetch('AGENT.md');
    const text = await response.text();
    textarea.value = text;
  } catch (error) {
    textarea.value = '# TETE - Transient Endpoint for Transfer & Encryption\n\nLoading failed. See AGENT.md file in repository.';
  }
}

// Config functions
async function loadConfig() {
  if (!isAdmin) {
    showToast('Admin access required');
    return;
  }
  try {
    const response = await fetch(`${API_BASE}/api/config`, {
      credentials: 'include'
    });
    const config = await response.json();
    document.getElementById('defaultExpiration').value = config.defaultExpiration.toString();
  } catch (error) {
    console.error('Error loading config:', error);
    showToast('Failed to load config');
  }
}

async function saveConfig() {
  if (!isAdmin) {
    showToast('Admin access required');
    return;
  }

  const btn = document.getElementById('saveConfigBtn');
  const expiration = document.getElementById('defaultExpiration').value;

  btn.disabled = true;
  btn.innerHTML = '<span class="loading"></span> Saving...';

  try {
    console.log('Saving config:', expiration);
    
    const response = await fetch(`${API_BASE}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Important: send cookies
      body: JSON.stringify({ defaultExpiration: parseInt(expiration) })
    });

    console.log('Response status:', response.status);
    const result = await response.json();
    console.log('Response:', result);

    if (response.ok) {
      showToast('Configuration saved');
    } else {
      showToast(result.error || 'Failed to save config');
      // If admin access required, check admin status
      if (result.error === 'Admin access required') {
        console.log('Checking admin status...');
        const statusResponse = await fetch(`${API_BASE}/api/admin/status`, {
          credentials: 'include'
        });
        const status = await statusResponse.json();
        console.log('Admin status:', status);
        if (!status.isAdmin) {
          showToast('Session expired, please login again');
          isAdmin = false;
          updateAdminStatus();
        }
      }
    }
  } catch (error) {
    console.error('Error saving config:', error);
    showToast('Failed to save config');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Configuration';
  }
}

// Change password function
async function changePassword() {
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (!currentPassword || !newPassword || !confirmPassword) {
    showToast('All fields are required');
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast('New passwords do not match');
    return;
  }

  if (newPassword.length < 4) {
    showToast('Password must be at least 4 characters');
    return;
  }

  const btn = document.getElementById('changePasswordBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading"></span> Changing...';

  try {
    const verifyResponse = await fetch(`${API_BASE}/api/admin/verify-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password: currentPassword })
    });

    if (!verifyResponse.ok) {
      showToast('Current password is incorrect');
      btn.disabled = false;
      btn.textContent = 'Change Password';
      return;
    }

    const response = await fetch(`${API_BASE}/api/admin/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ newPassword })
    });

    if (response.ok) {
      showToast('Password changed successfully');
      document.getElementById('currentPassword').value = '';
      document.getElementById('newPassword').value = '';
      document.getElementById('confirmPassword').value = '';
    } else {
      const result = await response.json();
      showToast(result.error || 'Failed to change password');
    }
  } catch (error) {
    console.error('Error changing password:', error);
    showToast('Failed to change password');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Change Password';
  }
}

// Copy agent docs
function copyAgentDocs() {
  const textarea = document.getElementById('agentContent');
  if (!textarea.value) {
    showToast('Loading documentation...');
    loadAgentDocs();
    setTimeout(() => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textarea.value).then(() => {
          showToast('Agent documentation copied');
        });
      }
    }, 500);
  } else {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textarea.value).then(() => {
        showToast('Agent documentation copied');
      });
    } else {
      fallbackCopy(textarea.value);
    }
  }
}

function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  showToast('Copied to clipboard');
}

// Dropdown functions
document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown')) {
    closeAllDropdowns();
  }
});

function closeAllDropdowns() {
  document.querySelectorAll('.dropdown-menu').forEach(menu => {
    menu.classList.remove('show');
  });
  openDropdown = null;
}

function toggleDropdown(id) {
  const menu = document.getElementById(id);
  if (openDropdown && openDropdown !== menu) {
    closeAllDropdowns();
  }
  menu.classList.toggle('show');
  openDropdown = menu.classList.contains('show') ? menu : null;
}

// Drag and drop
const dropZone = document.getElementById('dropZone');

if (dropZone) {
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFilesSelected(e.dataTransfer.files);
  });
}

// File handling
function handleFilesSelected(files) {
  selectedFiles = Array.from(files);
  const container = document.getElementById('selectedFiles');

  if (selectedFiles.length > 0) {
    container.innerHTML = selectedFiles.map(f =>
      `<div class="selected-file">
        <span class="selected-file-name">${f.name}</span>
        <span class="selected-file-size">${formatSize(f.size)}</span>
      </div>`
    ).join('');
    document.getElementById('uploadBtn').disabled = false;
  } else {
    container.innerHTML = '';
    document.getElementById('uploadBtn').disabled = true;
  }
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatExpiration(expiresAt) {
  if (!expiresAt) return 'No expiration';
  const expires = new Date(expiresAt);
  const now = new Date();
  const diff = expires - now;

  if (diff <= 0) return 'Expired';

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `Expires in ${days} day${days > 1 ? 's' : ''}`;
  } else if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `Expires in ${hours}h ${remainingMinutes}m`;
  } else {
    return `Expires in ${minutes}m`;
  }
}

// Upload files
async function uploadFiles() {
  if (selectedFiles.length === 0) return;

  const btn = document.getElementById('uploadBtn');
  const resultDiv = document.getElementById('uploadResult');
  const password = document.getElementById('uploadPassword').value;
  const expiration = document.getElementById('uploadExpiration').value;

  btn.disabled = true;
  btn.innerHTML = '<span class="loading"></span> Uploading...';
  resultDiv.innerHTML = '';

  const formData = new FormData();
  selectedFiles.forEach(file => {
    formData.append('files', file);
  });
  if (password) {
    formData.append('password', password);
  }
  if (expiration) {
    formData.append('expiration', expiration);
  }

  try {
    const response = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (response.ok) {
      const results = Array.isArray(result) ? result : [result];
      resultDiv.innerHTML = `
        <div class="result-box">
          <h3>✅ Upload Successful</h3>
          ${results.map(r => `
            <div class="result-link">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <strong>${r.originalName} ${r.locked ? '🔒' : ''}</strong>
                <div class="dropdown">
                  <button class="btn btn-ghost btn-sm" onclick="toggleDropdown('result-menu-${r.id}')">
                    ⋮
                  </button>
                  <div id="result-menu-${r.id}" class="dropdown-menu">
                    <button class="dropdown-item" onclick="copyDownloadLink('${r.downloadUrl}', ${r.locked})">
                      <span class="dropdown-icon">🔗</span>
                      Copy Download Link
                    </button>
                    <button class="dropdown-item" onclick="copyDetails('${r.id}', '${r.originalName.replace(/'/g, "\\'")}', '${r.mimeType}', ${r.size}, '${r.uploadedAt}')">
                      <span class="dropdown-icon">📋</span>
                      Copy Details
                    </button>
                    <a href="${r.downloadUrl}" target="_blank" class="dropdown-item">
                      <span class="dropdown-icon">⬇</span>
                      Download
                    </a>
                    <a href="${r.url}" target="_blank" class="dropdown-item">
                      <span class="dropdown-icon">👁</span>
                      View Info
                    </a>
                    <button class="dropdown-item danger" onclick="deleteFile('${r.id}')">
                      <span class="dropdown-icon">🗑</span>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
              <code>${r.url}</code>
            </div>
          `).join('')}
        </div>
      `;
      selectedFiles = [];
      document.getElementById('selectedFiles').innerHTML = '';
      document.getElementById('uploadBtn').disabled = true;
      showToast('Files uploaded successfully');
    } else {
      resultDiv.innerHTML = `<div class="result-box" style="background: #fef2f2; border-color: #fecaca;">
        <h3>❌ Upload Failed</h3>
        <p>${result.message || 'Unknown error'}</p>
      </div>`;
    }
  } catch (error) {
    resultDiv.innerHTML = `<div class="result-box" style="background: #fef2f2; border-color: #fecaca;">
      <h3>❌ Upload Failed</h3>
      <p>${error.message}</p>
    </div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Upload Files';
  }
}

// Upload text
async function uploadText() {
  const text = document.getElementById('textContent').value;
  const filename = document.getElementById('filename').value;
  const password = document.getElementById('textPassword').value;
  const expiration = document.getElementById('textExpiration').value;
  const btn = document.getElementById('uploadTextBtn');
  const resultDiv = document.getElementById('uploadResult');

  if (!text.trim()) {
    showToast('Please enter some text');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="loading"></span> Uploading...';
  resultDiv.innerHTML = '';

  try {
    const response = await fetch(`${API_BASE}/api/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, filename, password, expiration })
    });

    const result = await response.json();

    if (response.ok) {
      resultDiv.innerHTML = `
        <div class="result-box">
          <h3>✅ Upload Successful</h3>
          <div class="result-link">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <strong>${result.originalName} ${result.locked ? '🔒' : ''}</strong>
              <div class="dropdown">
                <button class="btn btn-ghost btn-sm" onclick="toggleDropdown('result-menu-${result.id}')">
                  ⋮
                </button>
                <div id="result-menu-${result.id}" class="dropdown-menu">
                  <button class="dropdown-item" onclick="copyDownloadLink('${result.downloadUrl}', ${result.locked})">
                    <span class="dropdown-icon">🔗</span>
                    Copy Download Link
                  </button>
                  <button class="dropdown-item" onclick="copyDetails('${result.id}', '${result.originalName.replace(/'/g, "\\'")}', '${result.mimeType}', ${result.size}, '${result.uploadedAt}')">
                    <span class="dropdown-icon">📋</span>
                    Copy Details
                  </button>
                  <a href="${result.downloadUrl}" target="_blank" class="dropdown-item">
                    <span class="dropdown-icon">⬇</span>
                    Download
                  </a>
                  <a href="${result.url}" target="_blank" class="dropdown-item">
                    <span class="dropdown-icon">👁</span>
                    View Info
                  </a>
                  <button class="dropdown-item danger" onclick="deleteFile('${result.id}')">
                    <span class="dropdown-icon">🗑</span>
                    Delete
                  </button>
                </div>
              </div>
            </div>
            <code>${result.url}</code>
          </div>
        </div>
      `;
      document.getElementById('textContent').value = '';
      document.getElementById('filename').value = '';
      document.getElementById('textPassword').value = '';
      document.getElementById('textExpiration').value = '';
      showToast('Text uploaded successfully');
    } else {
      resultDiv.innerHTML = `<div class="result-box" style="background: #fef2f2; border-color: #fecaca;">
        <h3>❌ Upload Failed</h3>
        <p>${result.message || 'Unknown error'}</p>
      </div>`;
    }
  } catch (error) {
    resultDiv.innerHTML = `<div class="result-box" style="background: #fef2f2; border-color: #fecaca;">
      <h3>❌ Upload Failed</h3>
      <p>${error.message}</p>
    </div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Upload Text';
  }
}

// Copy download link
function copyDownloadLink(url, isLocked) {
  if (isLocked) {
    showToast('Locked file - share with password query param');
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showToast('Download link copied');
    });
  } else {
    fallbackCopy(url);
  }
}

// Copy file details
function copyDetails(id, originalName, mimeType, size, uploadedAt) {
  const details = JSON.stringify({
    id,
    originalName,
    mimeType,
    size,
    uploadedAt
  }, null, 2);

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(details).then(() => {
      showToast('File details copied');
    });
  } else {
    fallbackCopy(details);
  }
}

// Load files
async function loadFiles() {
  const fileList = document.getElementById('fileList');
  fileList.innerHTML = '<li class="empty-state"><div class="empty-state-icon">🔄</div><p>Loading files...</p></li>';

  try {
    const response = await fetch(`${API_BASE}/api/files`, {
      credentials: 'include'
    });
    const files = await response.json();

    if (files.length === 0) {
      fileList.innerHTML = '<li class="empty-state"><div class="empty-state-icon">📄</div><p>No files uploaded yet</p></li>';
      return;
    }

    fileList.innerHTML = files.map(f => `
      <li class="file-item">
        <div class="file-info">
          <div class="file-name">${f.originalName} ${f.locked ? '🔒' : ''}</div>
          <div class="file-meta">${formatSize(f.size)} • Uploaded: ${new Date(f.uploadedAt).toLocaleString()} • ${formatExpiration(f.expiresAt)}</div>
        </div>
        <div class="dropdown">
          <button class="btn btn-ghost btn-sm" onclick="toggleDropdown('file-menu-${f.id}')">
            ⋮
          </button>
          <div id="file-menu-${f.id}" class="dropdown-menu">
            <button class="dropdown-item" onclick="copyDownloadLink('${f.downloadUrl}', ${f.locked})">
              <span class="dropdown-icon">🔗</span>
              Copy Download Link
            </button>
            <button class="dropdown-item" onclick="copyDetails('${f.id}', '${f.originalName.replace(/'/g, "\\'")}', '${f.mimeType}', ${f.size}, '${f.uploadedAt}')">
              <span class="dropdown-icon">📋</span>
              Copy Details
            </button>
            <a href="${f.downloadUrl}" target="_blank" class="dropdown-item">
              <span class="dropdown-icon">⬇</span>
              Download
            </a>
            <a href="${f.url}" target="_blank" class="dropdown-item">
              <span class="dropdown-icon">👁</span>
              View Info
            </a>
            <button class="dropdown-item danger" onclick="deleteFile('${f.id}')">
              <span class="dropdown-icon">🗑</span>
              Delete
            </button>
          </div>
        </div>
      </li>
    `).join('');
  } catch (error) {
    fileList.innerHTML = '<li class="empty-state"><div class="empty-state-icon">❌</div><p>Failed to load files</p></li>';
    console.error('Error loading files:', error);
  }
}

// Delete file
async function deleteFile(id) {
  if (!confirm('Are you sure you want to delete this file?')) return;

  try {
    const response = await fetch(`${API_BASE}/file/${id}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      showToast('File deleted successfully');
      loadFiles();
    } else {
      const result = await response.json();
      showToast(result.error || 'Failed to delete file');
    }
  } catch (error) {
    showToast('Delete error: ' + error.message);
  }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.getElementById('passwordModal').classList.contains('show')) {
    submitPassword();
  }
  if (e.key === 'Enter' && document.getElementById('adminModal').classList.contains('show')) {
    submitAdminLogin();
  }
  if (e.key === 'Escape') {
    closePasswordModal();
    closeAdminModal();
    closeAllDropdowns();
  }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  checkAdminStatus();
  startFileRefresh();
  
  // Initialize custom dropdowns
  setTimeout(initCustomDropdowns, 100);
});
