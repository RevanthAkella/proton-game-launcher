import { readdirSync, statSync, existsSync } from "fs";
import { join, relative, basename } from "path";
import { type ExeCandidate, rankExes } from "./exe-detector.js";
import type { ScannedGame } from "./index.js";
import { logger } from "../../logger.js";

const log = logger.child({ module: "scanner" });

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Maximum directory depth to search for .exe files within a game folder. */
const MAX_EXE_DEPTH = 5;

/**
 * Top-level folder names that are excluded from game scanning (case-insensitive).
 * Any immediate child directory of a scan root whose name matches an entry here
 * will be silently skipped — it will never appear in the library.
 *
 * Add new entries here to exclude additional well-known non-game directories.
 */
const EXCLUDED_FOLDER_NAMES: ReadonlySet<string> = new Set([
  "prefixes",   // Proton/Wine prefix storage directories
]);

// ---------------------------------------------------------------------------
// FS helpers
// ---------------------------------------------------------------------------

/**
 * Recursively collects every .exe file under `dir` up to `maxDepth` levels.
 * Returns absolute paths. Skips symlinks to avoid infinite loops.
 */
function collectExes(
  dir: string,
  rootDir: string,
  currentDepth: number,
  maxDepth: number,
  results: ExeCandidate[]
): void {
  if (currentDepth > maxDepth) return;

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    // Permission denied or unreadable directory — skip silently
    return;
  }

  for (const entry of entries) {
    const absolutePath = join(dir, entry);

    let stat;
    try {
      stat = statSync(absolutePath);
    } catch {
      continue;
    }

    if (stat.isSymbolicLink()) continue;

    if (stat.isDirectory()) {
      collectExes(absolutePath, rootDir, currentDepth + 1, maxDepth, results);
    } else if (stat.isFile() && entry.toLowerCase().endsWith(".exe")) {
      const rel = relative(rootDir, absolutePath).replace(/\\/g, "/");
      results.push({
        absolutePath,
        relativePath: rel,
        sizeBytes: stat.size,
      });
    }
  }
}

/**
 * Lists the immediate child directories of `scanPath`.
 * Each child is treated as a separate game.
 * Non-directory entries and symlinks are ignored.
 */
function listGameDirs(scanPath: string): string[] {
  if (!existsSync(scanPath)) {
    log.warn({ path: scanPath }, "Scan path does not exist, skipping");
    return [];
  }

  let entries: string[];
  try {
    entries = readdirSync(scanPath);
  } catch (err) {
    log.warn({ path: scanPath, err }, "Cannot read scan path");
    return [];
  }

  return entries
    .map((e) => join(scanPath, e))
    .filter((p) => {
      try {
        const s = statSync(p);
        if (!s.isDirectory() || s.isSymbolicLink()) return false;
        return !EXCLUDED_FOLDER_NAMES.has(basename(p).toLowerCase());
      } catch {
        return false;
      }
    });
}

// ---------------------------------------------------------------------------
// Public scanner
// ---------------------------------------------------------------------------

export type ScanProgressCallback = (event: ScanProgressEvent) => void;

export interface ScanProgressEvent {
  /** Currently being scanned game directory name. */
  current: string;
  /** Number of game directories found so far. */
  found: number;
  /** Total game directories being examined in this pass. */
  total: number;
}

/**
 * Scans each path in `rootPaths` for game directories and scores their
 * .exe files to identify the main executable.
 *
 * @param rootPaths  Directories to scan (e.g. ["/home/user/Games"])
 * @param onProgress Optional callback called as each game directory is processed
 */
export async function scanPaths(
  rootPaths: string[],
  onProgress?: ScanProgressCallback
): Promise<ScannedGame[]> {
  // Collect all game-level directories across all scan paths
  const gameDirs: string[] = [];
  for (const root of rootPaths) {
    gameDirs.push(...listGameDirs(root));
  }

  const results: ScannedGame[] = [];
  const total = gameDirs.length;

  for (let i = 0; i < gameDirs.length; i++) {
    const gameRoot = gameDirs[i];
    const dirName = basename(gameRoot);

    onProgress?.({ current: dirName, found: results.length, total });

    const rawCandidates: ExeCandidate[] = [];
    collectExes(gameRoot, gameRoot, 0, MAX_EXE_DEPTH, rawCandidates);

    if (rawCandidates.length === 0) {
      // No .exe files found — not a Windows game directory, skip
      continue;
    }

    const ranked = rankExes(rawCandidates, dirName);

    // Only include directories where the best candidate has a non-negative score.
    // Directories where every candidate scores below 0 are likely not game roots.
    if (ranked[0].score < 0) continue;

    results.push({
      name: dirName,
      rootPath: gameRoot,
      exePath: ranked[0].absolutePath,
      exeCandidates: ranked.map((c) => c.absolutePath),
    });
  }

  return results;
}
