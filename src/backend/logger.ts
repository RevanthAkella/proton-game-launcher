/**
 * logger.ts — Shared pino logger for all backend modules
 *
 * A single pino instance is created at startup and exported here.
 * Every module should import `logger` and call `.child({ module: "<name>" })`
 * to create a scoped logger that includes the module name in every entry.
 *
 * Fastify receives the same instance via `loggerInstance` so that all
 * request/response logs and application logs share one output stream.
 *
 * Log level:
 *   • LPGL_LOG_LEVEL env var — overrides everything (e.g. "debug", "trace")
 *   • NODE_ENV === "production" → "info"   (NDJSON, no pretty-print)
 *   • otherwise               → "debug"   (pino-pretty, colorised)
 */

import pino from "pino";

const isProd = process.env.NODE_ENV === "production";
const level  = process.env.LPGL_LOG_LEVEL ?? (isProd ? "info" : "debug");

export const logger = pino(
  isProd
    ? { level }
    : {
        level,
        transport: {
          target:  "pino-pretty",
          options: { colorize: true },
        },
      }
);
