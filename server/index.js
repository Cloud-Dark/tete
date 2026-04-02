const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = 3232;
const HOST = '0.0.0.0';

// Create uploads directory
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Metadata storage (in-memory, for persistence use a database)
const fileMetadata = new Map();

// Config storage
const CONFIG_FILE = path.join(__dirname, 'config.json');
let appConfig = {
  defaultExpiration: 3600000 // Default 1 hour in milliseconds
};

// Load config from file
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const savedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      appConfig = { ...appConfig, ...savedConfig };
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
}

// Save config to file
function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(appConfig, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving config:', error);
  }
}

// Load config on startup
loadConfig();

// Auto-delete expired files
function deleteExpiredFiles() {
  const now = Date.now();
  fileMetadata.forEach((metadata, id) => {
    if (metadata.expiresAt && metadata.expiresAt <= now) {
      const filePath = path.join(UPLOADS_DIR, metadata.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      fileMetadata.delete(id);
      console.log(`Auto-deleted expired file: ${id}`);
    }
  });
}

// Check for expired files every minute
setInterval(deleteExpiredFiles, 60000);

// Generate short 6-character hex ID
function generateShortId() {
  return crypto.randomBytes(3).toString('hex');
}

// Hash password
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.text());

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueId = generateShortId();
    const ext = path.extname(file.originalname);
    req.uploadedFileName = `${uniqueId}${ext}`;
    req.uploadedOriginalName = file.originalname;
    cb(null, req.uploadedFileName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Helper function to get file metadata
function getFileMetadata(id) {
  return fileMetadata.get(id);
}

// Helper function to save file metadata
function saveFileMetadata(id, metadata) {
  fileMetadata.set(id, metadata);
}

// Helper function to delete file metadata
function deleteFileMetadata(id) {
  fileMetadata.delete(id);
}

// Helper function to get base URL
function getBaseUrl(req) {
  const host = req.get('host') || `${HOST}:${PORT}`;
  const protocol = req.protocol;
  return `${protocol}://${host}`;
}

// API: Upload files via multipart/form-data
app.post('/api/upload', upload.array('files', 100), (req, res) => {
  try {
    const files = req.files || [];
    const password = req.body.password;
    const expiration = req.body.expiration ? parseInt(req.body.expiration) : null;
    const results = [];

    files.forEach(file => {
      const id = generateShortId();
      const filePath = path.join(UPLOADS_DIR, file.filename);
      const stats = fs.statSync(filePath);

      const expTime = expiration !== null ? expiration : appConfig.defaultExpiration;
      const metadata = {
        id,
        originalName: file.originalname,
        filename: file.filename,
        mimeType: file.mimetype,
        size: stats.size,
        uploadedAt: new Date().toISOString(),
        expiresAt: expTime ? Date.now() + expTime : null,
        locked: !!password,
        passwordHash: password ? hashPassword(password) : null
      };

      saveFileMetadata(id, metadata);

      const baseUrl = getBaseUrl(req);
      results.push({
        id,
        url: `${baseUrl}/file/${id}`,
        downloadUrl: `${baseUrl}/file/${id}/download`,
        deleteUrl: `${baseUrl}/file/${id}`,
        locked: !!password,
        expiresAt: metadata.expiresAt,
        ...metadata
      });
    });

    if (results.length === 1) {
      res.json(results[0]);
    } else {
      res.json(results);
    }
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed', message: error.message });
  }
});

// API: Upload text content
app.post('/api/text', (req, res) => {
  try {
    const { text, filename, password, expiration } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text content is required' });
    }

    const id = generateShortId();
    const fileName = `${id}.txt`;
    const filePath = path.join(UPLOADS_DIR, fileName);

    fs.writeFileSync(filePath, text, 'utf-8');
    const stats = fs.statSync(filePath);

    const expTime = expiration !== undefined && expiration !== '' ? parseInt(expiration) : appConfig.defaultExpiration;
    const metadata = {
      id,
      originalName: filename || `${id}.txt`,
      filename: fileName,
      mimeType: 'text/plain',
      size: stats.size,
      uploadedAt: new Date().toISOString(),
      expiresAt: expTime ? Date.now() + expTime : null,
      locked: !!password,
      passwordHash: password ? hashPassword(password) : null
    };

    saveFileMetadata(id, metadata);

    const baseUrl = getBaseUrl(req);
    const result = {
      id,
      url: `${baseUrl}/file/${id}`,
      downloadUrl: `${baseUrl}/file/${id}/download`,
      deleteUrl: `${baseUrl}/file/${id}`,
      locked: !!password,
      expiresAt: metadata.expiresAt,
      ...metadata
    };

    res.json(result);
  } catch (error) {
    console.error('Text upload error:', error);
    res.status(500).json({ error: 'Text upload failed', message: error.message });
  }
});

// API: Upload file via binary (for curl)
app.post('/api', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const password = req.body.password;
    const expiration = req.body.expiration ? parseInt(req.body.expiration) : null;
    const id = generateShortId();
    const filePath = path.join(UPLOADS_DIR, req.file.filename);
    const stats = fs.statSync(filePath);

    const expTime = expiration !== null ? expiration : appConfig.defaultExpiration;
    const metadata = {
      id,
      originalName: req.uploadedOriginalName || req.file.originalname,
      filename: req.file.filename,
      mimeType: req.file.mimetype,
      size: stats.size,
      uploadedAt: new Date().toISOString(),
      expiresAt: expTime ? Date.now() + expTime : null,
      locked: !!password,
      passwordHash: password ? hashPassword(password) : null
    };

    saveFileMetadata(id, metadata);

    const baseUrl = getBaseUrl(req);
    const result = {
      id,
      url: `${baseUrl}/file/${id}`,
      downloadUrl: `${baseUrl}/file/${id}/download`,
      deleteUrl: `${baseUrl}/file/${id}`,
      locked: !!password,
      expiresAt: metadata.expiresAt,
      ...metadata
    };

    res.json(result);
  } catch (error) {
    console.error('API upload error:', error);
    res.status(500).json({ error: 'Upload failed', message: error.message });
  }
});

// API: Get file info
app.get('/file/:id', (req, res) => {
  const { id } = req.params;
  const metadata = getFileMetadata(id);

  if (!metadata) {
    return res.status(404).json({ error: 'File not found' });
  }

  const baseUrl = getBaseUrl(req);
  res.json({
    id: metadata.id,
    originalName: metadata.originalName,
    mimeType: metadata.mimeType,
    size: metadata.size,
    uploadedAt: metadata.uploadedAt,
    locked: metadata.locked || false,
    url: `${baseUrl}/file/${id}`,
    downloadUrl: `${baseUrl}/file/${id}/download`,
    deleteUrl: `${baseUrl}/file/${id}`
  });
});

// API: Verify password for locked file
app.post('/file/:id/verify', (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  const metadata = getFileMetadata(id);

  if (!metadata) {
    return res.status(404).json({ error: 'File not found' });
  }

  if (!metadata.locked) {
    return res.json({ success: true, message: 'File is not locked' });
  }

  if (!password) {
    return res.status(401).json({ error: 'Password required' });
  }

  const isValid = hashPassword(password) === metadata.passwordHash;
  
  if (isValid) {
    res.json({ success: true, message: 'Password correct' });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// API: Download file
app.get('/file/:id/download', (req, res) => {
  const { id } = req.params;
  const metadata = getFileMetadata(id);

  if (!metadata) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Check if file is locked
  if (metadata.locked) {
    const password = req.query.password;
    if (!password || hashPassword(password) !== metadata.passwordHash) {
      return res.status(401).json({ error: 'Password required' });
    }
  }

  const filePath = path.join(UPLOADS_DIR, metadata.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }

  res.setHeader('Content-Type', metadata.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${metadata.originalName}"`);
  res.setHeader('Content-Length', metadata.size);

  res.sendFile(filePath);
});

// API: Delete file
app.delete('/file/:id', (req, res) => {
  const { id } = req.params;
  const metadata = getFileMetadata(id);

  if (!metadata) {
    return res.status(404).json({ error: 'File not found' });
  }

  const filePath = path.join(UPLOADS_DIR, metadata.filename);
  
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  deleteFileMetadata(id);
  res.json({ success: true, message: 'File deleted successfully' });
});

// API: List all files
app.get('/api/files', (req, res) => {
  const baseUrl = getBaseUrl(req);
  const files = Array.from(fileMetadata.values()).map(metadata => ({
    id: metadata.id,
    originalName: metadata.originalName,
    mimeType: metadata.mimeType,
    size: metadata.size,
    uploadedAt: metadata.uploadedAt,
    expiresAt: metadata.expiresAt,
    url: `${baseUrl}/file/${metadata.id}`,
    downloadUrl: `${baseUrl}/file/${metadata.id}/download`,
    deleteUrl: `${baseUrl}/file/${metadata.id}`
  }));

  res.json(files);
});

// API: Get config
app.get('/api/config', (req, res) => {
  res.json({
    defaultExpiration: appConfig.defaultExpiration
  });
});

// API: Update config
app.post('/api/config', (req, res) => {
  const { defaultExpiration } = req.body;
  
  if (defaultExpiration !== undefined) {
    appConfig.defaultExpiration = parseInt(defaultExpiration);
    saveConfig();
  }
  
  res.json({
    defaultExpiration: appConfig.defaultExpiration
  });
});

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));

// Serve AGENT.md for AI agent documentation
app.get('/AGENT.md', (req, res) => {
  res.sendFile(path.join(__dirname, '../AGENT.md'));
});

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Catch-all route for API info
app.get('/api', (req, res) => {
  res.json({
    message: 'TETE - Transient Endpoint for Transfer & Encryption',
    endpoints: {
      upload: 'POST /api/upload (multipart/form-data)',
      uploadText: 'POST /api/text (JSON: { text, filename })',
      uploadSingle: 'POST /api (multipart/form-data, field: file)',
      fileInfo: 'GET /file/:id',
      download: 'GET /file/:id/download',
      delete: 'DELETE /file/:id',
      listFiles: 'GET /api/files'
    }
  });
});

app.listen(PORT, HOST, () => {
  console.log(`TETE Server running at http://${HOST}:${PORT}`);
  console.log(`API endpoints:`);
  console.log(`  POST /api/upload - Upload multiple files`);
  console.log(`  POST /api/text   - Upload text content`);
  console.log(`  POST /api        - Upload single file (curl compatible)`);
  console.log(`  GET  /file/:id   - Get file info`);
  console.log(`  GET  /file/:id/download - Download file`);
  console.log(`  DELETE /file/:id - Delete file`);
  console.log(`  GET  /api/files  - List all files`);
});
