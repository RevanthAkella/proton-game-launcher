/**
 * ============================================================
 *  env-builder — Unit Tests
 * ============================================================
 *
 * Tests that buildProtonEnv() produces the correct environment
 * variable map for Proton execution.
 *
 * All tests run in-process with no filesystem or subprocess access.
 * process.env is read (not mutated) during the tests.
 *
 * Module under test: src/backend/modules/proton-runner/env-builder.ts
 * Suite entry:       src/tests/suite.ts
 *
 * Variables verified:
 *   STEAM_COMPAT_DATA_PATH         — must equal config.winePrefix
 *   STEAM_COMPAT_APP_ID            — must equal steamAppId or "0"
 *   STEAM_COMPAT_CLIENT_INSTALL_PATH — present only when steamRoot given
 *   PROTON_LOG                     — must equal "1"
 *   PATH                           — inherited from process.env
 *   extraEnv overrides             — must have final precedence
 * ============================================================
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildProtonEnv } from "./env-builder.js";
import type { LaunchConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

const BASE_CONFIG: LaunchConfig = {
  exePath: "/games/GameA/game.exe",
  protonPath: "/proton/Proton 9.0",
  winePrefix: "/home/user/.local/share/lpgl/prefixes/abc-123",
};

const STEAM_ROOT = "/home/user/.steam/steam";

// ---------------------------------------------------------------------------
// Required Proton variables
// ---------------------------------------------------------------------------

describe("buildProtonEnv — required Proton variables", () => {
  /**
   * STEAM_COMPAT_DATA_PATH must be the wine prefix directory exactly.
   * Proton will create `pfx/` inside it on first run.
   */
  test("STEAM_COMPAT_DATA_PATH equals config.winePrefix", () => {
    const env = buildProtonEnv(BASE_CONFIG, null);
    assert.equal(env["STEAM_COMPAT_DATA_PATH"], BASE_CONFIG.winePrefix);
  });

  /**
   * PROTON_LOG must be "1" so Proton writes a log file for debugging.
   */
  test("PROTON_LOG is '1'", () => {
    const env = buildProtonEnv(BASE_CONFIG, null);
    assert.equal(env["PROTON_LOG"], "1");
  });
});

// ---------------------------------------------------------------------------
// STEAM_COMPAT_APP_ID
// ---------------------------------------------------------------------------

describe("buildProtonEnv — STEAM_COMPAT_APP_ID", () => {
  /**
   * When no steamAppId is provided, the ID must default to "0".
   * Proton accepts "0" as a valid non-Steam game identifier.
   */
  test("defaults to '0' when config.steamAppId is undefined", () => {
    const env = buildProtonEnv(BASE_CONFIG, null);
    assert.equal(env["STEAM_COMPAT_APP_ID"], "0");
  });

  /**
   * When a steamAppId is provided, it must be passed through verbatim.
   */
  test("uses config.steamAppId when provided", () => {
    const config: LaunchConfig = { ...BASE_CONFIG, steamAppId: "271590" };
    const env = buildProtonEnv(config, null);
    assert.equal(env["STEAM_COMPAT_APP_ID"], "271590");
  });

  /**
   * Explicit "0" is passed through, not double-defaulted.
   */
  test("preserves explicit '0' steamAppId", () => {
    const config: LaunchConfig = { ...BASE_CONFIG, steamAppId: "0" };
    const env = buildProtonEnv(config, null);
    assert.equal(env["STEAM_COMPAT_APP_ID"], "0");
  });
});

// ---------------------------------------------------------------------------
// STEAM_COMPAT_CLIENT_INSTALL_PATH
// ---------------------------------------------------------------------------

describe("buildProtonEnv — STEAM_COMPAT_CLIENT_INSTALL_PATH", () => {
  /**
   * When a Steam root is detected, the path is set so Proton can locate
   * runtime libraries and compatibility databases.
   */
  test("set to steamRoot when steamRoot is provided", () => {
    const env = buildProtonEnv(BASE_CONFIG, STEAM_ROOT);
    assert.equal(env["STEAM_COMPAT_CLIENT_INSTALL_PATH"], STEAM_ROOT);
  });

  /**
   * When Steam is not installed or not detected, the variable must be absent
   * rather than set to null/undefined (which would break subprocess.spawn).
   */
  test("absent (not set) when steamRoot is null", () => {
    const env = buildProtonEnv(BASE_CONFIG, null);
    assert.ok(
      !("STEAM_COMPAT_CLIENT_INSTALL_PATH" in env),
      "STEAM_COMPAT_CLIENT_INSTALL_PATH should not be present when steamRoot is null"
    );
  });
});

// ---------------------------------------------------------------------------
// Environment inheritance
// ---------------------------------------------------------------------------

describe("buildProtonEnv — environment inheritance", () => {
  /**
   * PATH must always be inherited so Proton can find system binaries.
   * Tests cannot guarantee a specific PATH value, but it must be non-empty
   * on any real system.
   */
  test("inherits PATH from process.env", () => {
    const env = buildProtonEnv(BASE_CONFIG, null);
    if (process.env["PATH"]) {
      assert.equal(env["PATH"], process.env["PATH"]);
    }
    // If PATH is not set in the test environment, we just verify the key type
    assert.equal(typeof env["PATH"], "string");
  });

  /**
   * All values in the returned map must be strings (never undefined).
   * child_process.spawn will throw if env contains non-string values.
   */
  test("all values in the returned env are strings", () => {
    const env = buildProtonEnv(BASE_CONFIG, STEAM_ROOT);
    for (const [key, value] of Object.entries(env)) {
      assert.equal(
        typeof value,
        "string",
        `env["${key}"] should be a string, got ${typeof value}`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// extraEnv overrides
// ---------------------------------------------------------------------------

describe("buildProtonEnv — extraEnv overrides", () => {
  /**
   * User-supplied extraEnv must take precedence over all generated variables.
   * This is the escape hatch for per-game env tuning (DXVK settings, etc.).
   */
  test("extraEnv overrides a generated Proton variable", () => {
    const config: LaunchConfig = {
      ...BASE_CONFIG,
      extraEnv: { PROTON_LOG: "0" },
    };
    const env = buildProtonEnv(config, null);
    assert.equal(env["PROTON_LOG"], "0");
  });

  test("extraEnv overrides STEAM_COMPAT_APP_ID", () => {
    const config: LaunchConfig = {
      ...BASE_CONFIG,
      extraEnv: { STEAM_COMPAT_APP_ID: "999" },
    };
    const env = buildProtonEnv(config, null);
    assert.equal(env["STEAM_COMPAT_APP_ID"], "999");
  });

  /**
   * extraEnv can add brand-new variables not otherwise set.
   */
  test("extraEnv can add arbitrary new variables", () => {
    const config: LaunchConfig = {
      ...BASE_CONFIG,
      extraEnv: { DXVK_HUD: "fps", MANGOHUD: "1" },
    };
    const env = buildProtonEnv(config, null);
    assert.equal(env["DXVK_HUD"], "fps");
    assert.equal(env["MANGOHUD"], "1");
  });

  /**
   * When extraEnv is not provided, the function must not throw.
   */
  test("works correctly when extraEnv is undefined", () => {
    const config: LaunchConfig = { ...BASE_CONFIG };
    assert.doesNotThrow(() => buildProtonEnv(config, null));
  });
});
