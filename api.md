# TETE - Transient Endpoint for Transfer & Encryption

## API Documentation

Simple, secure file sharing server with password protection. Self-hosted alternative to temp.sh.

## Server Info

| Setting | Value | Description |
|---------|-------|-------------|
| **Web UI** | `https://tete.apipedia.id` | Browser interface for uploads & management |
| **API Base URL** | `https://tetein.apipedia.id` | Endpoint for integrators & automation |
| **Default Port** | 3232 | HTTP server port |
| **Host** | 0.0.0.0 | Listen on all interfaces |
| **File ID Format** | 6-character hex (e.g., `a1b2c3`) |
| **Password Hashing** | SHA-256 |
| **File Encryption** | AES-256-GCM |

> **Note:** Both domains point to the same server. Use `tetein.apipedia.id` for API/curl commands and `tete.apipedia.id` for the web interface.

---

## API Endpoints

### 1. Upload Single File (curl compatible)

Upload a single file via multipart/form-data.

**Endpoint:** `POST /api`

**Request:**
```bash
curl -X POST -F "file=@xyz.txt" https://tetein.apipedia.id/api
curl -X POST -F "file=@file1.txt" -F "file=@file2.txt" https://tetein.apipedia.id/api
```

**Upload with password protection:**
```bash
curl -X POST -F "file=@secret.txt" -F "password=mysecret123" https://tetein.apipedia.id/api
```

**Response:**
```json
{
  "id": "a1b2c3",
  "originalName": "xyz.txt",
  "filename": "a1b2c3.txt",
  "mimeType": "text/plain",
  "size": 1024,
  "uploadedAt": "2024-01-15T10:30:00.000Z",
  "locked": true,
  "url": "https://tete.apipedia.id/file/a1b2c3",
  "downloadUrl": "https://tete.apipedia.id/file/a1b2c3/download",
  "deleteUrl": "https://tete.apipedia.id/file/a1b2c3"
}
```

---

### 2. Upload Multiple Files

Upload multiple files at once.

**Endpoint:** `POST /api/upload`

**Request:**
```bash
curl -X POST -F "files=@file1.txt" -F "files=@file2.pdf" -F "files=@image.png" https://tetein.apipedia.id/api/upload
```

**Response:**
```json
[
  {
    "id": "uuid-1",
    "originalName": "file1.txt",
    "mimeType": "text/plain",
    "size": 1024,
    "uploadedAt": "2024-01-15T10:30:00.000Z",
    "url": "https://tete.apipedia.id/file/uuid-1",
    "downloadUrl": "https://tete.apipedia.id/file/uuid-1/download",
    "deleteUrl": "https://tete.apipedia.id/file/uuid-1"
  },
  {
    "id": "uuid-2",
    "originalName": "file2.pdf",
    "mimeType": "application/pdf",
    "size": 2048,
    "uploadedAt": "2024-01-15T10:30:01.000Z",
    "url": "https://tete.apipedia.id/file/uuid-2",
    "downloadUrl": "https://tete.apipedia.id/file/uuid-2/download",
    "deleteUrl": "https://tete.apipedia.id/file/uuid-2"
  }
]
```

---

### 3. Upload Text Content

Upload plain text content.

**Endpoint:** `POST /api/text`

**Request:**
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"text": "Hello World", "filename": "greeting.txt"}' \
  https://tetein.apipedia.id/api/text
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "originalName": "greeting.txt",
  "filename": "550e8400-e29b-41d4-a716-446655440000.txt",
  "mimeType": "text/plain",
  "size": 11,
  "uploadedAt": "2024-01-15T10:30:00.000Z",
  "url": "https://tete.apipedia.id/file/550e8400-e29b-41d4-a716-446655440000",
  "downloadUrl": "https://tete.apipedia.id/file/550e8400-e29b-41d4-a716-446655440000/download",
  "deleteUrl": "https://tete.apipedia.id/file/550e8400-e29b-41d4-a716-446655440000"
}
```

---

### 4. Get File Info

Get information about an uploaded file.

**Endpoint:** `GET /file/:id`

**Request:**
```bash
curl https://tetein.apipedia.id/file/550e8400-e29b-41d4-a716-446655440000
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "originalName": "xyz.txt",
  "mimeType": "text/plain",
  "size": 1024,
  "uploadedAt": "2024-01-15T10:30:00.000Z",
  "url": "https://tete.apipedia.id/file/550e8400-e29b-41d4-a716-446655440000",
  "downloadUrl": "https://tete.apipedia.id/file/550e8400-e29b-41d4-a716-446655440000/download",
  "deleteUrl": "https://tete.apipedia.id/file/550e8400-e29b-41d4-a716-446655440000"
}
```

---

### 5. Download File

Direct download of a file.

**Endpoint:** `GET /file/:id/download`

**Request (public file):**
```bash
curl -O https://tetein.apipedia.id/file/a1b2c3/download
# or
wget https://tetein.apipedia.id/file/a1b2c3/download
```

**Request (locked file with password):**
```bash
curl -O "https://tetein.apipedia.id/file/a1b2c3/download?password=mysecret123"
# or
wget "https://tetein.apipedia.id/file/a1b2c3/download?password=mysecret123"
```

**Response (locked file, no password):**
```json
{
  "error": "Password required"
}
```

**Response:** Binary file download with appropriate Content-Type and Content-Disposition headers.

---

### 6. Verify Password (for locked files)

Verify password for a password-protected file.

**Endpoint:** `POST /file/:id/verify`

**Request:**
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"password": "mysecret123"}' \
  https://tetein.apipedia.id/file/a1b2c3/verify
```

**Response (correct password):**
```json
{
  "success": true,
  "message": "Password correct"
}
```

**Response (wrong password):**
```json
{
  "error": "Invalid password"
}
```

---

### 7. Delete File

Delete an uploaded file.

**Endpoint:** `DELETE /file/:id`

**Request:**
```bash
curl -X DELETE https://tetein.apipedia.id/file/550e8400-e29b-41d4-a716-446655440000
```

**Response:**
```json
{
  "success": true,
  "message": "File deleted successfully"
}
```

---

### 8. List All Files

Get a list of all uploaded files.

**Endpoint:** `GET /api/files`

**Request:**
```bash
curl https://tetein.apipedia.id/api/files
```

**Response:**
```json
[
  {
    "id": "uuid-1",
    "originalName": "file1.txt",
    "mimeType": "text/plain",
    "size": 1024,
    "uploadedAt": "2024-01-15T10:30:00.000Z",
    "url": "https://tete.apipedia.id/file/uuid-1",
    "downloadUrl": "https://tete.apipedia.id/file/uuid-1/download",
    "deleteUrl": "https://tete.apipedia.id/file/uuid-1"
  }
]
```

---

### 9. Get Agent Documentation

Get the AGENT.md file for AI agent context.

**Endpoint:** `GET /AGENT.md`

**Request:**
```bash
curl https://tetein.apipedia.id/AGENT.md
```

**Response:** Plain text markdown content of the AGENT.md file.

---

### 10. Admin Endpoints

#### Admin Login
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"password": "admin123"}' \
  https://tetein.apipedia.id/api/admin/login \
  -c cookies.txt
```

#### Admin Logout
```bash
curl -X POST https://tetein.apipedia.id/api/admin/logout -b cookies.txt
```

#### Admin Status
```bash
curl https://tetein.apipedia.id/api/admin/status -b cookies.txt
```

#### Get Configuration (Admin)
```bash
curl https://tetein.apipedia.id/api/config -b cookies.txt
```

#### Update Configuration (Admin)
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"defaultExpiration": 3600000}' \
  https://tetein.apipedia.id/api/config \
  -b cookies.txt
```

#### Change Admin Password (Admin)
```bash
# First verify current password
curl -X POST -H "Content-Type: application/json" \
  -d '{"password": "admin123"}' \
  https://tetein.apipedia.id/api/admin/verify-password \
  -b cookies.txt

# Then change password
curl -X POST -H "Content-Type: application/json" \
  -d '{"newPassword": "newpass123"}' \
  https://tetein.apipedia.id/api/admin/change-password \
  -b cookies.txt
```

---

## URL Formats

| Purpose | URL Pattern | Example |
|---------|-------------|---------|
| Web UI | `https://tete.apipedia.id` | Browser interface |
| API Base | `https://tetein.apipedia.id` | Integrator endpoint |
| File Info | `/file/:id` | `https://tetein.apipedia.id/file/abc123` |
| Download (public) | `/file/:id/download` | `https://tetein.apipedia.id/file/abc123/download` |
| Download (locked) | `/file/:id/download?password=xxx` | `https://tetein.apipedia.id/file/abc123/download?password=secret` |
| Verify Password | `POST /file/:id/verify` | `curl -X POST -d '{"password":"xxx"}' ...` |
| Delete | `DELETE /file/:id` | `curl -X DELETE https://tetein.apipedia.id/file/abc123` |
| Admin Login | `POST /api/admin/login` | `curl -X POST -d '{"password":"admin123"}' ...` |
| Admin Config | `GET/POST /api/config` | Admin configuration endpoints |

---

## Quick Start

### Start the server:
```bash
cd /path/to/tete
node server/index.js
```

### Upload a file (public):
```bash
curl -F "file=@myfile.txt" https://tetein.apipedia.id/api
```

### Upload a file (locked with password):
```bash
curl -F "file=@secret.txt" -F "password=mysecret123" https://tetein.apipedia.id/api
```

### Download a file (public):
```bash
curl -O https://tetein.apipedia.id/file/abc123/download
```

### Download a file (locked):
```bash
curl -O "https://tetein.apipedia.id/file/abc123/download?password=mysecret123"
```

### Open in browser:
```
https://tete.apipedia.id
```

---

## Limits

- Maximum file size: 100MB per file
- Maximum files per upload: 100 files
- Storage: In-memory metadata (files persist on disk until server restart or manual delete)

---

## Web Interface

Open `https://tete.apipedia.id` in your browser for a web interface with:
- Drag & drop file upload
- Text content upload
- File list with download/delete actions
- Admin panel with config management
- Real-time upload results
- Built-in documentation viewer
