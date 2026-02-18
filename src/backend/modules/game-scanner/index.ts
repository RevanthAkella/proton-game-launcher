export type { ExeCandidate, ScoredExe } from "./exe-detector.js";
export { scoreExe, rankExes } from "./exe-detector.js";
export type { ScanProgressCallback, ScanProgressEvent } from "./scanner.js";
export { scanPaths } from "./scanner.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ScannedGame {
  /** Derived from the game's root directory name. */
  name: string;
  /** Absolute path to the top-level game directory. */
  rootPath: string;
  /** Absolute path to the best-match .exe file. */
  exePath: string;
  /** All .exe candidates found, sorted by score descending. */
  exeCandidates: string[];
}
