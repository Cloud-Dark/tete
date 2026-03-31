# TETE - Transient Endpoint for Transfer & Encryption

## API Documentation

Simple, secure file sharing server with password protection. Self-hosted alternative to temp.sh.

## Server Info

- **Default Port**: 3232
- **Host**: 0.0.0.0 (all interfaces)
- **Base URL**: `http://10.0.24.23:3232` (adjust to your server IP)
- **File ID Format**: 6-character hex (e.g., `a1b2c3`)
- **Password Hashing**: SHA-256

---

## API Endpoints

### 1. Upload Single File (curl compatible)

Upload a single file via multipart/form-data.

**Endpoint:** `POST /api`

**Request:**
```bash
curl -X POST -F "file=@xyz.txt" http://10.0.24.23:3232/api
curl -X POST -F "file=@file1.txt" -F "file=@file2.txt" http://10.0.24.23:3232/api
```

**Upload with password protection:**
```bash
curl -X POST -F "file=@secret.txt" -F "password=mysecret123" http://10.0.24.23:3232/api
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
  "url": "http://10.0.24.23:3232/file/a1b2c3",
  "downloadUrl": "http://10.0.24.23:3232/file/a1b2c3/download",
  "deleteUrl": "http://10.0.24.23:3232/file/a1b2c3"
}
```

---

### 2. Upload Multiple Files

Upload multiple files at once.

**Endpoint:** `POST /api/upload`

**Request:**
```bash
curl -X POST -F "files=@file1.txt" -F "files=@file2.pdf" -F "files=@image.png" http://10.0.24.23:3232/api/upload
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
    "url": "http://10.0.24.23:3232/file/uuid-1",
    "downloadUrl": "http://10.0.24.23:3232/file/uuid-1/download",
    "deleteUrl": "http://10.0.24.23:3232/file/uuid-1"
  },
  {
    "id": "uuid-2",
    "originalName": "file2.pdf",
    "mimeType": "application/pdf",
    "size": 2048,
    "uploadedAt": "2024-01-15T10:30:01.000Z",
    "url": "http://10.0.24.23:3232/file/uuid-2",
    "downloadUrl": "http://10.0.24.23:3232/file/uuid-2/download",
    "deleteUrl": "http://10.0.24.23:3232/file/uuid-2"
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
  http://10.0.24.23:3232/api/text
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
  "url": "http://10.0.24.23:3232/file/550e8400-e29b-41d4-a716-446655440000",
  "downloadUrl": "http://10.0.24.23:3232/file/550e8400-e29b-41d4-a716-446655440000/download",
  "deleteUrl": "http://10.0.24.23:3232/file/550e8400-e29b-41d4-a716-446655440000"
}
```

---

### 4. Get File Info

Get information about an uploaded file.

**Endpoint:** `GET /file/:id`

**Request:**
```bash
curl http://10.0.24.23:3232/file/550e8400-e29b-41d4-a716-446655440000
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "originalName": "xyz.txt",
  "mimeType": "text/plain",
  "size": 1024,
  "uploadedAt": "2024-01-15T10:30:00.000Z",
  "url": "http://10.0.24.23:3232/file/550e8400-e29b-41d4-a716-446655440000",
  "downloadUrl": "http://10.0.24.23:3232/file/550e8400-e29b-41d4-a716-446655440000/download",
  "deleteUrl": "http://10.0.24.23:3232/file/550e8400-e29b-41d4-a716-446655440000"
}
```

---

### 5. Download File

Direct download of a file.

**Endpoint:** `GET /file/:id/download`

**Request (public file):**
```bash
curl -O http://10.0.24.23:3232/file/a1b2c3/download
# or
wget http://10.0.24.23:3232/file/a1b2c3/download
```

**Request (locked file with password):**
```bash
curl -O "http://10.0.24.23:3232/file/a1b2c3/download?password=mysecret123"
# or
wget "http://10.0.24.23:3232/file/a1b2c3/download?password=mysecret123"
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
  http://10.0.24.23:3232/file/a1b2c3/verify
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
curl -X DELETE http://10.0.24.23:3232/file/550e8400-e29b-41d4-a716-446655440000
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
curl http://10.0.24.23:3232/api/files
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
    "url": "http://10.0.24.23:3232/file/uuid-1",
    "downloadUrl": "http://10.0.24.23:3232/file/uuid-1/download",
    "deleteUrl": "http://10.0.24.23:3232/file/uuid-1"
  }
]
```

---

### 9. Get Agent Documentation

Get the AGENT.md file for AI agent context.

**Endpoint:** `GET /AGENT.md`

**Request:**
```bash
curl http://10.0.24.23:3232/AGENT.md
```

**Response:** Plain text markdown content of the AGENT.md file.

---

## URL Formats

| Purpose | URL Pattern | Example |
|---------|-------------|---------|
| File Info | `/file/:id` | `http://10.0.24.23:3232/file/abc123` |
| Direct Download (public) | `/file/:id/download` | `http://10.0.24.23:3232/file/abc123/download` |
| Direct Download (locked) | `/file/:id/download?password=xxx` | `http://10.0.24.23:3232/file/abc123/download?password=secret` |
| Verify Password | `POST /file/:id/verify` | `curl -X POST -d '{"password":"xxx"}' ...` |
| Delete (API) | `DELETE /file/:id` | `curl -X DELETE http://10.0.24.23:3232/file/abc123` |

---

## Quick Start

### Start the server:
```bash
cd /home/syahdan/temp/tete
node server/index.js
```

### Upload a file (public):
```bash
curl -F "file=@myfile.txt" http://10.0.24.23:3232/api
```

### Upload a file (locked with password):
```bash
curl -F "file=@secret.txt" -F "password=mysecret123" http://10.0.24.23:3232/api
```

### Download a file (public):
```bash
curl -O http://10.0.24.23:3232/file/abc123/download
```

### Download a file (locked):
```bash
curl -O "http://10.0.24.23:3232/file/abc123/download?password=mysecret123"
```

### Open in browser:
```
http://10.0.24.23:3232
```

---

## Limits

- Maximum file size: 100MB per file
- Maximum files per upload: 100 files
- Storage: In-memory metadata (files persist on disk until server restart or manual delete)

---

## Web Interface

Open `http://10.0.24.23:3232` in your browser for a web interface with:
- Drag & drop file upload
- Text content upload
- File list with download/delete actions
- Real-time upload results
