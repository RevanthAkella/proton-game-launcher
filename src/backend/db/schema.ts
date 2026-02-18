import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// games
// ---------------------------------------------------------------------------
export const games = sqliteTable("games", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  rootPath: text("root_path"),             // null = unlinked / not installed
  exePath: text("exe_path"),               // null when unlinked
  // null = use the global default from settings
  protonId: text("proton_id"),
  steamAppId: text("steam_app_id"),
  winePrefix: text("wine_prefix").notNull(),
  lastPlayed: integer("last_played"), // unix ms, nullable
  playTimeSeconds: integer("play_time_seconds").notNull().default(0),
  progress: integer("progress").notNull().default(0),           // 0–100 displayed value
  progressOverride: integer("progress_override"),               // null = use HLTB auto-calc
  hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;

// ---------------------------------------------------------------------------
// artwork
// ---------------------------------------------------------------------------
export const artwork = sqliteTable("artwork", {
  id: text("id").primaryKey(),
  gameId: text("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  // 'grid' | 'hero' | 'logo' | 'icon'
  type: text("type").notNull(),
  localPath: text("local_path").notNull(),
  sourceUrl: text("source_url"),
  // 'steamgriddb' | 'manual'
  provider: text("provider").notNull(),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export type Artwork = typeof artwork.$inferSelect;
export type NewArtwork = typeof artwork.$inferInsert;

// ---------------------------------------------------------------------------
// game_info
// ---------------------------------------------------------------------------
export const gameInfo = sqliteTable("game_info", {
  gameId:      text("game_id").primaryKey().references(() => games.id, { onDelete: "cascade" }),
  source:      text("source").notNull().default("steam"),
  steamAppId:  text("steam_app_id"),
  description: text("description"),
  shortDesc:   text("short_desc"),
  developer:   text("developer"),
  publisher:   text("publisher"),
  releaseDate: text("release_date"),
  genres:      text("genres"),    // JSON array string: '["Action","RPG"]'
  metacritic:  integer("metacritic"),
  fetchedAt:   integer("fetched_at").notNull(),
  // HLTB (HowLongToBeat) data
  hltbId:              text("hltb_id"),
  hltbMainHours:       real("hltb_main_hours"),
  hltbExtraHours:      real("hltb_extra_hours"),
  hltbCompletionistHours: real("hltb_completionist_hours"),
  hltbFetchedAt:       integer("hltb_fetched_at"),
});

export type GameInfo = typeof gameInfo.$inferSelect;
