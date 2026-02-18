import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { readFileSync, readdirSync, mkdirSync, existsSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import * as schema from "./schema.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "db" });

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const DB_PATH = resolve(
  process.env.LPGL_DB_PATH ?? join(process.cwd(), "data", "launcher.db")
);

const MIGRATIONS_DIR = resolve(__dirname, "migrations");

let _db: ReturnType<typeof drizzle> | null = null;

/**
 * Returns the singleton Drizzle db instance.
 * Call initDb() at startup before using this.
 */
export function getDb() {
  if (!_db) throw new Error("DB not initialized — call initDb() first");
  return _db;
}

/**
 * Opens (or creates) the SQLite database and runs any pending migrations.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initDb(): Promise<void> {
  if (_db) return;

  // Ensure the data directory exists
  const dataDir = dirname(DB_PATH);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const sqlite = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  // Create migrations tracking table if it doesn't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )
  `);

  // Read applied migrations
  const applied = new Set<string>(
    (sqlite.prepare("SELECT name FROM _migrations").all() as { name: string }[])
      .map((r) => r.name)
  );

  // Read migration files in order
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const pending = files.filter((f) => !applied.has(f));

  if (pending.length > 0) {
    // Disable FK checks during migrations — required for table-recreating
    // migrations (SQLite can't DROP a referenced table with FKs enabled).
    // Re-enabled and verified after all migrations run.
    sqlite.pragma("foreign_keys = OFF");

    for (const file of pending) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");

      sqlite.transaction(() => {
        sqlite.exec(sql);
        sqlite.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
      })();

      log.info({ migration: file }, "Applied migration");
    }

    sqlite.pragma("foreign_keys = ON");

    // Verify no FK violations were introduced
    const fkErrors = sqlite.pragma("foreign_key_check") as unknown[];
    if (fkErrors.length > 0) {
      log.warn({ violations: fkErrors.length }, "Foreign key violations after migration");
    }
  }

  _db = drizzle(sqlite, { schema });
  log.info({ path: DB_PATH }, "DB ready");
}

// Allow running directly: `tsx src/backend/db/migrate.ts`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await initDb();
  log.info("Migrations complete");
  process.exit(0);
}
