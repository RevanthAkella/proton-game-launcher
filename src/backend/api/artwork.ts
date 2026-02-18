/**
 * ============================================================
 *  Artwork API Routes
 * ============================================================
 *
 * Routes:
 *   GET  /api/games/:id/artwork              List saved artwork for a game
 *   POST /api/games/:id/artwork/search       Search SteamGridDB (not persisted)
 *   POST /api/games/:id/artwork/set          Download + save artwork to DB
 *   GET  /api/games/:id/artwork/:type/file   Stream the cached image file
 *
 * Artwork is stored on disk under ~/.cache/lpgl/<gameId>/ and tracked
 * in the `artwork` table. Only one artwork record per game+type is kept —
 * setting a new one replaces the old.
 * ============================================================
 */
import type { FastifyInstance } from "fastify";
import { createReadStream } from "fs";
import { extname } from "path";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db/migrate.js";
import { games, artwork } from "../db/schema.js";
import { getSettings } from "../modules/settings/index.js";
import { createSteamGridDbProvider } from "../modules/artwork/index.js";
import type { ArtworkResult } from "../modules/artwork/index.js";

// Content-type map for streaming cached files
const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  ico: "image/x-icon",
  gif: "image/gif",
};

export async function registerArtworkRoutes(app: FastifyInstance) {
  // ── GET /api/games/:id/artwork ──────────────────────────────────────────

  /**
   * Lists all saved artwork records for a game.
   *
   * Each record includes:
   *   id, gameId, type, localPath, sourceUrl, provider, createdAt
   *
   * To display an image in a browser, use the /file route:
   *   GET /api/games/:id/artwork/<type>/file
   *
   * Responses:
   *   200  Artwork[]
   *   404  Game not found
   */
  app.get<{ Params: { id: string } }>("/api/games/:id/artwork", async (request, reply) => {
    const db = getDb();
    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, request.params.id));

    if (!game) return reply.status(404).send({ error: "Game not found" });

    return db.select().from(artwork).where(eq(artwork.gameId, game.id));
  });

  // ── POST /api/games/:id/artwork/search ──────────────────────────────────

  /**
   * Searches SteamGridDB for artwork matching the game name (or a custom query).
   * Results are NOT persisted — use /set to save a chosen result.
   *
   * Body (optional): { query?: string }
   *   query — overrides the game's name for the search term
   *
   * Responses:
   *   200  { query: string; results: ArtworkResult[] }
   *   400  API key not configured
   *   404  Game not found
   *   502  SteamGridDB request failed
   */
  app.post<{
    Params: { id: string };
    Body?: { query?: string };
  }>("/api/games/:id/artwork/search", async (request, reply) => {
    const db = getDb();
    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, request.params.id));

    if (!game) return reply.status(404).send({ error: "Game not found" });

    const settings = getSettings();
    if (!settings.steamGridDbApiKey) {
      return reply.status(400).send({
        error: "SteamGridDB API key not configured.",
        hint: 'Set steamGridDbApiKey via PUT /api/settings with { "steamGridDbApiKey": "<key>" }.',
      });
    }

    const query = request.body?.query ?? game.name;
    const provider = createSteamGridDbProvider(settings.steamGridDbApiKey);

    try {
      const results = await provider.search(query);
      return { query, results };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: `SteamGridDB search failed: ${message}` });
    }
  });

  // ── POST /api/games/:id/artwork/set ─────────────────────────────────────

  /**
   * Downloads an artwork URL and saves it to the DB.
   * Replaces any existing artwork of the same type for this game.
   *
   * Body: { url: string; type: "grid" | "hero" | "logo" | "icon" | "home" }
   *
   * Responses:
   *   200  Artwork  (the saved DB record)
   *   400  Missing fields or API key not configured
   *   404  Game not found
   *   502  Download failed
   */
  app.post<{
    Params: { id: string };
    Body: { url: string; type: ArtworkResult["type"] };
  }>("/api/games/:id/artwork/set", async (request, reply) => {
    const db = getDb();
    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, request.params.id));

    if (!game) return reply.status(404).send({ error: "Game not found" });

    const { url, type } = request.body ?? {};

    if (!url || !type) {
      return reply.status(400).send({ error: '"url" and "type" are required in the request body.' });
    }

    const VALID_TYPES = new Set(["grid", "hero", "logo", "icon", "home"]);
    if (!VALID_TYPES.has(type)) {
      return reply.status(400).send({
        error: `Invalid type "${type}". Must be one of: grid, hero, logo, icon, home.`,
      });
    }

    const settings = getSettings();
    if (!settings.steamGridDbApiKey) {
      return reply.status(400).send({
        error: "SteamGridDB API key not configured.",
        hint: 'Set steamGridDbApiKey via PUT /api/settings with { "steamGridDbApiKey": "<key>" }.',
      });
    }

    const provider = createSteamGridDbProvider(settings.steamGridDbApiKey);

    try {
      const localPath = await provider.download(url, game.id, type);

      // Replace existing artwork of the same type for this game
      await db
        .delete(artwork)
        .where(and(eq(artwork.gameId, game.id), eq(artwork.type, type)));

      const id = uuidv4();
      await db.insert(artwork).values({
        id,
        gameId: game.id,
        type,
        localPath,
        sourceUrl: url,
        provider: "steamgriddb",
      });

      const [saved] = await db.select().from(artwork).where(eq(artwork.id, id));
      return saved;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: `Artwork download failed: ${message}` });
    }
  });

  // ── GET /api/games/:id/artwork/:type/file ───────────────────────────────

  /**
   * Streams the cached artwork image file for display in a browser.
   *
   * URL params:
   *   type — "grid" | "hero" | "logo" | "icon" | "home"
   *
   * Responses:
   *   200  image/*  (streamed from disk)
   *   404  Game not found, artwork not in DB, or file missing from disk
   */
  app.get<{
    Params: { id: string; type: string };
  }>("/api/games/:id/artwork/:type/file", async (request, reply) => {
    const db = getDb();
    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, request.params.id));

    if (!game) return reply.status(404).send({ error: "Game not found" });

    const [art] = await db
      .select()
      .from(artwork)
      .where(
        and(eq(artwork.gameId, game.id), eq(artwork.type, request.params.type))
      );

    if (!art) {
      return reply.status(404).send({ error: "No artwork of this type saved for this game" });
    }

    try {
      const stream = createReadStream(art.localPath);
      const ext = extname(art.localPath).slice(1).toLowerCase();
      const contentType = CONTENT_TYPES[ext] ?? "image/jpeg";
      reply.header("Content-Type", contentType);
      reply.header("Cache-Control", "public, max-age=86400");
      return reply.send(stream);
    } catch {
      return reply.status(404).send({ error: "Artwork file not found on disk" });
    }
  });
}
