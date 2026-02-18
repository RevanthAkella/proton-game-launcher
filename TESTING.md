# Testing Guide

## Quick Start

```bash
# Activate the correct Node version first (required — system default is Node 12)
source ~/.nvm/nvm.sh && nvm use 22

# Run the full suite
npm test
```

That's it. All tests run in under a second.

---

## Commands

| Command | What it does |
|---|---|
| `npm test` | Run the full suite once, compact output |
| `npm run test:watch` | Re-run the suite on every file save |
| `npm run test:verbose` | Full TAP output — shows every assertion |
| `npm run typecheck` | TypeScript type-check only (no tests run) |

All commands use Node's built-in test runner — no extra test framework installed.

---

## How the Suite is Organised

```
src/
├── tests/
│   ├── suite.ts          ← single entry point — lists every test file
│   └── helpers/
│       └── index.ts      ← shared factories used across test files
└── backend/
    └── modules/
        └── game-scanner/
            ├── exe-detector.ts
            └── exe-detector.test.ts   ← test file lives next to the module
```

**Convention:** test files are co-located with the module they test, named `<module>.test.ts`. They are registered in `src/tests/suite.ts` — adding a file there is the only step needed to include it in the suite.

---

## Test Inventory

### Phase 2 — Game Scanner

#### `exe-detector.test.ts` — 25 tests, 6 suites

Tests the pure heuristic scoring engine. No filesystem access, no database, no server needed.

| Suite | Tests | What is verified |
|---|---|---|
| `scoreExe — name similarity (+40)` | 4 | Exact match, case-insensitive match, partial containment, no-match baseline |
| `scoreExe — depth bonus (+20)` | 3 | Depth 0 earns +20, depth 1 earns +20, depth 2+ earns nothing |
| `scoreExe — size bonus (+15)` | 3 | >1 MB earns +15, exactly 1 MB does not, <1 MB does not |
| `scoreExe — heavy penalties (−50 per match)` | 5 | `setup`, `unins`, `dotnet`, `vcredist`+`redist` double-hit, `redist`+`setup` double-hit |
| `scoreExe — light penalties (−30 per match)` | 3 | `crash`+`report` double-hit, `update`, `report` |
| `rankExes — ordering` | 7 | Rank ordering by score, depth tiebreak, size tiebreak, empty input, single input, GTA5 real-world, Witcher3 real-world |

> **Penalty accumulation:** keywords are matched independently. A filename like `vcredist_x64.exe` normalises to `vcreditx64` and matches both `vcredist` (−50) and `redist` (−50), scoring −100. This is by design — utilities with multiple penalty markers are pushed further down the ranking.

### Phase 3 — Proton Runner

#### `version-manager.test.ts` — 19 tests, 3 suites

Tests the pure helper functions that derive Proton version metadata from directory names. All tests are filesystem-free.

| Suite | Tests | What is verified |
|---|---|---|
| `buildProtonId — slug generation` | 10 | Steam naming (`Proton 9.0`), versioned builds (`8.0-5`), GE-Proton format, Experimental label, Beta suffix, no leading/trailing hyphens, lowercase only, valid charset |
| `buildProtonLabel — human-readable label` | 3 | Passthrough for standard, GE-Proton, and Experimental labels |
| `protonSortKey — newest-first sort ordering` | 6 | Major version ordering, minor version ordering (GE), handles names with no version, returns number for any input, non-negative |

> FS-dependent functions (`detectProtonVersions`, `detectSteamRoot`, `findProtonVersion`, `isProtonDirectory`) are excluded from unit tests — they depend on the host's Steam installation and are covered by manual integration testing.

#### `env-builder.test.ts` — 13 tests, 5 suites

Tests that `buildProtonEnv()` builds the correct environment for `child_process.spawn`. No filesystem or subprocess access.

| Suite | Tests | What is verified |
|---|---|---|
| `required Proton variables` | 2 | `STEAM_COMPAT_DATA_PATH` = `winePrefix`, `PROTON_LOG` = "1" |
| `STEAM_COMPAT_APP_ID` | 3 | Defaults to "0", passes through explicit ID, preserves explicit "0" |
| `STEAM_COMPAT_CLIENT_INSTALL_PATH` | 2 | Present and correct when steamRoot given, absent (not undefined) when null |
| `environment inheritance` | 2 | `PATH` inherited from `process.env`, all values are strings (spawn-safe) |
| `extraEnv overrides` | 4 | Overrides generated vars, overrides APP_ID, adds new vars (DXVK_HUD etc.), works without extraEnv |

### Phase 4 — Artwork

#### `cache.test.ts` — 19 tests, 4 suites

Tests the pure path-construction and filename-derivation helpers in the artwork cache module. All tests are filesystem-free.

| Suite | Tests | What is verified |
|---|---|---|
| `CACHE_BASE — root cache directory` | 2 | Resolves to `~/.cache/lpgl`, is an absolute path |
| `getCacheDir — per-game directory path` | 4 | Correct path under `CACHE_BASE`, different IDs produce different dirs, absolute, gameId is suffix |
| `getCachePath — full file path` | 3 | Correct path joining getCacheDir + filename, filename preserved exactly, absolute |
| `buildCacheFilename — deterministic filename derivation` | 10 | All four art types, query string stripping, .jpeg preserved, fallback to .jpg for missing/unknown ext, type always base name, no path separators |

> FS-dependent functions (`ensureCacheDir`, `downloadToCache`) and the SteamGridDB client are excluded from unit tests — they require network access or disk writes. They are covered by manual integration testing.

---

## Adding New Tests

1. Create `src/backend/modules/<module>/<module>.test.ts`
2. Import and use helpers from `src/tests/helpers/index.ts` where applicable
3. Add an import line to `src/tests/suite.ts` in the correct phase section
4. Run `npm test` — the new tests are included automatically

**Test file header (copy this):**

```typescript
/**
 * ============================================================
 *  <Module Name> — Unit Tests
 * ============================================================
 *
 * Module under test: src/backend/modules/<path>/<module>.ts
 * Suite entry:       src/tests/suite.ts
 *
 * <Describe what is tested here>
 * ============================================================
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
```

**Helper usage:**

```typescript
import { makeExeCandidate, makeExeCandidates } from "../../../tests/helpers/index.js";

// Create a single candidate (depth 0, 5 MB default)
const c = makeExeCandidate("game.exe");

// Create a candidate with overrides
const c2 = makeExeCandidate("engine.exe", { relativePath: "bin/engine.exe", sizeBytes: 200 });

// Create a batch for real-world scenarios
const candidates = makeExeCandidates("/games/GTA5", [
  ["GTA5.exe", "GTA5.exe", 80_000_000],
  ["setup.exe", "setup.exe", 1_000_000],
]);
```

---

## Error Catalog

Each entry lists the error, whether it blocks all tests or just some, and exactly what to do.

---

### `ERR_UNSUPPORTED_NODE_VERSION` / engine warning

**Symptom:**
```
npm warn EBADENGINE Unsupported engine { required: { node: '>=22.0.0' }, current: { node: 'v12...' } }
SyntaxError: Unexpected reserved word
```

**Blocker:** Yes — tests will not run at all.

**Cause:** The system default Node (v12) is being used instead of v22.

**Fix:**
```bash
source ~/.nvm/nvm.sh && nvm use 22
npm test
```

To make this permanent for the terminal session: add `nvm use 22` to your shell profile or create a shell alias.

---

### `Cannot find module` / `ERR_MODULE_NOT_FOUND`

**Symptom:**
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'fastify'
```

**Blocker:** Yes — tests will not run.

**Cause:** `npm install` has not been run, or `node_modules/` was deleted.

**Fix:**
```bash
source ~/.nvm/nvm.sh && nvm use 22
npm install
npm test
```

---

### `ERR_MODULE_NOT_FOUND` for a `.js` import in `.ts` source

**Symptom:**
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../exe-detector.js'
```

**Blocker:** Yes — the failing test file cannot load.

**Cause:** A test or module file has an incorrect import path (missing `.js` extension, wrong relative path, or a typo).

**Fix:** Check the import statement in the file mentioned in the stack trace. All TypeScript imports must use `.js` extensions (NodeNext resolution):
```typescript
// correct
import { scoreExe } from "./exe-detector.js";

// wrong — will fail at runtime
import { scoreExe } from "./exe-detector";
```

---

### `AssertionError` — test failure

**Symptom:**
```
not ok 3 - some test name
  error: Expected values to be strictly equal:
  -65 !== -15
```

**Blocker:** Partial — the specific assertion fails; other tests still run.

**Cause:** The module's behaviour does not match what the test expects. Either:
- A regression was introduced in the module, **or**
- The test expectation is wrong (e.g. a scoring rule was intentionally changed)

**Fix:**
1. Read the full error — the stack trace points to the exact line in the test file.
2. Decide whether the module or the test is wrong.
3. If the module regressed: fix the module and re-run.
4. If the scoring rule changed intentionally: update the test assertion and the comment explaining the expected value.

---

### `TypeError: ... is not a function`

**Symptom:**
```
TypeError: scoreExe is not a function
    at TestContext.<anonymous> (exe-detector.test.ts:42:...)
```

**Blocker:** Partial — the failing describe block fails; other suites still run.

**Cause:** A named export was renamed or removed from the module under test, but the test file still imports the old name.

**Fix:** Check the module's `index.ts` or the file directly, find the correct export name, and update the import in the test file.

---

### `SyntaxError: Unexpected token` / `SyntaxError: Cannot use import statement`

**Symptom:**
```
SyntaxError: Cannot use import statement in a module
    at ...tsx/esm...
```

**Blocker:** Yes — tests will not run.

**Cause:** `tsx` is not correctly set up, or a non-ESM-compatible file is being loaded.

**Fix:**
```bash
# Reinstall tsx
npm install

# Verify tsx version
npx tsx --version   # should print 4.x

# Try running directly to isolate the issue
node --import tsx/esm src/tests/suite.ts
```

---

### Test hangs / no output after starting

**Symptom:** `npm test` runs but produces no TAP output and does not exit.

**Blocker:** Yes — the suite cannot complete.

**Cause:** A test or module has an infinite loop, unresolved Promise, or open file handle.

**Fix:**
1. Run with `--test-timeout` to force-fail slow tests:
   ```bash
   node --import tsx/esm --test --test-timeout=5000 src/tests/suite.ts
   ```
2. The failing test will be reported. Inspect it for infinite loops, missing `await`, or unreleased resources (open DB connections, running child processes).

---

### SDL2 not installed (future — Phase 6)

**Symptom:**
```
Error: Could not load SDL2 library
```

**Blocker:** Partial — only Phase 6 controller tests fail. All other tests still pass.

**Cause:** The `@kmamal/sdl` package requires the SDL2 system library, which is not installed by default.

**Fix (Ubuntu/Debian):**
```bash
sudo apt install libsdl2-dev libsdl2-2.0-0
npm test
```

**Fix (Arch/Manjaro):**
```bash
sudo pacman -S sdl2
npm test
```

> This error will not appear until Phase 6 controller tests are added to the suite.

---

## Future Work

### Gradio Test Suite UI (`tools/test-ui/app.py`)

A planned Python Gradio application that runs the test suite via subprocess, parses the TAP output, and presents results in a visual browser UI. Intended for non-engineers reviewing test health without reading raw TAP lines.

Planned features: live streaming output, pass/fail/skip counters, per-suite collapsible tree, failure-only filter, run history. Full specification is in `system_architecture.md → Future Work → Gradio Test Suite Frontend`.

---

## Test Philosophy

- **Unit tests only for pure logic** — tests that require a running server, database, or filesystem are integration tests and will be added in Phase 7 with a separate `npm run test:integration` command.
- **No extra test libraries** — Node's built-in `node:test` + `node:assert/strict` is sufficient. Adding Jest/Vitest would add a build dependency with no benefit.
- **Tests live next to the code** — `exe-detector.ts` and `exe-detector.test.ts` are in the same directory. This makes it immediately obvious when a module is untested.
- **suite.ts is the only registry** — if a test file is not imported in `suite.ts`, it does not run. This is intentional: it prevents orphaned test files from silently being skipped.
