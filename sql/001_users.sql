-- MCP user/API-key store. Also created automatically at server and CLI
-- startup (see ensureUsersTable in src/users.ts) — this file is for
-- reference and for running manually against a database directly.
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  api_key_hash  TEXT NOT NULL UNIQUE,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ
);
