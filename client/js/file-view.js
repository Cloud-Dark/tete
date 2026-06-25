// File View Page JavaScript

const API_BASE = window.location.origin;
let currentFileId = null;
let currentFileMetadata = null;

// Get file ID from URL path
function getFileIdFromPath() {
  const path = window.location.pathname;
  const match = path.match(/\/file\/([a-f0-9]+)/i);
  return match ? match[1] : null;
}

// Show toast notification
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show ' + type;
  
  setTimeout(() => {
    toast.className = 'toast';
  }, 3000);
}

// Format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format date
function formatDate(dateString) {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  return date.toLocaleString();
}

// Get file icon based on file type
function getFileIcon(mimeType, filename) {
  const ext = filename ? filename.split('.').pop().toLowerCase() : '';
  
  const extIcons = {
    'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'svg': '🖼️', 'webp': '🖼️',
    'mp4': '🎥', 'avi': '🎥', 'mov': '🎥', 'mkv': '🎥',
    'mp3': '🎵', 'wav': '🎵', 'ogg': '🎵', 'flac': '🎵',
    'pdf': '📄',
    'zip': '📦', 'rar': '📦', '7z': '📦', 'tar': '📦', 'gz': '📦',
    'txt': '📝', 'md': '📝',
    'js': '📜', 'ts': '📜',
    'py': '🐍',
    'java': '☕',
    'doc': '📝', 'docx': '📝',
    'xls': '📊', 'xlsx': '📊',
    'ppt': '📽️', 'pptx': '📽️',
    'exe': '⚙️', 'msi': '⚙️',
    'enc': '🔐'
  };
  
  if (extIcons[ext]) return extIcons[ext];
  
  if (mimeType && mimeType.includes('image')) return '🖼️';
  if (mimeType && mimeType.includes('video')) return '🎥';
  if (mimeType && mimeType.includes('audio')) return '🎵';
  
  return '📄';
}

// Load file information
async function loadFileInfo() {
  const loadingState = document.getElementById('loadingState');
  const fileInfo = document.getElementById('fileInfo');
  const errorState = document.getElementById('errorState');
  
  try {
    loadingState.style.display = 'block';
    fileInfo.style.display = 'none';
    errorState.style.display = 'none';
    
    const response = await fetch(`${API_BASE}/file/${currentFileId}`, {
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error('File not found');
    }
    
    const data = await response.json();
    currentFileMetadata = data;
    
    // Update UI
    document.title = `${data.originalName} - TETE`;
    document.getElementById('fileName').textContent = data.originalName;
    document.getElementById('fileId').textContent = `ID: ${data.id}`;
    document.getElementById('fileSize').textContent = formatFileSize(data.size);
    document.getElementById('uploadDate').textContent = formatDate(data.uploadedAt);
    
    // Expiry
    const expiryEl = document.getElementById('expiryDate');
    if (data.expiresAt) {
      const expiresAt = new Date(data.expiresAt);
      const now = new Date();
      if (expiresAt < now) {
        expiryEl.textContent = 'Expired';
        expiryEl.style.color = '#dc3545';
      } else {
        expiryEl.textContent = formatDate(data.expiresAt);
      }
    } else {
      expiryEl.textContent = 'Never';
    }
    
    // Status
    const statusEl = document.getElementById('fileStatus');
    if (data.locked || data.encrypted) {
      statusEl.textContent = '🔒 Locked';
      statusEl.style.color = '#dc3545';
    } else {
      statusEl.textContent = '🔓 Unlocked';
      statusEl.style.color = '#22c55e';
    }
    
    // File icon
    document.getElementById('fileIcon').textContent = getFileIcon(data.mimeType, data.originalName);
    
    // Show file info
    loadingState.style.display = 'none';
    fileInfo.style.display = 'block';
    
  } catch (error) {
    console.error('Error loading file info:', error);
    loadingState.style.display = 'none';
    errorState.style.display = 'block';
  }
}

// Handle download button click
function handleDownload() {
  if (!currentFileMetadata) return;
  
  if (currentFileMetadata.locked || currentFileMetadata.encrypted) {
    showPasswordModal();
  } else {
    downloadFile();
  }
}

// Show password modal
function showPasswordModal() {
  const modal = document.getElementById('passwordModal');
  modal.classList.add('show');
  document.getElementById('modalPassword').value = '';
  document.getElementById('modalPassword').focus();
}

// Close password modal
function closePasswordModal() {
  const modal = document.getElementById('passwordModal');
  modal.classList.remove('show');
}

// Handle password input keypress
function handlePasswordKeypress(event) {
  if (event.key === 'Enter') {
    submitPassword();
  }
}

// Submit password and download
async function submitPassword() {
  const password = document.getElementById('modalPassword').value;
  
  if (!password) {
    showToast('Please enter the encryption key', 'error');
    return;
  }
  
  closePasswordModal();
  downloadFile(password);
}

// Download file with optional password
function downloadFile(password = null) {
  const downloadBtn = document.getElementById('downloadBtn');
  downloadBtn.disabled = true;
  downloadBtn.innerHTML = '<span class="loading"></span> Downloading...';
  
  let downloadUrl = `${API_BASE}/file/${currentFileId}/download`;
  if (password) {
    downloadUrl += `?password=${encodeURIComponent(password)}`;
  }
  
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = currentFileMetadata.originalName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  setTimeout(() => {
    downloadBtn.disabled = false;
    downloadBtn.innerHTML = '⬇️ Download';
  }, 2000);
  
  showToast('Download started!', 'success');
}

// Copy share link to clipboard
function copyShareLink() {
  const shareUrl = `${API_BASE}/file/${currentFileId}`;
  
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareUrl)
      .then(() => showToast('Link copied!', 'success'))
      .catch(() => fallbackCopyLink(shareUrl));
  } else {
    fallbackCopyLink(shareUrl);
  }
}

// Fallback copy method
function fallbackCopyLink(url) {
  const textarea = document.createElement('textarea');
  textarea.value = url;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  
  try {
    document.execCommand('copy');
    showToast('Link copied!', 'success');
  } catch (err) {
    showToast('Failed to copy link', 'error');
  }
  
  document.body.removeChild(textarea);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  currentFileId = getFileIdFromPath();
  
  if (!currentFileId) {
    showToast('Invalid file URL', 'error');
    document.getElementById('errorState').style.display = 'block';
    document.getElementById('loadingState').style.display = 'none';
    return;
  }
  
  loadFileInfo();
});
