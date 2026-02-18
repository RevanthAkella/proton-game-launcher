import type { FastifyInstance } from "fastify";
import { existsSync } from "fs";
import { rmSync } from "fs";
import { v4 as uuidv4 } from "uuid";
import { eq, inArray } from "drizzle-orm";
import { getSettings, updateSettings, SettingsSchema } from "../modules/settings/index.js";
import { getDb } from "../db/migrate.js";
import { games, artwork } from "../db/schema.js";
import { createSteamGridDbProvider, CACHE_BASE } from "../modules/artwork/index.js";
import { clearAllGameInfo, syncMissingGameInfo } from "./game-info.js";
import { broadcast } from "./ws.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "settings" });

export async function registerSettingsRoutes(app: FastifyInstance) {
  // GET /api/settings
  app.get("/api/settings", async () => {
    return getSettings();
  });

  // PUT /api/settings
  app.put("/api/settings", async (request, reply) => {
    const partial = SettingsSchema.partial().safeParse(request.body);
    if (!partial.success) {
      return reply.status(400).send({ error: partial.error.flatten() });
    }

    const previous = getSettings();
    const updated  = updateSettings(partial.data);

    // ── Soft-unlink games not under any active scan path ───────────────────
    // After every scanPaths save, find all DB games whose rootPath no longer
    // falls under any currently configured scan path and soft-unlink them
    // (set rootPath = NULL, exePath = NULL). This preserves the game row and
    // all associated data (artwork, game_info, play time, progress).
    if (partial.data.scanPaths !== undefined) {
      const db = getDb();
      const currentPaths = (updated.scanPaths ?? []).map((p) => p.replace(/\/+$/, ""));

      const allGames = await db.select({ id: games.id, rootPath: games.rootPath }).from(games);

      const orphaned = allGames.filter((g) =>
        g.rootPath != null && (
          currentPaths.length === 0 ||
          !currentPaths.some((p) => g.rootPath === p || g.rootPath!.startsWith(p + "/"))
        )
      );

      if (orphaned.length > 0) {
        const ids = orphaned.map((g) => g.id);
        await db.update(games)
          .set({ rootPath: null, exePath: null })
          .where(inArray(games.id, ids));
        log.info({ count: orphaned.length, currentPaths }, "Soft-unlinked games not under any active scan path");
        broadcast({ type: "games_unlinked", count: orphaned.length, timestamp: Date.now() });
      }
    }

    // ── Artwork sync when API key changes ──────────────────────────────────
    // If a new SteamGridDB API key was just saved, sync artwork for any
    // existing library games that have no working artwork on disk.
    const keyChanged =
      partial.data.steamGridDbApiKey !== undefined &&
      updated.steamGridDbApiKey &&
      updated.steamGridDbApiKey !== previous.steamGridDbApiKey;

    if (keyChanged) {
      syncMissingArtwork(updated.steamGridDbApiKey)
        .then(() => broadcast({ type: "artwork_complete", timestamp: Date.now() }))
        .catch((err) => log.warn({ err }, "Artwork sync error"));
    }

    return updated;
  });

  // POST /api/library/refresh
  app.post("/api/library/refresh", async (_request, reply) => {
    const db = getDb();

    // 1. Wipe all artwork DB records
    await db.delete(artwork);

    // 2. Wipe all game info DB records
    await clearAllGameInfo();

    // 3. Delete cache files on disk (best-effort — ignore errors)
    try {
      rmSync(CACHE_BASE, { recursive: true, force: true });
    } catch {
      // Non-fatal: files may not exist yet
    }

    // 4. Re-sync artwork + game info in the background
    const settings = getSettings();
    if (settings.steamGridDbApiKey) {
      syncMissingArtwork(settings.steamGridDbApiKey)
        .then(() => broadcast({ type: "artwork_complete", timestamp: Date.now() }))
        .catch((err) => log.warn({ err }, "Library refresh artwork error"));
    }

    syncMissingGameInfo()
      .catch((err) => log.warn({ err }, "Library refresh game info error"));

    log.info("Library refresh started");
    return reply.status(202).send({ status: "started", message: "Library refresh started in background." });
  });
}

/**
 * Fetches artwork for every game in the library that has no working artwork on disk.
 *
 * "Working" means at least one DB record exists AND the local file is present.
 * Stale DB records (file deleted from cache) are removed before re-downloading.
 *
 * Called:
 *   • At server startup (via server.ts main)
 *   • When the SteamGridDB API key is saved via PUT /api/settings
 *
 * Runs in the background — never blocks the caller.
 */
export async function syncMissingArtwork(apiKey: string): Promise<void> {
  const db       = getDb();
  const provider = createSteamGridDbProvider(apiKey);

  const allGames   = await db.select({ id: games.id, name: games.name }).from(games);
  const allArtwork = await db
    .select({ gameId: artwork.gameId, localPath: artwork.localPath })
    .from(artwork);

  // Games with at least one record where the cache file exists on disk
  const coveredIds = new Set(
    allArtwork.filter((r) => existsSync(r.localPath)).map((r) => r.gameId)
  );

  // Games that have DB records but every file is missing — these need cleanup
  const staleIds = new Set(
    allArtwork
      .filter((r) => !existsSync(r.localPath))
      .map((r) => r.gameId)
      .filter((id) => !coveredIds.has(id))
  );

  const toFetch = allGames.filter((g) => !coveredIds.has(g.id));
  if (toFetch.length === 0) return;

  log.info({ count: toFetch.length }, "Syncing artwork for library games");

  // Delete stale DB records before re-downloading so inserts don't conflict
  for (const id of staleIds) {
    await db.delete(artwork).where(eq(artwork.gameId, id));
  }

  for (const game of toFetch) {
    try {
      const results = await provider.search(game.name);
      if (results.length === 0) continue;

      const byType = new Map<string, (typeof results)[0]>();
      for (const r of results) {
        if (!byType.has(r.type)) byType.set(r.type, r);
      }

      for (const [type, result] of byType) {
        try {
          const localPath = await provider.download(result.url, game.id, type);
          await db.insert(artwork).values({
            id: uuidv4(),
            gameId: game.id,
            type,
            localPath,
            sourceUrl: result.url,
            provider: "steamgriddb",
          });
          log.info({ type, gameId: game.id, gameName: game.name }, "Synced artwork");
        } catch (err) {
          log.warn({ type, gameName: game.name, err }, "Artwork sync download failed");
        }
      }
    } catch (err) {
      log.warn({ gameName: game.name, err }, "Artwork sync search failed");
    }
  }

  log.info({ count: toFetch.length }, "Artwork sync complete");
}
