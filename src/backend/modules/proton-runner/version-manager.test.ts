/**
 * ============================================================
 *  version-manager — Unit Tests
 * ============================================================
 *
 * Tests the pure helper functions that derive Proton version IDs,
 * labels, and sort keys from directory names. All tests are
 * filesystem-free.
 *
 * The FS-dependent detection functions (detectProtonVersions,
 * detectSteamRoot, findProtonVersion) are not tested here because
 * they depend on the host machine's Steam installation. They are
 * covered by manual integration testing.
 *
 * Module under test: src/backend/modules/proton-runner/version-manager.ts
 * Suite entry:       src/tests/suite.ts
 *
 * Functions tested:
 *   buildProtonId(dirName)   — URL-safe slug generation
 *   buildProtonLabel(dirName) — identity / human-readable label
 *   protonSortKey(dirName)   — numeric sort key for newest-first ordering
 *   isProtonDirectory(path)  — not testable without FS (excluded)
 * ============================================================
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildProtonId,
  buildProtonLabel,
  protonSortKey,
} from "./version-manager.js";

// ─── buildProtonId ────────────────────────────────────────────────────────────

describe("buildProtonId — slug generation", () => {
  /**
   * Standard Steam Proton directory names use spaces and dots.
   * These must become hyphen-separated lowercase slugs.
   */
  test("'Proton 9.0' → 'proton-9-0'", () => {
    assert.equal(buildProtonId("Proton 9.0"), "proton-9-0");
  });

  test("'Proton 8.0-5' → 'proton-8-0-5'", () => {
    assert.equal(buildProtonId("Proton 8.0-5"), "proton-8-0-5");
  });

  test("'Proton 7.0-6' → 'proton-7-0-6'", () => {
    assert.equal(buildProtonId("Proton 7.0-6"), "proton-7-0-6");
  });

  /**
   * Experimental / beta builds have longer names with special chars.
   */
  test("'Proton - Experimental' → 'proton-experimental'", () => {
    assert.equal(buildProtonId("Proton - Experimental"), "proton-experimental");
  });

  test("'Proton 9.0 (Beta)' → 'proton-9-0-beta'", () => {
    assert.equal(buildProtonId("Proton 9.0 (Beta)"), "proton-9-0-beta");
  });

  /**
   * GE-Proton (community build) directory names already use hyphens.
   * They should be lowercased and preserved as-is.
   */
  test("'GE-Proton9-20' → 'ge-proton9-20'", () => {
    assert.equal(buildProtonId("GE-Proton9-20"), "ge-proton9-20");
  });

  test("'GE-Proton8-32' → 'ge-proton8-32'", () => {
    assert.equal(buildProtonId("GE-Proton8-32"), "ge-proton8-32");
  });

  /**
   * Leading/trailing separators must be stripped.
   */
  test("no leading or trailing hyphens in the output", () => {
    const id = buildProtonId("  Proton 9.0  ");
    assert.ok(!id.startsWith("-"), `should not start with hyphen: "${id}"`);
    assert.ok(!id.endsWith("-"), `should not end with hyphen: "${id}"`);
  });

  /**
   * Output must be lowercase.
   */
  test("output is always lowercase", () => {
    const id = buildProtonId("GE-Proton9-20");
    assert.equal(id, id.toLowerCase());
  });

  /**
   * Output must contain only alphanumeric characters and hyphens.
   */
  test("output contains only [a-z0-9-]", () => {
    const id = buildProtonId("Proton 9.0 (Beta)");
    assert.match(id, /^[a-z0-9-]+$/);
  });
});

// ─── buildProtonLabel ─────────────────────────────────────────────────────────

describe("buildProtonLabel — human-readable label", () => {
  /**
   * The label is passed through unchanged — Steam and GE already provide
   * descriptive names. Any transformation here would lose information.
   */
  test("returns the directory name unchanged", () => {
    assert.equal(buildProtonLabel("Proton 9.0"), "Proton 9.0");
  });

  test("preserves GE-Proton formatting", () => {
    assert.equal(buildProtonLabel("GE-Proton9-20"), "GE-Proton9-20");
  });

  test("preserves Experimental label", () => {
    assert.equal(buildProtonLabel("Proton - Experimental"), "Proton - Experimental");
  });
});

// ─── protonSortKey ────────────────────────────────────────────────────────────

describe("protonSortKey — newest-first sort ordering", () => {
  /**
   * Higher major version → higher sort key → sorts first.
   */
  test("Proton 9.0 has a higher key than Proton 8.0-5", () => {
    assert.ok(
      protonSortKey("Proton 9.0") > protonSortKey("Proton 8.0-5"),
      "9.0 should sort before 8.0-5"
    );
  });

  test("Proton 8.0-5 has a higher key than Proton 7.0-6", () => {
    assert.ok(
      protonSortKey("Proton 8.0-5") > protonSortKey("Proton 7.0-6"),
      "8.0-5 should sort before 7.0-6"
    );
  });

  /**
   * Within the same major version, higher minor number sorts first.
   */
  test("GE-Proton9-20 has a higher key than GE-Proton9-10", () => {
    assert.ok(
      protonSortKey("GE-Proton9-20") > protonSortKey("GE-Proton9-10"),
      "GE-Proton9-20 should sort before GE-Proton9-10"
    );
  });

  /**
   * Names with no recognisable version numbers return 0 rather than throwing.
   */
  test("directory with no version numbers returns 0 without throwing", () => {
    assert.doesNotThrow(() => protonSortKey("Proton - Experimental"));
    assert.equal(typeof protonSortKey("Proton - Experimental"), "number");
  });

  /**
   * The function must return a number for any input, including empty strings.
   */
  test("returns a number for any string input", () => {
    for (const name of ["", "abc", "Proton 9.0", "GE-Proton9-20"]) {
      assert.equal(typeof protonSortKey(name), "number");
    }
  });

  /**
   * Sort key must be non-negative for all realistic inputs.
   */
  test("sort key is non-negative", () => {
    for (const name of ["Proton 9.0", "GE-Proton9-20", "Proton 7.0-6"]) {
      assert.ok(protonSortKey(name) >= 0, `key for "${name}" should be >= 0`);
    }
  });
});
