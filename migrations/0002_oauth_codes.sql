-- Single-use enforcement for OAuth authorization codes (the codes themselves are stateless signed tokens).
CREATE TABLE IF NOT EXISTS oauth_codes (
  jti TEXT PRIMARY KEY,
  exp INTEGER NOT NULL      -- epoch ms; rows are purged after they can no longer be redeemed
) WITHOUT ROWID;
