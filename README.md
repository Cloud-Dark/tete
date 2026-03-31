# TETE - Transient Endpoint for Transfer & Encryption

Simple, secure file sharing server with password protection. Self-hosted alternative to temp.sh.

## Features

- 📤 **Upload Files** - Drag & drop or click to browse
- 📝 **Upload Text** - Paste text content directly
- 🔒 **Password Protection** - Lock files with password (optional)
- 📋 **File Management** - View, download, delete uploaded files
- 🔗 **Short URLs** - 6-character hex IDs (e.g., `/file/a1b2c3`)
- 📱 **Responsive UI** - Clean, minimalist design
- 🚀 **API Access** - Full REST API for automation
- 🛡️ **Security** - SHA-256 password hashing for locked files

## Quick Start

### Install Dependencies
```bash
npm install
```

### Start Server
```bash
npm start
```

Server runs on `http://localhost:3232`

## Usage

### Web Interface
Open `http://localhost:3232` in your browser.

### API Examples

**Upload a file:**
```bash
curl -F "file=@myfile.txt" http://localhost:3232/api
```

**Upload with password protection:**
```bash
curl -F "file=@secret.txt" -F "password=mysecret" http://localhost:3232/api
```

**Upload text:**
```bash
curl -H "Content-Type: application/json" \
  -d '{"text": "Hello World", "filename": "greeting.txt"}' \
  http://localhost:3232/api/text
```

**Download a file (public):**
```bash
curl -O http://localhost:3232/file/a1b2c3/download
```

**Download a locked file:**
```bash
curl -O "http://localhost:3232/file/a1b2c3/download?password=mysecret"
```

**Get file info:**
```bash
curl http://localhost:3232/file/a1b2c3
```

**Delete a file:**
```bash
curl -X DELETE http://localhost:3232/file/a1b2c3
```

**List all files:**
```bash
curl http://localhost:3232/api/files
```

**Verify password:**
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"password": "mysecret"}' \
  http://localhost:3232/file/a1b2c3/verify
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api` | Upload single file (with optional `password` field) |
| POST | `/api/upload` | Upload multiple files (with optional `password` field) |
| POST | `/api/text` | Upload text content (with optional `password` field) |
| GET | `/file/:id` | Get file information (includes `locked` status) |
| GET | `/file/:id/download` | Download file (add `?password=xxx` for locked files) |
| POST | `/file/:id/verify` | Verify password for locked file |
| DELETE | `/file/:id` | Delete file |
| GET | `/api/files` | List all uploaded files |

## Configuration

- **Port**: 3232 (default)
- **Host**: 0.0.0.0 (all interfaces)
- **Max file size**: 100MB
- **File ID length**: 6 characters (hex)
- **Password hashing**: SHA-256

## Project Structure

```
tete/
├── server/
│   └── index.js      # Express server with file handling
├── client/
│   └── index.html    # Web UI (single page application)
├── uploads/          # Uploaded files (auto-created, gitignored)
├── package.json
├── API.md            # Full API documentation
├── AGENT.md          # AI agent documentation
└── README.md
```

## Running with PM2

```bash
# Install PM2
npm install -g pm2

# Start server
pm2 start server/index.js --name tete

# View logs
pm2 logs tete

# Auto-start on boot
pm2 startup
pm2 save
```

## Security Notes

- Passwords are hashed with SHA-256 before storage
- Locked files require password for download
- Files are stored on disk until manually deleted
- No file encryption (password protects download only)
- Metadata stored in-memory (lost on server restart)

## License

ISC
