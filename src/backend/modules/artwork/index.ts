/**
 * ============================================================
 *  Artwork Module — Public API
 * ============================================================
 *
 * Adapter interface: any artwork provider implements ArtworkProvider.
 * The default provider (SteamGridDB) is registered at server startup.
 *
 * Swap candidate: replace with an IGDB or manual provider by calling
 * setArtworkProvider() with any object that implements ArtworkProvider.
 * ============================================================
 */

// ── Shared types ────────────────────────────────────────────────────────────

export interface ArtworkResult {
  url: string;
  type: "grid" | "hero" | "logo" | "icon" | "home";
  width: number;
  height: number;
  source: string;
}

export interface ArtworkProvider {
  search(gameName: string): Promise<ArtworkResult[]>;
  /** Downloads the image and returns the absolute local cache path. */
  download(url: string, gameId: string, type: string): Promise<string>;
}

// ── Provider registry ────────────────────────────────────────────────────────

let _provider: ArtworkProvider | null = null;

export function setArtworkProvider(p: ArtworkProvider): void {
  _provider = p;
}

export function getArtworkProvider(): ArtworkProvider {
  if (!_provider) throw new Error("No artwork provider registered");
  return _provider;
}

export function hasArtworkProvider(): boolean {
  return _provider !== null;
}

// ── Re-exports ────────────────────────────────────────────────────────────────

export { createSteamGridDbProvider } from "./steamgriddb.js";
export {
  CACHE_BASE,
  getCacheDir,
  getCachePath,
  buildCacheFilename,
  ensureCacheDir,
  downloadToCache,
} from "./cache.js";
