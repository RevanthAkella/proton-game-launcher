/**
 * settings.test.ts — Unit tests for SettingsSchema and AbsolutePath validation
 *
 * These tests verify the Zod rules without touching the filesystem.
 * All schema fields use .default(), so parsing an empty object is always valid.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SettingsSchema, AbsolutePath } from "./index.js";

// ── AbsolutePath ──────────────────────────────────────────────────────────

describe("AbsolutePath", () => {
  it("accepts a standard absolute path", () => {
    assert.equal(AbsolutePath.parse("/home/user/Games"), "/home/user/Games");
  });

  it("accepts a deep nested path", () => {
    assert.equal(AbsolutePath.parse("/mnt/games/steam"), "/mnt/games/steam");
  });

  it("rejects an empty string", () => {
    assert.throws(() => AbsolutePath.parse(""), /empty/i);
  });

  it("rejects a relative path", () => {
    assert.throws(() => AbsolutePath.parse("home/user/Games"), /absolute/i);
  });

  it("rejects a Windows-style path", () => {
    assert.throws(() => AbsolutePath.parse("C:\\Games"), /absolute/i);
  });
});

// ── SettingsSchema — defaults ─────────────────────────────────────────────

describe("SettingsSchema — defaults", () => {
  it("parses an empty object with all defaults", () => {
    const s = SettingsSchema.parse({});
    assert.equal(s.defaultProtonVersion, "");
    assert.deepEqual(s.scanPaths, []);
    assert.equal(s.steamGridDbApiKey, "");
    assert.equal(s.controllerEnabled, true);
    assert.equal(s.theme, "html-template");
    assert.equal(s.language, "en");
  });

  it("preserves provided values", () => {
    const s = SettingsSchema.parse({
      defaultProtonVersion: "proton-ge-9",
      scanPaths: ["/home/user/Games"],
      steamGridDbApiKey: "abc123",
      controllerEnabled: false,
    });
    assert.equal(s.defaultProtonVersion, "proton-ge-9");
    assert.deepEqual(s.scanPaths, ["/home/user/Games"]);
    assert.equal(s.steamGridDbApiKey, "abc123");
    assert.equal(s.controllerEnabled, false);
  });
});

// ── SettingsSchema — scanPaths validation ─────────────────────────────────

describe("SettingsSchema — scanPaths validation", () => {
  it("accepts an array of valid absolute paths", () => {
    const s = SettingsSchema.parse({ scanPaths: ["/games", "/mnt/data"] });
    assert.deepEqual(s.scanPaths, ["/games", "/mnt/data"]);
  });

  it("rejects a scanPaths array containing a relative path", () => {
    assert.throws(
      () => SettingsSchema.parse({ scanPaths: ["games/steam"] }),
      /absolute/i
    );
  });

  it("rejects a scanPaths array containing an empty string", () => {
    assert.throws(
      () => SettingsSchema.parse({ scanPaths: [""] }),
      /empty/i
    );
  });

  it("rejects a mixed array (valid + relative)", () => {
    assert.throws(
      () => SettingsSchema.parse({ scanPaths: ["/valid", "relative"] }),
      /absolute/i
    );
  });
});

// ── SettingsSchema — steamGridDbApiKey trimming ───────────────────────────

describe("SettingsSchema — steamGridDbApiKey trimming", () => {
  it("trims leading and trailing whitespace from the API key", () => {
    const s = SettingsSchema.parse({ steamGridDbApiKey: "  mykey123  " });
    assert.equal(s.steamGridDbApiKey, "mykey123");
  });

  it("accepts a key with no surrounding whitespace unchanged", () => {
    const s = SettingsSchema.parse({ steamGridDbApiKey: "cleankey" });
    assert.equal(s.steamGridDbApiKey, "cleankey");
  });

  it("trims a whitespace-only key to empty string", () => {
    const s = SettingsSchema.parse({ steamGridDbApiKey: "   " });
    assert.equal(s.steamGridDbApiKey, "");
  });
});

// ── SettingsSchema.partial() — used by PUT /api/settings ─────────────────

describe("SettingsSchema.partial() — API patch validation", () => {
  const Partial = SettingsSchema.partial();

  it("accepts a patch with only scanPaths", () => {
    const result = Partial.safeParse({ scanPaths: ["/home/user/Games"] });
    assert.ok(result.success);
  });

  it("rejects a patch with an invalid scan path", () => {
    const result = Partial.safeParse({ scanPaths: ["not-absolute"] });
    assert.ok(!result.success);
  });

  it("trims steamGridDbApiKey in a partial patch", () => {
    const result = Partial.safeParse({ steamGridDbApiKey: "  trimmed  " });
    assert.ok(result.success);
    assert.equal(result.data?.steamGridDbApiKey, "trimmed");
  });
});
