const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const session = require('express-session');

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

// Admin password (change this in production!)
const ADMIN_PASSWORD = 'admin123';
const ADMIN_PASSWORD_HASH = hashPassword(ADMIN_PASSWORD);

// Config storage
const CONFIG_FILE = path.join(__dirname, '../db/config.json');
let appConfig = {
  defaultExpiration: 3600000, // Default 1 hour in milliseconds
  adminPasswordHash: hashPassword('admin123'),
  sessionSecret: null, // Will be set on first run
  maxFileSize: 100 * 1024 * 1024, // Default 100MB in bytes
  maxFilesPerUpload: 100, // Default max files per upload
  fileWhitelist: [] // Empty = allow all extensions, e.g. ['jpg','png','pdf','txt']
};

// Load config from file
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const savedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      appConfig = { ...appConfig, ...savedConfig };

      // Generate session secret if not exists
      if (!appConfig.sessionSecret) {
        appConfig.sessionSecret = crypto.randomBytes(32).toString('hex');
        saveConfig();
      }
    } else {
      // First run - generate session secret
      appConfig.sessionSecret = crypto.randomBytes(32).toString('hex');
    }
  } catch (error) {
    console.error('Error loading config:', error);
    appConfig.sessionSecret = crypto.randomBytes(32).toString('hex');
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

// Load config from file (returns fresh copy)
function loadConfigFromFile() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
  return { ...appConfig };
}

// Save config to file (full replace)
function saveConfigToFile(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    appConfig = config;
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

// Generate user ID (for cookie-based tracking)
function generateUserId() {
  return crypto.randomBytes(16).toString('hex');
}

// Hash password
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// ============================================
// FULL ENCRYPTION IMPLEMENTATION (AES-256-GCM)
// ============================================

// Generate a random encryption key (32 bytes for AES-256)
function generateEncryptionKey() {
  return crypto.randomBytes(32);
}

// Derive encryption key from password using PBKDF2
function deriveKeyFromPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
}

// Encrypt data using AES-256-GCM
// Returns: { encryptedData, iv, authTag }
function encryptData(data, key) {
  const iv = crypto.randomBytes(12); // 12 bytes for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted;
  if (Buffer.isBuffer(data)) {
    encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  } else {
    encrypted = Buffer.concat([cipher.update(Buffer.from(data, 'utf8')), cipher.final()]);
  }
  
  const authTag = cipher.getAuthTag();
  
  return {
    encryptedData: encrypted,
    iv: iv,
    authTag: authTag
  };
}

// Decrypt data using AES-256-GCM
function decryptData(encryptedData, iv, authTag, key) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
  return decrypted;
}

// Encrypt file content and metadata
function encryptFileContent(content, key) {
  const result = encryptData(content, key);
  return {
    encryptedContent: result.encryptedData,
    iv: result.iv,
    authTag: result.authTag
  };
}

// Decrypt file content
function decryptFileContent(encryptedContent, iv, authTag, key) {
  return decryptData(encryptedContent, iv, authTag, key);
}

// Encrypt filename
function encryptFilename(filename, key) {
  const result = encryptData(filename, key);
  return {
    encryptedFilename: result.encryptedData.toString('base64'),
    iv: result.iv.toString('base64'),
    authTag: result.authTag.toString('base64')
  };
}

// Decrypt filename
function decryptFilename(encryptedFilenameB64, ivB64, authTagB64, key) {
  const encryptedFilename = Buffer.from(encryptedFilenameB64, 'base64');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  
  const decrypted = decryptData(encryptedFilename, iv, authTag, key);
  return decrypted.toString('utf8');
}

// Wrap encryption key with password (encrypt key with password-derived key)
function wrapEncryptionKey(encryptionKey, password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = deriveKeyFromPassword(password, salt);
  const wrapped = encryptData(encryptionKey, derivedKey);
  
  return {
    wrappedKey: wrapped.encryptedData.toString('base64'),
    keyIv: wrapped.iv.toString('base64'),
    keyAuthTag: wrapped.authTag.toString('base64'),
    salt: salt.toString('base64')
  };
}

// Unwrap encryption key with password
function unwrapEncryptionKey(wrappedKeyB64, keyIvB64, keyAuthTagB64, saltB64, password) {
  const wrappedKey = Buffer.from(wrappedKeyB64, 'base64');
  const keyIv = Buffer.from(keyIvB64, 'base64');
  const keyAuthTag = Buffer.from(keyAuthTagB64, 'base64');
  const salt = Buffer.from(saltB64, 'base64');
  
  const derivedKey = deriveKeyFromPassword(password, salt);
  const unwrapped = decryptData(wrappedKey, keyIv, keyAuthTag, derivedKey);
  
  return unwrapped;
}

// Load config on startup
loadConfig();

console.log('Session secret loaded:', appConfig.sessionSecret ? appConfig.sessionSecret.substring(0, 8) + '...' : 'not set');

// Middleware - CORS must be first
app.use(cors({
  origin: true, // Accept all origins
  credentials: true, // Allow cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Add credentials header to all responses
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});

app.use(cookieParser());
app.use(session({
  secret: appConfig.sessionSecret,
  resave: true, // Important: resave to keep session alive
  saveUninitialized: true,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  }
}));

app.use(express.json());
app.use(express.text());

// Middleware to assign user ID cookie if not exists
app.use((req, res, next) => {
  if (!req.cookies.userId) {
    const userId = generateUserId();
    res.cookie('userId', userId, { 
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      sameSite: 'lax'
    });
    req.userId = userId;
  } else {
    req.userId = req.cookies.userId;
  }
  next();
});

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

// File filter for extension whitelist
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase().substring(1);
  
  // If whitelist is empty, allow all
  if (!appConfig.fileWhitelist || appConfig.fileWhitelist.length === 0) {
    return cb(null, true);
  }
  
  // Check if extension is in whitelist
  if (appConfig.fileWhitelist.includes(ext)) {
    return cb(null, true);
  } else {
    return cb(new Error(`File extension .${ext} is not allowed. Allowed: ${appConfig.fileWhitelist.join(', ')}`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { 
    fileSize: appConfig.maxFileSize,
    files: appConfig.maxFilesPerUpload
  }
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
app.post('/api/upload', upload.array('files', appConfig.maxFilesPerUpload), (req, res) => {
  try {
    const files = req.files || [];
    const password = req.body.password;
    const expiration = req.body.expiration ? parseInt(req.body.expiration) : null;
    const userId = req.userId;
    const results = [];

    files.forEach(file => {
      const id = generateShortId();
      const filePath = path.join(UPLOADS_DIR, file.filename);
      const fileContent = fs.readFileSync(filePath);
      const stats = fs.statSync(filePath);

      const expTime = expiration !== null ? expiration : appConfig.defaultExpiration;
      
      // Base metadata
      const metadata = {
        id,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: stats.size,
        uploadedAt: new Date().toISOString(),
        expiresAt: expTime ? Date.now() + expTime : null,
        locked: !!password,
        passwordHash: password ? hashPassword(password) : null,
        userId: userId
      };

      // If password is set, encrypt the file content and filename
      if (password) {
        const encryptionKey = generateEncryptionKey();

        // Encrypt file content
        const encrypted = encryptFileContent(fileContent, encryptionKey);

        // Encrypt original filename (not the generated ID)
        const encryptedFilenameData = encryptFilename(file.originalname, encryptionKey);

        // Wrap encryption key with password
        const wrappedKeyData = wrapEncryptionKey(encryptionKey, password);

        // Save encrypted content to file
        const encryptedFilePath = path.join(UPLOADS_DIR, `${id}.enc`);
        fs.writeFileSync(encryptedFilePath, encrypted.encryptedContent);

        // Delete original unencrypted file
        fs.unlinkSync(filePath);

        // Update metadata with encryption info
        metadata.filename = `${id}.enc`;
        metadata.encrypted = true;
        metadata.encryption = {
          iv: encrypted.iv.toString('base64'),
          authTag: encrypted.authTag.toString('base64'),
          encryptedFilename: encryptedFilenameData.encryptedFilename,
          filenameIv: encryptedFilenameData.iv,
          filenameAuthTag: encryptedFilenameData.authTag,
          wrappedKey: wrappedKeyData.wrappedKey,
          keyIv: wrappedKeyData.keyIv,
          keyAuthTag: wrappedKeyData.keyAuthTag,
          salt: wrappedKeyData.salt
        };
      }

      saveFileMetadata(id, metadata);

      const baseUrl = getBaseUrl(req);
      results.push({
        id,
        url: `${baseUrl}/file/${id}`,
        downloadUrl: `${baseUrl}/file/${id}/download`,
        deleteUrl: `${baseUrl}/file/${id}`,
        locked: !!password,
        encrypted: !!password,
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
    const userId = req.userId;

    if (!text) {
      return res.status(400).json({ error: 'Text content is required' });
    }

    const id = generateShortId();
    const fileName = `${id}.txt`;
    const filePath = path.join(UPLOADS_DIR, fileName);

    const expTime = expiration !== undefined && expiration !== '' ? parseInt(expiration) : appConfig.defaultExpiration;
    
    // Base metadata
    const metadata = {
      id,
      originalName: filename || `${id}.txt`,
      mimeType: 'text/plain',
      size: Buffer.byteLength(text, 'utf8'),
      uploadedAt: new Date().toISOString(),
      expiresAt: expTime ? Date.now() + expTime : null,
      locked: !!password,
      passwordHash: password ? hashPassword(password) : null,
      userId: userId
    };

    // If password is set, encrypt the content and filename
    if (password) {
      const encryptionKey = generateEncryptionKey();
      const fileContent = Buffer.from(text, 'utf8');

      // Encrypt file content
      const encrypted = encryptFileContent(fileContent, encryptionKey);

      // Encrypt original filename (from metadata)
      const encryptedFilenameData = encryptFilename(metadata.originalName, encryptionKey);

      // Wrap encryption key with password
      const wrappedKeyData = wrapEncryptionKey(encryptionKey, password);

      // Save encrypted content to file
      const encryptedFilePath = path.join(UPLOADS_DIR, `${id}.enc`);
      fs.writeFileSync(encryptedFilePath, encrypted.encryptedContent);

      // Update metadata with encryption info
      metadata.filename = `${id}.enc`;
      metadata.encrypted = true;
      metadata.encryption = {
        iv: encrypted.iv.toString('base64'),
        authTag: encrypted.authTag.toString('base64'),
        encryptedFilename: encryptedFilenameData.encryptedFilename,
        filenameIv: encryptedFilenameData.iv,
        filenameAuthTag: encryptedFilenameData.authTag,
        wrappedKey: wrappedKeyData.wrappedKey,
        keyIv: wrappedKeyData.keyIv,
        keyAuthTag: wrappedKeyData.keyAuthTag,
        salt: wrappedKeyData.salt
      };
    } else {
      // No password - save unencrypted
      fs.writeFileSync(filePath, text, 'utf-8');
    }

    saveFileMetadata(id, metadata);

    const baseUrl = getBaseUrl(req);
    const result = {
      id,
      url: `${baseUrl}/file/${id}`,
      downloadUrl: `${baseUrl}/file/${id}/download`,
      deleteUrl: `${baseUrl}/file/${id}`,
      locked: !!password,
      encrypted: !!password,
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
    const userId = req.userId;
    const id = generateShortId();
    const filePath = path.join(UPLOADS_DIR, req.file.filename);
    const fileContent = fs.readFileSync(filePath);
    const stats = fs.statSync(filePath);

    const expTime = expiration !== null ? expiration : appConfig.defaultExpiration;
    
    // Base metadata
    const metadata = {
      id,
      originalName: req.uploadedOriginalName || req.file.originalname,
      mimeType: req.file.mimetype,
      size: stats.size,
      uploadedAt: new Date().toISOString(),
      expiresAt: expTime ? Date.now() + expTime : null,
      locked: !!password,
      passwordHash: password ? hashPassword(password) : null,
      userId: userId
    };

    // If password is set, encrypt the file content and filename
    if (password) {
      const encryptionKey = generateEncryptionKey();

      // Encrypt file content
      const encrypted = encryptFileContent(fileContent, encryptionKey);

      // Encrypt original filename (not the generated ID)
      const encryptedFilenameData = encryptFilename(req.uploadedOriginalName || req.file.originalname, encryptionKey);

      // Wrap encryption key with password
      const wrappedKeyData = wrapEncryptionKey(encryptionKey, password);

      // Save encrypted content to file
      const encryptedFilePath = path.join(UPLOADS_DIR, `${id}.enc`);
      fs.writeFileSync(encryptedFilePath, encrypted.encryptedContent);

      // Delete original unencrypted file
      fs.unlinkSync(filePath);

      // Update metadata with encryption info
      metadata.filename = `${id}.enc`;
      metadata.encrypted = true;
      metadata.encryption = {
        iv: encrypted.iv.toString('base64'),
        authTag: encrypted.authTag.toString('base64'),
        encryptedFilename: encryptedFilenameData.encryptedFilename,
        filenameIv: encryptedFilenameData.iv,
        filenameAuthTag: encryptedFilenameData.authTag,
        wrappedKey: wrappedKeyData.wrappedKey,
        keyIv: wrappedKeyData.keyIv,
        keyAuthTag: wrappedKeyData.keyAuthTag,
        salt: wrappedKeyData.salt
      };
    }

    saveFileMetadata(id, metadata);

    const baseUrl = getBaseUrl(req);
    const result = {
      id,
      url: `${baseUrl}/file/${id}`,
      downloadUrl: `${baseUrl}/file/${id}/download`,
      deleteUrl: `${baseUrl}/file/${id}`,
      locked: !!password,
      encrypted: !!password,
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
    encrypted: metadata.encrypted || false,
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

  const password = req.query.password;
  const filePath = path.join(UPLOADS_DIR, metadata.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }

  // If file is encrypted, decrypt it before sending
  if (metadata.encrypted && metadata.encryption) {
    // For encrypted files, verify password by attempting to unwrap key
    if (!password) {
      return res.status(401).json({ error: 'Encryption key required' });
    }
    
    try {
      // Unwrap encryption key with password
      const encryptionKey = unwrapEncryptionKey(
        metadata.encryption.wrappedKey,
        metadata.encryption.keyIv,
        metadata.encryption.keyAuthTag,
        metadata.encryption.salt,
        password
      );

      // Read encrypted file content
      const encryptedContent = fs.readFileSync(filePath);

      // Decrypt file content
      const iv = Buffer.from(metadata.encryption.iv, 'base64');
      const authTag = Buffer.from(metadata.encryption.authTag, 'base64');
      const decryptedContent = decryptFileContent(encryptedContent, iv, authTag, encryptionKey);

      // Decrypt original filename for Content-Disposition header
      let downloadFilename = metadata.originalName;
      try {
        downloadFilename = decryptFilename(
          metadata.encryption.encryptedFilename,
          metadata.encryption.filenameIv,
          metadata.encryption.filenameAuthTag,
          encryptionKey
        );
      } catch (e) {
        console.log('Filename decryption failed, using originalName:', e.message);
      }

      res.setHeader('Content-Type', metadata.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
      res.setHeader('Content-Length', decryptedContent.length);

      res.send(decryptedContent);
    } catch (error) {
      // Wrong password - unwrap/decrypt failed
      console.log('Decryption failed:', error.message);
      return res.status(401).json({ error: 'Invalid encryption key' });
    }
  } else {
    // File is not encrypted - check password for locked files
    if (metadata.locked) {
      if (!password || hashPassword(password) !== metadata.passwordHash) {
        return res.status(401).json({ error: 'Password required' });
      }
    }

    res.setHeader('Content-Type', metadata.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${metadata.originalName}"`);
    res.setHeader('Content-Length', metadata.size);

    res.sendFile(filePath);
  }
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

// API: List all files (filtered by user for non-admin, all files for admin)
app.get('/api/files', (req, res) => {
  const baseUrl = getBaseUrl(req);
  const isAdmin = req.session && req.session.isAdmin;
  const userId = req.userId;
  
  let files = Array.from(fileMetadata.values());
  
  // Filter by userId if not admin
  if (!isAdmin) {
    files = files.filter(f => f.userId === userId);
  }
  
  const result = files.map(metadata => ({
    id: metadata.id,
    originalName: metadata.originalName,
    mimeType: metadata.mimeType,
    size: metadata.size,
    uploadedAt: metadata.uploadedAt,
    expiresAt: metadata.expiresAt,
    locked: metadata.locked || false,
    encrypted: metadata.encrypted || false,
    url: `${baseUrl}/file/${metadata.id}`,
    downloadUrl: `${baseUrl}/file/${metadata.id}/download`,
    deleteUrl: `${baseUrl}/file/${metadata.id}`
  }));

  res.json(result);
});

// API: Admin login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  const config = loadConfigFromFile();
  const hashedPassword = hashPassword(password);

  if (hashedPassword === config.adminPasswordHash) {
    req.session.isAdmin = true;
    console.log('Admin login - session set:', {
      sessionId: req.sessionID,
      isAdmin: req.session.isAdmin,
      keys: Object.keys(req.session)
    });
    res.json({ success: true, message: 'Login successful' });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// API: Admin logout
app.post('/api/admin/logout', (req, res) => {
  if (req.session) {
    req.session.isAdmin = false;
  }
  res.json({ success: true, message: 'Logout successful' });
});

// API: Check admin status
app.get('/api/admin/status', (req, res) => {
  console.log('Admin status check:', {
    sessionId: req.sessionID,
    hasSession: !!req.session,
    isAdmin: req.session?.isAdmin,
    keys: req.session ? Object.keys(req.session) : []
  });
  res.json({
    isAdmin: req.session && req.session.isAdmin ? true : false
  });
});

// API: Verify current password (admin only)
app.post('/api/admin/verify-password', (req, res) => {
  const isAdmin = req.session && req.session.isAdmin;
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  const hashedPassword = hashPassword(password);
  const config = loadConfigFromFile();
  
  if (hashedPassword === config.adminPasswordHash) {
    res.json({ success: true, message: 'Password verified' });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// API: Change admin password (admin only)
app.post('/api/admin/change-password', (req, res) => {
  const isAdmin = req.session && req.session.isAdmin;
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  const config = loadConfigFromFile();
  config.adminPasswordHash = hashPassword(newPassword);
  saveConfigToFile(config);

  res.json({ success: true, message: 'Password changed successfully' });
});

// API: Get config (admin only)
app.get('/api/config', (req, res) => {
  const isAdmin = req.session && req.session.isAdmin;
  console.log('GET /api/config:', {
    sessionId: req.sessionID,
    hasSession: !!req.session,
    isAdmin: isAdmin,
    keys: req.session ? Object.keys(req.session) : []
  });
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  res.json({
    defaultExpiration: appConfig.defaultExpiration,
    maxFileSize: appConfig.maxFileSize,
    maxFileSizeMB: Math.round(appConfig.maxFileSize / 1024 / 1024),
    maxFilesPerUpload: appConfig.maxFilesPerUpload,
    fileWhitelist: appConfig.fileWhitelist
  });
});

// API: Update config (admin only)
app.post('/api/config', (req, res) => {
  const session = req.session;
  const isAdmin = session && session.isAdmin;

  // Log session info for debugging
  console.log('POST /api/config:', {
    sessionId: req.sessionID,
    hasSession: !!session,
    isAdmin: isAdmin,
    sessionKeys: session ? Object.keys(session) : [],
    cookie: req.headers.cookie ? 'present' : 'missing'
  });

  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { defaultExpiration, maxFileSize, maxFilesPerUpload, fileWhitelist } = req.body;

  if (defaultExpiration !== undefined) {
    appConfig.defaultExpiration = parseInt(defaultExpiration);
  }
  
  if (maxFileSize !== undefined) {
    // Convert MB to bytes if needed
    const sizeInBytes = parseInt(maxFileSize);
    appConfig.maxFileSize = sizeInBytes > 1000 ? sizeInBytes : sizeInBytes * 1024 * 1024;
  }
  
  if (maxFilesPerUpload !== undefined) {
    appConfig.maxFilesPerUpload = parseInt(maxFilesPerUpload);
  }
  
  if (fileWhitelist !== undefined) {
    // Parse whitelist - can be string "jpg,png" or array
    if (typeof fileWhitelist === 'string') {
      appConfig.fileWhitelist = fileWhitelist.split(',').map(ext => ext.trim().toLowerCase()).filter(ext => ext);
    } else if (Array.isArray(fileWhitelist)) {
      appConfig.fileWhitelist = fileWhitelist.map(ext => ext.toString().toLowerCase().replace('.', ''));
    } else {
      appConfig.fileWhitelist = [];
    }
  }
  
  saveConfig();

  res.json({
    defaultExpiration: appConfig.defaultExpiration,
    maxFileSize: appConfig.maxFileSize,
    maxFileSizeMB: Math.round(appConfig.maxFileSize / 1024 / 1024),
    maxFilesPerUpload: appConfig.maxFilesPerUpload,
    fileWhitelist: appConfig.fileWhitelist
  });
});

// Serve AGENT.md for AI agent documentation (BEFORE static files)
// Auto-replace {{BASE_URL}} placeholder with actual server URL
app.get('/AGENT.md', (req, res) => {
  const baseUrl = getBaseUrl(req);
  const agentPath = path.join(__dirname, '../AGENT.md');

  try {
    let content = fs.readFileSync(agentPath, 'utf-8');
    // Replace all occurrences of {{BASE_URL}} with actual base URL
    content = content.replace(/{{BASE_URL}}/g, baseUrl);
    // Also replace localhost:3232 for backward compatibility
    content = content.replace(/http:\/\/localhost:3232/g, baseUrl);
    res.setHeader('Content-Type', 'text/markdown');
    res.send(content);
  } catch (error) {
    console.error('Error serving AGENT.md:', error);
    res.status(500).send('Error loading AGENT.md');
  }
});

// Serve README.md for documentation (BEFORE static files)
// Auto-replace localhost:3232 with actual server URL
app.get('/README.md', (req, res) => {
  const baseUrl = getBaseUrl(req);
  const readmePath = path.join(__dirname, '../README.md');

  try {
    let content = fs.readFileSync(readmePath, 'utf-8');
    // Replace all occurrences of localhost:3232 with actual base URL (including in code blocks)
    content = content.replace(/http:\/\/localhost:3232/g, baseUrl);
    content = content.replace(/localhost:3232/g, baseUrl.replace('http://', ''));
    res.setHeader('Content-Type', 'text/markdown');
    res.send(content);
  } catch (error) {
    console.error('Error serving README.md:', error);
    res.status(500).send('Error loading README.md');
  }
});

// Serve README with JavaScript rendering support
app.get('/readme', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/readme.html'));
});

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));

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
