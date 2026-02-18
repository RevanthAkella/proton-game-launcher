-- Migration 0003: progress tracking + soft-unlink support
--
-- 1. Recreate games table with nullable root_path/exe_path and new progress columns
-- 2. Add HLTB columns to game_info

-- ── Step 1: Recreate games table ─────────────────────────────────────────────
-- SQLite does not support ALTER COLUMN, so we recreate the table to make
-- root_path and exe_path nullable (needed for soft-unlink).

CREATE TABLE games_new (
  id                TEXT    PRIMARY KEY,
  name              TEXT    NOT NULL,
  root_path         TEXT,                          -- nullable for soft-unlink
  exe_path          TEXT,                          -- nullable for soft-unlink
  proton_id         TEXT,
  steam_app_id      TEXT,
  wine_prefix       TEXT    NOT NULL,
  last_played       INTEGER,
  play_time_seconds INTEGER NOT NULL DEFAULT 0,
  progress          INTEGER NOT NULL DEFAULT 0,    -- 0–100 displayed value
  progress_override INTEGER,                       -- NULL = use HLTB auto-calc
  hidden            INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

INSERT INTO games_new (id, name, root_path, exe_path, proton_id, steam_app_id,
                       wine_prefix, last_played, play_time_seconds, hidden, created_at)
SELECT id, name, root_path, exe_path, proton_id, steam_app_id,
       wine_prefix, last_played, play_time_seconds, hidden, created_at
FROM games;

DROP TABLE games;
ALTER TABLE games_new RENAME TO games;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_games_last_played ON games(last_played DESC);

-- ── Step 2: Add HLTB columns to game_info ────────────────────────────────────
ALTER TABLE game_info ADD COLUMN hltb_id              TEXT;
ALTER TABLE game_info ADD COLUMN hltb_main_hours      REAL;
ALTER TABLE game_info ADD COLUMN hltb_extra_hours     REAL;
ALTER TABLE game_info ADD COLUMN hltb_completionist_hours REAL;
ALTER TABLE game_info ADD COLUMN hltb_fetched_at      INTEGER;
