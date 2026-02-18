import type { LaunchConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Proton environment builder
// ---------------------------------------------------------------------------

/**
 * Builds the full environment variable map required to run a Windows executable
 * through Proton's `proton run` command.
 *
 * The returned object is safe to pass directly as `env` to `child_process.spawn`.
 *
 * Variable precedence (highest wins):
 *   config.extraEnv  >  proton vars  >  inherited process.env
 *
 * Required Proton variables:
 *   STEAM_COMPAT_DATA_PATH   — directory that will contain the Wine prefix (pfx/)
 *   STEAM_COMPAT_APP_ID      — Steam app ID; use "0" for non-Steam games
 *
 * Optional but recommended:
 *   STEAM_COMPAT_CLIENT_INSTALL_PATH — Steam root; helps Proton find runtime libs
 *   PROTON_LOG               — set to "1" to write proton_<pid>.log in HOME
 */
export function buildProtonEnv(
  config: LaunchConfig,
  steamRoot: string | null
): Record<string, string> {
  // Start with the inherited environment (needed for PATH, DISPLAY, WAYLAND_DISPLAY, etc.)
  const inherited: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) inherited[key] = value;
  }

  const protonVars: Record<string, string> = {
    STEAM_COMPAT_DATA_PATH: config.winePrefix,
    STEAM_COMPAT_APP_ID: config.steamAppId ?? "0",
    PROTON_LOG: "1",
  };

  if (steamRoot) {
    protonVars["STEAM_COMPAT_CLIENT_INSTALL_PATH"] = steamRoot;
  }

  return {
    ...inherited,
    ...protonVars,
    // User-supplied overrides have the final say
    ...(config.extraEnv ?? {}),
  };
}
