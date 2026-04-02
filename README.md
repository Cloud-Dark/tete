# TETE - Transient Endpoint for Transfer & Encryption

> Simple, secure file sharing server with password protection. Self-hosted alternative to temp.sh.

![TETE Screenshot](https://github.com/user-attachments/assets/0f362dd3-98a3-47a5-9863-a44e96475f62)

---

## ✨ Features

### Core Features
- 📤 **File Upload** - Drag & drop or click to browse (max 100MB per file)
- 📝 **Text Upload** - Paste text content directly
- 🔐 **Full Encryption** - AES-256-GCM encryption for file content AND filename (one-way encryption)
- ⏱️ **Auto-Delete** - Configurable expiration time for files
- 📋 **File Management** - View, download, delete uploaded files
- 🔗 **Short URLs** - 6-character hex IDs (e.g., `/file/a1b2c3`)
- 📱 **Responsive UI** - Clean, minimalist design
- 🚀 **REST API** - Full API for automation
- 🛡️ **Security** - SHA-256 password hashing + AES-256-GCM file encryption

### Admin Features
- 👑 **Admin Dashboard** - View all files (not just yours)
- 🔐 **Admin Login** - Secure authentication
- 🔑 **Change Password** - Update admin password from UI
- ⚙️ **Configuration** - Set default expiration time

### User Features
- 📂 **Multi-File Upload** - Upload multiple files at once
- 🔍 **Search Dropdowns** - Easy expiration selection
- 📊 **File List** - See all your uploaded files
- 📥 **Download Locked Files** - Password modal for protected files
- 🗑️ **Quick Delete** - Delete files with confirmation

---

## 🚀 Quick Start

### Install Dependencies
```bash
npm install
```

### Start Server
```bash
npm start
```

Server runs on `http://localhost:3232`

### Run with PM2 (Production)
```bash
# Install PM2 globally
npm install -g pm2

# Start server
pm2 start server/index.js --name tete

# View logs
pm2 logs tete

# Monitor
pm2 monit

# Auto-start on boot
pm2 startup
pm2 save
```

---

## 📖 Usage

### Web Interface

1. **Open Browser**: Navigate to `http://localhost:3232`
2. **Upload Files**: 
   - Drag & drop files or click to browse
   - Optional: Set password for protection
   - Optional: Set expiration time
   - Click "Upload Files"
3. **Upload Text**:
   - Enter text content
   - Optional: Set filename
   - Optional: Set password
   - Optional: Set expiration
   - Click "Upload Text"
4. **Manage Files**:
   - Switch to "Files" tab
   - View all your uploads
   - Download, copy link, or delete

### Admin Access

1. Click "🔐 Admin Login" in header
2. Enter default password: `admin123`
3. Access admin features:
   - **Config Tab**: Set default expiration
   - **Change Password**: Update admin password
   - **View All Files**: See files from all users

> ⚠️ **Important**: Change default admin password after first login!

---

## 🔌 API Documentation

### Upload Endpoints

#### Upload Single File
```bash
curl -F "file=@myfile.txt" http://localhost:3232/api
```

#### Upload Single File (Locked)
```bash
curl -F "file=@secret.txt" -F "password=mysecret" http://localhost:3232/api
```

#### Upload Multiple Files
```bash
curl -F "files=@file1.txt" -F "files=@file2.txt" http://localhost:3232/api/upload
```

#### Upload Text
```bash
curl -H "Content-Type: application/json" \
  -d '{"text": "Hello World", "filename": "greeting.txt"}' \
  http://localhost:3232/api/text
```

#### Upload Text (Locked)
```bash
curl -H "Content-Type: application/json" \
  -d '{"text": "Secret", "password": "pass123"}' \
  http://localhost:3232/api/text
```

### Download Endpoints

#### Download Public File
```bash
curl -O http://localhost:3232/file/a1b2c3/download
```

#### Download Locked File
```bash
curl -O "http://localhost:3232/file/a1b2c3/download?password=mysecret"
```

#### Get File Info
```bash
curl http://localhost:3232/file/a1b2c3
```

### Management Endpoints

#### Delete File
```bash
curl -X DELETE http://localhost:3232/file/a1b2c3
```

#### List All Files
```bash
curl http://localhost:3232/api/files
```

#### Verify Password
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"password": "mysecret"}' \
  http://localhost:3232/file/a1b2c3/verify
```

### Admin Endpoints

#### Admin Login
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"password": "admin123"}' \
  http://localhost:3232/api/admin/login \
  -c cookies.txt
```

#### Admin Logout
```bash
curl -X POST http://localhost:3232/api/admin/logout -b cookies.txt
```

#### Check Admin Status
```bash
curl http://localhost:3232/api/admin/status -b cookies.txt
```

#### Get Configuration (Admin)
```bash
curl http://localhost:3232/api/config -b cookies.txt
```

#### Update Configuration (Admin)
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"defaultExpiration": 3600000}' \
  http://localhost:3232/api/config \
  -b cookies.txt
```

#### Change Admin Password (Admin)
```bash
# First verify current password
curl -X POST -H "Content-Type: application/json" \
  -d '{"password": "admin123"}' \
  http://localhost:3232/api/admin/verify-password \
  -b cookies.txt

# Then change password
curl -X POST -H "Content-Type: application/json" \
  -d '{"newPassword": "newpass123"}' \
  http://localhost:3232/api/admin/change-password \
  -b cookies.txt
```

---

## 📋 API Response Examples

### Upload Response
```json
{
  "id": "a1b2c3",
  "originalName": "myfile.txt",
  "filename": "a1b2c3.txt",
  "mimeType": "text/plain",
  "size": 1024,
  "uploadedAt": "2024-01-15T10:30:00.000Z",
  "expiresAt": "2024-01-15T11:30:00.000Z",
  "locked": true,
  "url": "http://localhost:3232/file/a1b2c3",
  "downloadUrl": "http://localhost:3232/file/a1b2c3/download",
  "deleteUrl": "http://localhost:3232/file/a1b2c3"
}
```

### File Info Response
```json
{
  "id": "a1b2c3",
  "originalName": "myfile.txt",
  "mimeType": "text/plain",
  "size": 1024,
  "uploadedAt": "2024-01-15T10:30:00.000Z",
  "locked": true,
  "url": "http://localhost:3232/file/a1b2c3",
  "downloadUrl": "http://localhost:3232/file/a1b2c3/download",
  "deleteUrl": "http://localhost:3232/file/a1b2c3"
}
```

### Error Response
```json
{
  "error": "Password required"
}
```

---

## ⚙️ Configuration

### Default Settings

| Setting | Value | Description |
|---------|-------|-------------|
| **Port** | 3232 | HTTP server port |
| **Host** | 0.0.0.0 | Listen on all interfaces |
| **Max File Size** | 100MB | Upload limit per file |
| **Max Files** | 100 | Files per multipart upload |
| **ID Length** | 6 chars | Hex file identifier |
| **Password Hash** | SHA-256 | Hashing algorithm |
| **Default Expiration** | 1 hour | Auto-delete time |

### Expiration Options

- **No expiration** - File never expires
- **30 minutes** - Short-term sharing
- **1 hour** - Default
- **2-12 hours** - Medium-term
- **24 hours** - 1 day
- **2 days** - 48 hours
- **7 days** - 1 week

---

## 🗂️ Project Structure

```
tete/
├── server/
│   └── index.js          # Express server (600+ lines)
├── client/
│   ├── index.html        # Web UI (280 lines)
│   ├── css/
│   │   └── style.css     # Styles (700+ lines)
│   └── js/
│       └── app.js        # JavaScript (800+ lines)
├── db/
│   ├── config.json       # App configuration
│   ├── memory.json       # File metadata
│   ├── admin.json        # Admin data
│   └── sessions.json     # Session storage
├── uploads/              # Uploaded files (gitignored)
├── node_modules/         # Dependencies (gitignored)
├── package.json          # Project config
├── package-lock.json     # Dependency lock
├── README.md             # This file
├── API.md                # Full API docs
└── AGENT.md              # AI agent documentation
```

---

## 🛡️ Security Features

### Encryption & Password Protection
- ✅ **Full File Encryption** - Files encrypted with AES-256-GCM when encryption key is set
- ✅ **Filename Encryption** - Original filenames also encrypted (not visible on disk)
- ✅ **One-Way Encryption** - Lost encryption key = file cannot be recovered (by design!)
- ✅ **Password Verification** - SHA-256 hash for access control
- ✅ **Locked Files** - Require encryption key for download
- ✅ **Admin Cannot Decrypt** - Even admins cannot view encrypted file content or names

### File Security
- ✅ Files stored encrypted on disk (content + filename)
- ✅ Encryption key wrapped with password-derived key (PBKDF2)
- ✅ Only users with encryption key can decrypt and view files
- ⚠️ Metadata stored in-memory (lost on server restart)
- ⚠️ Anyone with file ID can attempt download (but need encryption key)

### Admin Security
- ✅ Session-based authentication
- ✅ Password change requires current password
- ✅ Config changes require admin login
- ⚠️ Default password is `admin123` - **CHANGE IT!**

---

## 🔧 Troubleshooting

### Server won't start
```bash
# Check if port 3232 is in use
lsof -i :3232

# Kill process or change PORT in server/index.js
```

### File not found
- Check file ID is 6 hex characters
- Verify server is running: `pm2 status tete`
- Check uploads/ directory exists

### Password not working
- Ensure password is URL-encoded in query string
- Verify exact password match (case-sensitive)
- Check if file is actually locked

### Dropdown not working
- Clear browser cache
- Check browser console for errors
- Ensure JavaScript is enabled

### Auto-delete not working
- Check server logs: `pm2 logs tete`
- Verify expiration time is set
- Check server time is correct

---

## 📦 Dependencies

```json
{
  "cors": "^2.8.6",
  "express": "^5.2.1",
  "multer": "^2.1.1",
  "uuid": "^13.0.0",
  "cookie-parser": "^1.4.6",
  "express-session": "^1.17.3"
}
```

**Note:** Uses Node.js built-in `crypto` module for password hashing.

---

## 🌐 URL Patterns

| Type | Pattern | Example |
|------|---------|---------|
| File Info | `/file/:id` | `/file/a1b2c3` |
| Download (public) | `/file/:id/download` | `/file/a1b2c3/download` |
| Download (locked) | `/file/:id/download?password=xxx` | `/file/a1b2c3/download?password=secret` |
| Verify Password | `POST /file/:id/verify` | `curl -X POST -d '{"password":"x"}' ...` |
| Delete | `DELETE /file/:id` | `curl -X DELETE /file/a1b2c3` |

---

## 📝 Common Use Cases

### 1. Share Public File
```bash
curl -F "file=@document.pdf" http://localhost:3232/api
# Returns: {"url": "...", "downloadUrl": "..."}
```

### 2. Share Secret File
```bash
curl -F "file=@secret.pdf" -F "password=pass123" http://localhost:3232/api
# Share: http://localhost:3232/file/abc123/download?password=pass123
```

### 3. Share Text Snippet
```bash
curl -H "Content-Type: application/json" \
  -d '{"text": "Sensitive data here", "password": "secret"}' \
  http://localhost:3232/api/text
```

### 4. Automate Backup
```bash
tar czf backup.tar.gz /data
curl -F "file=@backup.tar.gz" -F "password=backup123" http://localhost:3232/api
# Save the downloadUrl for retrieval
```

### 5. Set Expiration
```bash
# 2 hours expiration (7200000ms)
curl -F "files=@file.txt" -F "expiration=7200000" http://localhost:3232/api/upload
```

---

## 📄 License

ISC

---

## 🔗 Links

- **Repository**: https://github.com/Cloud-Dark/tete
- **Issues**: GitHub Issues tab
- **API Docs**: `/API.md`
- **Agent Docs**: `/AGENT.md` or `http://localhost:3232/AGENT.md`

---

## 🎯 Quick Reference

| Action | Command/URL |
|--------|-------------|
| **Start** | `npm start` |
| **PM2 Start** | `pm2 start server/index.js --name tete` |
| **PM2 Logs** | `pm2 logs tete` |
| **PM2 Restart** | `pm2 restart tete` |
| **Web UI** | `http://localhost:3232` |
| **Admin Login** | Click 🔐 → `admin123` |
| **Change Password** | Config tab → Change Password |
| **API Docs** | `http://localhost:3232/AGENT.md` |

---

**Made with ❤️ - Self-hosted file sharing made simple**
