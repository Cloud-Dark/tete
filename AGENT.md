# TETE - Transient Endpoint for Transfer & Encryption

## Project Identity

**Name:** TETE - Transient Endpoint for Transfer & Encryption

**Description:** Simple, secure file sharing server with password protection. Self-hosted alternative to temp.sh.

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

### Run with PM2
```bash
pm2 start server/index.js --name tete
pm2 logs tete
pm2 restart tete
```

---

## Core Features

1. **File Upload** - Drag & drop or API
2. **Text Upload** - Paste text content
3. **Password Protection** - Lock files with SHA-256 hashed passwords
4. **Short URLs** - 6-character hex IDs
5. **REST API** - Full automation support
6. **Minimalist UI** - Clean, responsive design

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
| GET | `/AGENT.md` | Get agent documentation |

---

## Common API Examples

### Upload File (Public)
```bash
curl -F "file=@myfile.txt" http://localhost:3232/api
```

### Upload File (Locked)
```bash
curl -F "file=@secret.txt" -F "password=mysecret" http://localhost:3232/api
```

### Upload Text
```bash
curl -H "Content-Type: application/json" \
  -d '{"text": "Hello World", "filename": "test.txt"}' \
  http://localhost:3232/api/text
```

### Download (Public)
```bash
curl -O http://localhost:3232/file/a1b2c3/download
```

### Download (Locked)
```bash
curl -O "http://localhost:3232/file/a1b2c3/download?password=mysecret"
```

### Get File Info
```bash
curl http://localhost:3232/file/a1b2c3
```

### Delete File
```bash
curl -X DELETE http://localhost:3232/file/a1b2c3
```

### Verify Password
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"password": "mysecret"}' \
  http://localhost:3232/file/a1b2c3/verify
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

## Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| Port | 3232 | Default HTTP port |
| Host | 0.0.0.0 | Listen on all interfaces |
| Max File Size | 100MB | Upload limit per file |
| Max Files | 100 | Files per multipart upload |
| ID Length | 6 chars | Hex file identifier |
| Password Hash | SHA-256 | Hashing algorithm |

---

## File Structure

```
tete/
├── server/
│   └── index.js          # Express server (363 lines)
├── client/
│   └── index.html        # Web UI (1043 lines)
├── uploads/              # Stored files (gitignored)
├── node_modules/         # Dependencies (gitignored)
├── package.json          # Project config
├── package-lock.json     # Dependency lock
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
  "uuid": "^13.0.0"
}
```

**Note:** Using Node.js built-in `crypto` module for password hashing.

---

## Security Model

1. **Password Storage:** SHA-256 hash (not plaintext)
2. **File Access:** Locked files require password query parameter
3. **No Encryption:** Files stored unencrypted on disk
4. **In-Memory Metadata:** File info lost on server restart
5. **No Auth:** Anyone with file ID can access/delete

---

## URL Patterns

| Type | Pattern | Example |
|------|---------|---------|
| Info | `/file/:id` | `/file/a1b2c3` |
| Download (public) | `/file/:id/download` | `/file/a1b2c3/download` |
| Download (locked) | `/file/:id/download?password=xxx` | `/file/a1b2c3/download?password=secret` |
| Delete | `DELETE /file/:id` | `curl -X DELETE /file/a1b2c3` |
| Verify | `POST /file/:id/verify` | `curl -X POST -d '{"password":"x"}' /file/a1b2c3/verify` |

---

## Web UI Features

- **Tabs:** Upload | Files | API Docs
- **Upload:** Drag & drop, multi-file, text content
- **Password Lock:** Optional field for each upload
- **File List:** Dropdown menu per file
- **Actions:** Copy link, Copy details, Download, View info, Delete
- **Password Modal:** Prompt for locked file downloads
- **Toast Notifications:** User feedback

---

## Common Use Cases

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

---

## Contact & Support

**Repository:** https://github.com/Cloud-Dark/tete

**Issues:** GitHub Issues tab

---

## Copy All Documentation

Use the copy button below to copy this entire AGENT.md file for AI context.
