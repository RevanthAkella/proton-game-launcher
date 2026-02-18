# Changelog

All notable changes to this project will be documented in this file.
See [changelog_template.md](changelog_template.md) for contribution rules.

---

## [Unreleased]

### Fixed
- [Phase11] Fix controller battery drain — gamepad polling now only runs when at least one gamepad is connected and pauses when the browser tab is hidden. Previously polled `navigator.getGamepads()` at 60fps unconditionally, keeping wireless controllers awake. `src/frontend/html-template/js/controller.js` `src/frontend/html-template/controller-test.html`
- [Phase11] Fix syntax error in controller.js — add missing commas after trigger-left/trigger-right entries in GAMEPAD_BTN_MAP that broke the entire module. `src/frontend/html-template/js/controller.js`
- [Phase11] Fix LT/RT analog triggers not detected — Linux xpad driver reports triggers as axes 4/5 (range -1 to +1), not buttons 6/7. Read from axes with normalisation `(v+1)/2` → 0–1, fall back to buttons 6/7 for standard-mapping gamepads. `src/frontend/html-template/js/controller.js` `src/frontend/html-template/controller-test.html`
- [Phase11] Add proportional SVG trigger bar fill in controller test page — LT/RT bars dynamically resize based on normalised trigger value (0.0–1.0). `src/frontend/html-template/controller-test.html`
- [Phase11] Fix raw debug display — trigger axes (4/5) resting at -1.0 no longer show false-positive active markers. `src/frontend/html-template/controller-test.html`
- [Phase6] Fix X/Square and Y/Triangle button swap — map both W3C button indices 2 and 3 to `menu` action so either physical button works regardless of driver ordering. `src/frontend/html-template/js/controller.js` `src/backend/modules/controller/input-map.ts`
- [Phase6] Fix LT/RT analog triggers causing constant false presses — remove buttons 6/7 from browser Gamepad API button map and remove `leftTrigger`/`rightTrigger` axis mapping from SDL2 backend (analog drift at rest fires continuously). Shoulder buttons LB/RB already cover trigger-left/right actions. `src/frontend/html-template/js/controller.js` `src/backend/modules/controller/input-map.ts` `src/frontend/html-template/controller-test.html`
- [Phase6] Fix right stick not detected — add right stick axes (2/3) navigation polling in browser Gamepad API; add SDL2 `rightStickX`/`rightStickY` axis mapping in backend. `src/frontend/html-template/js/controller.js` `src/backend/modules/controller/input-map.ts`

### Added
- [Phase11] Add shoulder button (LB/RB) navigation for top nav bar. PageUp/PageDown (mapped from LB/RB) cycles between Home, Library, and Settings tabs. Game detail pages count as Library for cycling purposes. `src/frontend/html-template/js/app.js`
- [Phase11] Add dynamic controller SVG diagrams to controller test page. Detects connected gamepad type (Xbox, DualSense PS5, DualShock PS4, Generic) via `gamepad.id` string matching and swaps the SVG diagram with a controller-specific realistic outline showing correct button labels (A/B/X/Y vs ✕/○/□/△), shoulder/trigger labels (LB/RB vs L1/R1), meta buttons (View/Menu vs Create/Options vs Share/Options), stick positions (asymmetric vs symmetric), and accent colors. Includes controller type badge display. `src/frontend/html-template/controller-test.html`
- [Phase11] Add raw gamepad data debug panel to controller test page. Shows live button pressed/value and axis values for first connected gamepad; active inputs marked with `◀◀◀`; trigger axes (4/5) use adjusted threshold to avoid false-positive markers at rest. `src/frontend/html-template/controller-test.html`
- [Phase10] Add Controller Tester link to Settings page under new "Tools" section. Opens `/controller-test.html` in a new tab. `src/frontend/html-template/js/views/settings.js`
- [Phase10] Add browser Gamepad API polling to controller test page. Detects controllers directly in the browser via `navigator.getGamepads()` — works independently of backend SDL2 adapter. Shows button presses, both stick positions, and gamepad connection status. `src/frontend/html-template/controller-test.html`
- [Phase10] Add browser Gamepad API polling to main app. Polls `navigator.getGamepads()` via `requestAnimationFrame`, maps W3C Standard Gamepad buttons/axes to `ControllerAction` names, and synthesises `KeyboardEvent`s on `document` — same approach as the WS backend bridge but works directly in the browser with any gamepad (Bluetooth, USB). `src/frontend/html-template/js/controller.js` `src/frontend/html-template/js/app.js`

### Changed
- [Phase10] Remap controller test SVG diagram from SDL2 button indices to W3C Standard Gamepad API indices. Add LT/RT trigger bars (btn 6/7), right stick visualizer (axes 2/3), fix D-pad (12-15), Back/Start (8/9), L3/R3 (10/11), Guide (16). Update reference table to match standard mapping. `src/frontend/html-template/controller-test.html`

### Fixed
- [Phase10] Fix SDL2 adapter using wrong `@kmamal/sdl` API. Replace `sdl.controller.instances()` with `sdl.controller.devices` getter, `sdl.events.on("controllerAdded")` with `sdl.controller.on("deviceAdd")`, `sdl.controller.open(id)` with `sdl.controller.openDevice(device)`. Update all types and event shapes. `src/backend/modules/controller/sdl-adapter.ts`
- [Phase10] Fix input-map using numeric button/axis indices instead of `@kmamal/sdl` v0.9.x string names. Replace `BUTTON_MAP<number>` with `BUTTON_MAP<string>` using Xbox-named keys (`"a"`, `"dpadUp"`, `"leftShoulder"`, etc.). Replace `axisToAction(0, v)` with `axisToAction("leftStickX", v)`. Update all tests. `src/backend/modules/controller/input-map.ts` `src/backend/modules/controller/input-map.test.ts`
- [Phase10] Add `PUT /api/games/:id/progress` endpoint for manual progress override (0–100) or clearing to auto-calc. Validates with Zod, recalculates displayed `progress` column via `computeProgress()`. `src/backend/api/games.ts`
- [Phase10] Add `api.setProgress()` to frontend API client. `src/frontend/html-template/js/api.js`
- [Phase10] Add DB migration `0003_progress_softunlink.sql` — makes `root_path`/`exe_path` nullable (soft-unlink support), adds `progress` and `progress_override` columns to `games`, adds HLTB columns to `game_info` (pre-provisioned). `src/backend/db/migrations/0003_progress_softunlink.sql` `src/backend/db/schema.ts`
- [Phase10] Add scanner re-linking — `persistScannedGames()` pre-fetches unlinked games (rootPath IS NULL), matches by folder name (case-insensitive), restores `rootPath`/`exePath` instead of inserting duplicates. Adds `relinked` count to scan results and WS `scan_complete` broadcast. `src/backend/api/scan.ts`
- [Phase10] Add `showUninstalledGames` boolean setting (default false) to `SettingsSchema`, `config.example.json`, and Settings UI. Toggle appears in a new "Advanced" section; value persisted via save button. `src/backend/modules/settings/index.ts` `config.example.json` `src/frontend/html-template/js/views/settings.js` `src/frontend/html-template/css/main.css`
- [Phase10] Add library filtering for unlinked games. Default hides games with `rootPath=null`; when `showUninstalledGames` is on, unlinked games render with greyed-out art (`grayscale(1) opacity(0.5)`) and a "Not Installed" badge overlay. Home page always excludes unlinked games. `src/frontend/html-template/js/views/library.js` `src/frontend/html-template/js/views/home.js` `src/frontend/html-template/css/main.css`
- [Phase10] Add game info section to detail page. Fetches `GET /api/games/:id/info` in parallel with artwork; displays short description, developer, publisher, release date, genres, and Metacritic score between play stats and Proton selector. Fields with no data are omitted. `src/frontend/html-template/js/views/game-detail.js` `src/frontend/html-template/css/main.css`
- [Phase10] Add `PUT /api/games/:id/path` endpoint. Accepts `{ rootPath }`, validates directory exists, auto-detects best `.exe` via `detectExeInDirectory()`, updates game row with `rootPath` and `exePath`. Returns 400 if directory missing or no valid exe found. `src/backend/api/games.ts` `src/backend/modules/game-scanner/detect.ts`
- [Phase10] Add `api.setGamePath()` to frontend API client for manual path re-linking. `src/frontend/html-template/js/api.js`
- [Phase10] Add Not Installed state to game detail page. When `rootPath` is null: hero/cover art desaturated (`grayscale(1) opacity(0.5)`), "Not Installed" badge next to title, Proton selector hidden, "Add to Library" button replaces Launch. Clicking opens inline path text input; submitting calls `PUT /api/games/:id/path` and re-renders as installed. `src/frontend/html-template/js/views/game-detail.js` `src/frontend/html-template/css/main.css`
- [Phase10] Add progress circle widget to game detail title row. SVG donut ring with green arc fill proportional to `progress` (0–100), percentage centered. Pencil icon on hover opens inline editor: number input (0–100) + Save + Reset to auto (clears override) + Cancel. Always visible so users can set progress from 0%. `src/frontend/html-template/js/views/game-detail.js` `src/frontend/html-template/css/main.css`
- [Phase10] Add progress circle to home page info panel title row. Smaller 36px variant shows current progress percentage next to game title. `src/frontend/html-template/js/views/home.js` `src/frontend/html-template/css/main.css`

### Changed
- [Phase10] Remove 3-line CSS clamp on home page game description; show full short description in both home spotlight and game detail views. `src/frontend/html-template/css/main.css`
- [Phase10] Verify Refresh Library (`POST /api/library/refresh`) correctly scoped — only clears `artwork` + `game_info` tables and disk cache; never touches `games.playTimeSeconds`, `games.lastPlayed`, `games.progress`, `games.progressOverride`, or `games.rootPath`. No code changes needed — already correct. `src/backend/api/settings.ts`
- [Phase10] Change orphan purge from DELETE to soft-unlink (UPDATE SET rootPath=NULL, exePath=NULL). Preserves game row, artwork, game_info, play time, and progress. WS event renamed from `games_purged` to `games_unlinked`. `src/backend/api/settings.ts` `src/frontend/html-template/js/app.js`
- [Phase10] Disable foreign_keys during migration runner for table-recreating migrations; re-enable and verify with `foreign_key_check` after. `src/backend/db/migrate.ts`
- [Phase10] Add guard for unlinked games in launch handler — returns 400 if `exePath` or `rootPath` is null. `src/backend/api/launch.ts`

- [Phase9] Auto-purge library games when scan paths change in Settings. `PUT /api/settings` now compares all DB games against the full set of currently active scan paths (not just the removed ones) and deletes any game whose `rootPath` is not under any active path. Handles removed paths, all-paths-cleared, and orphans from prior sessions. Broadcasts `games_purged` WS event so the frontend clears `state.games`, shows an informational toast, and re-renders the current view. `src/backend/api/settings.ts` `src/frontend/html-template/js/app.js`
- [Phase9] Add Launch Game / Close Game button to Home page info panel. Appears below the description; shows "▶ Launch Game" when idle and "■ Close Game" when running. Mirrors the game-detail page button behaviour including kill-on-click and toast feedback. `src/frontend/html-template/js/views/home.js` `src/frontend/html-template/css/main.css`
- [Phase9] Add real-time system clock (`HH:MM AM/PM`) to the top-right of the nav bar. Updated every second via `setInterval`. `src/frontend/html-template/index.html` `src/frontend/html-template/js/app.js` `src/frontend/html-template/css/main.css`
- [Phase9] Add `EXCLUDED_FOLDER_NAMES` list to the game scanner. Folders named `Prefixes` (case-insensitive) are silently skipped during scan; additional exclusions can be added by extending the `Set`. `src/backend/modules/game-scanner/scanner.ts`

### Changed
- [Phase9] Move Home and Library tab buttons into the main nav bar (left of search). Remove the separate `#view-tabs` bar below the nav; `--tabs-h` is now `0px`. `src/frontend/html-template/index.html` `src/frontend/html-template/css/main.css` `src/frontend/html-template/js/app.js`
- [Phase9] Replace Settings text link with a gear icon button (`⚙`) in the top-right nav. `src/frontend/html-template/index.html` `src/frontend/html-template/css/main.css` `src/frontend/html-template/js/app.js`
- [Phase9] Remove LPGL logo from top-left nav. `src/frontend/html-template/index.html` `src/frontend/html-template/css/main.css`
- [Phase9] Convert game-detail back arrow from `<a href="#library">` to a `<button>` that navigates to `state.previousHash` (returns to wherever the user came from). Style as a frosted-glass circular button (white/gray, semi-transparent backdrop, amber on hover) positioned top-left of the hero banner. `src/frontend/html-template/js/views/game-detail.js` `src/frontend/html-template/css/main.css`
- [Phase9] Rename "Kill game" → "Close Game" throughout the UI. `src/frontend/html-template/js/views/game-detail.js` `src/frontend/html-template/js/views/home.js`
- [Phase9] Increase global font size by 10%. `html { font-size: 110% }` scales all `rem`-based values; `body { font-size: 16.5px }` raises the base text size from 15px. `src/frontend/html-template/css/main.css`

- [Phase8] Add Home page with recently-played carousel and full-page info panel. Carousel at top: all cards share a fixed height (`--home-card-h: 150px`); inactive cards are portrait (grid/cover art, ≈100px wide); active card shows the SteamGridDB "home" image (460×215 landscape header, ≈321px wide at 150px height). Hero image fills the entire `#view-home` background (behind carousel + info panel) via a `.home-bg-scrim` gradient overlay; background and active card art update on focus change without re-rendering HTML. Info panel fills remaining height with title/stats/description overlaid. Single-click to focus, double-click to launch, arrow keys to navigate, Enter/Space to launch. `src/frontend/html-template/js/views/home.js` `src/frontend/html-template/css/main.css`
- [Phase8] Add `home` artwork type — fetches landscape grid images from SteamGridDB's Grids section (same endpoint as `grid`), filtered client-side to `width > height` so only landscape images are kept. Used for the active card in the Home carousel; falls back to portrait grid art (cropped by `object-fit:cover`) when no landscape grid exists. `ART_ENDPOINTS` entry carries an optional `filter` function applied after the API response. `src/backend/modules/artwork/index.ts` `src/backend/modules/artwork/steamgriddb.ts` `src/backend/api/artwork.ts`
- [Phase8] Add automatic Steam Store game info fetching (no API key required). On server startup and after Refresh Library, `syncMissingGameInfo()` queries the Steam Store search and app-details APIs for every game with no cached `game_info` entry. Results are persisted in the new `game_info` table (description, short desc, developer, publisher, release date, genres, Metacritic score). `src/backend/modules/game-info/steamstore.ts` `src/backend/api/game-info.ts`
- [Phase8] Add `GET /api/games/:id/info` and `POST /api/games/:id/info/refresh` routes. Returns cached game info (404 if not yet fetched); refresh endpoint clears the cached row and re-fetches from Steam. `src/backend/api/game-info.ts`
- [Phase8] Add `POST /api/library/refresh` route. Clears all artwork DB records, game info DB records, and on-disk cache files, then re-fetches artwork (SteamGridDB) and game info (Steam Store) for the entire library in the background. Returns 202 immediately. `src/backend/api/settings.ts`
- [Phase8] Add `getGameInfo`, `refreshGameInfo`, and `refreshLibrary` to the frontend API client. `src/frontend/html-template/js/api.js`
- [Phase8] Add `game_info` DB table and migration. Stores Steam Store metadata per game with `game_id` as primary key (cascade-deletes with game). `src/backend/db/migrations/0002_game_info.sql` `src/backend/db/schema.ts`
- [Phase8] Add Home/Library tab bar below the nav. `.view-tabs` contains two `<button class="tab-btn">` elements. Active tab highlighted with amber underline. Tab bar hidden (and `body.no-tabs` applied) on Settings and detail pages. `src/frontend/html-template/index.html` `src/frontend/html-template/css/main.css` `src/frontend/html-template/js/app.js`
- [Phase8] Add Refresh Library button to Settings page. Calls `POST /api/library/refresh`, shows a toast confirming the background task started. `src/frontend/html-template/js/views/settings.js`

### Changed
- [Phase8] Switch font to Futura / Century Gothic / Jost (Google Fonts CDN fallback). Body `font-family` updated to `"Futura", "Futura PT", "Century Gothic", "Jost", "Trebuchet MS", sans-serif`. Jost linked from Google Fonts CDN. `src/frontend/html-template/index.html` `src/frontend/html-template/css/main.css`
- [Phase8] Replace `← Library` back button in Settings with `←` using `state.previousHash` as the destination, so the back arrow returns to whatever page was active before navigating to Settings. Escape key likewise returns to `state.previousHash`. `src/frontend/html-template/js/views/settings.js`
- [Phase8] Remove text label from game detail back button; now renders as `←` (arrow only). `src/frontend/html-template/js/views/game-detail.js`
- [Phase8] Router default route is now `#home` (was `#library`). Nav logo links to `#home`. Library is no longer in the top nav; Home and Library are tab buttons. `src/frontend/html-template/index.html` `src/frontend/html-template/js/app.js`
- [Phase8] Register `game-info` routes and kick off `syncMissingGameInfo()` at server startup. `src/backend/server.ts`

- Automatically sync artwork on server startup. On every launch, `syncMissingArtwork()` runs in the background: for each game in the library it checks whether at least one artwork file exists on disk; games with no working local files (or stale DB records pointing to deleted cache files) are fetched from SteamGridDB and saved. Games that already have artwork are skipped. A `artwork_complete` WebSocket event is broadcast when the sync finishes so the frontend refreshes. `src/backend/api/settings.ts` `src/backend/server.ts`

### Fixed
- [Phase9] Fix game-detail back button invisible on light hero images. Change from white semi-transparent background (`rgba(255,255,255,0.15)`) to dark semi-transparent (`rgba(0,0,0,0.52)`) with white icon and `box-shadow` for depth separation, ensuring clear visibility on both light and dark backgrounds. `src/frontend/html-template/css/main.css`
- Fix hero artwork overwriting grid cover art on disk. `steamgriddb.ts` `download()` inferred the art type from the URL using `endpoint.replace(/s$/, "")`, which produces `"heroe"` (not `"hero"`) for the `heroes` endpoint — causing all hero images to fall back to type `"grid"` and overwrite the grid file. Fixed by adding `type` as an explicit required parameter to `ArtworkProvider.download()` and all call sites (`scan.ts`, `settings.ts`, `artwork.ts`), removing the fragile URL inference entirely. `src/backend/modules/artwork/index.ts` `src/backend/modules/artwork/steamgriddb.ts` `src/backend/api/scan.ts` `src/backend/api/settings.ts` `src/backend/api/artwork.ts`
- Fix library not showing artwork after background fetch completes. `scan_complete` WS event fires before the background artwork fetch finishes, so the library re-rendered with placeholders and was never updated again. Both `scan.ts` (post-scan artwork fetch) and `settings.ts` (backfill on API key change) now broadcast `artwork_complete` when the fetch finishes. `app.js` handles `artwork_complete` by calling `refreshCurrentView()`, causing the library or detail view to re-render and pick up the downloaded images. `src/backend/api/scan.ts` `src/backend/api/settings.ts` `src/frontend/html-template/js/app.js`
- Fix artwork not fetching after SteamGridDB API key is added via Settings. `fetchArtworkForNewGames` in `scan.ts` was guarded by `hasArtworkProvider()` (the module-level registry populated only at server startup), but creates its own fresh provider inline — the stale registry check always returned false when the key was added post-startup, silently skipping all artwork. Removed the guard; the existing `settings.steamGridDbApiKey` check is the correct and sufficient gate. `src/backend/api/scan.ts`
- Fix existing library games having no artwork when the API key is added after an initial scan. `PUT /api/settings` now detects when `steamGridDbApiKey` changes and triggers `backfillMissingArtwork()` in the background, which queries for games with no `artwork` table entries and fetches artwork for each from SteamGridDB. `src/backend/api/settings.ts`

### Added
- [Phase7] Add `README.md` — full project documentation covering prerequisites (Node 22, Proton, SDL2), quick-start (clone → install → configure → run), configuration reference (settings fields + env vars), REST API table (17 endpoints), WebSocket event reference, development commands, project directory structure, Proton version ID format, and a contribution guide with backend/frontend checklists and commit-style guidelines. `README.md`
- [Phase7] Add structured pino logging throughout the backend. New `src/backend/logger.ts` exports a shared pino instance (dev: pino-pretty+color at `debug` level; prod: NDJSON at `info` level; overridable via `LPGL_LOG_LEVEL`). Every backend module now imports `logger.child({ module: "<name>" })` replacing all `console.log/warn/error` calls: `db/migrate.ts`, `modules/settings/index.ts`, `modules/game-scanner/scanner.ts`, `modules/artwork/steamgriddb.ts`, `api/scan.ts`, `api/launch.ts`, `api/controller.ts`, `modules/controller/sdl-adapter.ts`. Fastify's own pino config updated to respect `NODE_ENV`/`LPGL_LOG_LEVEL` consistently. `src/backend/logger.ts` `src/backend/server.ts`
- [Phase7] Add settings validation with Zod. `SettingsSchema` gains an `AbsolutePath` validator (rejects empty strings and non-`/` paths) applied to every `scanPaths` entry; `steamGridDbApiKey` uses `.trim()` to strip accidental whitespace on save. `POST /api/scan` now validates the request body via `ScanBody = z.object({ paths: z.array(AbsolutePath).optional() })` and returns 400 with structured errors on invalid input. 17 new unit tests cover default values, path rejection, API-key trimming, and `SettingsSchema.partial()` patch behaviour. `src/backend/modules/settings/index.ts` `src/backend/api/scan.ts` `src/backend/modules/settings/settings.test.ts`
- [Phase7] Add error boundaries for network failures, missing Proton, and server-unreachable state. `api.js` now wraps every `fetch()` call and converts `TypeError` network failures into a human-readable `ApiError(0, "Cannot reach server — is it running?")`. `app.js` `init()` now shows an 8-second error toast when the initial settings/Proton fetch fails. `game-detail.js` `renderActionButton()` disables the Launch button with an explanatory `title` attribute when no Proton versions are installed and no per-game override exists. `src/frontend/html-template/js/api.js` `src/frontend/html-template/js/app.js` `src/frontend/html-template/js/views/game-detail.js`
- [Phase5] Add `index.html` — HTML shell with fixed nav bar (logo, search input, Library/Settings links), scan progress banner, three mutually exclusive view containers (`#view-library`, `#view-detail`, `#view-settings`), and toast notification area. `src/frontend/html-template/index.html`
- [Phase5] Add `main.css` — dark cinematic theme (~500 lines). CSS design tokens (`--bg: #0d0d12`, `--accent: #f59e0b`), nav bar with blur backdrop, game grid tiles (2:3 aspect ratio, scale+amber border on hover), running-game green glow, skeleton shimmer animation, detail view (hero banner + two-column layout), settings/form styles, toast fade-in, and full button variant set (`btn-primary`, `btn-launch`, `btn-kill`, `btn-secondary`, `btn-ghost`). `src/frontend/html-template/css/main.css`
- [Phase5] Add `api.js` — vanilla JS fetch wrapper mirroring `api-client.ts`. Exports `ApiError` class and `api` object covering all 14 backend endpoints: games CRUD, launch/kill/status, Proton versions, artwork list/search/set/file, scan start/status, settings get/update. `src/frontend/html-template/js/api.js`
- [Phase5] Add `app.js` — bootstrap, hash router, WebSocket, and shared utilities. Exports `state` (games, protonVersions, runningGames Map, settings), `setKeyHandler()` for per-view keyboard handling, and `toast()` for notifications. Router handles `#library`, `#game/:id`, `#settings`. WebSocket auto-reconnects every 3 s and handles `launch_status`, `scan_started/progress/complete/error` events. `src/frontend/html-template/js/app.js`
- [Phase5] Add `views/library.js` — game grid view. Renders 16 skeleton tiles while fetching, builds per-game artwork map via parallel `api.listArtwork()` calls, renders cover-art tiles with deterministic gradient placeholders, running badge, and last-played label. Supports live client-side search filter. Keyboard navigation via arrow keys with `getGridCols()` computing column count from DOM `offsetTop`. `src/frontend/html-template/js/views/library.js`
- [Phase5] Add `views/game-detail.js` — single game detail page. Hero banner (hero artwork or deterministic gradient fallback), back button overlaid on hero, grid cover art, title with animated running badge, play-time and last-played stats, Proton version selector (auto-saves on change), Launch / Kill button toggled by `state.runningGames`. Escape key returns to `#library`. `src/frontend/html-template/js/views/game-detail.js`
- [Phase5] Add `views/settings.js` — settings page with scan path list (add/remove), default Proton version selector, SteamGridDB API key input (show/hide toggle), Save button persisting via `api.updateSettings()`, and Scan Now button triggering `api.startScan()`. Escape key returns to `#library`. `src/frontend/html-template/js/views/settings.js`
- [Phase6] Add `input-map.ts` — pure button/axis → ControllerAction mapping. Exports `BUTTON_MAP` (14-entry ReadonlyMap covering D-pad, face buttons, bumpers, guide), `buttonToAction()`, `axisToAction()` (left-stick X/Y with configurable `AXIS_THRESHOLD = 0.5`), and `AXIS_REPEAT_MS = 180` for axis rate-limiting. `src/backend/modules/controller/input-map.ts`
- [Phase6] Add `sdl-adapter.ts` — `createSdlAdapter()` factory implementing `InputAdapter` via `@kmamal/sdl`. Enumerates already-connected controllers on `start()`, handles hot-plug connect/disconnect events, per-axis rate-limits navigation with `AXIS_REPEAT_MS`, gracefully disables itself if SDL2 is unavailable. `src/backend/modules/controller/sdl-adapter.ts`
- [Phase6] Add `api/controller.ts` — `startControllerBridge()` / `stopControllerBridge()` service. Starts the SDL2 adapter when `controllerEnabled` is true and broadcasts each `ControllerAction` over WebSocket as `{ type: "controller", action, timestamp }`. `src/backend/api/controller.ts`
- [Phase6] Add `js/controller.js` — `handleControllerMessage()` maps each `ControllerAction` to a `KeyboardEvent.key` string via `ACTION_KEY_MAP` and dispatches synthetic `keydown`+`keyup` events on `document`, so all existing keyboard handlers fire identically for controller input. `src/frontend/html-template/js/controller.js`
- [Phase6] Add 34 unit tests for `input-map.ts` across 8 suites covering BUTTON_MAP size/shape, face buttons (Xbox A/B/Y / DualSense ✕○△ / Generic), shoulder buttons (LB/RB / L1/R1), meta buttons (Back/Start/Guide), D-pad, X/Y axis full-range, dead-zone, inclusive threshold boundary, and non-navigation axes (right stick, triggers). `src/backend/modules/controller/input-map.test.ts`
- [Phase6] Register Phase 6 test file in `src/tests/suite.ts`.
- [Phase6.5] Add `controller-test.html` — standalone live controller test page served at `/controller-test.html`. SVG gamepad diagram with all 15 SDL2 standard buttons labeled for Xbox/DualSense/Generic families; buttons flash amber on press via WebSocket `controller` events; left-stick X/Y axis crosshair visualiser; action history log (last 20 actions); auto-reconnecting WebSocket; full SDL2 button map reference table. `src/frontend/html-template/controller-test.html`
- [Phase4] Add `cache.ts` — disk-based artwork cache under `~/.cache/lpgl/<gameId>/`. Exports pure helpers `getCacheDir()`, `getCachePath()`, `buildCacheFilename()` and async `downloadToCache()` that fetches a URL and writes the file. `src/backend/modules/artwork/cache.ts`
- [Phase4] Add `steamgriddb.ts` — `createSteamGridDbProvider(apiKey)` factory implementing the `ArtworkProvider` interface. Searches SGDB for a game name (autocomplete endpoint), then fetches up to 5 results each for grid, hero, logo, and icon art types. `src/backend/modules/artwork/steamgriddb.ts`
- [Phase4] Add `GET /api/games/:id/artwork` — returns all saved artwork records for a game. `src/backend/api/artwork.ts`
- [Phase4] Add `POST /api/games/:id/artwork/search` — searches SteamGridDB and returns `ArtworkResult[]` without persisting. Accepts optional `{ query }` body to override the game name. `src/backend/api/artwork.ts`
- [Phase4] Add `POST /api/games/:id/artwork/set` — downloads a chosen artwork URL to the per-game cache dir and persists the record in the `artwork` table; replaces existing artwork of the same type. `src/backend/api/artwork.ts`
- [Phase4] Add `GET /api/games/:id/artwork/:type/file` — streams the cached image file for display in a browser with correct `Content-Type` header. `src/backend/api/artwork.ts`
- [Phase4] Add 19 unit tests for `cache.ts` covering `CACHE_BASE` constant, `getCacheDir`, `getCachePath`, and `buildCacheFilename` (all four types, query string stripping, extension fallback, no path separators). `src/backend/modules/artwork/cache.test.ts`
- [Phase4] Register Phase 4 test file in `src/tests/suite.ts`.
- [Phase4] Update `TESTING.md` Phase 4 section with per-suite test inventory for `cache`.

### Changed
- [Phase4] Replace `artwork` stub `index.ts` with full exports: `ArtworkResult`, `ArtworkProvider`, provider registry (`setArtworkProvider`, `getArtworkProvider`, `hasArtworkProvider`), and re-exports of `steamgriddb.ts` and `cache.ts`. `src/backend/modules/artwork/index.ts`
- [Phase4] Register `createSteamGridDbProvider` as the default artwork provider at startup (when `steamGridDbApiKey` is set) and register `registerArtworkRoutes`. `src/backend/server.ts`
- [Phase6] Wire `case "controller"` into `handleWsMessage()` in `app.js`; import `handleControllerMessage` from `controller.js`. `src/frontend/html-template/js/app.js`
- [Phase6] Call `startControllerBridge()` after server starts listening; register `SIGINT`/`SIGTERM` hooks to call `stopControllerBridge()` on graceful shutdown. `src/backend/server.ts`
- [Phase4] Extend `persistScannedGames()` to return newly added game IDs and names; trigger background artwork auto-fetch after scan completes (non-blocking, never fails the scan). `src/backend/api/scan.ts`

---

### Added
- [Phase3] Add `src/backend/modules/proton-runner/types.ts` — shared `ProtonVersion`, `LaunchConfig`, `RunningGame`, and `GameStatus` types imported by all sub-modules to eliminate circular dependencies.
- [Phase3] Add `version-manager.ts` — detects Proton versions across all known Steam installation paths (native, `~/.local/share/Steam`, Flatpak), deduplicates, sorts newest-first. Exports `buildProtonId()`, `buildProtonLabel()`, `protonSortKey()`, `detectProtonVersions()`, `detectSteamRoot()`, `findProtonVersion()`. `src/backend/modules/proton-runner/version-manager.ts`
- [Phase3] Add `env-builder.ts` — builds the full `Record<string, string>` env map for `child_process.spawn` with correct Proton variables, inherited PATH, and user `extraEnv` overrides having final precedence. `src/backend/modules/proton-runner/env-builder.ts`
- [Phase3] Add `runner.ts` — in-memory process registry, `launch()` spawning `proton run <exe>`, `kill()` via SIGTERM, `getStatus()`, `getRunningGame()`, `getAllRunning()`, and `setOnExitCallback()` for play-time tracking. `src/backend/modules/proton-runner/runner.ts`
- [Phase3] Add `POST /api/games/:id/launch` — resolves Proton version (per-launch override → game pref → global default), creates wine prefix, spawns process, updates `last_played`, broadcasts `launch_status` WS event. `src/backend/api/launch.ts`
- [Phase3] Add `POST /api/games/:id/kill` — sends SIGTERM; exit callback updates `play_time_seconds` and broadcasts stopped status. `src/backend/api/launch.ts`
- [Phase3] Add `GET /api/games/:id/status` — returns `running | stopped`, `pid`, and `startedAt`. `src/backend/api/launch.ts`
- [Phase3] Add `GET /api/proton/versions` — lists all detected Proton installations sorted newest-first. `src/backend/api/launch.ts`
- [Phase3] Add 19 unit tests for `version-manager` covering slug generation, label passthrough, and sort key ordering. `src/backend/modules/proton-runner/version-manager.test.ts`
- [Phase3] Add 13 unit tests for `env-builder` covering all required variables, App ID defaulting, `STEAM_COMPAT_CLIENT_INSTALL_PATH` presence/absence, string-safety, and `extraEnv` override precedence. `src/backend/modules/proton-runner/env-builder.test.ts`
- [Phase3] Register Phase 3 test files in `src/tests/suite.ts`.
- [Phase3] Update `TESTING.md` Phase 3 section with per-suite test inventory for `version-manager` and `env-builder`.

### Changed
- [Phase3] Replace `proton-runner` stub `index.ts` with full re-exports from `types.ts`, `version-manager.ts`, `env-builder.ts`, and `runner.ts`. `src/backend/modules/proton-runner/index.ts`
- [Phase3] Register `registerLaunchRoutes` in server bootstrap. `src/backend/server.ts`

---

### Added
- Add `TESTING.md` — full testing guide covering quick start, all commands, test inventory with per-suite descriptions, how to add new tests, and a 7-entry error catalog with blocker status and resolution steps.
- Add `src/tests/suite.ts` — explicit test suite entry point; all test files must be imported here to be included in the suite.
- Add `src/tests/helpers/index.ts` — shared test factories `makeExeCandidate()` and `makeExeCandidates()` for building typed `ExeCandidate` fixtures without repetition.
- Add `npm run test:watch` script — re-runs suite on every file save via Node's `--watch` flag.
- Add `npm run test:verbose` script — full TAP output showing every individual assertion.

### Changed
- Refactor `exe-detector.test.ts` to use shared helpers from `src/tests/helpers/index.ts` — eliminates inline fixture construction.
- Refactor `exe-detector.test.ts` test names and inline comments to precisely state the scoring arithmetic behind each assertion.
- Update `npm test` to use `src/tests/suite.ts` as entry point instead of a glob pattern.

---

### Added
- [Phase2] Add pure `scoreExe()` function with heuristic scoring (+40 name match, +20 shallow depth, +15 large file, −50/−30 penalty keywords). `src/backend/modules/game-scanner/exe-detector.ts`
- [Phase2] Add `rankExes()` function that scores all exe candidates and returns them sorted descending. `src/backend/modules/game-scanner/exe-detector.ts`
- [Phase2] Add recursive `collectExes()` directory walker (max depth 5, skips symlinks, handles permission errors gracefully). `src/backend/modules/game-scanner/scanner.ts`
- [Phase2] Add `scanPaths()` function that walks scan root paths, scores exe candidates per game directory, and filters out non-game directories (negative top score). `src/backend/modules/game-scanner/scanner.ts`
- [Phase2] Add `POST /api/scan` route — accepts optional `paths` array or falls back to `settings.scanPaths`, fires scan asynchronously, returns 202, broadcasts real-time progress via WebSocket. `src/backend/api/scan.ts`
- [Phase2] Add `GET /api/scan/status` route returning current scan state (`idle | running | done | error`), progress, last run timestamp, and last results. `src/backend/api/scan.ts`
- [Phase2] Add module-level scan state singleton tracking status, progress, and last results across requests. `src/backend/api/scan.ts`
- [Phase2] Add deduplication in `persistScannedGames()` — skips games whose `rootPath` already exists in the database. `src/backend/api/scan.ts`
- [Phase2] Add WebSocket broadcast events for `scan_started`, `scan_progress`, `scan_complete`, and `scan_error`. `src/backend/api/scan.ts`
- [Phase2] Add 25 unit tests for `scoreExe` and `rankExes` covering all scoring rules, edge cases, and real-world scenarios (GTA5, Witcher3). `src/backend/modules/game-scanner/exe-detector.test.ts`
- [Phase2] Add `npm test` script using Node 22 built-in test runner via `node --import tsx/esm --test`.

### Changed
- [Phase2] Replace `game-scanner` stub with full re-export of `scoreExe`, `rankExes`, `scanPaths`, and all public types. `src/backend/modules/game-scanner/index.ts`
- [Phase2] Register `registerScanRoutes` in server bootstrap. `src/backend/server.ts`

### Fixed
- [Phase2] Correct test assertions for multi-keyword penalty accumulation: `vcredist_x64.exe` correctly scores −65 (matches both `vcredist` and `redist`); `crashreporter.exe` correctly scores −25 (matches both `crash` and `report`).

---

## [0.1.0] — 2026-02-15

### Added
- [Phase1] Add `system_architecture.md` defining the full project architecture, module contracts, API surface, data model, dependency list, MVP phases, and Electron migration path.
- [Phase1] Add `package.json` with all Phase 1 runtime and dev dependencies, `"type": "module"` for ESM, and npm scripts for `dev`, `start`, `migrate`, and `typecheck`.
- [Phase1] Add `tsconfig.json` with strict TypeScript config targeting ES2022 with NodeNext module resolution.
- [Phase1] Add `drizzle.config.ts` wiring `drizzle-kit` to the SQLite database at `data/launcher.db`.
- [Phase1] Add Fastify HTTP server with `GET /api/health` endpoint returning version, theme, and timestamp. `src/backend/server.ts`
- [Phase1] Add `@fastify/websocket` plugin and `/ws` WebSocket endpoint with ping/pong keepalive and a `broadcast()` helper for server-push events. `src/backend/api/ws.ts`
- [Phase1] Add `@fastify/static` plugin serving the active frontend theme as static files from `src/frontend/<theme>/`.
- [Phase1] Add SQLite database schema with `games` and `artwork` tables using Drizzle ORM. `src/backend/db/schema.ts`
- [Phase1] Add self-healing migration runner that tracks applied migrations in a `_migrations` table, enables WAL mode, and enforces foreign keys. `src/backend/db/migrate.ts`
- [Phase1] Add first SQL migration creating `games`, `artwork`, and their indexes. `src/backend/db/migrations/0001_initial.sql`
- [Phase1] Add settings module with Zod schema validation, auto-creation of `config/settings.json` from `config.example.json` on first run, and in-memory caching. `src/backend/modules/settings/index.ts`
- [Phase1] Add `config.example.json` as a committed settings template covering Proton version, scan paths, SteamGridDB API key, controller toggle, theme, and language.
- [Phase1] Add games CRUD API routes: `GET /api/games`, `GET /api/games/:id`, `POST /api/games`, `PUT /api/games/:id`, `DELETE /api/games/:id` with Zod-validated request bodies. `src/backend/api/games.ts`
- [Phase1] Add settings API routes: `GET /api/settings` and `PUT /api/settings`. `src/backend/api/settings.ts`
- [Phase1] Add typed frontend API client covering all HTTP routes and a self-reconnecting WebSocket client. `src/frontend/adapters/api-client.ts`
- [Phase1] Add module stub with typed public contracts for `game-scanner`. `src/backend/modules/game-scanner/index.ts`
- [Phase1] Add module stub with typed public contracts for `proton-runner` including `LaunchConfig` and `ProtonVersion` types. `src/backend/modules/proton-runner/index.ts`
- [Phase1] Add module stub with `ArtworkProvider` adapter interface for swappable artwork providers. `src/backend/modules/artwork/index.ts`
- [Phase1] Add module stub with `InputAdapter` interface and `ControllerAction` union type for swappable controller backends. `src/backend/modules/controller/index.ts`
- [Phase1] Add `.gitignore` excluding `node_modules/`, `dist/`, `data/`, `cache/`, and `config/settings.json`.
- [Phase1] Add `.nvmrc` pinning the project to Node 22.
- [Phase1] Add `changelog_template.md` defining changelog format rules for all contributors.

### Fixed
- Fix `@fastify/static` root path: corrected resolution from `../../frontend` to `../frontend` so the HTML theme directory resolves correctly relative to `src/backend/`. `src/backend/server.ts`

### Dependencies
- Add `fastify ^5.0.0` — HTTP server framework.
- Add `@fastify/static ^8.0.0` — static file serving plugin.
- Add `@fastify/websocket ^11.0.0` — WebSocket plugin.
- Add `@kmamal/sdl ^0.9.0` — SDL2 bindings for controller input (Phase 6).
- Add `better-sqlite3 ^11.0.0` — synchronous SQLite driver.
- Add `drizzle-orm ^0.38.0` — type-safe query builder and schema definition.
- Add `node-fetch ^3.3.2` — HTTP client for external API calls.
- Add `uuid ^11.0.0` — UUID generation for game IDs.
- Add `zod ^3.23.0` — runtime schema validation.
- Add `@types/better-sqlite3 ^7.6.12` — TypeScript types for better-sqlite3.
- Add `@types/node ^22.0.0` — TypeScript types for Node.js.
- Add `@types/uuid ^10.0.0` — TypeScript types for uuid.
- Add `drizzle-kit ^0.30.0` — migration generation and push tooling.
- Add `pino-pretty ^13.1.3` — development log formatting.
- Add `tsx ^4.19.0` — TypeScript execution without a build step.
- Add `typescript ^5.7.0` — TypeScript compiler.

### Infrastructure
- Add `engines.node >= 22.0.0` to `package.json` to enforce minimum Node version.
- Add `.nvmrc` set to `22` for consistent local development with nvm.
- Verify `npm run migrate` creates `data/launcher.db` and applies `0001_initial.sql` cleanly.
- Verify `npm start` boots Fastify on `http://127.0.0.1:9420` and `GET /api/health` returns HTTP 200.

---

<!-- repo URL TBD -->
[Unreleased]: <!-- repo URL TBD -->
[0.1.0]: <!-- repo URL TBD -->
