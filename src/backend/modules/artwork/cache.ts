/**
 * ============================================================
 *  Artwork Cache — Disk-based image cache
 * ============================================================
 *
 * Manages artwork storage under ~/.cache/lpgl/<gameId>/.
 * Provides pure path helpers (testable without FS) and
 * an async downloader that fetches a URL to a local file.
 *
 * Cache layout:
 *   ~/.cache/lpgl/
 *   └── <gameId>/
 *       ├── grid.jpg
 *       ├── hero.png
 *       ├── logo.png
 *       └── icon.ico
 * ============================================================
 */
import { createWriteStream, mkdirSync } from "fs";
import { join, extname, basename } from "path";
import { homedir } from "os";
import fetch from "node-fetch";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Absolute path to the top-level cache directory. */
export const CACHE_BASE = join(homedir(), ".cache", "lpgl");

/**
 * Returns the per-game cache directory path.
 * Pure — no filesystem access.
 */
export function getCacheDir(gameId: string): string {
  return join(CACHE_BASE, gameId);
}

/**
 * Returns the full absolute path for a cached file.
 * Pure — no filesystem access.
 */
export function getCachePath(gameId: string, filename: string): string {
  return join(getCacheDir(gameId), filename);
}

/**
 * Derives a deterministic cache filename from an artwork type and source URL.
 * The type becomes the base name; the URL's file extension is preserved.
 * Falls back to ".jpg" if the URL has no recognised image extension.
 *
 * Pure — no filesystem access.
 *
 * @example
 *   buildCacheFilename("grid", "https://cdn.steamgriddb.com/grid/abc.jpg") → "grid.jpg"
 *   buildCacheFilename("hero", "https://cdn.example.com/hero.png?v=2")     → "hero.png"
 *   buildCacheFilename("logo", "https://cdn.example.com/logo")             → "logo.jpg"
 */
export function buildCacheFilename(type: string, url: string): string {
  // Strip query string before extracting extension
  const pathname = url.split("?")[0] ?? url;
  const raw = extname(basename(pathname)).toLowerCase(); // e.g. ".jpg"
  const VALID_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".ico", ".gif"]);
  const ext = VALID_EXTS.has(raw) ? raw : ".jpg";
  return `${type}${ext}`;
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

/**
 * Creates the per-game cache directory if it does not already exist.
 * Returns the directory path.
 */
export function ensureCacheDir(gameId: string): string {
  const dir = getCacheDir(gameId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// Downloader
// ---------------------------------------------------------------------------

/**
 * Downloads an image URL into the per-game cache directory.
 * The filename is derived from the artwork type and URL extension.
 * Returns the absolute local path of the saved file.
 *
 * Throws if the HTTP response is not 2xx or if the write fails.
 */
export async function downloadToCache(
  url: string,
  gameId: string,
  type: string
): Promise<string> {
  ensureCacheDir(gameId);

  const filename = buildCacheFilename(type, url);
  const dest = getCachePath(gameId, filename);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Download failed (${response.status} ${response.statusText}): ${url}`
    );
  }

  if (!response.body) {
    throw new Error(`Response body is null for: ${url}`);
  }

  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(dest);
    response.body!.pipe(stream);
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  return dest;
}
