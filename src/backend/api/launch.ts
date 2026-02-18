import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/migrate.js";
import { games } from "../db/schema.js";
import { getSettings } from "../modules/settings/index.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "launch" });
import {
  detectProtonVersions,
  findProtonVersion,
  launch,
  kill,
  getStatus,
  getRunningGame,
  setOnExitCallback,
} from "../modules/proton-runner/index.js";
import { broadcast } from "./ws.js";

// ---------------------------------------------------------------------------
// Exit callback — updates play time and broadcasts status
// ---------------------------------------------------------------------------

setOnExitCallback(async (gameId, _exitCode, _signal, startedAt) => {
  const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);

  try {
    const db = getDb();
    await db
      .update(games)
      .set({
        playTimeSeconds: sql`${games.playTimeSeconds} + ${elapsedSeconds}`,
      })
      .where(eq(games.id, gameId));
  } catch (err) {
    log.error({ gameId, err }, "Failed to update play time");
  }

  broadcast({
    type: "launch_status",
    gameId,
    status: "stopped",
    timestamp: Date.now(),
  });
});

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function registerLaunchRoutes(app: FastifyInstance) {
  /**
   * POST /api/games/:id/launch
   * Launches a game through Proton.
   *
   * Body (optional): { protonId?: string }  — overrides the game/settings default for this launch.
   *
   * Responses:
   *   200  { pid, protonId }
   *   400  No Proton version configured / Proton not found on disk
   *   404  Game not found
   *   409  Game already running
   *   500  spawn failed
   */
  app.post<{
    Params: { id: string };
    Body?: { protonId?: string };
  }>("/api/games/:id/launch", async (request, reply) => {
    const db = getDb();
    const settings = getSettings();

    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, request.params.id));

    if (!game) return reply.status(404).send({ error: "Game not found" });

    if (!game.exePath || !game.rootPath) {
      return reply.status(400).send({ error: "Game is not installed (no path configured)" });
    }

    if (getStatus(game.id) === "running") {
      const running = getRunningGame(game.id)!;
      return reply.status(409).send({
        error: "Game is already running",
        pid: running.pid,
        startedAt: running.startedAt,
      });
    }

    // Resolve Proton version: per-launch override → game preference → global default
    const protonId =
      request.body?.protonId ??
      game.protonId ??
      settings.defaultProtonVersion;

    if (!protonId) {
      return reply.status(400).send({
        error:
          "No Proton version configured. " +
          "Set a default via PUT /api/settings or assign one to this game via PUT /api/games/:id.",
        hint: "GET /api/proton/versions to see what is installed.",
      });
    }

    const protonVersion = findProtonVersion(protonId);
    if (!protonVersion) {
      return reply.status(400).send({
        error: `Proton version "${protonId}" was not found on disk.`,
        hint: "GET /api/proton/versions to see installed versions.",
      });
    }

    try {
      const child = launch(game.id, {
        exePath: game.exePath!,
        protonPath: protonVersion.path,
        steamAppId: game.steamAppId ?? undefined,
        winePrefix: game.winePrefix,
      });

      // Update last_played timestamp
      await db
        .update(games)
        .set({ lastPlayed: Date.now() })
        .where(eq(games.id, game.id));

      broadcast({
        type: "launch_status",
        gameId: game.id,
        status: "running",
        pid: child.pid,
        timestamp: Date.now(),
      });

      return { pid: child.pid, protonId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: `Failed to launch: ${message}` });
    }
  });

  /**
   * POST /api/games/:id/kill
   * Sends SIGTERM to a running game process.
   *
   * Responses:
   *   200  { stopped: true }
   *   404  Game not found or not currently running
   *   500  kill failed
   */
  app.post<{ Params: { id: string } }>("/api/games/:id/kill", async (request, reply) => {
    const db = getDb();
    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, request.params.id));

    if (!game) return reply.status(404).send({ error: "Game not found" });

    if (getStatus(game.id) !== "running") {
      return reply.status(404).send({ error: "Game is not currently running" });
    }

    try {
      kill(game.id);
      // The exit callback will broadcast 'stopped' and update play time
      return { stopped: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: message });
    }
  });

  /**
   * GET /api/games/:id/status
   * Returns the current run state for a game.
   *
   * Responses:
   *   200  { status, pid, startedAt }
   *   404  Game not found
   */
  app.get<{ Params: { id: string } }>("/api/games/:id/status", async (request, reply) => {
    const db = getDb();
    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, request.params.id));

    if (!game) return reply.status(404).send({ error: "Game not found" });

    const status = getStatus(game.id);
    const running = getRunningGame(game.id);

    return {
      status,
      pid: running?.pid ?? null,
      startedAt: running?.startedAt ?? null,
    };
  });

  /**
   * GET /api/proton/versions
   * Lists all Proton installations detected on the system.
   *
   * Response: ProtonVersion[]  (sorted newest-first, may be empty if none installed)
   */
  app.get("/api/proton/versions", async () => {
    return detectProtonVersions();
  });
}
