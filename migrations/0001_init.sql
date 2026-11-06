-- TETE schema v1

CREATE TABLE IF NOT EXISTS files (
  id            TEXT PRIMARY KEY,           -- 6-char hex short id (lookups are by id only)
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

-- Index design: every index costs one extra row written per upload, so keep exactly two.
-- Owner listing: index-only range scan, already ordered newest-first (no sort, no table scan).
CREATE INDEX IF NOT EXISTS idx_files_user_uploaded ON files (user_id, uploaded_at DESC);
-- Cron purge: partial index only holds files that can expire, and stays empty for "never" files.
CREATE INDEX IF NOT EXISTS idx_files_expiring ON files (expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;
