/**
 * Shared test utilities used across the test suite.
 *
 * Import selectively — only import what your test needs:
 *   import { makeExeCandidate } from "../../tests/helpers/index.js";
 */

import type { ExeCandidate } from "../../backend/modules/game-scanner/exe-detector.js";

// ─── Game Scanner helpers ─────────────────────────────────────────────────────

/**
 * Builds an ExeCandidate for use in exe-detector tests.
 *
 * @param filename   The filename including .exe extension, e.g. "game.exe"
 * @param opts.relativePath  Overrides the relative path (default: same as filename, depth 0)
 * @param opts.sizeBytes     Overrides the file size (default: 5 MB — large enough for the +15 bonus)
 * @param opts.gameRoot      Overrides the absolute path root (default: "/games/SomeGame")
 *
 * @example
 * makeExeCandidate("GTA5.exe")
 * // → { absolutePath: "/games/SomeGame/GTA5.exe", relativePath: "GTA5.exe", sizeBytes: 5000000 }
 *
 * makeExeCandidate("engine.exe", { relativePath: "bin/x64/engine.exe", sizeBytes: 200 })
 * // → { absolutePath: "/games/SomeGame/bin/x64/engine.exe", relativePath: "bin/x64/engine.exe", sizeBytes: 200 }
 */
export function makeExeCandidate(
  filename: string,
  opts: {
    relativePath?: string;
    sizeBytes?: number;
    gameRoot?: string;
  } = {}
): ExeCandidate {
  const root = opts.gameRoot ?? "/games/SomeGame";
  const rel = opts.relativePath ?? filename;
  return {
    absolutePath: `${root}/${rel}`,
    relativePath: rel,
    sizeBytes: opts.sizeBytes ?? 5_000_000,
  };
}

/**
 * Builds a list of ExeCandidates with explicit absolute paths.
 * Useful for real-world scenario tests where paths matter.
 *
 * @example
 * makeExeCandidates("/games/GTA5", [
 *   ["GTA5.exe",         "GTA5.exe",         80_000_000],
 *   ["GTAVLauncher.exe", "GTAVLauncher.exe",    500_000],
 * ])
 */
export function makeExeCandidates(
  gameRoot: string,
  entries: [filename: string, relativePath: string, sizeBytes: number][]
): ExeCandidate[] {
  return entries.map(([filename, relativePath, sizeBytes]) => ({
    absolutePath: `${gameRoot}/${filename}`,
    relativePath,
    sizeBytes,
  }));
}
