import { basename } from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExeCandidate {
  /** Absolute path to the .exe file. */
  absolutePath: string;
  /**
   * Path relative to the game root directory.
   * Always uses forward slashes, no leading slash.
   * e.g. "game.exe" or "bin/x64/game.exe"
   */
  relativePath: string;
  /** File size in bytes. */
  sizeBytes: number;
}

export interface ScoredExe extends ExeCandidate {
  score: number;
}

// ---------------------------------------------------------------------------
// Negative keyword lists
// ---------------------------------------------------------------------------

/**
 * Executables containing these strings are very likely not the main game binary.
 * Each match deducts 50 points.
 */
const HEAVY_PENALTY_PATTERNS: ReadonlyArray<string> = [
  "launcher",
  "setup",
  "unins",
  "redist",
  "install",
  "uninst",
  "vcredist",
  "directx",
  "dxsetup",
  "dotnet",
];

/**
 * Executables containing these strings are probably utility processes.
 * Each match deducts 30 points.
 */
const LIGHT_PENALTY_PATTERNS: ReadonlyArray<string> = [
  "crash",
  "update",
  "report",
  "helper",
  "service",
  "config",
  "register",
  "easyanticheat",
  "battleye",
  "bethesdanet",
  "galaxyclient",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalises a name for fuzzy comparison:
 * lowercase, strip non-alphanumeric characters.
 */
function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Returns the depth of a relative path (number of directory separators).
 * "game.exe"        → 0  (sits directly in the game root)
 * "bin/game.exe"    → 1
 * "bin/x64/game.exe"→ 2
 */
function depth(relativePath: string): number {
  return relativePath.split("/").length - 1;
}

// ---------------------------------------------------------------------------
// Core scoring function
// ---------------------------------------------------------------------------

/**
 * Scores a single exe candidate given the name of the game's root directory.
 *
 * Scoring rubric:
 *  +40  exe stem matches (or closely contains) the game directory name
 *  +20  file is in the root or one directory deep
 *  +15  file is larger than 1 MB (filters out tiny stub launchers)
 *  −50  name contains a heavy-penalty keyword (per match)
 *  −30  name contains a light-penalty keyword (per match)
 */
export function scoreExe(
  candidate: ExeCandidate,
  gameDirectoryName: string
): number {
  let score = 0;

  const stem = normalise(basename(candidate.absolutePath, ".exe"));
  const gameName = normalise(gameDirectoryName);

  // +40: name similarity to game directory
  if (
    stem === gameName ||
    (gameName.length >= 3 && stem.includes(gameName)) ||
    (stem.length >= 3 && gameName.includes(stem))
  ) {
    score += 40;
  }

  // +20: shallow depth
  if (depth(candidate.relativePath) <= 1) {
    score += 20;
  }

  // +15: substantial file size
  if (candidate.sizeBytes > 1_000_000) {
    score += 15;
  }

  // −50 per heavy penalty keyword
  for (const kw of HEAVY_PENALTY_PATTERNS) {
    if (stem.includes(kw)) score -= 50;
  }

  // −30 per light penalty keyword
  for (const kw of LIGHT_PENALTY_PATTERNS) {
    if (stem.includes(kw)) score -= 30;
  }

  return score;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scores all candidates and returns them sorted by score descending.
 * Candidates with equal scores preserve their original order (stable sort).
 */
export function rankExes(
  candidates: ExeCandidate[],
  gameDirectoryName: string
): ScoredExe[] {
  return candidates
    .map((c) => ({ ...c, score: scoreExe(c, gameDirectoryName) }))
    .sort((a, b) => b.score - a.score);
}
