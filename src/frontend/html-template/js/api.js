/**
 * api.js — Vanilla JS API client
 *
 * Thin fetch wrapper around the LPGL backend REST API.
 * All methods return parsed JSON or throw ApiError on non-2xx.
 *
 * Mirrors the typed contract in src/frontend/adapters/api-client.ts
 * for use in the plain HTML/JS frontend (no build step).
 */

// ── HTTP helpers ──────────────────────────────────────────────────────────

async function get(url) {
  let res;
  try { res = await fetch(url); } catch { throw new ApiError(0, { error: "Cannot reach server — is it running?" }); }
  if (!res.ok) throw new ApiError(res.status, await safeJson(res));
  return res.json();
}

async function post(url, body = {}) {
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch { throw new ApiError(0, { error: "Cannot reach server — is it running?" }); }
  if (!res.ok) throw new ApiError(res.status, await safeJson(res));
  return res.json();
}

async function put(url, body) {
  let res;
  try {
    res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch { throw new ApiError(0, { error: "Cannot reach server — is it running?" }); }
  if (!res.ok) throw new ApiError(res.status, await safeJson(res));
  return res.json();
}

async function del(url) {
  let res;
  try { res = await fetch(url, { method: "DELETE" }); } catch { throw new ApiError(0, { error: "Cannot reach server — is it running?" }); }
  if (!res.ok) throw new ApiError(res.status, await safeJson(res));
  return res.json();
}

async function safeJson(res) {
  try { return await res.json(); } catch { return {}; }
}

// ── Error class ───────────────────────────────────────────────────────────

export class ApiError extends Error {
  /** @param {number} status  @param {object} body */
  constructor(status, body) {
    super(body.error || `HTTP ${status}`);
    this.status = status;
    this.body   = body;
  }
}

// ── API surface ───────────────────────────────────────────────────────────

export const api = {

  // ── Games ────────────────────────────────────────────────────────────────

  /** @returns {Promise<import('../types').Game[]>} */
  listGames: () => get("/api/games"),

  /** @param {string} id */
  getGame: (id) => get(`/api/games/${id}`),

  /** @param {string} id  @param {object} patch */
  updateGame: (id, patch) => put(`/api/games/${id}`, patch),

  /** @param {string} id */
  deleteGame: (id) => del(`/api/games/${id}`),

  // ── Launch ───────────────────────────────────────────────────────────────

  /**
   * @param {string} id
   * @param {string|null} protonId  — if null, uses game/global default
   */
  launchGame: (id, protonId = null) =>
    post(`/api/games/${id}/launch`, protonId ? { protonId } : {}),

  /** @param {string} id */
  killGame: (id) => post(`/api/games/${id}/kill`),

  /** @param {string} id */
  getGameStatus: (id) => get(`/api/games/${id}/status`),

  // ── Proton ───────────────────────────────────────────────────────────────

  /** @returns {Promise<{id:string, path:string, label:string}[]>} */
  listProtonVersions: () => get("/api/proton/versions"),

  // ── Artwork ──────────────────────────────────────────────────────────────

  /** @param {string} id */
  listArtwork: (id) => get(`/api/games/${id}/artwork`),

  /**
   * @param {string} id
   * @param {string|null} query  — overrides game name if provided
   */
  searchArtwork: (id, query = null) =>
    post(`/api/games/${id}/artwork/search`, query ? { query } : {}),

  /**
   * @param {string} id
   * @param {string} url
   * @param {"grid"|"hero"|"logo"|"icon"} type
   */
  setArtwork: (id, url, type) =>
    post(`/api/games/${id}/artwork/set`, { url, type }),

  /**
   * Returns the URL for serving a cached artwork image directly in <img>.
   * @param {string} id
   * @param {"grid"|"hero"|"logo"|"icon"} type
   */
  artworkUrl: (id, type) => `/api/games/${id}/artwork/${type}/file`,

  // ── Scan ─────────────────────────────────────────────────────────────────

  /**
   * @param {string[]|null} paths  — if null, uses settings.scanPaths
   */
  startScan: (paths = null) =>
    post("/api/scan", paths ? { paths } : {}),

  /** @returns {Promise<{status:string, progress:object, lastRun:number|null, lastResults:object|null}>} */
  getScanStatus: () => get("/api/scan/status"),

  // ── Settings ─────────────────────────────────────────────────────────────

  getSettings: () => get("/api/settings"),

  /** @param {object} patch */
  updateSettings: (patch) => put("/api/settings", patch),

  // ── Library ──────────────────────────────────────────────────────────────

  /**
   * Clear all artwork + game info and re-fetch everything in the background.
   * Returns 202 immediately.
   */
  refreshLibrary: () => post("/api/library/refresh"),

  // ── Path (re-link / add to library) ─────────────────────────────────────

  /**
   * Set rootPath for an unlinked game; backend auto-detects exePath.
   * @param {string} id
   * @param {string} rootPath — absolute path to the game directory
   */
  setGamePath: (id, rootPath) => put(`/api/games/${id}/path`, { rootPath }),

  // ── Game Info ─────────────────────────────────────────────────────────────

  /** @param {string} id */
  getGameInfo: (id) => get(`/api/games/${id}/info`),

  /** @param {string} id — force re-fetch from Steam Store */
  refreshGameInfo: (id) => post(`/api/games/${id}/info/refresh`),

  // ── Progress ──────────────────────────────────────────────────────────────

  /**
   * Set or clear manual progress override.
   * @param {string} id
   * @param {number|null} progressOverride — 0–100 or null to clear
   */
  setProgress: (id, progressOverride) =>
    put(`/api/games/${id}/progress`, { progressOverride }),
};
