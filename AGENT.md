# TETE - Transient Endpoint for Transfer & Encryption

## Project Identity

**Name:** TETE - Transient Endpoint for Transfer & Encryption

**Description:** Simple, secure file sharing server with password protection. Self-hosted alternative to temp.sh.

**Domains:**
- **Web UI:** `https://tete.apipedia.id` — Browser interface
- **API:** `https://tetein.apipedia.id` — Integrator/automation endpoint

**Version:** 1.0.0

**License:** ISC

---

## Quick Reference

### Start Server
```bash
npm install
npm start
# Server runs on http://localhost:3232
```

### Production with PM2
```bash
pm2 start server/index.js --name tete
pm2 logs tete
pm2 restart tete
```

---

## Core Features

1. **File Upload** — Drag & drop or API (max 100MB per file)
2. **Text Upload** — Paste text content directly
3. **Full Encryption** — AES-256-GCM for file content AND filename
4. **Password Protection** — Lock files with SHA-256 hashed passwords
5. **Auto-Delete** — Configurable expiration time for files
6. **Short URLs** — 6-character hex IDs
7. **REST API** — Full automation support (`https://tetein.apipedia.id`)
8. **Admin Panel** — Dashboard, config, password management
9. **Minimalist UI** — Clean, responsive design (`https://tete.apipedia.id`)

---

## API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api` | Upload single file |
| POST | `/api/upload` | Upload multiple files |
| POST | `/api/text` | Upload text content |
| GET | `/file/:id` | Get file info |
| GET | `/file/:id/download` | Download file |
| POST | `/file/:id/verify` | Verify password |
| DELETE | `/file/:id` | Delete file |
| GET | `/api/files` | List all files |
| POST | `/api/admin/login` | Admin login |
| POST | `/api/admin/logout` | Admin logout |
| GET | `/api/admin/status` | Admin session status |
| GET | `/api/config` | Get configuration |
| POST | `/api/config` | Update configuration |
| POST | `/api/admin/verify-password` | Verify admin password |
| POST | `/api/admin/change-password` | Change admin password |
| GET | `/AGENT.md` | Get agent documentation |
| GET | `/API.md` | Get API documentation |
| GET | `/README.md` | Get README documentation |

---

## Common API Examples

### Upload File (Public)
```bash
curl -F "file=@myfile.txt" https://tetein.apipedia.id/api
```

### Upload File (Locked)
```bash
curl -F "file=@secret.txt" -F "password=mysecret" https://tetein.apipedia.id/api
```

### Upload Text
```bash
curl -H "Content-Type: application/json" \
  -d '{"text": "Hello World", "filename": "test.txt"}' \
  https://tetein.apipedia.id/api/text
```

### Download (Public)
```bash
curl -O https://tetein.apipedia.id/file/a1b2c3/download
```

### Download (Locked)
```bash
curl -O "https://tetein.apipedia.id/file/a1b2c3/download?password=mysecret"
```

### Get File Info
```bash
curl https://tetein.apipedia.id/file/a1b2c3
```

### Delete File
```bash
curl -X DELETE https://tetein.apipedia.id/file/a1b2c3
```

### Verify Password
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"password": "mysecret"}' \
  https://tetein.apipedia.id/file/a1b2c3/verify
```

### Admin Login
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"password": "admin123"}' \
  https://tetein.apipedia.id/api/admin/login \
  -c cookies.txt
```

---

## Response Formats

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
  "url": "https://tete.apipedia.id/file/a1b2c3",
  "downloadUrl": "https://tete.apipedia.id/file/a1b2c3/download",
  "deleteUrl": "https://tete.apipedia.id/file/a1b2c3"
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
  "url": "https://tete.apipedia.id/file/a1b2c3",
  "downloadUrl": "https://tete.apipedia.id/file/a1b2c3/download",
  "deleteUrl": "https://tete.apipedia.id/file/a1b2c3"
}
```

### Error Response
```json
{
  "error": "Password required"
}
```

---

## Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| Port | 3232 | Default HTTP port |
| Host | 0.0.0.0 | Listen on all interfaces |
| Max File Size | 100MB | Upload limit per file |
| Max Files | 100 | Files per multipart upload |
| ID Length | 6 chars | Hex file identifier |
| Password Hash | SHA-256 | Hashing algorithm |
| File Encryption | AES-256-GCM | Content + filename encryption |
| Default Expiration | 1 hour | Auto-delete time |

---

## File Structure

```
tete/
├── server/
│   └── index.js          # Express server (600+ lines)
├── client/
│   ├── index.html        # Web UI (290+ lines)
│   ├── css/
│   │   └── style.css     # Styles (700+ lines)
│   └── js/
│       └── app.js        # JavaScript (1085 lines)
├── db/
│   ├── config.json       # App configuration
│   ├── memory.json       # File metadata
│   ├── admin.json        # Admin data
│   └── sessions.json     # Session storage
├── uploads/              # Stored files (gitignored)
├── node_modules/         # Dependencies (gitignored)
├── package.json          # Project config
├── README.md             # User documentation
├── API.md                # API documentation
├── AGENT.md              # This file
└── .gitignore            # Git ignore rules
```

---

## Dependencies

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

**Note:** Using Node.js built-in `crypto` module for password hashing and encryption.

---

## Security Model

1. **Password Storage:** SHA-256 hash (not plaintext)
2. **File Encryption:** AES-256-GCM for content + filename (one-way)
3. **File Access:** Locked files require password query parameter
4. **Metadata:** Stored in-memory (lost on server restart)
5. **Admin Auth:** Session-based authentication
6. **Admin Cannot Decrypt:** Even admins cannot view encrypted file content

---

## URL Patterns

| Type | Pattern | Example |
|------|---------|---------|
| Web UI | `https://tete.apipedia.id` | Browser interface |
| API Base | `https://tetein.apipedia.id` | Integrator endpoint |
| Info | `/file/:id` | `/file/a1b2c3` |
| Download (public) | `/file/:id/download` | `/file/a1b2c3/download` |
| Download (locked) | `/file/:id/download?password=xxx` | `/file/a1b2c3/download?password=secret` |
| Delete | `DELETE /file/:id` | `curl -X DELETE /file/a1b2c3` |
| Verify | `POST /file/:id/verify` | `curl -X POST -d '{"password":"x"}' /file/a1b2c3/verify` |

---

## Web UI Features

- **Tabs:** Upload | Files | Config (admin) | Docs
- **Upload:** Drag & drop, multi-file, text content
- **Encryption:** Optional AES-256-GCM per file
- **Password Lock:** Optional field for each upload
- **Expiration:** Configurable auto-delete per file
- **File List:** Dropdown menu per file with actions
- **Actions:** Copy link, Copy details, Download, View info, Delete
- **Password Modal:** Prompt for locked file downloads
- **Admin Panel:** Config, password change, upload limits
- **Docs Viewer:** In-app README, API.md, AGENT.md display
- **Toast Notifications:** User feedback

---

## Common Use Cases

### 1. Share Public File
```bash
curl -F "file=@document.pdf" https://tetein.apipedia.id/api
# Open: https://tete.apipedia.id
```

### 2. Share Secret File
```bash
curl -F "file=@secret.pdf" -F "password=pass123" https://tetein.apipedia.id/api
# Share: https://tetein.apipedia.id/file/abc123/download?password=pass123
```

### 3. Share Text Snippet
```bash
curl -H "Content-Type: application/json" \
  -d '{"text": "Sensitive data here", "password": "secret"}' \
  https://tetein.apipedia.id/api/text
```

### 4. Automate Backup
```bash
tar czf backup.tar.gz /data
curl -F "file=@backup.tar.gz" -F "password=backup123" https://tetein.apipedia.id/api
# Save the downloadUrl for retrieval
```

### 5. Set Expiration
```bash
# 2 hours expiration (7200000ms)
curl -F "files=@file.txt" -F "expiration=7200000" https://tetein.apipedia.id/api/upload
```

---

## Troubleshooting

**Server won't start:**
```bash
# Check if port 3232 is in use
lsof -i :3232
# Kill process or change PORT in server/index.js
```

**File not found:**
- Check file ID is 6 hex characters
- Verify server is running
- Check uploads/ directory exists

**Password not working:**
- Ensure password is URL-encoded in query string
- Verify exact password match (case-sensitive)

**Dropdown not working:**
- Clear browser cache
- Check browser console for errors
- Ensure JavaScript is enabled

**Auto-delete not working:**
- Check server logs
- Verify expiration time is set
- Check server time is correct

---

## Contact & Support

**Repository:** https://github.com/Cloud-Dark/tete

**Issues:** GitHub Issues tab

---

## Copy All Documentation

Use the copy button below to copy this entire AGENT.md file for AI context.
