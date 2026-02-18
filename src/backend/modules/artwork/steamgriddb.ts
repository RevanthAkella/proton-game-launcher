/**
 * ============================================================
 *  SteamGridDB — ArtworkProvider Implementation
 * ============================================================
 *
 * Implements the ArtworkProvider interface against the
 * SteamGridDB REST API v2 (https://www.steamgriddb.com/api/v2).
 *
 * Authentication: Bearer token set via PUT /api/settings
 *   { "steamGridDbApiKey": "<your-key>" }
 *
 * Search flow:
 *   1. GET /search/autocomplete/{term}      → pick first game ID
 *   2. GET /grids|heroes|logos|icons/game/{id} → up to 5 results each
 *   3. Combine and return as ArtworkResult[]
 *
 * Download: delegates to cache.downloadToCache()
 * ============================================================
 */
import fetch from "node-fetch";
import type { ArtworkProvider, ArtworkResult } from "./index.js";
import { downloadToCache } from "./cache.js";
import { logger } from "../../logger.js";

const log = logger.child({ module: "artwork" });

const BASE_URL = "https://www.steamgriddb.com/api/v2";

// Max results to return per artwork type — keeps response size bounded
const RESULTS_PER_TYPE = 5;

// ---------------------------------------------------------------------------
// Internal types — mirrors the SGDB API response shape
// ---------------------------------------------------------------------------

interface SgdbResponse<T> {
  success: boolean;
  data: T;
}

interface SgdbGame {
  id: number;
  name: string;
}

interface SgdbImage {
  id: number;
  url: string;
  width: number;
  height: number;
}

// Maps our ArtworkResult type to the SGDB endpoint segment.
// filter (optional) is applied client-side after the API response is received.
const ART_ENDPOINTS: Array<{
  endpoint: string;
  type: ArtworkResult["type"];
  filter?: (img: SgdbImage) => boolean;
}> = [
  { endpoint: "grids",  type: "grid" },
  // "home" = landscape grid from the Grids section, filtered client-side to width > height
  { endpoint: "grids",  type: "home", filter: (img) => img.width > img.height },
  { endpoint: "heroes", type: "hero" },
  { endpoint: "logos",  type: "logo" },
  { endpoint: "icons",  type: "icon" },
];

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a SteamGridDB ArtworkProvider bound to the given API key.
 * Called on each request so the key is always current.
 */
export function createSteamGridDbProvider(apiKey: string): ArtworkProvider {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": "linux-proton-game-launcher/1.0",
  };

  // ── Internal helpers ────────────────────────────────────────────────────

  /** Searches SGDB for a game name and returns the first matching SGDB ID. */
  async function findSgdbGameId(gameName: string): Promise<number | null> {
    const url = `${BASE_URL}/search/autocomplete/${encodeURIComponent(gameName)}`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      log.warn({ status: res.status, gameName }, "SGDB search request failed");
      return null;
    }

    const json = (await res.json()) as SgdbResponse<SgdbGame[]>;

    if (!json.success || json.data.length === 0) return null;

    return json.data[0].id;
  }

  /** Fetches artwork of one type for a SGDB game ID. */
  async function fetchArtOfType(
    sgdbGameId: number,
    endpoint: string,
    type: ArtworkResult["type"],
    filter?: (img: SgdbImage) => boolean
  ): Promise<ArtworkResult[]> {
    const url = `${BASE_URL}/${endpoint}/game/${sgdbGameId}`;
    const res = await fetch(url, { headers });

    if (!res.ok) return [];

    const json = (await res.json()) as SgdbResponse<SgdbImage[]>;

    if (!json.success || !Array.isArray(json.data)) return [];

    const data = filter ? json.data.filter(filter) : json.data;
    return data.slice(0, RESULTS_PER_TYPE).map((img) => ({
      url: img.url,
      type,
      width: img.width,
      height: img.height,
      source: "steamgriddb",
    }));
  }

  // ── ArtworkProvider implementation ──────────────────────────────────────

  return {
    /**
     * Searches SteamGridDB for artwork matching the given game name.
     * Returns up to (RESULTS_PER_TYPE × 4) results across all art types.
     * Never throws — individual type failures are silently skipped.
     */
    async search(gameName: string): Promise<ArtworkResult[]> {
      const sgdbId = await findSgdbGameId(gameName);
      if (!sgdbId) return [];

      const results: ArtworkResult[] = [];

      for (const { endpoint, type, filter } of ART_ENDPOINTS) {
        try {
          const typeResults = await fetchArtOfType(sgdbId, endpoint, type, filter);
          results.push(...typeResults);
        } catch (err) {
          // One type failing must not abort the rest
          log.warn({ type, sgdbId, err }, "Failed to fetch artwork type");
        }
      }

      return results;
    },

    /**
     * Downloads an artwork URL to the per-game cache directory.
     * Returns the absolute local path of the saved file.
     */
    async download(url: string, gameId: string, type: string): Promise<string> {
      return downloadToCache(url, gameId, type);
    },
  };
}
