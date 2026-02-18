/**
 * Shared types for the proton-runner module.
 * Imported by version-manager, env-builder, and runner — never from index.ts —
 * so there are no circular dependencies between the sub-modules.
 */

export interface ProtonVersion {
  /** URL-safe slug derived from the directory name, e.g. "proton-9-0", "ge-proton9-20" */
  id: string;
  /** Absolute path to the Proton directory (contains the `proton` script) */
  path: string;
  /** Human-readable label, e.g. "Proton 9.0", "GE-Proton9-20" */
  label: string;
}

export interface LaunchConfig {
  /** Absolute path to the Windows .exe to run */
  exePath: string;
  /** Absolute path to the Proton directory (contains the `proton` script) */
  protonPath: string;
  /** Steam app ID — used for compatibility databases. Defaults to "0" for non-Steam games */
  steamAppId?: string;
  /** Additional environment variables merged on top of the generated set */
  extraEnv?: Record<string, string>;
  /**
   * Absolute path used as STEAM_COMPAT_DATA_PATH.
   * Proton will create `pfx/` inside this directory the first time it runs.
   */
  winePrefix: string;
}

export type GameStatus = "running" | "stopped" | "error";

export interface RunningGame {
  gameId: string;
  pid: number;
  startedAt: number; // unix ms
}
