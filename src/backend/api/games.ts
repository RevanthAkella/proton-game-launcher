import type { FastifyInstance } from "fastify";
import { getDb } from "../db/migrate.js";
import { games } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { join, basename } from "path";
import { homedir } from "os";
import { existsSync } from "fs";
import { detectExeInDirectory } from "../modules/game-scanner/detect.js";

const WINE_PREFIX_BASE = join(homedir(), ".local", "share", "lpgl", "prefixes");

/**
 * Compute the displayed progress value (0–100).
 * Priority: manual override > 0 (HLTB auto-calc is a future enhancement).
 */
export function computeProgress(progressOverride: number | null): number {
  if (progressOverride !== null) return progressOverride;
  return 0;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------
export async function registerGamesRoutes(app: FastifyInstance) {
  // GET /api/games — list all non-hidden games
  app.get("/api/games", async (request, reply) => {
    const db = getDb();
    const rows = await db.select().from(games).where(eq(games.hidden, false));
    return rows;
  });

  // GET /api/games/:id — single game
  app.get<{ Params: { id: string } }>("/api/games/:id", async (request, reply) => {
    const db = getDb();
    const [row] = await db
      .select()
      .from(games)
      .where(eq(games.id, request.params.id));

    if (!row) return reply.status(404).send({ error: "Game not found" });
    return row;
  });

  // POST /api/games — manually add a game
  const AddGameBody = z.object({
    name: z.string().min(1),
    rootPath: z.string().min(1),
    exePath: z.string().min(1),
    protonId: z.string().optional(),
    steamAppId: z.string().optional(),
  });

  app.post("/api/games", async (request, reply) => {
    const body = AddGameBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const db = getDb();
    const id = uuidv4();
    const winePrefix = join(WINE_PREFIX_BASE, id);

    await db.insert(games).values({
      id,
      name: body.data.name,
      rootPath: body.data.rootPath,
      exePath: body.data.exePath,
      protonId: body.data.protonId ?? null,
      steamAppId: body.data.steamAppId ?? null,
      winePrefix,
    });

    const [row] = await db.select().from(games).where(eq(games.id, id));
    return reply.status(201).send(row);
  });

  // PUT /api/games/:id — update metadata
  const UpdateGameBody = z.object({
    name: z.string().min(1).optional(),
    exePath: z.string().min(1).optional(),
    protonId: z.string().nullable().optional(),
    steamAppId: z.string().nullable().optional(),
    hidden: z.boolean().optional(),
  });

  app.put<{ Params: { id: string } }>("/api/games/:id", async (request, reply) => {
    const db = getDb();
    const body = UpdateGameBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const [existing] = await db
      .select()
      .from(games)
      .where(eq(games.id, request.params.id));
    if (!existing) return reply.status(404).send({ error: "Game not found" });

    await db
      .update(games)
      .set(body.data)
      .where(eq(games.id, request.params.id));

    const [updated] = await db
      .select()
      .from(games)
      .where(eq(games.id, request.params.id));
    return updated;
  });

  // PUT /api/games/:id/progress — set or clear manual progress override
  const ProgressBody = z.object({
    progressOverride: z.number().int().min(0).max(100).nullable(),
  });

  app.put<{ Params: { id: string } }>("/api/games/:id/progress", async (request, reply) => {
    const db = getDb();
    const body = ProgressBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const [existing] = await db
      .select()
      .from(games)
      .where(eq(games.id, request.params.id));
    if (!existing) return reply.status(404).send({ error: "Game not found" });

    const override = body.data.progressOverride;
    const progress = computeProgress(override);

    await db
      .update(games)
      .set({ progressOverride: override, progress })
      .where(eq(games.id, request.params.id));

    const [updated] = await db
      .select()
      .from(games)
      .where(eq(games.id, request.params.id));
    return updated;
  });

  // PUT /api/games/:id/path — manually set rootPath + auto-detect exePath
  const SetPathBody = z.object({
    rootPath: z.string().min(1),
  });

  app.put<{ Params: { id: string } }>("/api/games/:id/path", async (request, reply) => {
    const db = getDb();
    const body = SetPathBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const [existing] = await db
      .select()
      .from(games)
      .where(eq(games.id, request.params.id));
    if (!existing) return reply.status(404).send({ error: "Game not found" });

    const rootPath = body.data.rootPath;
    if (!existsSync(rootPath)) {
      return reply.status(400).send({ error: "Directory does not exist" });
    }

    const exePath = detectExeInDirectory(rootPath);
    if (!exePath) {
      return reply.status(400).send({ error: "No valid .exe files found in that directory" });
    }

    await db
      .update(games)
      .set({ rootPath, exePath })
      .where(eq(games.id, request.params.id));

    const [updated] = await db
      .select()
      .from(games)
      .where(eq(games.id, request.params.id));
    return updated;
  });

  // DELETE /api/games/:id
  app.delete<{ Params: { id: string } }>("/api/games/:id", async (request, reply) => {
    const db = getDb();
    const [existing] = await db
      .select()
      .from(games)
      .where(eq(games.id, request.params.id));
    if (!existing) return reply.status(404).send({ error: "Game not found" });

    await db.delete(games).where(eq(games.id, request.params.id));
    return reply.status(204).send();
  });
}
