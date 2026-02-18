/**
 * ============================================================
 *  Linux Proton Game Launcher — Test Suite
 * ============================================================
 *
 * This file is the single source of truth for all tests.
 * Every test file MUST be imported here to be included in the suite.
 * Tests are grouped by phase and module.
 *
 * Run:            npm test
 * Watch mode:     npm run test:watch
 * Verbose output: npm run test:verbose
 *
 * To add a new test file:
 *   1. Create your .test.ts file co-located with the module it tests.
 *   2. Add an import below in the correct phase section.
 *   3. That's it — the test runner picks it up automatically.
 * ============================================================
 */

// ─── Phase 2: Game Scanner ────────────────────────────────────────────────────
import "../backend/modules/game-scanner/exe-detector.test.js";

// ─── Phase 3: Proton Runner ───────────────────────────────────────────────────
import "../backend/modules/proton-runner/version-manager.test.js";
import "../backend/modules/proton-runner/env-builder.test.js";

// ─── Phase 4: Artwork ─────────────────────────────────────────────────────────
import "../backend/modules/artwork/cache.test.js";

// ─── Phase 5: HTML Frontend ───────────────────────────────────────────────────
// import "../frontend/adapters/api-client.test.js";

// ─── Phase 6: Controller ──────────────────────────────────────────────────────
import "../backend/modules/controller/input-map.test.js";

// ─── Phase 7: Polish & Hardening ──────────────────────────────────────────────
import "../backend/modules/settings/settings.test.js";
