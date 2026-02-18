/**
 * ============================================================
 *  Steam Store — Game Info Provider
 * ============================================================
 *
 * Fetches game metadata from Steam's public Store API.
 * No API key required.
 *
 * Flow:
 *   1. findSteamAppId(name)
 *      → GET store.steampowered.com/api/storesearch/?term=<name>
 *      → returns first matching Steam App ID, or null
 *
 *   2. fetchSteamGameInfo(appId)
 *      → GET store.steampowered.com/api/appdetails?appids=<appId>
 *      → returns parsed SteamGameData, or null if unavailable
 * ============================================================
 */
import fetch from "node-fetch";
import { logger } from "../../logger.js";

const log = logger.child({ module: "game-info" });

// ---------------------------------------------------------------------------
// Internal response types — Steam Store API shapes
// ---------------------------------------------------------------------------

interface StoreSearchResponse {
  total: number;
  items: Array<{ id: number; name: string; price?: unknown }>;
}

interface AppDetailsResponse {
  [appId: string]: {
    success: boolean;
    data?: {
      name: string;
      short_description: string;
      detailed_description: string;
      developers?: string[];
      publishers?: string[];
      release_date?: { coming_soon: boolean; date: string };
      genres?: Array<{ id: string; description: string }>;
      metacritic?: { score: number; url: string };
    };
  };
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SteamGameData {
  steamAppId:  string;
  description: string;
  shortDesc:   string;
  developer:   string | null;
  publisher:   string | null;
  releaseDate: string | null;
  genres:      string[];
  metacritic:  number | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Searches the Steam Store for a game by name.
 * Returns the first matching Steam App ID as a string, or null if not found.
 */
export async function findSteamAppId(name: string): Promise<string | null> {
  const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&l=english&cc=US`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      log.warn({ status: res.status, name }, "Steam search request failed");
      return null;
    }
    const json = (await res.json()) as StoreSearchResponse;
    if (!json.items || json.items.length === 0) return null;
    return String(json.items[0].id);
  } catch (err) {
    log.warn({ name, err }, "Steam search fetch error");
    return null;
  }
}

/**
 * Fetches game metadata from Steam Store by App ID.
 * Returns parsed SteamGameData, or null if the request fails or the game is unavailable.
 */
export async function fetchSteamGameInfo(appId: string): Promise<SteamGameData | null> {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&filters=basic,short_description,developers,publishers,genres,metacritic`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      log.warn({ status: res.status, appId }, "Steam appdetails request failed");
      return null;
    }
    const json = (await res.json()) as AppDetailsResponse;
    const entry = json[appId];
    if (!entry?.success || !entry.data) {
      log.warn({ appId }, "Steam appdetails returned no data");
      return null;
    }
    const d = entry.data;
    return {
      steamAppId:  appId,
      description: stripHtml(d.detailed_description ?? ""),
      shortDesc:   stripHtml(d.short_description ?? ""),
      developer:   d.developers?.[0] ?? null,
      publisher:   d.publishers?.[0] ?? null,
      releaseDate: d.release_date?.date ?? null,
      genres:      (d.genres ?? []).map((g) => g.description),
      metacritic:  d.metacritic?.score ?? null,
    };
  } catch (err) {
    log.warn({ appId, err }, "Steam appdetails fetch error");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip basic HTML tags from Steam's HTML-formatted description strings. */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
