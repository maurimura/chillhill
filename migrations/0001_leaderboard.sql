-- Only named, qualifying entries are public. Unfinished runs expire after 24h.
CREATE TABLE IF NOT EXISTS leaderboard_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leaderboard_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS leaderboard_limits_expiry ON leaderboard_limits(expires_at);

CREATE TABLE IF NOT EXISTS leaderboard_sessions (
  run_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  version INTEGER NOT NULL,
  car TEXT NOT NULL,
  seed INTEGER NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('standard', 'custom')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  record_json TEXT,
  record_id TEXT UNIQUE,
  record_hash TEXT,
  score INTEGER,
  near_misses INTEGER,
  finished_at TEXT,
  name TEXT
);
CREATE INDEX IF NOT EXISTS leaderboard_sessions_expiry ON leaderboard_sessions(expires_at);

CREATE TABLE IF NOT EXISTS leaderboard_entries (
  run_id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('standard', 'custom')),
  name TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score > 0),
  near_misses INTEGER NOT NULL,
  finished_at TEXT NOT NULL,
  record_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS leaderboard_ranking ON leaderboard_entries(
  version, category, score DESC, near_misses DESC, finished_at, run_id
);
