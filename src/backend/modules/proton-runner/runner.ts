import { spawn, type ChildProcess } from "child_process";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import type { LaunchConfig, RunningGame, GameStatus } from "./types.js";
import { buildProtonEnv } from "./env-builder.js";
import { detectSteamRoot } from "./version-manager.js";

// ---------------------------------------------------------------------------
// In-memory process registry
// ---------------------------------------------------------------------------

// Maps gameId → running process entry
const registry = new Map<string, RunningGame & { process: ChildProcess }>();

// ---------------------------------------------------------------------------
// Exit callback
// ---------------------------------------------------------------------------

/**
 * Called when a game process exits — either naturally or via kill().
 * The exit handler fires AFTER the registry entry has been removed, so the
 * callback receives the startedAt timestamp before it was deleted.
 *
 * @param gameId    ID of the game that exited
 * @param exitCode  Process exit code, or null if terminated by signal
 * @param signal    Signal name if killed, or null
 * @param startedAt Unix ms timestamp of when the game was launched
 */
export type GameExitCallback = (
  gameId: string,
  exitCode: number | null,
  signal: string | null,
  startedAt: number
) => void;

let _onExit: GameExitCallback | null = null;

export function setOnExitCallback(cb: GameExitCallback): void {
  _onExit = cb;
}

// ---------------------------------------------------------------------------
// Launch
// ---------------------------------------------------------------------------

/**
 * Launches a Windows executable through Proton.
 *
 * Invocation: `<protonPath>/proton run <exePath>`
 * stdout/stderr from the game are piped (available via child.stdout/stderr).
 *
 * Throws if:
 *   - The game is already running
 *   - The proton script doesn't exist at the expected path
 *   - The OS fails to spawn the process
 */
export function launch(gameId: string, config: LaunchConfig): ChildProcess {
  if (registry.has(gameId)) {
    throw new Error(`Game "${gameId}" is already running (pid ${registry.get(gameId)!.pid})`);
  }

  // Ensure the Wine prefix directory exists — Proton will initialise pfx/ inside it
  if (!existsSync(config.winePrefix)) {
    mkdirSync(config.winePrefix, { recursive: true });
  }

  const protonScript = join(config.protonPath, "proton");
  if (!existsSync(protonScript)) {
    throw new Error(
      `Proton script not found at "${protonScript}". ` +
      `Verify the Proton installation at "${config.protonPath}".`
    );
  }

  const env = buildProtonEnv(config, detectSteamRoot());

  const child = spawn(protonScript, ["run", config.exePath], {
    env,
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (!child.pid) {
    throw new Error(`Failed to obtain PID for game "${gameId}" — spawn may have failed silently`);
  }

  const entry = {
    gameId,
    pid: child.pid,
    startedAt: Date.now(),
    process: child,
  };

  registry.set(gameId, entry);

  // Remove from registry and invoke the exit callback when the process ends
  const handleExit = (code: number | null, signal: NodeJS.Signals | null) => {
    const { startedAt } = entry;
    registry.delete(gameId);
    _onExit?.(gameId, code, signal as string | null, startedAt);
  };

  child.on("exit", handleExit);
  child.on("error", () => handleExit(null, null));

  return child;
}

// ---------------------------------------------------------------------------
// Kill
// ---------------------------------------------------------------------------

/**
 * Sends SIGTERM to a running game process.
 * Throws if the game is not in the running registry.
 * The exit callback will still fire after the process actually exits.
 */
export function kill(gameId: string): void {
  const entry = registry.get(gameId);
  if (!entry) {
    throw new Error(`Game "${gameId}" is not currently running`);
  }
  entry.process.kill("SIGTERM");
}

// ---------------------------------------------------------------------------
// Status queries
// ---------------------------------------------------------------------------

export function getStatus(gameId: string): GameStatus {
  return registry.has(gameId) ? "running" : "stopped";
}

export function getRunningGame(gameId: string): RunningGame | undefined {
  const entry = registry.get(gameId);
  if (!entry) return undefined;
  // Return without the internal ChildProcess reference
  return { gameId: entry.gameId, pid: entry.pid, startedAt: entry.startedAt };
}

export function getAllRunning(): RunningGame[] {
  return Array.from(registry.values()).map(({ gameId, pid, startedAt }) => ({
    gameId, pid, startedAt,
  }));
}
