-- TETE schema v1

CREATE TABLE IF NOT EXISTS files (
  id            TEXT PRIMARY KEY,           -- 6-char hex short id
  original_name TEXT,                       -- NULL for locked files (name lives encrypted in enc)
  mime_type     TEXT NOT NULL,
  size          INTEGER NOT NULL,           -- plaintext size in bytes
  uploaded_at   TEXT NOT NULL,              -- ISO 8601
  expires_at    INTEGER,                    -- epoch ms, NULL = never
  user_id       TEXT NOT NULL,              -- anonymous owner (cookie)
  delete_token  TEXT NOT NULL,              -- SHA-256 hex of the delete token
  locked        INTEGER NOT NULL DEFAULT 0, -- 1 = AES-256-GCM encrypted, password required
  enc           TEXT                        -- JSON: iv, wrapped key, salt, encrypted name (locked only)
);

CREATE INDEX IF NOT EXISTS idx_files_expires ON files (expires_at);
CREATE INDEX IF NOT EXISTS idx_files_user ON files (user_id);

CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
