# Linux Proton Game Launcher — System Architecture

## Overview

A locally-running game launcher for Linux that runs Windows games through Proton. The backend exposes a clean REST/WebSocket API; the frontend is a swappable client layer. Everything is built with modular, open-source libraries so any component can be replaced independently.

---

## Core Design Principles

1. **API-first backend** — all logic lives in the backend; frontends are thin clients
2. **Adapter pattern** — every integration point (frontend, artwork provider, Proton runner) is behind an interface so it can be swapped
3. **Module isolation** — each concern is its own module with a defined public API; no cross-module imports except through the module's index
4. **Local-first** — no cloud dependency at runtime; external services (SteamGridDB) are optional and cached
5. **Open-source only** — every library must have a permissive OSS license

---

## Technology Stack

| Layer | Choice | Rationale | Swap candidate |
|---|---|---|---|
| Runtime | Node.js 22 LTS | Shared with future Electron target | Deno |
| HTTP server | Fastify | Fast, schema-first, plugin ecosystem | Express, Hono |
| Database | SQLite via `better-sqlite3` | Zero-config, embedded, fast sync API | PostgreSQL |
| ORM/query | `drizzle-orm` | Type-safe, lightweight, no magic | Kysely |
| Frontend (v1) | Vanilla HTML/CSS/JS | Zero build step, easy to fork | React, Svelte, Vue |
| Controller input | Browser Gamepad API (primary) + `SDL2` via `@kmamal/sdl` (fallback) | Browser API works with any OS-paired gamepad (BT/USB); SDL2 for headless | `node-gamepad` |
| Artwork API | SteamGridDB REST API | Best Linux game art coverage | IGDB, custom |
| Game info API | Steam Store API (no key) | Free metadata source; covers most Windows titles | IGDB, RAWG |
| Proton runner | `child_process` + env builder | Direct, no hidden abstraction | Steam Runtime wrapper |
| IPC (real-time) | WebSocket via `@fastify/websocket` | Native browser support, Electron compatible | SSE |
| Config storage | JSON flat file + SQLite | Human-readable, easy to hand-edit | TOML |
| Image cache | Local disk (`~/.cache/lpgl/`) | Avoids re-fetching, offline capable | Redis |

---

## Directory Structure

```
linux-proton-game-launcher/
├── src/
│   ├── backend/
│   │   ├── server.ts                  # Fastify bootstrap, plugin registration
│   │   ├── api/
│   │   │   ├── games.ts               # CRUD routes: /api/games
│   │   │   ├── launch.ts              # POST /api/games/:id/launch
│   │   │   ├── scan.ts                # POST /api/scan
│   │   │   ├── artwork.ts             # GET  /api/games/:id/artwork
│   │   │   ├── game-info.ts           # GET/POST /api/games/:id/info
│   │   │   └── settings.ts            # GET/PUT /api/settings, POST /api/library/refresh
│   │   ├── modules/
│   │   │   ├── game-scanner/
│   │   │   │   ├── index.ts           # Public API
│   │   │   │   ├── scanner.ts         # Directory walker
│   │   │   │   └── exe-detector.ts    # .exe heuristic scoring
│   │   │   ├── proton-runner/
│   │   │   │   ├── index.ts           # Public API
│   │   │   │   ├── runner.ts          # child_process launcher
│   │   │   │   ├── env-builder.ts     # WINE/Proton env vars
│   │   │   │   └── version-manager.ts # Detect installed Proton builds
│   │   │   ├── artwork/
│   │   │   │   ├── index.ts           # Public API (adapter interface)
│   │   │   │   ├── steamgriddb.ts     # SteamGridDB implementation
│   │   │   │   └── cache.ts           # Disk-based image cache
│   │   │   ├── settings/
│   │   │   │   ├── index.ts           # Public API
│   │   │   │   └── store.ts           # Read/write settings.json + DB
│   │   │   ├── game-info/
│   │   │   │   └── steamstore.ts      # Steam Store API client (no key required)
│   │   │   └── controller/
│   │   │       ├── index.ts           # Public API
│   │   │       ├── sdl-adapter.ts     # SDL2 implementation
│   │   │       └── input-map.ts       # Button → action mapping
│   │   └── db/
│   │       ├── schema.ts              # Drizzle schema definitions
│   │       ├── migrate.ts             # Migration runner
│   │       └── migrations/            # SQL migration files
│   └── frontend/
│       ├── adapters/
│       │   └── api-client.ts          # Typed fetch wrapper, shared by all frontends
│       └── html-template/             # Default frontend (v1)
│           ├── index.html
│           ├── css/
│           │   └── main.css
│           └── js/
│               ├── app.js             # Bootstrap, router, shared state, WebSocket
│               ├── api.js             # Vanilla JS fetch wrapper (all endpoints)
│               ├── views/
│               │   ├── home.js        # Home page: hero carousel (top) + full-page info panel
│               │   ├── library.js     # Game grid / list
│               │   ├── game-detail.js # Single game page
│               │   └── settings.js    # Settings page
│               └── controller.js      # Controller input handler (client-side)
├── data/
│   └── launcher.db                    # SQLite database (gitignored)
├── cache/                             # Artwork image cache (gitignored)
├── config/
│   └── settings.json                  # User settings (gitignored, template committed)
├── config.example.json                # Committed settings template
├── package.json
├── tsconfig.json
└── system_architecture.md
```

---

## Module Contracts

### `game-scanner`

```
scan(rootPaths: string[]): Promise<ScannedGame[]>

ScannedGame {
  name: string          // derived from directory name
  rootPath: string      // top-level directory
  exePath: string       // best-match .exe (see Exe Detector below)
  exeCandidates: string[] // all .exe files found, ranked
}
```

**Exe Detector heuristic** (scored, highest wins):
- Name matches parent directory — +40
- Located in root or one level deep — +20
- File size > 1 MB — +15
- Name contains `launcher`, `setup`, `unins`, `redist` — −50 each
- Name contains `_crash`, `update`, `report` — −30 each

**Excluded folder names** (`EXCLUDED_FOLDER_NAMES` in `scanner.ts`):
A `ReadonlySet<string>` of folder names (case-insensitive) that are silently skipped when listing game directories under a scan root. Any immediate child of a scan root whose name matches an entry is never scanned or shown in the library.

| Entry | Reason |
|---|---|
| `prefixes` | Proton/Wine prefix storage directories |

Add new entries to the set to exclude additional well-known non-game directories.

### `proton-runner`

```
launch(config: LaunchConfig): ChildProcess
kill(pid: number): void
listProtonVersions(): ProtonVersion[]

LaunchConfig {
  exePath: string
  protonPath: string       // e.g. ~/.steam/steam/steamapps/common/Proton 9.0
  steamAppId?: string      // set STEAM_COMPAT_APP_ID for art/compat overrides
  extraEnv?: Record<string,string>
  winePrefix: string       // per-game prefix under ~/.local/share/lpgl/prefixes/
}

ProtonVersion {
  id: string               // "proton-9.0", "proton-experimental"
  path: string
  label: string
}
```

### `artwork` (adapter interface)

```
interface ArtworkProvider {
  search(gameName: string): Promise<ArtworkResult[]>
  download(url: string, gameId: string, type: string): Promise<string> // returns local cache path
}

ArtworkResult {
  url: string
  type: 'grid' | 'hero' | 'logo' | 'icon' | 'home'
  width: number
  height: number
  source: string
}
```

SteamGridDB implements this interface. Any other provider just needs to implement the same two methods.

Notes:
- `'home'` type fetches from the same `grids` SteamGridDB endpoint as `'grid'`, but is filtered client-side to `width > height` (landscape only). Used for the active card in the Home carousel. Falls back to portrait grid art in the UI if no landscape grid exists.
- `ART_ENDPOINTS` in `steamgriddb.ts` supports an optional `filter: (img) => boolean` applied after the API response.

### `game-info`

```
findSteamAppId(name: string): Promise<string | null>
  // Searches Steam Store storesearch endpoint; returns best-match appId

fetchSteamGameInfo(appId: string): Promise<SteamGameData | null>
  // Fetches Steam appdetails; returns structured metadata

SteamGameData {
  description: string       // detailed_description (HTML stripped)
  shortDesc:   string       // short_description
  developer:   string
  publisher:   string
  releaseDate: string
  genres:      string[]
  metacritic:  number | null
}
```

No API key required. Results are cached in the `game_info` DB table and only cleared on "Refresh Library".

**Progress computation** (priority chain):
```
if (progressOverride !== null) → use progressOverride
else                          → 0
```

Progress is set via manual override (`PUT /api/games/:id/progress`). HLTB auto-calc is a future enhancement (DB columns pre-provisioned in `game_info`).

### `settings`

```
getSettings(): Settings
updateSettings(patch: Partial<Settings>): Settings

Settings {
  defaultProtonVersion: string
  scanPaths: string[]
  steamGridDbApiKey: string
  controllerEnabled: boolean
  showUninstalledGames: boolean   // default false; when true, library shows unlinked games greyed out
  theme: string                   // frontend theme name
  language: string
}
```

**Scan-path soft-unlink** — whenever `PUT /api/settings` includes a `scanPaths` field, the handler fetches all `games` rows and **soft-unlinks** any whose `rootPath` does not fall under any currently active scan path. Soft-unlink sets `rootPath = NULL` and `exePath = NULL` but preserves the game row and all associated data (artwork, game_info, play time, progress). A `games_unlinked` WebSocket event is broadcast so the frontend can filter unlinked games from the library view.

**Scanner re-linking** — when `POST /api/scan` discovers a game folder whose name (case-insensitive) matches the `name` of an existing unlinked game (`rootPath IS NULL`), the scanner updates that game's `rootPath` and `exePath` instead of inserting a new row. This restores the game to the library with all its prior play time, progress, artwork, and game info intact.

### `controller`

```
interface InputAdapter {
  start(): void
  stop(): void
  on(event: 'action', handler: (action: ControllerAction) => void): void
}

ControllerAction =
  | 'navigate-up' | 'navigate-down' | 'navigate-left' | 'navigate-right'
  | 'confirm' | 'back' | 'menu' | 'start'
  | 'trigger-left' | 'trigger-right'
```

Controller events are forwarded to the frontend via WebSocket so the HTML layer can respond identically to keyboard events.

---

## Data Model (SQLite via Drizzle)

```sql
-- games
id                TEXT PRIMARY KEY   -- uuid
name              TEXT NOT NULL
root_path         TEXT               -- NULL = unlinked / not installed
exe_path          TEXT               -- NULL when unlinked
proton_id         TEXT               -- overrides default if set
steam_app_id      TEXT
wine_prefix       TEXT NOT NULL
last_played       INTEGER            -- unix timestamp
play_time_seconds INTEGER DEFAULT 0
progress          INTEGER NOT NULL DEFAULT 0   -- 0–100, displayed value (auto-calc or override)
progress_override INTEGER            -- NULL = use HLTB auto-calc; non-null = manual override (0–100)
hidden            INTEGER DEFAULT 0
created_at        INTEGER NOT NULL

-- artwork  (cascade-deletes when game is deleted)
id          TEXT PRIMARY KEY
game_id     TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE
type        TEXT NOT NULL       -- 'grid'|'hero'|'logo'|'icon'|'home'
local_path  TEXT NOT NULL
source_url  TEXT
provider    TEXT NOT NULL       -- 'steamgriddb'|'manual'
created_at  INTEGER NOT NULL

-- game_info  (one row per game; cascade-deletes when game is deleted)
game_id              TEXT PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE
source               TEXT NOT NULL DEFAULT 'steam'
steam_app_id         TEXT
description          TEXT              -- HTML-stripped detailed description
short_desc           TEXT              -- one-line short description (shown in Home + detail info panel)
developer            TEXT
publisher            TEXT
release_date         TEXT
genres               TEXT              -- JSON array string: '["Action","RPG"]'
metacritic           INTEGER
fetched_at           INTEGER NOT NULL  -- unix ms
hltb_id              TEXT              -- HowLongToBeat game ID
hltb_main_hours      REAL              -- main story hours
hltb_extra_hours     REAL              -- main + extras hours
hltb_completionist_hours REAL          -- completionist hours
hltb_fetched_at      INTEGER           -- unix ms; when HLTB data was last fetched

-- settings stored in settings.json (single-row settings table for migrations only)
```

**Installation status** is derived from `root_path`: `NULL` = not installed / unlinked, non-`NULL` = installed. No separate column needed.

**Progress** lives on the `games` row (not a child table) so "Refresh Library" (which clears `artwork` + `game_info`) never wipes it. HLTB hours live on `game_info` so they are re-fetched on library refresh, but the `progress` and `progress_override` columns on `games` persist.

---

## API Surface

All routes are under `http://localhost:PORT` (default port: 9420).

```
GET    /api/games                     list all games
POST   /api/games                     add game manually
GET    /api/games/:id                 get single game
PUT    /api/games/:id                 update game metadata / exe path
DELETE /api/games/:id                 remove game

POST   /api/scan                      trigger directory scan
GET    /api/scan/status               current scan progress (SSE stream)

POST   /api/games/:id/launch          launch game via Proton
POST   /api/games/:id/kill            kill running game
GET    /api/games/:id/status          running | stopped | error

GET    /api/games/:id/artwork         list artwork for game
POST   /api/games/:id/artwork/search  search SteamGridDB
POST   /api/games/:id/artwork/set     assign artwork to game
GET    /api/games/:id/artwork/:type/file  serve cached artwork image

GET    /api/games/:id/info            get cached game info (404 if not yet fetched)
POST   /api/games/:id/info/refresh    force re-fetch game info from Steam Store

PUT    /api/games/:id/path            set/update rootPath manually; triggers exe detection
PUT    /api/games/:id/progress        set manual progress override (or clear with null)

GET    /api/settings                  get current settings
PUT    /api/settings                  update settings
POST   /api/library/refresh           clear artwork + game info (not progress/playTime), re-fetch (202)
GET    /api/proton/versions           list detected Proton installations

WS     /ws                            real-time events (controller input, launch status, scan progress, artwork_complete, games_unlinked)
```

---

## Frontend Swappability

The frontend is decoupled by contract:

1. The backend serves the frontend's static files from `src/frontend/<active-theme>/`
2. `config/settings.json` has a `"theme": "html-template"` field
3. On startup, the server mounts the selected theme's directory as static files
4. Any frontend only needs `src/frontend/adapters/api-client.ts` to communicate with the backend

To create a new frontend: create `src/frontend/my-new-ui/`, implement against the same API, set `"theme": "my-new-ui"` in settings. No backend changes required.

---

## Controller → Frontend Bridge

Two input paths — both produce the same KeyboardEvents:

```
Path 1: Browser Gamepad API (primary)
  navigator.getGamepads() polled via requestAnimationFrame
  → controller.js maps W3C Standard Gamepad buttons/axes to ControllerAction
  → Both sticks (left 0/1 + right 2/3) produce navigation
  → LT/RT read from axes 4/5 (Linux xpad: -1→+1, normalised to 0–1); fallback to buttons 6/7
  → LB/RB fire shoulder actions
  → dispatches equivalent KeyboardEvent (ArrowRight, Enter, etc.) into DOM

Path 2: Backend SDL2 (fallback)
  SDL2 event (gamepad button — string names like "a", "dpadUp")
  → sdl-adapter.ts maps to ControllerAction
  → WebSocket broadcast { type: "controller", action: "navigate-right" }
  → controller.js receives event, dispatches equivalent KeyboardEvent
```

Both paths converge on the same keyboard handler — zero duplication.

**WebSocket event types** (broadcast from backend → all connected frontends):

| Event type | Payload fields | When sent |
|---|---|---|
| `controller` | `action: string` | Gamepad button pressed |
| `launch_status` | `gameId, status, pid?` | Game launched, exited, or errored |
| `scan_progress` | `current, found, total` | Each game directory examined during scan |
| `scan_complete` | `count` | Scan finished |
| `artwork_complete` | — | Background artwork sync finished |
| `games_unlinked` | `count` | Games soft-unlinked because their scan path was removed from settings |

---

## Proton Execution Model

```
STEAM_COMPAT_DATA_PATH=~/.local/share/lpgl/prefixes/<game-id>
STEAM_COMPAT_CLIENT_INSTALL_PATH=<steam-install-path>
PROTON_LOG=1
WINEDLLOVERRIDES=...

exec: <proton-path>/proton run <exe-path> [args]
```

Each game gets an isolated Wine prefix so installs never interfere.

---

## Dependency List (MVP)

| Package | Purpose | License |
|---|---|---|
| `fastify` | HTTP server | MIT |
| `@fastify/static` | Serve frontend | MIT |
| `@fastify/websocket` | WebSocket support | MIT |
| `better-sqlite3` | SQLite driver | MIT |
| `drizzle-orm` | Query builder + schema | Apache-2.0 |
| `drizzle-kit` | Migrations CLI | Apache-2.0 |
| `@kmamal/sdl` | SDL2 controller input | MIT |
| `node-fetch` | HTTP client for SteamGridDB | MIT |
| `uuid` | Game ID generation | MIT |
| `zod` | Runtime schema validation | MIT |
| `tsx` | TypeScript execution | MIT |
| `typescript` | Type checking | Apache-2.0 |

No framework locks. Each package is replaceable with a same-interface alternative.

---

## MVP Phases & Tasks

### Phase 1 — Project Scaffold ✓
- [x] Initialize Node.js + TypeScript project
- [x] Configure `tsconfig.json`, `package.json`
- [x] Set up Fastify server with health check route
- [x] Initialize SQLite DB + Drizzle schema
- [x] Write first migration (games + artwork tables)
- [x] Establish module directory structure
- [x] Add `config.example.json` with defaults

### Phase 2 — Game Scanner ✓
- [x] Directory walker (recursive, configurable depth)
- [x] Exe detector with heuristic scoring
- [x] POST /api/scan route
- [x] GET /api/scan/status SSE stream
- [x] Persist scanned games to DB
- [x] Unit tests for exe-detector scoring

### Phase 3 — Proton Runner ✓
- [x] Detect installed Proton versions (Steam + Flatpak paths)
- [x] Build Proton environment variables
- [x] Launch game via `child_process`
- [x] Track running PID, expose launch/kill routes
- [x] Per-game Wine prefix creation
- [x] GET /api/proton/versions route

### Phase 4 — SteamGridDB Artwork ✓
- [x] SteamGridDB API client (search + download)
- [x] Disk cache layer
- [x] Artwork routes: search, set, serve cached file
- [x] Auto-fetch artwork during scan (background, non-blocking)

### Phase 5 — HTML Frontend (v1) ✓
- [x] Static HTML shell — `index.html` with nav, scan banner, view containers, toast area
- [x] Dark cinematic CSS theme — `main.css` with design tokens, grid tiles, skeleton shimmer, detail layout, button variants
- [x] Vanilla JS api-client — `api.js` wrapping all backend endpoints
- [x] App bootstrap + router + WebSocket — `app.js` with shared state, hash router, auto-reconnecting WS, toast helper
- [x] Library view — `views/library.js` with cover-art grid, skeleton loading, search filter, keyboard navigation
- [x] Detail view — `views/game-detail.js` with hero banner, stats, Proton selector, launch/kill
- [x] Settings page — `views/settings.js` with scan paths, default Proton, API key, Scan Now button
- [x] Keyboard navigation: escape to go back (detail + settings views)

### Phase 6 — Controller Support
- [x] SDL2 adapter: enumerate gamepads via `sdl.controller.devices` getter, map string-named buttons/axes to ControllerAction
- [x] WebSocket broadcast on controller events
- [x] Frontend controller.js: browser Gamepad API polling (primary) + WS backend bridge (fallback) → synthesise KeyboardEvent
- [x] Test with common controllers (Xbox, DualSense, generic USB — Bluetooth and wired)

### Phase 6.5 — Controller Test UI ✓
- [x] Standalone `controller-test.html` page served at `/controller-test.html`
- [x] SVG gamepad diagram with W3C Standard Gamepad API buttons (LT/RT triggers, both sticks, D-pad, face/shoulder/meta)
- [x] Real-time button highlight via browser Gamepad API polling + WebSocket fallback
- [x] Controller Tester link in Settings → Tools section
- [x] Left-stick and right-stick axis crosshairs showing live X/Y position
- [x] LT/RT proportional SVG trigger bars (resize based on analog value 0–1)
- [x] Raw Gamepad Data debug panel (live button pressed/value + axis values with active markers)
- [x] Action history log (last 20 actions with timestamps)
- [x] Dynamic SVG swap — 4 controller-specific diagrams (Xbox, DualSense, DualShock, Generic) with auto-detection and type badge

### Phase 7 — Polish & Hardening ✓
- [x] Error boundaries: scan failures, missing Proton, network errors
- [x] Settings validation with Zod
- [x] Logging (Fastify's built-in pino)
- [x] README with setup steps and contribution guide

### Phase 8 — Home Page, Game Info & Nav Overhaul ✓
- [x] Home page — `views/home.js` with a horizontal carousel at top (hero/landscape artwork, 3:1 ratio; active card wider with amber outline, inactive dimmed) and a full-page info panel below (hero as full-bleed background, gradient scrim, title + stats + description overlaid — no thumbnail)
- [x] Double-click game card to launch; arrow keys navigate carousel; Enter/Space to launch focused game
- [x] Steam Store game info — `modules/game-info/steamstore.ts` fetches description, developer, publisher, genres, Metacritic (no API key required)
- [x] `game_info` DB table — `0002_game_info.sql` migration; cached on first fetch, only cleared on Refresh Library
- [x] `GET /api/games/:id/info` and `POST /api/games/:id/info/refresh` routes
- [x] `POST /api/library/refresh` — wipes artwork + game info + disk cache, re-fetches all in background
- [x] Auto-sync game info on server startup (`syncMissingGameInfo()`) alongside artwork sync
- [x] Home/Library tab bar below nav (`.view-tabs`); Settings and detail pages hide tabs
- [x] `state.previousHash` — Settings `←` back button and Escape key return to last non-settings page
- [x] Font switched to Futura / Century Gothic / Jost (Google Fonts CDN fallback)
- [x] Detail page back button is now `←` arrow only (no text label)
- [x] Refresh Library button added to Settings page

### Phase 9 — UI Polish & Library Integrity ✓
- [x] Nav bar restructure: LPGL logo removed; Home/Library tab buttons moved into the nav bar left of search; Settings link replaced with gear SVG icon button; real-time system clock (`HH:MM AM/PM`) added right of gear icon
- [x] Detail page back button converted from `<a href>` to a styled `<button>`: frosted-glass circular button (semi-transparent white, `backdrop-filter: blur`, amber on hover) overlaid top-left of the hero banner; navigates to `state.previousHash`
- [x] Home info panel: Launch Game / Close Game button added below the description; mirrors game-detail button behaviour (kill on click, toast feedback, disables while stopping)
- [x] Renamed "Kill Game" → "Close Game" throughout all frontend views
- [x] Global font size increased 10%: `html { font-size: 110% }` scales all `rem` values; `body { font-size: 16.5px }` raises the explicit base
- [x] `EXCLUDED_FOLDER_NAMES` added to `scanner.ts`: folders named `prefixes` (case-insensitive) are silently skipped during scan; list is extensible by adding entries to the `ReadonlySet`
- [x] Scan-path orphan handling: `PUT /api/settings` detects games whose `rootPath` is not under any currently active scan path. Originally deleted them; changed to soft-unlink in Phase 10

### Phase 10 — Game Progress, Soft-Unlink & Detail Enhancements
- [x] DB migration `0003_progress_softunlink.sql` — make `root_path` and `exe_path` nullable; add `progress` (INTEGER NOT NULL DEFAULT 0) and `progress_override` (INTEGER, nullable) columns to `games`; add HLTB columns to `game_info` (pre-provisioned for future HLTB integration)
- [x] Progress computation — `computeProgress()` in `games.ts`: `progressOverride` (if non-null) used as `progress`; otherwise 0%; recomputed after manual override set/clear
- [x] Soft-unlink — `PUT /api/settings` orphan handler changed from `DELETE` to `UPDATE SET rootPath = NULL, exePath = NULL`; preserves game row + artwork + game_info + play time + progress; broadcasts `games_unlinked` WS event instead of `games_purged`
- [x] Scanner re-linking — `persistScannedGames()` pre-fetches unlinked games (rootPath IS NULL), builds case-insensitive name map; on match, updates `rootPath` + `exePath` instead of inserting duplicate; `relinked` count added to scan results + WS broadcast
- [x] `PUT /api/games/:id/path` — manually set/update `rootPath`; backend validates path exists on disk, runs exe detector via `detectExeInDirectory()` to find best `.exe`, updates both `rootPath` and `exePath`; returns updated game. `api.setGamePath()` added to frontend client
- [x] `PUT /api/games/:id/progress` — set `progressOverride` (integer 0–100) or clear it (null to revert to auto-calc); recalculates `progress` column; returns updated game
- [x] Settings: `showUninstalledGames` boolean (default false) — added to `SettingsSchema` + `config.example.json`; Advanced section in Settings UI with checkbox toggle; saved alongside other settings via `PUT /api/settings`
- [x] Library filtering — client-side: hides games with `rootPath=null` by default; when `showUninstalledGames` is on, shows unlinked games with `.uninstalled` class (greyed-out art via `filter: grayscale(1) opacity(0.5)`) and "Not Installed" badge overlay; Home page always excludes unlinked games
- [x] Game detail: game info section — fetches `GET /api/games/:id/info` in parallel with artwork; renders short description, developer, publisher, release date, genres, Metacritic score via `renderGameInfo()` between play stats and Proton selector; fields with no data omitted; styled with `.detail-game-info` / `.detail-game-desc` / `.detail-game-meta`
- [x] Game detail: progress circle widget — SVG donut ring (green arc, percentage centered) in title row via `margin-left: auto`; pencil edit button on hover opens inline editor (number input 0–100, Save, Reset to auto, Cancel); hidden when progress=0 with no override; calls `PUT /api/games/:id/progress` and re-renders
- [x] Game detail: Not Installed state — when `rootPath` is null: desaturated hero/cover art (`filter: grayscale(1) opacity(0.5)`), "Not Installed" badge near title, Proton selector hidden, "Add to Library" button replaces Launch; clicking reveals inline path text input → `PUT /api/games/:id/path` → page re-renders as installed
- [x] Refresh Library (`POST /api/library/refresh`) — clears `artwork` table + `game_info` table + disk cache files; re-fetches artwork and game info in background; **never** touches `games.playTimeSeconds`, `games.lastPlayed`, `games.progress`, `games.progressOverride`, or `games.rootPath` (verified — already correctly scoped)
- [x] Home page: game info available via existing `_infoMap` — no changes needed (already displays `shortDesc`)

---

### Phase 11 — Controller Test Fixes & Dynamic SVG ✓
- [x] Fix LT/RT trigger detection — Linux xpad driver reports triggers as axes 4/5 (range -1 to +1), not buttons 6/7. Both controller.js and controller-test.html now read axes with normalisation `(v+1)/2`, with button 6/7 fallback for standard-mapping gamepads
- [x] Fix right stick detection — confirmed axes 2/3 are right stick (not shared with triggers); right stick visualiser and navigation polling work correctly
- [x] Fix syntax error in GAMEPAD_BTN_MAP (missing commas broke entire controller.js module)
- [x] Add proportional SVG trigger bars + raw gamepad data debug panel to controller test page
- [x] Dynamic controller SVG diagrams — `detectControllerType(id)` matches gamepad.id against known patterns (xbox/microsoft/xinput, dualsense/054c:0ce6, dualshock/054c:05c4/054c:09cc); `swapSVG(type)` replaces the SVG element with a controller-specific template and rebuilds the `btnEls` map; 4 realistic SVG templates (Xbox, DualSense PS5, DualShock PS4, Generic) with correct body shapes, button labels, stick positions, and accent colors; controller type badge shows detected name
- [x] Shoulder button nav — LB/RB (PageUp/PageDown) cycles between Home → Library → Settings tabs
- [x] Demand-driven gamepad polling — rAF loop only runs when `_connectedCount > 0` and `!document.hidden`; starts on `gamepadconnected`, stops on last `gamepaddisconnected` or tab hide; reduces battery drain on wireless controllers

## Future Work

### Electron Packaging
The Electron transition is straightforward because:
- Backend is already a standalone Node process — it runs as an Electron main process
- Frontend HTML is already a browser document — loads in BrowserWindow with no changes
- WebSocket communication stays identical
- Only addition: replace `@fastify/static` serving with `BrowserWindow.loadFile()`

Migration path: wrap `server.ts` in an Electron `main.js`, point `BrowserWindow` at the existing HTML frontend, bundle with `electron-builder`.

### Gradio Test Suite Frontend
A Python Gradio UI that wraps the existing `npm test` / `npm run test:verbose` commands and presents results visually in a browser tab.

**Motivation:** The current TAP output is developer-friendly but not immediately readable for non-engineers reviewing test health. Gradio is already available in the project's Python environment and requires no Node dependencies.

**Planned features:**
- Run full suite or individual phase with one button click
- Live streaming output as tests execute (via `subprocess` + `gr.Textbox`)
- Pass / Fail / Skip summary counters with colour indicators
- Per-suite collapsible result tree matching the describe/test hierarchy in `suite.ts`
- Filter view: show only failures, only passing, or all
- History panel showing last N run results with timestamps
- One-click copy of failing test output for bug reports

**Implementation notes:**
- Thin Python wrapper — does not duplicate any test logic; calls `node --import tsx/esm --test src/tests/suite.ts` and parses TAP output
- TAP parser is a ~50-line pure-Python function (no extra libraries required)
- Gradio app lives at `tools/test-ui/app.py`; launched separately with `python tools/test-ui/app.py`
- Uses the `protonlauncher` venv (`/home/revanthakella/protonlauncher`) which already has Python available
- Must pass the correct Node binary path explicitly (`~/.nvm/versions/node/v22.8.0/bin/node`) since the venv's default Node is v12

**Swap candidate:** Any other Python web UI (Streamlit, Panel) implements the same TAP-parsing + subprocess pattern with no other changes.

### HLTB Auto-Progress
DB columns for HLTB data are pre-provisioned in `game_info` (`hltb_id`, `hltb_main_hours`, `hltb_extra_hours`, `hltb_completionist_hours`, `hltb_fetched_at`). When implemented, `hltb.ts` module would search HowLongToBeat, store hours, and auto-calculate `progress = min(100, round(playTimeHours / hltbMainHours * 100))`. The progress priority chain would become: `progressOverride` > HLTB auto-calc > 0%. Consider using the `howlongtobeat` npm package or writing a custom client. Rate-limit to 1.5s between requests during bulk sync.

### Additional Future Items
- Steam library import (parse `libraryfolders.vdf`)
- Library search — wire the existing nav search bar to filter games by name in real time
- Library sorting/filtering — sort by name, last played, play time; filter by genre using fetched `game_info` data
- Game categories/collections — user-created groups or auto-groups by genre
- Lazy-load artwork and paginate the library grid for large collections
- Multiple frontend themes (Svelte/React versions)
- Save state / snapshot support (if Proton version supports it)
- Flatpak distribution
