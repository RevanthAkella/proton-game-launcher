import { readFileSync, writeFileSync, existsSync, copyFileSync } from "fs";
import { resolve, join } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { logger } from "../../logger.js";

const log = logger.child({ module: "settings" });

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Validates a single scan path: must be a non-empty absolute Unix path.
 * Rejects empty strings and Windows-style or relative paths.
 */
export const AbsolutePath = z
  .string()
  .min(1, "Path must not be empty")
  .refine((p) => p.startsWith("/"), {
    message: "Scan path must be an absolute path starting with /",
  });

export const SettingsSchema = z.object({
  defaultProtonVersion: z.string().default(""),
  /** Each entry must be a non-empty absolute Unix path. */
  scanPaths: z.array(AbsolutePath).default([]),
  /** Whitespace is stripped automatically on save. */
  steamGridDbApiKey: z.string().trim().default(""),
  controllerEnabled: z.boolean().default(true),
  showUninstalledGames: z.boolean().default(false),
  theme: z.string().default("html-template"),
  language: z.string().default("en"),
});

export type Settings = z.infer<typeof SettingsSchema>;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const CONFIG_DIR = resolve(process.cwd(), "config");
const CONFIG_PATH = join(CONFIG_DIR, "settings.json");
const EXAMPLE_PATH = resolve(process.cwd(), "config.example.json");

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------
let _settings: Settings | null = null;

function ensureConfigExists(): void {
  if (!existsSync(CONFIG_PATH)) {
    copyFileSync(EXAMPLE_PATH, CONFIG_PATH);
    log.info({ path: CONFIG_PATH }, "Created settings from example template");
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Loads settings from disk, creating config/settings.json from the example
 * template if it does not exist yet. Cached in memory after first load.
 */
export async function loadSettings(): Promise<Settings> {
  if (_settings) return _settings;

  ensureConfigExists();

  const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  _settings = SettingsSchema.parse(raw);
  return _settings;
}

/**
 * Returns the cached settings. loadSettings() must have been called first.
 */
export function getSettings(): Settings {
  if (!_settings) throw new Error("Settings not loaded — call loadSettings() first");
  return _settings;
}

/**
 * Merges a partial patch into the current settings and persists to disk.
 */
export function updateSettings(patch: Partial<Settings>): Settings {
  const current = getSettings();
  const next = SettingsSchema.parse({ ...current, ...patch });
  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + "\n", "utf-8");
  _settings = next;
  return next;
}
