-- Migration 0001: initial schema
-- Games and artwork tables

CREATE TABLE IF NOT EXISTS games (
  id                TEXT    PRIMARY KEY,
  name              TEXT    NOT NULL,
  root_path         TEXT    NOT NULL,
  exe_path          TEXT    NOT NULL,
  proton_id         TEXT,
  steam_app_id      TEXT,
  wine_prefix       TEXT    NOT NULL,
  last_played       INTEGER,
  play_time_seconds INTEGER NOT NULL DEFAULT 0,
  hidden            INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS artwork (
  id          TEXT    PRIMARY KEY,
  game_id     TEXT    NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  type        TEXT    NOT NULL,
  local_path  TEXT    NOT NULL,
  source_url  TEXT,
  provider    TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_artwork_game_id ON artwork(game_id);
CREATE INDEX IF NOT EXISTS idx_games_last_played ON games(last_played DESC);
