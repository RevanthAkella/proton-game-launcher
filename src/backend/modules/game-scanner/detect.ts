/**
 * detect.ts — Single-directory exe detection for manual path assignment.
 *
 * Re-uses the same exe collection and ranking logic from scanner.ts/exe-detector.ts
 * but exposes a focused helper for detecting the best exe in one directory.
 */

import { readdirSync, statSync, existsSync } from "fs";
import { join, relative, basename } from "path";
import { type ExeCandidate, rankExes } from "./exe-detector.js";

const MAX_EXE_DEPTH = 5;

/**
 * Recursively collects every .exe file under `dir` up to `maxDepth` levels.
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
 * Detect the best .exe in a single game directory.
 * Returns the absolute path of the best-scoring exe, or null if none found.
 */
export function detectExeInDirectory(rootPath: string): string | null {
  if (!existsSync(rootPath)) return null;

  const candidates: ExeCandidate[] = [];
  collectExes(rootPath, rootPath, 0, MAX_EXE_DEPTH, candidates);

  if (candidates.length === 0) return null;

  const ranked = rankExes(candidates, basename(rootPath));
  if (ranked[0].score < 0) return null;

  return ranked[0].absolutePath;
}
