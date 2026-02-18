import { readdirSync, existsSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { ProtonVersion } from "./types.js";

// ---------------------------------------------------------------------------
// Known Steam root paths (checked in order)
// ---------------------------------------------------------------------------

const STEAM_ROOTS: ReadonlyArray<string> = [
  join(homedir(), ".steam", "steam"),
  join(homedir(), ".local", "share", "Steam"),
  join(homedir(), ".var", "app", "com.valvesoftware.Steam", ".local", "share", "Steam"),
];

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Converts a Proton directory name into a URL-safe slug used as the version ID.
 *
 * Examples:
 *   "Proton 9.0"          → "proton-9-0"
 *   "Proton 8.0-5"        → "proton-8-0-5"
 *   "GE-Proton9-20"       → "ge-proton9-20"
 *   "Proton - Experimental" → "proton-experimental"
 */
export function buildProtonId(dirName: string): string {
  return dirName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Returns the human-readable label for a Proton directory.
 * The directory name is used as-is — Steam and ProtonGE already use descriptive names.
 */
export function buildProtonLabel(dirName: string): string {
  return dirName;
}

/**
 * Returns true when `dirPath` looks like a valid Proton installation.
 * The minimum requirement is the presence of the `proton` launch script.
 */
export function isProtonDirectory(dirPath: string): boolean {
  return existsSync(join(dirPath, "proton"));
}

/**
 * Extracts a numeric sort key from a Proton directory name so newer versions
 * sort first. Falls back to 0 for names with no recognisable version numbers.
 *
 * Examples:
 *   "Proton 9.0"   → 9000
 *   "Proton 8.0-5" → 8000
 *   "GE-Proton9-20"→ 9020
 */
export function protonSortKey(dirName: string): number {
  // Match patterns like "9.0", "9-20", "8.0-5"
  const match = dirName.match(/(\d+)[.\-](\d+)/);
  if (!match) {
    const single = dirName.match(/(\d+)/);
    return single ? parseInt(single[1], 10) * 1000 : 0;
  }
  return parseInt(match[1], 10) * 1000 + parseInt(match[2], 10);
}

// ---------------------------------------------------------------------------
// FS-dependent detection
// ---------------------------------------------------------------------------

/**
 * Lists all immediate child directories under `commonPath` that:
 *   1. Contain the word "proton" (case-insensitive)
 *   2. Are confirmed Proton installs (have a `proton` script)
 */
function scanCommonDir(commonPath: string): ProtonVersion[] {
  if (!existsSync(commonPath)) return [];

  let entries: string[];
  try {
    entries = readdirSync(commonPath);
  } catch {
    return [];
  }

  const versions: ProtonVersion[] = [];
  for (const entry of entries) {
    if (!entry.toLowerCase().includes("proton")) continue;

    const fullPath = join(commonPath, entry);
    try {
      if (!statSync(fullPath).isDirectory()) continue;
    } catch {
      continue;
    }

    if (!isProtonDirectory(fullPath)) continue;

    versions.push({
      id: buildProtonId(entry),
      path: fullPath,
      label: buildProtonLabel(entry),
    });
  }
  return versions;
}

/**
 * Detects all installed Proton versions across every known Steam root path.
 * Results are deduplicated by absolute path and sorted newest-first.
 */
export function detectProtonVersions(): ProtonVersion[] {
  const seen = new Set<string>();
  const versions: ProtonVersion[] = [];

  for (const steamRoot of STEAM_ROOTS) {
    const commonPath = join(steamRoot, "steamapps", "common");
    for (const v of scanCommonDir(commonPath)) {
      if (seen.has(v.path)) continue;
      seen.add(v.path);
      versions.push(v);
    }
  }

  // Newest version first
  versions.sort((a, b) => protonSortKey(b.label) - protonSortKey(a.label));
  return versions;
}

/**
 * Returns the absolute path to the Steam installation root, or null if none
 * of the known locations exist. Used as STEAM_COMPAT_CLIENT_INSTALL_PATH.
 */
export function detectSteamRoot(): string | null {
  for (const root of STEAM_ROOTS) {
    if (existsSync(root)) return root;
  }
  return null;
}

/**
 * Finds a specific ProtonVersion by its ID slug.
 * Scans all known paths on every call — not cached, so always reflects
 * the current filesystem state.
 */
export function findProtonVersion(id: string): ProtonVersion | undefined {
  return detectProtonVersions().find((v) => v.id === id);
}
