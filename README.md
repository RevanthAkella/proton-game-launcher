# Linux Proton Game Launcher (LPGL)

A locally-running game launcher for Linux that runs Windows games through Proton.
No cloud account required — everything runs on your machine.

---
<img width="4096" height="1752" alt="Screenshot from 2026-02-17 23-09-35" src="https://github.com/user-attachments/assets/b5e35585-4cec-4329-a0ed-b35367459b52" />
<img width="4096" height="1752" alt="Screenshot from 2026-02-17 23-09-40" src="https://github.com/user-attachments/assets/1c7bc108-fa3f-433c-8cd0-cb4b1de4585c" />
<img width="4096" height="1752" alt="Screenshot from 2026-02-17 23-10-03" src="https://github.com/user-attachments/assets/5c8d8daf-ab6c-4695-8c80-de131b88fa64" />

## Features

- **Game library** — scans directories for Windows executables and organises them into a browsable grid
- **Proton runner** — launches games through Proton-GE or Steam's own Proton builds
- **Artwork** — automatically fetches cover art, hero banners, logos, and icons from SteamGridDB
- **Controller support** — Xbox, DualSense, and generic USB gamepads work via SDL2; controller input is bridged to the frontend as keyboard events
- **HTML frontend** — no Electron, no browser extension; just a local web page served by the launcher
- **REST + WebSocket API** — every action is available as a typed endpoint; the frontend is a thin client
- **Controller test page** — live SVG gamepad diagram at `/controller-test.html` for testing physical controllers

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 22 | Use [nvm](https://github.com/nvm-sh/nvm) — system packages are often outdated |
| Proton | any | Install [Proton-GE](https://github.com/GloriousEggroll/proton-ge-custom) or use Steam's built-in Proton |
| SDL2 | system library | Required for controller support only. Install via package manager (see below) |

### Installing SDL2 (optional — controller support only)

**Ubuntu / Debian / Pop!_OS:**
```bash
sudo apt install libsdl2-2.0-0
```

**Arch / Manjaro:**
```bash
sudo pacman -S sdl2
```

**Fedora:**
```bash
sudo dnf install SDL2
```

> The launcher starts and runs normally without SDL2 — controller input is simply unavailable.

---

## Quick Start

### 1. Clone and install

```bash
git clone <repo-url> linux-proton-game-launcher
cd linux-proton-game-launcher

# Use Node 22 (required)
source ~/.nvm/nvm.sh && nvm use 22

npm install
```

### 2. Configure

```bash
# The launcher creates config/settings.json automatically on first run.
# Edit it to add your game directories and (optionally) a SteamGridDB API key:
cp config.example.json config/settings.json
```

Open `config/settings.json`:

```json
{
  "defaultProtonVersion": "proton-ge-9-21",
  "scanPaths": ["/home/you/Games", "/mnt/games"],
  "steamGridDbApiKey": "",
  "controllerEnabled": true,
  "theme": "html-template",
  "language": "en"
}
```

| Field | Description |
|---|---|
| `defaultProtonVersion` | Proton build ID used when a game has no per-game override. Run `GET /api/proton/versions` to list detected builds. |
| `scanPaths` | Absolute paths LPGL will recursively scan for `.exe` files. Each path must start with `/`. |
| `steamGridDbApiKey` | Free API key from [steamgriddb.com](https://www.steamgriddb.com/profile/preferences/api). Leave empty to skip artwork downloads. |
| `controllerEnabled` | Set to `false` to disable the SDL2 controller bridge entirely. |
| `theme` | Frontend theme directory under `src/frontend/`. Default: `html-template`. |

### 3. Run

```bash
# Development (auto-reloads on file changes)
npm run dev

# Production
npm start
```

Open **http://127.0.0.1:9420** in your browser.

### 4. Add games

1. Open **Settings** (top-right nav link)
2. Add your game directories under **Scan Paths**
3. Click **Scan Now** — the library refreshes automatically via WebSocket
4. Each new game fetches artwork from SteamGridDB in the background (requires API key)

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LPGL_PORT` | `9420` | HTTP port the server listens on |
| `LPGL_HOST` | `127.0.0.1` | Bind address (`0.0.0.0` to expose on LAN) |
| `LPGL_DB_PATH` | `./data/launcher.db` | Path to the SQLite database file |
| `LPGL_LOG_LEVEL` | `debug` (dev) / `info` (prod) | Pino log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `NODE_ENV` | — | Set to `production` for JSON log output (no pretty-print) |

---

## REST API

The full API is served at `http://127.0.0.1:9420/api/`. All endpoints accept and return JSON.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Server health check |
| `GET` | `/api/games` | List all games |
| `GET` | `/api/games/:id` | Get a single game |
| `POST` | `/api/games` | Manually add a game |
| `PUT` | `/api/games/:id` | Update game metadata (name, protonId, etc.) |
| `DELETE` | `/api/games/:id` | Remove a game from the library |
| `POST` | `/api/games/:id/launch` | Launch a game through Proton |
| `POST` | `/api/games/:id/kill` | Send SIGTERM to a running game |
| `GET` | `/api/games/:id/status` | Running / stopped state and PID |
| `GET` | `/api/proton/versions` | List detected Proton installations |
| `POST` | `/api/scan` | Start a library scan (async — progress via WebSocket) |
| `GET` | `/api/scan/status` | Current or last scan state |
| `GET` | `/api/games/:id/artwork` | List cached artwork records |
| `POST` | `/api/games/:id/artwork/search` | Search SteamGridDB for artwork |
| `POST` | `/api/games/:id/artwork/set` | Download and cache a specific artwork URL |
| `GET` | `/api/settings` | Read current settings |
| `PUT` | `/api/settings` | Update settings (partial patch) |

### WebSocket

Connect to `ws://127.0.0.1:9420/ws` to receive real-time events:

| Event type | Payload | Trigger |
|---|---|---|
| `scan_started` | `{ paths }` | Scan begins |
| `scan_progress` | `{ current, found, total }` | Each directory scanned |
| `scan_complete` | `{ added, skipped, total }` | Scan finishes |
| `scan_error` | `{ message }` | Scan throws an error |
| `launch_status` | `{ gameId, status, pid }` | Game launches or exits |
| `controller` | `{ action, timestamp }` | Controller button/axis event |

---

## Development

### Commands

```bash
# Start dev server with hot-reload
npm run dev

# Type-check only (no output emitted)
npm run typecheck

# Run the full test suite
npm test

# Re-run on save
npm run test:watch

# Full TAP output
npm run test:verbose

# Apply pending DB migrations manually
npm run migrate
```

### Project structure

```
linux-proton-game-launcher/
├── config/
│   └── settings.json          ← auto-created from config.example.json
├── data/
│   └── launcher.db            ← SQLite database (auto-created)
├── src/
│   ├── backend/
│   │   ├── api/               ← Fastify route modules
│   │   │   ├── games.ts
│   │   │   ├── launch.ts
│   │   │   ├── scan.ts
│   │   │   ├── settings.ts
│   │   │   ├── artwork.ts
│   │   │   ├── ws.ts
│   │   │   └── controller.ts
│   │   ├── db/
│   │   │   ├── migrate.ts     ← DB init + migration runner
│   │   │   ├── schema.ts      ← Drizzle ORM schema
│   │   │   └── migrations/    ← SQL migration files
│   │   ├── modules/
│   │   │   ├── game-scanner/  ← directory scan + exe heuristics
│   │   │   ├── proton-runner/ ← Proton version detection + process launch
│   │   │   ├── artwork/       ← SteamGridDB client + disk cache
│   │   │   ├── controller/    ← SDL2 adapter + input mapping
│   │   │   └── settings/      ← settings load/save + Zod schema
│   │   ├── logger.ts          ← shared pino instance
│   │   └── server.ts          ← Fastify bootstrap + main()
│   ├── frontend/
│   │   └── html-template/     ← vanilla HTML/CSS/JS frontend
│   │       ├── index.html
│   │       ├── controller-test.html
│   │       ├── css/main.css
│   │       └── js/
│   │           ├── app.js     ← bootstrap, router, WebSocket, toasts
│   │           ├── api.js     ← fetch wrapper
│   │           ├── controller.js
│   │           └── views/
│   │               ├── library.js
│   │               ├── game-detail.js
│   │               └── settings.js
│   ├── frontend/adapters/
│   │   └── api-client.ts      ← typed API client (shared contract)
│   └── tests/
│       ├── suite.ts           ← test registry (single entry point)
│       └── helpers/index.ts   ← shared test factories
├── config.example.json
├── system_architecture.md     ← canonical design reference
├── CHANGELOG.md
├── TESTING.md                 ← test guide + error catalog
└── package.json
```

### Adding a new API route

1. Create `src/backend/api/<name>.ts` and export `registerXxxRoutes(app)`
2. Import and call it in `src/backend/server.ts`
3. Add corresponding methods to `src/frontend/adapters/api-client.ts` and `src/frontend/html-template/js/api.js`

### Adding a new test file

1. Create `src/backend/modules/<module>/<module>.test.ts` (co-located with the module)
2. Add an import to the correct phase section in `src/tests/suite.ts`
3. Run `npm test` — done

See [TESTING.md](TESTING.md) for the full test guide, error catalog, and examples.

---

## Proton version IDs

LPGL detects Proton installations in the standard Steam locations:

- `~/.steam/steam/compatibilitytools.d/` — Proton-GE and community builds
- `~/.steam/steam/steamapps/common/` — Steam's built-in Proton versions

The version ID (used in `defaultProtonVersion` and the `protonId` game field) is a normalised slug, e.g.:

| Directory name | Version ID |
|---|---|
| `GE-Proton9-21` | `ge-proton9-21` |
| `Proton 9.0 (Beta)` | `proton-9-0-beta` |
| `Proton Experimental` | `proton-experimental` |

Run `GET /api/proton/versions` to see all detected IDs and their human-readable labels.

---

## Contributing

Contributions are welcome. Here's how to get started:

### Before opening a PR

1. **Fork** the repository and create a feature branch from `main`
2. **Install** dependencies: `npm install`
3. **Make your changes** — see the sections below for conventions
4. **Run tests**: `npm test` — all 132 tests must pass
5. **Type-check**: `npm run typecheck` — no new type errors
6. **Update docs** — add an entry to `CHANGELOG.md` under `## [Unreleased]` following the format in [changelog_template.md](changelog_template.md)

### Code conventions

- **TypeScript** for all backend code; vanilla ES modules (no build step) for frontend JS
- **No new dependencies** without discussion — check if the standard library or an existing dep covers the need
- **Imports use `.js` extensions** even in `.ts` files (NodeNext module resolution)
- **Zod for all request body validation** — add a schema alongside any new `POST`/`PUT` route
- **Pino for logging** — import `logger` from `src/backend/logger.ts`, call `.child({ module: "name" })` for per-module loggers; never use `console.*` in backend code
- **Tests are mandatory** for pure logic modules — co-locate the `.test.ts` file and register it in `suite.ts`
- **Error responses** follow `{ error: string }` or `{ error: ZodFlattenedError }` shape

### Backend module checklist

When adding a new backend module:

- [ ] Module lives under `src/backend/modules/<name>/index.ts`
- [ ] Public API is exported from `index.ts`; internal helpers are not
- [ ] Uses `logger.child({ module: "<name>" })` — no raw `console.*`
- [ ] Input validated with Zod in the route handler
- [ ] Unit tests cover the pure logic (filesystem-free, network-free)
- [ ] `CHANGELOG.md` entry added

### Frontend checklist

When modifying the HTML frontend (`src/frontend/html-template/`):

- [ ] No build step — plain ES modules only, no bundler
- [ ] New API calls go through `api.js` (or `api-client.ts` for the typed adapter)
- [ ] All user-facing strings use `escHtml()` to prevent XSS
- [ ] Errors are surfaced via `toast()` or an inline error element — never silently swallowed
- [ ] WS message types are handled in `app.js handleWsMessage`

### Commit style

Use short imperative subject lines:

```
Add Proton version detection for Heroic Launcher paths
Fix axis threshold boundary in SDL2 adapter
Update settings schema to reject relative scan paths
```

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a full history of changes.

---

## Architecture

For a deep-dive into design decisions, module boundaries, and the technology stack, see [system_architecture.md](system_architecture.md).
