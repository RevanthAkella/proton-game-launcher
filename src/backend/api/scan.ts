import type { FastifyInstance } from "fastify";
import { join } from "path";
import { homedir } from "os";
import { v4 as uuidv4 } from "uuid";
import { eq, isNull } from "drizzle-orm";
import { getDb } from "../db/migrate.js";
import { games, artwork } from "../db/schema.js";
import { getSettings, AbsolutePath } from "../modules/settings/index.js";
import { scanPaths, type ScannedGame } from "../modules/game-scanner/index.js";
import { z } from "zod";
import { createSteamGridDbProvider } from "../modules/artwork/index.js";
import { broadcast } from "./ws.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "scan" });

const WINE_PREFIX_BASE = join(homedir(), ".local", "share", "lpgl", "prefixes");

// ---------------------------------------------------------------------------
// Scan state (module-level singleton)
// ---------------------------------------------------------------------------

type ScanStatus = "idle" | "running" | "done" | "error";

interface ScanState {
  status: ScanStatus;
  progress: {
    current: string;
    found: number;
    total: number;
  };
  lastRun: number | null;
  lastResults: {
    added: number;
    skipped: number;
    relinked: number;
    total: number;
  } | null;
  lastError: string | null;
}

const scanState: ScanState = {
  status: "idle",
  progress: { current: "", found: 0, total: 0 },
  lastRun: null,
  lastResults: null,
  lastError: null,
};

// ---------------------------------------------------------------------------
// Scan execution
// ---------------------------------------------------------------------------

async function persistScannedGames(
  scanned: ScannedGame[]
): Promise<{ added: number; skipped: number; relinked: number; newGames: Array<{ id: string; name: string }> }> {
  const db = getDb();
  let added = 0;
  let skipped = 0;
  let relinked = 0;
  const newGames: Array<{ id: string; name: string }> = [];

  // Pre-fetch all unlinked games (rootPath IS NULL) for re-linking checks
  const unlinkedGames = await db
    .select({ id: games.id, name: games.name })
    .from(games)
    .where(isNull(games.rootPath));

  // Build a case-insensitive name→id map for fast lookup
  const unlinkedByName = new Map<string, string>();
  for (const g of unlinkedGames) {
    unlinkedByName.set(g.name.toLowerCase(), g.id);
  }

  for (const game of scanned) {
    // Check for existing game by rootPath to avoid duplicates
    const existing = await db
      .select({ id: games.id })
      .from(games)
      .where(eq(games.rootPath, game.rootPath));

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    // Check for an unlinked game matching by name (case-insensitive)
    const unlinkedId = unlinkedByName.get(game.name.toLowerCase());
    if (unlinkedId) {
      await db
        .update(games)
        .set({ rootPath: game.rootPath, exePath: game.exePath })
        .where(eq(games.id, unlinkedId));

      // Remove from map so the same unlinked game isn't re-linked twice
      unlinkedByName.delete(game.name.toLowerCase());

      log.info({ gameId: unlinkedId, name: game.name }, "Re-linked unlinked game");
      relinked++;
      continue;
    }

    const id = uuidv4();
    const winePrefix = join(WINE_PREFIX_BASE, id);

    await db.insert(games).values({
      id,
      name: game.name,
      rootPath: game.rootPath,
      exePath: game.exePath,
      winePrefix,
    });

    newGames.push({ id, name: game.name });
    added++;
  }

  return { added, skipped, relinked, newGames };
}

/**
 * Fetches artwork for each newly added game in the background.
 * Non-blocking — failures are logged but never propagate to the caller.
 * Downloads only the first result of each art type (grid, hero, logo, icon).
 */
async function fetchArtworkForNewGames(
  newGames: Array<{ id: string; name: string }>
): Promise<void> {
  const settings = getSettings();
  if (!settings.steamGridDbApiKey) return; // no API key — skip silently

  const db = getDb();
  const provider = createSteamGridDbProvider(settings.steamGridDbApiKey);

  for (const game of newGames) {
    try {
      const results = await provider.search(game.name);
      if (results.length === 0) continue;

      // Group by type and pick the first result for each
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
          log.info({ type, gameId: game.id, gameName: game.name }, "Fetched artwork");
        } catch (err) {
          log.warn({ type, gameName: game.name, err }, "Failed to download artwork");
        }
      }
    } catch (err) {
      log.warn({ gameName: game.name, err }, "Artwork search failed");
    }
  }
}

async function runScan(paths: string[]): Promise<void> {
  scanState.status = "running";
  scanState.progress = { current: "", found: 0, total: 0 };
  scanState.lastError = null;

  broadcast({ type: "scan_started", paths, timestamp: Date.now() });

  try {
    const scanned = await scanPaths(paths, (event) => {
      scanState.progress = event;
      broadcast({ type: "scan_progress", ...event, timestamp: Date.now() });
    });

    const { added, skipped, relinked, newGames } = await persistScannedGames(scanned);

    scanState.status = "done";
    scanState.lastRun = Date.now();
    scanState.lastResults = { added, skipped, relinked, total: scanned.length };

    broadcast({
      type: "scan_complete",
      added,
      skipped,
      relinked,
      total: scanned.length,
      timestamp: Date.now(),
    });

    log.info({ total: scanned.length, added, skipped, relinked }, "Scan complete");

    // Fetch artwork for new games in the background — non-blocking
    if (newGames.length > 0) {
      fetchArtworkForNewGames(newGames)
        .then(() => broadcast({ type: "artwork_complete", count: newGames.length, timestamp: Date.now() }))
        .catch((err) => log.warn({ err }, "Background artwork fetch error"));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    scanState.status = "error";
    scanState.lastError = message;

    broadcast({ type: "scan_error", message, timestamp: Date.now() });

    log.error({ err }, "Scan failed");
  }
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

const ScanBody = z
  .object({ paths: z.array(AbsolutePath).optional() })
  .optional();

export async function registerScanRoutes(app: FastifyInstance) {
  /**
   * POST /api/scan
   * Triggers a directory scan. Uses `paths` from the request body if provided,
   * otherwise falls back to `settings.scanPaths`.
   * Returns 202 if the scan starts, 409 if a scan is already running.
   */
  app.post("/api/scan", async (request, reply) => {
    const bodyParsed = ScanBody.safeParse(request.body);
    if (!bodyParsed.success) {
      return reply.status(400).send({ error: bodyParsed.error.flatten() });
    }

    if (scanState.status === "running") {
      return reply.status(409).send({
        error: "A scan is already in progress",
        progress: scanState.progress,
      });
    }

    const settings = getSettings();
    const paths: string[] =
      bodyParsed.data?.paths?.length
        ? bodyParsed.data.paths
        : settings.scanPaths;

    if (paths.length === 0) {
      return reply.status(400).send({
        error:
          "No scan paths provided. Add paths in the request body or configure scanPaths in settings.",
      });
    }

    // Fire and forget — clients track progress via WebSocket
    runScan(paths).catch((err) => {
      log.error({ err }, "Unhandled scan error");
    });

    return reply.status(202).send({
      status: "started",
      paths,
      message: "Scan started. Subscribe to /ws for real-time progress.",
    });
  });

  /**
   * GET /api/scan/status
   * Returns the current or last scan state — useful for reconnecting clients
   * that missed the WebSocket events.
   */
  app.get("/api/scan/status", async () => {
    return {
      status: scanState.status,
      progress: scanState.progress,
      lastRun: scanState.lastRun,
      lastResults: scanState.lastResults,
      lastError: scanState.lastError,
    };
  });
}
