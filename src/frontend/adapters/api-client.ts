/**
 * Typed API client shared by all frontend themes.
 * Communicates with the backend over HTTP and WebSocket.
 *
 * This file intentionally has no build-step dependencies — it works
 * as-is in both a plain browser context and in a bundled frontend.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const BASE = window?.location?.origin ?? "http://127.0.0.1:9420";

// ---------------------------------------------------------------------------
// Types (mirrors backend schema)
// ---------------------------------------------------------------------------
export interface Game {
  id: string;
  name: string;
  rootPath: string;
  exePath: string;
  protonId: string | null;
  steamAppId: string | null;
  winePrefix: string;
  lastPlayed: number | null;
  playTimeSeconds: number;
  hidden: boolean;
  createdAt: number;
}

export interface Settings {
  defaultProtonVersion: string;
  scanPaths: string[];
  steamGridDbApiKey: string;
  controllerEnabled: boolean;
  theme: string;
  language: string;
}

export interface ArtworkResult {
  url: string;
  type: "grid" | "hero" | "logo" | "icon";
  width: number;
  height: number;
  source: string;
}

export type WsEvent =
  | { type: "connected"; timestamp: number }
  | { type: "pong"; timestamp: number }
  | { type: "controller"; action: string }
  | { type: "launch_status"; gameId: string; status: "running" | "stopped" | "error"; pid?: number }
  | { type: "scan_progress"; total: number; found: number; current: string };

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export const api = {
  health: () => get<{ status: string; version: string; theme: string }>("/api/health"),

  games: {
    list: () => get<Game[]>("/api/games"),
    get: (id: string) => get<Game>(`/api/games/${id}`),
    add: (body: Pick<Game, "name" | "rootPath" | "exePath"> & { protonId?: string; steamAppId?: string }) =>
      post<Game>("/api/games", body),
    update: (id: string, patch: Partial<Pick<Game, "name" | "exePath" | "protonId" | "steamAppId" | "hidden">>) =>
      put<Game>(`/api/games/${id}`, patch),
    remove: (id: string) => del(`/api/games/${id}`),
    launch: (id: string) => post<{ pid: number }>(`/api/games/${id}/launch`),
    kill: (id: string) => post<void>(`/api/games/${id}/kill`),
    status: (id: string) => get<{ status: "running" | "stopped" | "error" }>(`/api/games/${id}/status`),
    artworkSearch: (id: string) => post<ArtworkResult[]>(`/api/games/${id}/artwork/search`),
    artworkSet: (id: string, url: string, type: ArtworkResult["type"]) =>
      post(`/api/games/${id}/artwork/set`, { url, type }),
  },

  scan: {
    start: (paths?: string[]) => post<void>("/api/scan", paths ? { paths } : undefined),
  },

  settings: {
    get: () => get<Settings>("/api/settings"),
    update: (patch: Partial<Settings>) => put<Settings>("/api/settings", patch),
  },

  proton: {
    versions: () => get<Array<{ id: string; path: string; label: string }>>("/api/proton/versions"),
  },
};

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------
export function connectWs(onEvent: (event: WsEvent) => void): () => void {
  const wsUrl = `${BASE.replace(/^http/, "ws")}/ws`;
  let ws: WebSocket;
  let pingInterval: ReturnType<typeof setInterval>;
  let closed = false;

  function connect() {
    ws = new WebSocket(wsUrl);

    ws.onmessage = (e) => {
      try {
        onEvent(JSON.parse(e.data) as WsEvent);
      } catch {
        // ignore
      }
    };

    ws.onopen = () => {
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 30_000);
    };

    ws.onclose = () => {
      clearInterval(pingInterval);
      if (!closed) {
        // Reconnect after 2 s
        setTimeout(connect, 2000);
      }
    };

    ws.onerror = () => ws.close();
  }

  connect();

  // Return a cleanup / disconnect function
  return () => {
    closed = true;
    clearInterval(pingInterval);
    ws?.close();
  };
}
