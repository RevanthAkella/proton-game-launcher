/**
 * ============================================================
 *  exe-detector — Unit Tests
 * ============================================================
 *
 * Tests the heuristic scoring engine that identifies the primary
 * game executable from a list of .exe candidates.
 *
 * Module under test: src/backend/modules/game-scanner/exe-detector.ts
 * Suite entry:       src/tests/suite.ts
 *
 * Scoring rules verified here:
 *   +40  exe stem matches (or contains) the game directory name
 *   +20  file is at depth 0 or 1 relative to game root
 *   +15  file is larger than 1 MB
 *   −50  name contains a heavy-penalty keyword (per keyword match)
 *   −30  name contains a light-penalty keyword (per keyword match)
 *
 * Heavy-penalty keywords: launcher, setup, unins, redist, install,
 *   uninst, vcredist, directx, dxsetup, dotnet
 * Light-penalty keywords:  crash, update, report, helper, service,
 *   config, register, easyanticheat, battleye, bethesdanet, galaxyclient
 * ============================================================
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { scoreExe, rankExes } from "./exe-detector.js";
import {
  makeExeCandidate,
  makeExeCandidates,
} from "../../../tests/helpers/index.js";

// ─── scoreExe — name similarity (+40) ────────────────────────────────────────

describe("scoreExe — name similarity (+40)", () => {
  /**
   * When the normalised exe stem exactly matches the normalised game directory
   * name, the candidate receives +40.
   * Combined with depth 0 (+20) and 5 MB size (+15) → total 75.
   */
  test("exact match scores +75 (name +40, shallow +20, large +15)", () => {
    const c = makeExeCandidate("SomeGame.exe");
    assert.equal(scoreExe(c, "SomeGame"), 75);
  });

  /**
   * Normalisation is case-insensitive, so "SOMEGAME" matches "SomeGame".
   */
  test("case-insensitive name match scores +75", () => {
    const c = makeExeCandidate("SOMEGAME.exe");
    assert.equal(scoreExe(c, "SomeGame"), 75);
  });

  /**
   * The normalised stem "somegame64" contains the game name "somegame",
   * so it still earns the +40 partial-match bonus.
   */
  test("stem containing game name earns +40 partial match", () => {
    const c = makeExeCandidate("SomeGame64.exe");
    assert.equal(scoreExe(c, "SomeGame"), 75);
  });

  /**
   * A stem that shares no relationship with the game directory name
   * receives 0 for the name bonus.
   * Combined with depth 0 (+20) and 5 MB (+15) → total 35.
   */
  test("unrelated name earns no name bonus, scores +35", () => {
    const c = makeExeCandidate("engine.exe");
    assert.equal(scoreExe(c, "SomeGame"), 35);
  });
});

// ─── scoreExe — depth bonus (+20) ────────────────────────────────────────────

describe("scoreExe — depth bonus (+20)", () => {
  /**
   * An exe directly inside the game root (depth 0) earns the shallow bonus.
   */
  test("depth 0 (game root) earns +20", () => {
    const c = makeExeCandidate("game.exe", { relativePath: "game.exe" });
    assert.equal(scoreExe(c, "game"), 75); // +40 +20 +15
  });

  /**
   * An exe one directory deep (e.g. bin/game.exe) still earns the bonus.
   */
  test("depth 1 (one subdir) earns +20", () => {
    const c = makeExeCandidate("game.exe", { relativePath: "bin/game.exe" });
    assert.equal(scoreExe(c, "game"), 75); // +40 +20 +15
  });

  /**
   * An exe two or more directories deep does NOT earn the shallow bonus.
   * Combined with name +40 and size +15 → total 55.
   */
  test("depth 2+ earns no depth bonus, scores +55", () => {
    const c = makeExeCandidate("game.exe", {
      relativePath: "bin/x64/game.exe",
    });
    assert.equal(scoreExe(c, "game"), 55); // +40 +15
  });
});

// ─── scoreExe — size bonus (+15) ─────────────────────────────────────────────

describe("scoreExe — size bonus (+15)", () => {
  /**
   * Files strictly larger than 1 MB earn the size bonus.
   */
  test("file > 1 MB earns +15", () => {
    const c = makeExeCandidate("game.exe", { sizeBytes: 1_000_001 });
    assert.equal(scoreExe(c, "game"), 75); // +40 +20 +15
  });

  /**
   * Exactly 1 MB does NOT qualify; the threshold is strictly greater-than.
   * Total 60 (no size bonus).
   */
  test("file exactly 1 MB earns no size bonus, scores +60", () => {
    const c = makeExeCandidate("game.exe", { sizeBytes: 1_000_000 });
    assert.equal(scoreExe(c, "game"), 60); // +40 +20
  });

  /**
   * Files under 1 MB earn no size bonus.
   * Total 60 (no size bonus).
   */
  test("file < 1 MB earns no size bonus, scores +60", () => {
    const c = makeExeCandidate("game.exe", { sizeBytes: 500_000 });
    assert.equal(scoreExe(c, "game"), 60); // +40 +20
  });
});

// ─── scoreExe — heavy penalties (−50 per match) ───────────────────────────────

describe("scoreExe — heavy penalties (−50 per keyword match)", () => {
  /**
   * "setup" is a heavy-penalty keyword → −50.
   * +20 (shallow) +15 (large) −50 (setup) = −15.
   */
  test("setup.exe: −50 for 'setup', scores −15", () => {
    const c = makeExeCandidate("setup.exe");
    assert.equal(scoreExe(c, "SomeGame"), -15);
  });

  /**
   * "unins" is a heavy-penalty keyword → −50.
   * +20 +15 −50 = −15.
   */
  test("unins000.exe: −50 for 'unins', scores −15", () => {
    const c = makeExeCandidate("unins000.exe");
    assert.equal(scoreExe(c, "SomeGame"), -15);
  });

  /**
   * "dotnet" is a heavy-penalty keyword → −50.
   * +20 +15 −50 = −15.
   */
  test("dotnetfx.exe: −50 for 'dotnet', scores −15", () => {
    const c = makeExeCandidate("dotnetfx.exe");
    assert.equal(scoreExe(c, "SomeGame"), -15);
  });

  /**
   * "vcredist_x64" normalises to "vcreditx64", which contains both "vcredist"
   * and "redist" → two separate −50 hits = −100 total.
   * +20 +15 −50 −50 = −65.
   * This is intentional: double-matches produce double-penalties.
   */
  test("vcredist_x64.exe: −100 (matches 'vcredist' AND 'redist'), scores −65", () => {
    const c = makeExeCandidate("vcredist_x64.exe");
    assert.equal(scoreExe(c, "SomeGame"), -65);
  });

  /**
   * "RedistSetup" contains both "redist" and "setup" → two −50 hits.
   * +20 +15 −50 −50 = −65.
   */
  test("RedistSetup.exe: −100 (matches 'redist' AND 'setup'), scores −65", () => {
    const c = makeExeCandidate("RedistSetup.exe");
    assert.equal(scoreExe(c, "SomeGame"), -65);
  });
});

// ─── scoreExe — light penalties (−30 per match) ──────────────────────────────

describe("scoreExe — light penalties (−30 per keyword match)", () => {
  /**
   * "crashreporter" contains both "crash" and "report" → two −30 hits.
   * +20 (shallow) +15 (large) −30 −30 = −25.
   * This is intentional: utility processes are aggressively filtered.
   */
  test("crashreporter.exe: −60 (matches 'crash' AND 'report'), scores −25", () => {
    const c = makeExeCandidate("crashreporter.exe");
    assert.equal(scoreExe(c, "SomeGame"), -25);
  });

  /**
   * "update" is a light-penalty keyword → −30.
   * +20 +15 −30 = 5.
   */
  test("GameUpdater.exe: −30 for 'update', scores +5", () => {
    const c = makeExeCandidate("GameUpdater.exe");
    assert.equal(scoreExe(c, "SomeGame"), 5);
  });

  /**
   * "report" is a light-penalty keyword → −30.
   * +20 +15 −30 = 5.
   */
  test("BugReport.exe: −30 for 'report', scores +5", () => {
    const c = makeExeCandidate("BugReport.exe");
    assert.equal(scoreExe(c, "SomeGame"), 5);
  });
});

// ─── rankExes — ordering ──────────────────────────────────────────────────────

describe("rankExes — ordering", () => {
  /**
   * The main binary always outranks a setup executable.
   */
  test("main game exe ranks above setup.exe", () => {
    const candidates = [
      makeExeCandidate("setup.exe"),
      makeExeCandidate("Witcher3.exe"),
    ];
    const ranked = rankExes(candidates, "Witcher3");
    assert.equal(ranked[0].relativePath, "Witcher3.exe");
  });

  /**
   * When two exes have the same name, the shallower one wins.
   */
  test("shallower exe outranks same-name exe at depth 4", () => {
    const candidates = [
      { absolutePath: "/g/Game/bin/x64/x86/deep/game.exe", relativePath: "bin/x64/x86/deep/game.exe", sizeBytes: 5_000_000 },
      { absolutePath: "/g/Game/game.exe",                  relativePath: "game.exe",                  sizeBytes: 5_000_000 },
    ];
    const ranked = rankExes(candidates, "Game");
    assert.equal(ranked[0].relativePath, "game.exe");
  });

  /**
   * A large deep exe outranks a tiny shallow exe of the same game name
   * because +15 (size) > +20 (shallow) when the name bonus is equal
   * and the shallow exe is tiny.
   * depth-0 tiny:  +40 +20 +0  = 60
   * depth-1 large: +40 +20 +15 = 75
   */
  test("large exe at depth 1 outranks tiny exe at depth 0", () => {
    const candidates = [
      { absolutePath: "/g/G/game.exe",     relativePath: "game.exe",     sizeBytes: 100 },
      { absolutePath: "/g/G/bin/game.exe", relativePath: "bin/game.exe", sizeBytes: 10_000_000 },
    ];
    const ranked = rankExes(candidates, "G");
    assert.equal(ranked[0].relativePath, "bin/game.exe");
  });

  /**
   * An empty candidates list returns an empty array without error.
   */
  test("empty input returns empty array", () => {
    assert.deepEqual(rankExes([], "Game"), []);
  });

  /**
   * A single candidate is returned with a numeric score attached.
   */
  test("single candidate is returned with a score property", () => {
    const ranked = rankExes([makeExeCandidate("game.exe")], "game");
    assert.equal(ranked.length, 1);
    assert.equal(typeof ranked[0].score, "number");
  });

  /**
   * Real-world scenario: GTA 5 install directory.
   * GTA5.exe (80 MB, root) must beat GTAVLauncher.exe, CrashHandler.exe, setup.exe.
   */
  test("real-world GTA5: selects GTA5.exe over launcher, crash handler, and setup", () => {
    const candidates = makeExeCandidates("/games/GTA5", [
      ["GTA5.exe",         "GTA5.exe",         80_000_000],
      ["GTAVLauncher.exe", "GTAVLauncher.exe",    500_000],
      ["CrashHandler.exe", "CrashHandler.exe",    200_000],
      ["setup.exe",        "setup.exe",         1_000_000],
    ]);
    assert.equal(rankExes(candidates, "GTA5")[0].relativePath, "GTA5.exe");
  });

  /**
   * Real-world scenario: The Witcher 3 install directory.
   * witcher3.exe (45 MB, bin/x64) must beat launcher.exe and vcredist in a
   * redist subdirectory.
   */
  test("real-world Witcher3: selects witcher3.exe over launcher and redist", () => {
    const candidates = makeExeCandidates("/games/TheWitcher3", [
      ["witcher3.exe", "bin/x64/witcher3.exe", 45_000_000],
      ["launcher.exe", "launcher.exe",            800_000],
      ["vcredist.exe", "redist/vcredist.exe",      900_000],
    ]);
    assert.equal(rankExes(candidates, "TheWitcher3")[0].relativePath, "bin/x64/witcher3.exe");
  });
});
