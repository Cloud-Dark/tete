# Temp Share API Documentation

Simple file sharing server like temp.sh

## Server Info

- **Default Port**: 3232
- **Host**: 0.0.0.0 (all interfaces)
- **Base URL**: `http://10.0.24.23:3232` (adjust to your server IP)

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

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "originalName": "xyz.txt",
  "filename": "550e8400-e29b-41d4-a716-446655440000.txt",
  "mimeType": "text/plain",
  "size": 1024,
  "uploadedAt": "2024-01-15T10:30:00.000Z",
  "url": "http://10.0.24.23:3232/file/550e8400-e29b-41d4-a716-446655440000",
  "downloadUrl": "http://10.0.24.23:3232/file/550e8400-e29b-41d4-a716-446655440000/download",
  "deleteUrl": "http://10.0.24.23:3232/file/550e8400-e29b-41d4-a716-446655440000"
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

**Request:**
```bash
curl -O http://10.0.24.23:3232/file/550e8400-e29b-41d4-a716-446655440000/download
# or
wget http://10.0.24.23:3232/file/550e8400-e29b-41d4-a716-446655440000/download
```

**Response:** Binary file download with appropriate Content-Type and Content-Disposition headers.

---

### 6. Delete File

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

### 7. List All Files

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

## URL Formats

| Purpose | URL Pattern | Example |
|---------|-------------|---------|
| File Info | `/file/:id` | `http://10.0.24.23:3232/file/abc123` |
| Direct Download | `/file/:id/download` | `http://10.0.24.23:3232/file/abc123/download` |
| Delete (API) | `DELETE /file/:id` | `curl -X DELETE http://10.0.24.23:3232/file/abc123` |

---

## Quick Start

### Start the server:
```bash
cd /home/syahdan/temp/temp-share
node server/index.js
```

### Upload a file:
```bash
curl -F "file=@myfile.txt" http://10.0.24.23:3232/api
```

### Download a file:
```bash
curl -O http://10.0.24.23:3232/file/:id/download
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
