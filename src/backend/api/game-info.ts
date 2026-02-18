/**
 * ============================================================
 *  Game Info API Routes
 * ============================================================
 *
 * Routes:
 *   GET  /api/games/:id/info         Return cached game_info row
 *   POST /api/games/:id/info/refresh Force re-fetch from Steam Store API
 *
 * Exported utilities (used by server.ts at startup):
 *   syncMissingGameInfo()  — fetch info for games with no cached entry
 *   clearAllGameInfo()     — wipe all game_info rows (used by Refresh Library)
 * ============================================================
 */
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { getDb } from "../db/migrate.js";
import { games, gameInfo } from "../db/schema.js";
import { findSteamAppId, fetchSteamGameInfo } from "../modules/game-info/steamstore.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "game-info" });

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function registerGameInfoRoutes(app: FastifyInstance) {
  /**
   * GET /api/games/:id/info
   * Returns the cached game_info row.
   * 404 if the game doesn't exist or info hasn't been fetched yet.
   */
  app.get<{ Params: { id: string } }>("/api/games/:id/info", async (request, reply) => {
    const db = getDb();
    const [game] = await db.select({ id: games.id }).from(games).where(eq(games.id, request.params.id));
    if (!game) return reply.status(404).send({ error: "Game not found" });

    const [info] = await db.select().from(gameInfo).where(eq(gameInfo.gameId, request.params.id));
    if (!info) return reply.status(404).send({ error: "Game info not yet fetched" });

    return info;
  });

  /**
   * POST /api/games/:id/info/refresh
   * Deletes cached row and re-fetches from Steam Store API.
   * Returns the new game_info row, or 502 if Steam lookup fails.
   */
  app.post<{ Params: { id: string } }>("/api/games/:id/info/refresh", async (request, reply) => {
    const db = getDb();
    const [game] = await db.select({ id: games.id, name: games.name }).from(games).where(eq(games.id, request.params.id));
    if (!game) return reply.status(404).send({ error: "Game not found" });

    // Clear existing entry
    await db.delete(gameInfo).where(eq(gameInfo.gameId, game.id));

    const inserted = await fetchAndInsertGameInfo(game.id, game.name);
    if (!inserted) {
      return reply.status(502).send({ error: "Could not find game on Steam Store" });
    }

    const [info] = await db.select().from(gameInfo).where(eq(gameInfo.gameId, game.id));
    return info;
  });
}

// ---------------------------------------------------------------------------
// Exported utilities
// ---------------------------------------------------------------------------

/**
 * Fetches and caches game info for every game that has no game_info entry.
 * Non-blocking — called at startup and after Refresh Library.
 */
export async function syncMissingGameInfo(): Promise<void> {
  const db       = getDb();
  const allGames = await db.select({ id: games.id, name: games.name }).from(games);
  const covered  = new Set(
    (await db.select({ gameId: gameInfo.gameId }).from(gameInfo)).map((r) => r.gameId)
  );

  const toFetch = allGames.filter((g) => !covered.has(g.id));
  if (toFetch.length === 0) return;

  log.info({ count: toFetch.length }, "Fetching game info for library games");

  for (const game of toFetch) {
    try {
      await fetchAndInsertGameInfo(game.id, game.name);
    } catch (err) {
      log.warn({ gameName: game.name, err }, "Game info fetch failed");
    }
  }

  log.info({ count: toFetch.length }, "Game info sync complete");
}

/**
 * Deletes all game_info rows.
 * Called by POST /api/library/refresh.
 */
export async function clearAllGameInfo(): Promise<void> {
  const db = getDb();
  await db.delete(gameInfo);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Searches Steam for the game name, fetches metadata, and inserts a game_info row.
 * Also updates games.steamAppId if found.
 * Returns true on success, false if the game was not found on Steam.
 */
async function fetchAndInsertGameInfo(gameId: string, gameName: string): Promise<boolean> {
  const db = getDb();

  const appId = await findSteamAppId(gameName);
  if (!appId) {
    log.debug({ gameName }, "No Steam App ID found — skipping game info");
    return false;
  }

  // Persist the Steam App ID onto the game record
  await db.update(games).set({ steamAppId: appId }).where(eq(games.id, gameId));

  const data = await fetchSteamGameInfo(appId);
  if (!data) return false;

  await db.insert(gameInfo).values({
    gameId,
    source:      "steam",
    steamAppId:  appId,
    description: data.description || null,
    shortDesc:   data.shortDesc || null,
    developer:   data.developer,
    publisher:   data.publisher,
    releaseDate: data.releaseDate,
    genres:      data.genres.length > 0 ? JSON.stringify(data.genres) : null,
    metacritic:  data.metacritic,
    fetchedAt:   Date.now(),
  });

  log.info({ gameName, appId }, "Cached game info");
  return true;
}
