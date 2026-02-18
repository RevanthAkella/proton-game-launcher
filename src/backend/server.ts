import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyWebSocket from "@fastify/websocket";
import { resolve, join } from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";
import { initDb } from "./db/migrate.js";
import { loadSettings, getSettings } from "./modules/settings/index.js";
import { registerGamesRoutes } from "./api/games.js";
import { registerSettingsRoutes, syncMissingArtwork } from "./api/settings.js";
import { registerGameInfoRoutes, syncMissingGameInfo } from "./api/game-info.js";
import { registerScanRoutes } from "./api/scan.js";
import { registerLaunchRoutes } from "./api/launch.js";
import { registerArtworkRoutes } from "./api/artwork.js";
import { registerWsRoutes, broadcast } from "./api/ws.js";
import { startControllerBridge, stopControllerBridge } from "./api/controller.js";
import {
  createSteamGridDbProvider,
  setArtworkProvider,
} from "./modules/artwork/index.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export async function buildServer() {
  const settings = await loadSettings();

  const app = Fastify({
    logger: {
      level: process.env.LPGL_LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
      transport: process.env.NODE_ENV !== "production"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
    },
  });

  // WebSocket support
  await app.register(fastifyWebSocket);

  // Serve the active frontend theme as static files
  // __dirname = src/backend/ → ../frontend/<theme>
  const frontendPath = resolve(
    __dirname,
    "../frontend",
    settings.theme
  );
  await app.register(fastifyStatic, {
    root: frontendPath,
    prefix: "/",
  });

  // Health check — always available regardless of frontend
  app.get("/api/health", async () => ({
    status: "ok",
    version: "0.1.0",
    theme: settings.theme,
    timestamp: Date.now(),
  }));

  // Register SteamGridDB as the artwork provider (only if API key is set)
  if (settings.steamGridDbApiKey) {
    setArtworkProvider(createSteamGridDbProvider(settings.steamGridDbApiKey));
  }

  // Register route modules
  await registerGamesRoutes(app);
  await registerSettingsRoutes(app);
  await registerScanRoutes(app);
  await registerLaunchRoutes(app);
  await registerArtworkRoutes(app);
  await registerGameInfoRoutes(app);
  await registerWsRoutes(app);

  return app;
}

/** Start the controller bridge after the server is listening. */
export { startControllerBridge, stopControllerBridge };

async function main() {
  // Ensure DB and migrations are ready before accepting requests
  await initDb();

  const app = await buildServer();
  const port = Number(process.env.LPGL_PORT ?? 9420);
  const host = process.env.LPGL_HOST ?? "127.0.0.1";

  try {
    await app.listen({ port, host });
    logger.info({ url: `http://${host}:${port}` }, "Launcher ready");
    startControllerBridge();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Sync artwork for any library games missing local files — non-blocking
  const { steamGridDbApiKey } = getSettings();
  if (steamGridDbApiKey) {
    syncMissingArtwork(steamGridDbApiKey)
      .then(() => broadcast({ type: "artwork_complete", timestamp: Date.now() }))
      .catch((err) => logger.warn({ err }, "Startup artwork sync error"));
  }

  // Sync game info for any library games without cached metadata — non-blocking
  syncMissingGameInfo()
    .catch((err) => logger.warn({ err }, "Startup game info sync error"));

  // Graceful shutdown — stop controller adapter before exiting
  const shutdown = () => {
    stopControllerBridge();
    process.exit(0);
  };
  process.once("SIGINT",  shutdown);
  process.once("SIGTERM", shutdown);
}

main();
