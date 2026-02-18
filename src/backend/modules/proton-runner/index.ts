// Re-export all types
export type { ProtonVersion, LaunchConfig, RunningGame, GameStatus } from "./types.js";

// Re-export version-manager
export {
  buildProtonId,
  buildProtonLabel,
  isProtonDirectory,
  protonSortKey,
  detectProtonVersions,
  detectSteamRoot,
  findProtonVersion,
} from "./version-manager.js";

// Re-export env-builder
export { buildProtonEnv } from "./env-builder.js";

// Re-export runner
export {
  launch,
  kill,
  getStatus,
  getRunningGame,
  getAllRunning,
  setOnExitCallback,
  type GameExitCallback,
} from "./runner.js";
