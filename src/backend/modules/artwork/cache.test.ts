/**
 * ============================================================
 *  cache — Unit Tests
 * ============================================================
 *
 * Tests the pure helper functions in the artwork cache module.
 * All tests are filesystem-free — only path construction and
 * filename derivation are tested here.
 *
 * The FS-dependent functions (ensureCacheDir, downloadToCache)
 * are not tested here because they require network access and
 * disk writes. They are covered by manual integration testing.
 *
 * Module under test: src/backend/modules/artwork/cache.ts
 * Suite entry:       src/tests/suite.ts
 *
 * Functions tested:
 *   getCacheDir(gameId)               — per-game dir path
 *   getCachePath(gameId, filename)    — full file path
 *   buildCacheFilename(type, url)     — deterministic filename
 * ============================================================
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { join } from "path";
import { homedir } from "os";
import { getCacheDir, getCachePath, buildCacheFilename, CACHE_BASE } from "./cache.js";

const EXPECTED_CACHE_BASE = join(homedir(), ".cache", "lpgl");
const GAME_ID = "abc-123-def-456";

// ---------------------------------------------------------------------------
// CACHE_BASE constant
// ---------------------------------------------------------------------------

describe("CACHE_BASE — root cache directory", () => {
  /**
   * The constant must always resolve to ~/.cache/lpgl regardless of
   * the working directory at runtime.
   */
  test("resolves to ~/.cache/lpgl", () => {
    assert.equal(CACHE_BASE, EXPECTED_CACHE_BASE);
  });

  test("is an absolute path", () => {
    assert.ok(CACHE_BASE.startsWith("/"), `CACHE_BASE should be absolute, got: ${CACHE_BASE}`);
  });
});

// ---------------------------------------------------------------------------
// getCacheDir
// ---------------------------------------------------------------------------

describe("getCacheDir — per-game directory path", () => {
  /**
   * The per-game directory must be CACHE_BASE/<gameId>.
   * No filesystem access occurs in this function.
   */
  test("returns CACHE_BASE/<gameId>", () => {
    assert.equal(getCacheDir(GAME_ID), join(EXPECTED_CACHE_BASE, GAME_ID));
  });

  test("different game IDs produce different directories", () => {
    assert.notEqual(getCacheDir("game-a"), getCacheDir("game-b"));
  });

  test("result is an absolute path", () => {
    const dir = getCacheDir(GAME_ID);
    assert.ok(dir.startsWith("/"), `getCacheDir should return absolute path, got: ${dir}`);
  });

  test("gameId is a suffix of the returned path", () => {
    const dir = getCacheDir(GAME_ID);
    assert.ok(dir.endsWith(GAME_ID), `path should end with gameId, got: ${dir}`);
  });
});

// ---------------------------------------------------------------------------
// getCachePath
// ---------------------------------------------------------------------------

describe("getCachePath — full file path", () => {
  /**
   * The file path must be getCacheDir(gameId)/<filename>.
   */
  test("returns getCacheDir(gameId)/<filename>", () => {
    assert.equal(
      getCachePath(GAME_ID, "grid.jpg"),
      join(getCacheDir(GAME_ID), "grid.jpg")
    );
  });

  test("filename is preserved exactly", () => {
    const path = getCachePath(GAME_ID, "hero.png");
    assert.ok(path.endsWith("hero.png"), `path should end with filename, got: ${path}`);
  });

  test("result is an absolute path", () => {
    const path = getCachePath(GAME_ID, "logo.webp");
    assert.ok(path.startsWith("/"), `getCachePath should return absolute path, got: ${path}`);
  });
});

// ---------------------------------------------------------------------------
// buildCacheFilename
// ---------------------------------------------------------------------------

describe("buildCacheFilename — deterministic filename derivation", () => {
  /**
   * Standard case: type becomes the base, URL extension is preserved.
   */
  test("grid type with .jpg URL → 'grid.jpg'", () => {
    assert.equal(
      buildCacheFilename("grid", "https://cdn.steamgriddb.com/grid/abc123.jpg"),
      "grid.jpg"
    );
  });

  test("hero type with .png URL → 'hero.png'", () => {
    assert.equal(
      buildCacheFilename("hero", "https://cdn.steamgriddb.com/hero/xyz.png"),
      "hero.png"
    );
  });

  test("logo type with .webp URL → 'logo.webp'", () => {
    assert.equal(
      buildCacheFilename("logo", "https://cdn.steamgriddb.com/logo/abc.webp"),
      "logo.webp"
    );
  });

  test("icon type with .ico URL → 'icon.ico'", () => {
    assert.equal(
      buildCacheFilename("icon", "https://cdn.steamgriddb.com/icon/abc.ico"),
      "icon.ico"
    );
  });

  /**
   * Query strings must be stripped before extracting the extension.
   */
  test("strips query string before extracting extension", () => {
    assert.equal(
      buildCacheFilename("grid", "https://cdn.example.com/image.png?v=2&size=lg"),
      "grid.png"
    );
  });

  /**
   * .jpeg must be treated as a valid extension (same as .jpg but kept distinct).
   */
  test(".jpeg extension is preserved as-is", () => {
    assert.equal(
      buildCacheFilename("grid", "https://cdn.example.com/image.jpeg"),
      "grid.jpeg"
    );
  });

  /**
   * When the URL has no recognisable image extension, fall back to .jpg.
   */
  test("falls back to .jpg when URL has no image extension", () => {
    assert.equal(
      buildCacheFilename("grid", "https://cdn.example.com/image"),
      "grid.jpg"
    );
  });

  test("falls back to .jpg for unrecognised extension (.bmp)", () => {
    assert.equal(
      buildCacheFilename("grid", "https://cdn.example.com/image.bmp"),
      "grid.jpg"
    );
  });

  /**
   * The type becomes the base name — the URL's directory/basename are not used.
   */
  test("type is always used as the base name, not the URL filename", () => {
    const filename = buildCacheFilename("hero", "https://cdn.example.com/1234567.jpg");
    assert.ok(filename.startsWith("hero"), `should start with type 'hero', got: ${filename}`);
    assert.ok(!filename.includes("1234567"), "should not include URL filename component");
  });

  /**
   * Output must be a simple filename (no directory separators).
   */
  test("output contains no path separators", () => {
    const filename = buildCacheFilename("grid", "https://cdn.example.com/a/b/c.jpg");
    assert.ok(!filename.includes("/"), `output should not contain '/', got: ${filename}`);
  });
});
