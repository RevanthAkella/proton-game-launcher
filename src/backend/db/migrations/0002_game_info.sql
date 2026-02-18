-- Migration: add game_info table for cached Steam Store metadata
CREATE TABLE IF NOT EXISTS game_info (
  game_id      TEXT PRIMARY KEY
               REFERENCES games(id) ON DELETE CASCADE,
  source       TEXT NOT NULL DEFAULT 'steam',
  steam_app_id TEXT,
  description  TEXT,
  short_desc   TEXT,
  developer    TEXT,
  publisher    TEXT,
  release_date TEXT,
  genres       TEXT,   -- JSON array string, e.g. '["Action","RPG"]'
  metacritic   INTEGER,
  fetched_at   INTEGER NOT NULL
);
