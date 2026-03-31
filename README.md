# tete - Transient Endpoint for Transfer & Encryption

Simple, secure file sharing server with password protection. Like temp.sh but self-hosted.

## Features

- 📤 **Upload Files** - Drag & drop or click to browse
- 📝 **Upload Text** - Paste text content directly
- 🔒 **Password Protection** - Lock files with password (optional)
- 📋 **File Management** - View, download, delete uploaded files
- 🔗 **Short URLs** - 6-character hex IDs (e.g., `/file/a1b2c3`)
- 📱 **Responsive UI** - Clean, minimalist design
- 🚀 **API Access** - Full REST API for automation

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

**Download a file:**
```bash
curl -O http://localhost:3232/file/a1b2c3/download
```

**Download locked file:**
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

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api` | Upload single file |
| POST | `/api/upload` | Upload multiple files |
| POST | `/api/text` | Upload text content |
| GET | `/file/:id` | Get file information |
| GET | `/file/:id/download` | Download file |
| POST | `/file/:id/verify` | Verify password for locked file |
| DELETE | `/file/:id` | Delete file |
| GET | `/api/files` | List all files |

## Configuration

- **Port**: 3232 (default)
- **Host**: 0.0.0.0 (all interfaces)
- **Max file size**: 100MB
- **File ID length**: 6 characters (hex)

## Project Structure

```
tete/
├── server/
│   └── index.js      # Express server
├── client/
│   └── index.html    # Web UI
├── uploads/          # Uploaded files (auto-created)
├── package.json
├── API.md            # Full API documentation
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

## License

ISC
